import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Patch, Point, Shape } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { toWorldPoint, pickShapeAtGeometry, clampTiny, snapToGrid, isDrag, getCursorForTool } from '@/features/editor/utils/interactionHelpers';
import { calculateZoomTransform } from '@/utils/zoomHelper';
import SelectionOverlay from './SelectionOverlay';
import { HIT_TOLERANCE } from '@/config/constants';
import { isShapeInteractable } from '@/utils/visibility';
import { getEngineRuntime } from '@/engine/core/singleton';
import { GpuPicker } from '@/engine/picking/gpuPicker';
import { TextTool } from '@/engine/tools/TextTool';
import { TextInputProxy, type TextInputProxyRef } from '@/components/TextInputProxy';
import { TextCaretOverlay } from '@/components/TextCaretOverlay';
import type { TextInputDelta } from '@/types/text';
import { TextBoxMode } from '@/types/text';
import { getTextIdForShape, getShapeIdForText } from '@/engine/core/textEngineSync';
import { getShapeBoundingBox, worldToScreen } from '@/utils/geometry';

// New hooks
import { useSelectInteraction, type MoveState } from '@/features/editor/hooks/useSelectInteraction';
import { useDraftHandler } from '@/features/editor/hooks/useDraftHandler';
import { useTextEditHandler, type TextBoxMeta } from '@/features/editor/hooks/useTextEditHandler';
import { usePanZoom } from '@/features/editor/hooks/interaction/usePanZoom';

const EngineInteractionLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const activeTool = useUIStore((s) => s.activeTool);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const setSelectedShapeIds = useUIStore((s) => s.setSelectedShapeIds);
  const canvasSize = useUIStore((s) => s.canvasSize);

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);
  const snapOptions = useSettingsStore((s) => s.snap);
  const gridSize = useSettingsStore((s) => s.grid.size);

  const pointerDownRef = useRef<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  
  // Pan/Zoom hook
  const { isPanningRef, beginPan, updatePan, endPan, handleWheel } = usePanZoom();

  const runtimeRef = useRef<Awaited<ReturnType<typeof getEngineRuntime>> | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const gpuPickerRef = useRef<GpuPicker | null>(null);

  const textToolRef = useRef<TextTool | null>(null);
  const textInputProxyRef = useRef<TextInputProxyRef>(null);
  const textBoxMetaRef = useRef<Map<number, TextBoxMeta>>(new Map());

  // Track if we're dragging for FixedWidth text creation
  const textDragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const runtime = await getEngineRuntime();
      if (!disposed) {
        runtimeRef.current = runtime;
        setRuntimeReady(true);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const {
      caret,
      selectionRects,
      anchor,
      rotation,
      engineTextEditState
  } = useTextEditHandler({
      viewTransform,
      runtime: runtimeReady ? runtimeRef.current : null,
      textInputProxyRef,
      textBoxMetaRef,
      textToolRef
  });

  useEffect(() => {
    // Always instantiate GpuPicker (modern WebGL2 path).
    if (!gpuPickerRef.current) {
      gpuPickerRef.current = new GpuPicker();
    }
    return () => {
      gpuPickerRef.current?.dispose();
    };
  }, []);

  const pickShape = useCallback((world: Point, screen: Point, tolerance: number): string | null => {
    // 1. Try Engine Pick (CPU O(N)) for immediate hits
    if (runtimeRef.current) {
        // Engine returns uint32 ID. We need to map it back to string ID.
        const id = runtimeRef.current.engine.pick(world.x, world.y, tolerance);
        if (id !== 0) {
            const strId = runtimeRef.current.getIdMaps().idHashToString.get(id);
            // Check visibility/interactability for the hit
            if (strId) {
                const data = useDataStore.getState();
                const shape = data.shapes[strId];
                const layer = shape ? data.layers.find(l => l.id === shape.layerId) : null;
                const ui = useUIStore.getState();
                const interactable = shape && isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline });
                const visible = layer && layer.visible && !layer.locked;
                if (interactable && visible) {
                    return strId;
                }
            }
        }
    }

    if (gpuPickerRef.current) {
      const data = useDataStore.getState();
      const gpuHit = gpuPickerRef.current.pick({
        screen,
        world,
        toleranceWorld: tolerance,
        viewTransform,
        canvasSize,
        shapes: data.shapes,
        shapeOrder: data.shapeOrder,
        layers: data.layers,
        spatialIndex: data.spatialIndex,
        activeFloorId: activeFloorId ?? 'terreo',
        activeDiscipline,
      });
      if (gpuHit) return gpuHit;
    }

    return pickShapeAtGeometry(world, tolerance);
  }, [activeDiscipline, activeFloorId, canvasSize, viewTransform]);

  const {
      selectionBox,
      setSelectionBox,
      cursorOverride,
      setCursorOverride,
      handlePointerDown: selectHandlePointerDown,
      handlePointerMove: selectHandlePointerMove,
      handlePointerUp: selectHandlePointerUp,
      selectionSvg
  } = useSelectInteraction({
      viewTransform,
      selectedShapeIds,
      shapes: useDataStore((s) => s.shapes),
      layers: useDataStore((s) => s.layers),
      spatialIndex: useDataStore((s) => s.spatialIndex),
      onUpdateShape: useDataStore((s) => s.updateShape),
      onSyncConnections: () => {}, // No-op as connections removed
      onSetSelectedShapeIds: setSelectedShapeIds,
      onSaveToHistory: useDataStore((s) => s.saveToHistory),
      pickShape,
      textTool: textToolRef.current,
      getTextIdForShape,
      textBoxMetaRef,
      TextBoxMode
  });

  const moveRef = useRef<MoveState | null>(null);

  const {
      draft,
      setDraft,
      handlePointerDown: draftHandlePointerDown,
      handlePointerMove: draftHandlePointerMove,
      handlePointerUp: draftHandlePointerUp,
      commitPolyline,
      commitDefaultPolygonAt,
      polygonSidesModal,
      setPolygonSidesModal,
      polygonSidesValue,
      setPolygonSidesValue
  } = useDraftHandler({
      activeTool,
      viewTransform,
      snapSettings: snapOptions,
      onAddShape: useDataStore.getState().addShape,
      onFinalizeDraw: (id: string) => {
        setSelectedShapeIds(new Set([id]));
        const ui = useUIStore.getState();
        ui.setSidebarTab('desenho');
        ui.setTool('select');
      },
      activeFloorId,
      activeDiscipline,
      runtime: runtimeRef.current
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (polygonSidesModal && e.key === 'Escape') {
        e.preventDefault();
        setPolygonSidesModal(null);
        return;
      }

      if (activeTool !== 'polyline') return;

      if (e.key === 'Escape') {
        if (draft.kind === 'polyline') {
          e.preventDefault();
          setDraft({ kind: 'none' });
        }
        return;
      }

      if (e.key === 'Enter') {
        if (draft.kind === 'polyline') {
          e.preventDefault();
          commitPolyline(draft.current ? [...draft.points, draft.current] : draft.points);
          setDraft({ kind: 'none' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, polygonSidesModal, draft, commitPolyline, setDraft]);

  const cursor = useMemo(() => {
    if (engineTextEditState.active) return 'text';
    return cursorOverride ? cursorOverride : getCursorForTool(activeTool);
  }, [activeTool, cursorOverride, engineTextEditState.active]);

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
    (evt.currentTarget as HTMLDivElement).setPointerCapture(evt.pointerId);

    if (engineTextEditState.active && textToolRef.current) {
      const world = toWorldPoint(evt, viewTransform);
      const activeTextId = engineTextEditState.textId;
      const activeShapeId = activeTextId !== null ? getShapeIdForText(activeTextId) : null;

      if (activeShapeId) {
        const data = useDataStore.getState();
        const shape = data.shapes[activeShapeId];
        if (shape) {
          const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
          const meta = textBoxMetaRef.current.get(activeTextId!);

          const boxWidth = Math.max(
            0,
            meta
              ? meta.boxMode === TextBoxMode.FixedWidth
                ? meta.constraintWidth
                : meta.maxAutoWidth ?? (shape.width || 0)
              : shape.width || 0
          );
          const boxHeight = Math.max(0, meta?.fixedHeight ?? (shape.height || 0));

          const anchorX = shape.x || 0;
          const anchorY = (shape.y || 0) + boxHeight;

          const minX = anchorX - tolerance;
          const maxX = anchorX + boxWidth + tolerance;
          const minY = (shape.y || 0) - tolerance;
          const maxY = anchorY + tolerance;

          const inside = world.x >= minX && world.x <= maxX && world.y >= minY && world.y <= maxY;

          if (inside) {
             const localX = world.x - anchorX;
             const localY = world.y - anchorY;

             const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
             const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

             textToolRef.current.handlePointerDown(activeTextId!, localX, localY, evt.shiftKey, anchorX, anchorY, shape.rotation || 0, boxMode, constraintWidth);
             textInputProxyRef.current?.focus();
             evt.preventDefault();
             evt.stopPropagation();
             return;
          }
        }
      }

      textToolRef.current.commitAndExit();
    }

    if (evt.button === 2 && activeTool === 'polyline') {
      if (draft.kind === 'polyline') {
        evt.preventDefault();
        commitPolyline(draft.current ? [...draft.points, draft.current] : draft.points);
        setDraft({ kind: 'none' });
        return;
      }
    }

    if (evt.button === 1 || evt.button === 2 || evt.altKey || activeTool === 'pan') {
      beginPan(evt);
      return;
    }

    if (evt.button !== 0) return;

    const world = toWorldPoint(evt, viewTransform);
    const snapped = activeTool === 'select' ? world : (snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world);

    pointerDownRef.current = { x: evt.clientX, y: evt.clientY, world: snapped };
    if (activeTool === 'select') setSelectionBox(null);

    if (activeTool === 'text') {
      textDragStartRef.current = snapped;
      setDraft({ kind: 'text', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'move') {
      const data = useDataStore.getState();
      const selected = Array.from(selectedShapeIds)
        .map((id) => data.shapes[id])
        .filter(Boolean) as Shape[];

      const movable = selected.filter((s) => {
        const layer = data.layers.find((l) => l.id === s.layerId);
        if (layer?.locked) return false;
        return true;
      });

      if (movable.length === 0) return;
      moveRef.current = { start: snapped, snapshot: new Map(movable.map((s) => [s.id, s])) };
      return;
    }

    if (activeTool === 'select') {
        selectHandlePointerDown(evt, world);
        return;
    }

    // Delegate to draft handler
    draftHandlePointerDown(snapped, evt.button, evt.altKey);
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      updatePan(evt);
      return;
    }

    if (engineTextEditState.active) {
       if (textToolRef.current && engineTextEditState.textId !== null) {
          const activeTextId = engineTextEditState.textId;
          const activeShapeId = getShapeIdForText(activeTextId);
          if (activeShapeId) {
             const data = useDataStore.getState();
             const shape = data.shapes[activeShapeId];
             if (shape) {
                const world = toWorldPoint(evt, viewTransform);
             const bbox = getShapeBoundingBox(shape);
             const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
             const inside =
              world.x >= bbox.x - tolerance &&
              world.x <= bbox.x + bbox.width + tolerance &&
              world.y >= bbox.y - tolerance &&
              world.y <= bbox.y + bbox.height + tolerance;
             setCursorOverride(inside ? 'text' : null);

                const anchorY = (shape.y || 0) + (shape.height || 0);
                const anchorX = (shape.x || 0);
                const localX = world.x - anchorX;
                const localY = world.y - anchorY;
                textToolRef.current.handlePointerMove(activeTextId, localX, localY);
             }
          }
       }
       return;
    }

    const world = toWorldPoint(evt, viewTransform);
    const snapped = activeTool === 'select' ? world : (snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world);

    if (activeTool === 'text') {
      if (textDragStartRef.current) {
        setDraft({ kind: 'text', start: textDragStartRef.current, current: snapped });
      }
      return;
    }

    if (activeTool === 'select') {
      selectHandlePointerMove(evt, pointerDownRef.current, snapped);
      return;
    }

    if (activeTool === 'move') {
      const moveState = moveRef.current;
      if (moveState) {
        const data = useDataStore.getState();
        const dx = snapped.x - moveState.start.x;
        const dy = snapped.y - moveState.start.y;
        moveState.snapshot.forEach((shape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;

          const diff: Partial<Shape> = {};
          if (shape.x !== undefined) diff.x = clampTiny(shape.x + dx);
          if (shape.y !== undefined) diff.y = clampTiny(shape.y + dy);
          if (shape.points) diff.points = shape.points.map((p) => ({ x: clampTiny(p.x + dx), y: clampTiny(p.y + dy) }));

          if (Object.keys(diff).length) data.updateShape(id, diff, { skipConnectionSync: true, recordHistory: false });

          if (shape.type === 'text' && textToolRef.current) {
            const textId = getTextIdForShape(id);
            if (textId !== null) {
              const meta = textBoxMetaRef.current.get(textId);
              const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
              const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

              const newAnchorX = diff.x ?? shape.x ?? 0;
              const newShapeY = diff.y ?? shape.y ?? 0;
              const height = shape.height ?? 0;
              const newAnchorY = newShapeY + height;
              textToolRef.current.moveText(textId, newAnchorX, newAnchorY, boxMode, constraintWidth);
            }
          }
        });
      }
      return;
    }

    draftHandlePointerMove(snapped, evt.shiftKey);
  };

  const handlePointerUp = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      endPan();
      return;
    }

    if (evt.button !== 0) return;

    if (engineTextEditState.active) {
       textToolRef.current?.handlePointerUp();
       return;
    }

    if (activeTool === 'text' && textDragStartRef.current) {
      const world = toWorldPoint(evt, viewTransform);
      const snapped = snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world;
      const start = textDragStartRef.current;
      textDragStartRef.current = null;

      if (textToolRef.current) {
        const dx = snapped.x - start.x;
        const dy = snapped.y - start.y;
        const dragDistance = Math.hypot(dx, dy);

        if (dragDistance > 10) {
          textToolRef.current.handleDrag(start.x, start.y, snapped.x, snapped.y);
        } else {
          textToolRef.current.handleClick(start.x, start.y);
        }

        requestAnimationFrame(() => textInputProxyRef.current?.focus());
      }
      setDraft({ kind: 'none' });
      return;
    }

    if (activeTool === 'move') {
      const moveState = moveRef.current;
      moveRef.current = null;
      if (moveState) {
        const data = useDataStore.getState();
        // data.syncConnections(); // REMOVED
        const patches: Patch[] = [];
        moveState.snapshot.forEach((prevShape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;
          const diff: Partial<Shape> = {};
          if (prevShape.x !== curr.x) diff.x = curr.x;
          if (prevShape.y !== curr.y) diff.y = curr.y;
          if (prevShape.points || curr.points) diff.points = curr.points;
          if (Object.keys(diff).length === 0) return;
          patches.push({ type: 'UPDATE', id, diff, prev: prevShape });
        });
        data.saveToHistory(patches);
      }
      return;
    }

    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    const clickNoDrag = !!down && !isDrag(evt.clientX - down.x, evt.clientY - down.y);

    if (activeTool === 'select') {
        selectHandlePointerUp(evt, down);
        return;
    }

    draftHandlePointerUp(down ? down.world : {x:0, y:0}, clickNoDrag);
  };

  const handleDoubleClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select') {
      const world = toWorldPoint({
        currentTarget: evt.currentTarget,
        clientX: evt.clientX,
        clientY: evt.clientY
      } as React.PointerEvent<HTMLDivElement>, viewTransform);

      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hitId = pickShape(world, { x: evt.clientX, y: evt.clientY } as Point, tolerance);

      if (hitId) {
        const data = useDataStore.getState();
        const shape = data.shapes[hitId];
        if (shape && shape.type === 'text') {
          const textWrapperId = shape.id;
          const foundTextId = getTextIdForShape(textWrapperId);

          if (foundTextId !== null && textToolRef.current) {
            useUIStore.getState().setTool('text');

            const anchorY = (shape.y || 0) + (shape.height || 0);
            const anchorX = (shape.x || 0);
            const localX = world.x - anchorX;
            const localY = anchorY - world.y;

            const meta = textBoxMetaRef.current.get(foundTextId);
            const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
            const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

            textToolRef.current.handlePointerDown(foundTextId, localX, localY, evt.shiftKey, anchorX, anchorY, shape.rotation || 0, boxMode, constraintWidth, false);

            requestAnimationFrame(() => textInputProxyRef.current?.focus());
            return;
          }
        }
      }
    }

    if (activeTool === 'polyline') {
        evt.preventDefault();
        if (draft.kind === 'polyline') commitPolyline(draft.current ? [...draft.points, draft.current] : draft.points);
        return;
    }
  };

  const draftSvg = useMemo(() => {
    if (draft.kind === 'none') return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const stroke = toolDefaults.strokeColor || '#22c55e';
    const strokeWidth = Math.max(1, toolDefaults.strokeWidth ?? 2);

    if (draft.kind === 'line') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'arrow') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'rect') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'text') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'ellipse') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'polygon') {
      const sides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      const cx = x + w / 2;
      const cy = y + h / 2;
      const rx = w / 2;
      const ry = h / 2;
      const pts = Array.from({ length: sides }, (_, i) => {
        const t = (i / sides) * Math.PI * 2 - Math.PI / 2;
        return { x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry };
      });
      const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <polygon points={pointsAttr} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    const pts = draft.points;
    const pathPts = [...pts, ...(draft.current ? [draft.current] : [])].map((p) => worldToScreen(p, viewTransform));
    const d = pathPts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    return (
      <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
      </svg>
    );
  }, [canvasSize.height, canvasSize.width, draft, toolDefaults.strokeColor, toolDefaults.strokeWidth, viewTransform, toolDefaults.polygonSides]);

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none', cursor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {draftSvg}
      <SelectionOverlay hideAnchors={engineTextEditState.active} />
      {selectionSvg}
      <TextInputProxy
        ref={textInputProxyRef}
        active={engineTextEditState.active}
        content={engineTextEditState.content}
        caretIndex={engineTextEditState.caretIndex}
        selectionStart={engineTextEditState.selectionStart}
        selectionEnd={engineTextEditState.selectionEnd}
        positionHint={engineTextEditState.caretPosition ?? undefined}
        onInput={(delta: TextInputDelta) => {
          textToolRef.current?.handleInputDelta(delta);
        }}
        onSelectionChange={(start, end) => {
          textToolRef.current?.handleSelectionChange(start, end);
        }}
        onSpecialKey={(key, e) => {
          textToolRef.current?.handleSpecialKey(key, e);
        }}
      />

      <TextCaretOverlay
        caret={caret}
        selectionRects={selectionRects}
        viewTransform={viewTransform}
        anchor={anchor}
        rotation={rotation}
      />
      {polygonSidesModal ? (
        <>
          <div className="absolute inset-0 z-[60]" onPointerDown={() => setPolygonSidesModal(null)} />
          <div
            className="absolute left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2 w-[280px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3 text-slate-100">
              <div className="text-xs font-semibold mb-2">Lados do polígono</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={3}
                  max={24}
                  value={polygonSidesValue}
                  onChange={(e) => setPolygonSidesValue(Number.parseInt(e.target.value, 10))}
                  className="w-full h-8 bg-slate-800 border border-slate-700 rounded px-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <button
                  type="button"
                  className="h-8 px-3 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
                  onClick={() => {
                    const defaultSides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
                    const sides = Number.isFinite(polygonSidesValue) ? polygonSidesValue : defaultSides;
                    commitDefaultPolygonAt(polygonSidesModal.center, sides);
                    setPolygonSidesModal(null);
                  }}
                >
                  OK
                </button>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">Min 3, max 24. Tamanho inicial 100×100.</div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default EngineInteractionLayer;
