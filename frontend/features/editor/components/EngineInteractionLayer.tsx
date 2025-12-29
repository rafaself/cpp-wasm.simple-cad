import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Point } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { toWorldPoint, isDrag, getCursorForTool } from '@/features/editor/utils/interactionHelpers';
import SelectionOverlay from './SelectionOverlay';
import { MarqueeOverlay } from './MarqueeOverlay';
import { HIT_TOLERANCE } from '@/config/constants';
import { getEngineRuntime } from '@/engine/core/singleton';
import { TransformMode } from '@/engine/core/interactionSession';
import { TextTool } from '@/engine/tools/TextTool';
import { TextInputProxy, type TextInputProxyRef } from '@/components/TextInputProxy';
import { TextCaretOverlay } from '@/components/TextCaretOverlay';
import type { TextInputDelta } from '@/types/text';
import { TextBoxMode } from '@/types/text';
import { getTextMeta } from '@/engine/core/textEngineSync';
import { SelectionMode, type EntityId } from '@/engine/core/protocol';
import { CommandOp } from '@/engine/core/commandBuffer';
import { PickEntityKind } from '@/types/picking';
import { supportsEngineResize } from '@/engine/core/capabilities';

// Hooks
import { useSelectInteraction } from '@/features/editor/hooks/useSelectInteraction';
import { useDraftHandler } from '@/features/editor/hooks/useDraftHandler';
import { useTextEditHandler } from '@/features/editor/hooks/useTextEditHandler';
import { useEngineTextEditState } from '@/features/editor/hooks/useEngineTextEditState';
import { usePanZoom } from '@/features/editor/hooks/interaction/usePanZoom';
import { useEngineSession } from '@/features/editor/hooks/interaction/useEngineSession';
import { useSelectToolHandler } from '@/features/editor/hooks/interaction/useSelectToolHandler';
import { useKeyboardEffects } from '@/features/editor/hooks/interaction/useKeyboardEffects';

const EngineInteractionLayer: React.FC = () => {
  // ─── Store State ───
  const viewTransform = useUIStore((s) => s.viewTransform);
  const activeTool = useUIStore((s) => s.activeTool);
  const setInteractionDragActive = useUIStore((s) => s.setInteractionDragActive);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const activeLayerId = useUIStore((s) => s.activeLayerId);

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);
  const snapOptions = useSettingsStore((s) => s.snap);
  const gridSize = useSettingsStore((s) => s.grid.size);
  const enableEngineResize = useSettingsStore((s) => s.featureFlags.enableEngineResize);
  const engineCapabilitiesMask = useSettingsStore((s) => s.engineCapabilitiesMask);

  const engineResizeEnabled = enableEngineResize && supportsEngineResize(engineCapabilitiesMask);

  // ─── Refs ───
  const layerRef = useRef<HTMLDivElement | null>(null);
  const capturedPointerIdRef = useRef<number | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; world: Point } | null>(null);
  const textDragStartRef = useRef<Point | null>(null);
  const runtimeRef = useRef<Awaited<ReturnType<typeof getEngineRuntime>> | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const textToolRef = useRef<TextTool | null>(null);
  const textInputProxyRef = useRef<TextInputProxyRef>(null);

  // ─── Core Hooks ───
  const { isPanningRef, beginPan, updatePan, endPan, handleWheel } = usePanZoom();

  const {
    selectionBox, setSelectionBox,
    cursorOverride, setCursorOverride,
    handlePointerDown: selectHandlePointerDown,
    handlePointerMove: selectHandlePointerMove,
    handlePointerUp: selectHandlePointerUp,
  } = useSelectInteraction({ viewTransform, runtime: runtimeRef.current });

  const {
    dragRef, marqueeArmedRef,
    beginEngineSession, cancelActiveEngineSession, commitEngineSession,
  } = useEngineSession({
    runtime: runtimeRef.current, layerRef, capturedPointerIdRef, pointerDownRef,
    setSelectionBox, setCursorOverride,
  });

  const { caret, selectionRects, anchor, rotation, engineTextEditState } = useTextEditHandler({
    viewTransform, runtime: runtimeReady ? runtimeRef.current : null, textInputProxyRef, textToolRef,
  });

  const activeTextData = useEngineTextEditState(runtimeReady ? runtimeRef.current : null);

  const {
    draft, setDraft,
    handlePointerDown: draftHandlePointerDown,
    handlePointerMove: draftHandlePointerMove,
    handlePointerUp: draftHandlePointerUp,
    commitPolyline, commitDefaultPolygonAt,
    polygonSidesModal, setPolygonSidesModal, polygonSidesValue, setPolygonSidesValue,
  } = useDraftHandler({
    activeTool, viewTransform, snapSettings: snapOptions, activeLayerId, runtime: runtimeRef.current,
    onFinalizeDraw: (entityId: EntityId) => {
      setEngineSelection([entityId], SelectionMode.Replace);
      useUIStore.getState().setSidebarTab('desenho');
      useUIStore.getState().setTool('select');
    },
  });

  // ─── Selection Helpers ───
  const readSelectionIds = useCallback((): EntityId[] => {
    return runtimeRef.current ? Array.from(runtimeRef.current.getSelectionIds()) : [];
  }, []);

  const setEngineSelection = useCallback((ids: EntityId[], mode: SelectionMode) => {
    runtimeRef.current?.setSelection(ids, mode);
    return readSelectionIds();
  }, [readSelectionIds]);

  const clearEngineSelection = useCallback(() => {
    runtimeRef.current?.clearSelection();
    return readSelectionIds();
  }, [readSelectionIds]);

  // ─── Cursor ───
  const cursor = useMemo(() => {
    if (engineTextEditState.active) return 'text';
    return cursorOverride ?? getCursorForTool(activeTool);
  }, [activeTool, cursorOverride, engineTextEditState.active]);

  // ─── Select Tool Handler ───
  const { handleSelectPointerDown, handleSelectPointerMove, handleSelectPointerUp } = useSelectToolHandler({
    runtime: runtimeRef.current, viewTransform, engineResizeEnabled,
    dragRef, marqueeArmedRef, beginEngineSession,
    setSelectionBox, setCursorOverride, setEngineSelection, readSelectionIds,
    selectHandlePointerDown, selectHandlePointerMove, selectHandlePointerUp, clearEngineSelection, cursor,
  });

  // ─── Keyboard Effects ───
  useKeyboardEffects({
    activeTool, engineTextEditActive: engineTextEditState.active,
    polygonSidesModal, draft, setPolygonSidesModal, setDraft, commitPolyline, cancelActiveEngineSession,
  });

  // ─── Runtime Init ───
  useEffect(() => {
    let disposed = false;
    (async () => {
      const runtime = await getEngineRuntime();
      if (!disposed) { runtimeRef.current = runtime; setRuntimeReady(true); }
    })();
    return () => { disposed = true; };
  }, []);

  // ─── Engine Sync ───
  useEffect(() => {
    runtimeRef.current?.setSnapOptions?.(snapOptions.enabled, snapOptions.grid, gridSize);
  }, [snapOptions.enabled, snapOptions.grid, gridSize, runtimeReady]);

  useEffect(() => {
    runtimeRef.current?.apply([{
      op: CommandOp.SetViewScale,
      view: { x: viewTransform.x, y: viewTransform.y, scale: viewTransform.scale, width: canvasSize.width, height: canvasSize.height },
    }]);
  }, [viewTransform, canvasSize, runtimeReady]);

  // ─── Pointer Handlers ───
  const handlePointerCancel = () => {
    cancelActiveEngineSession('pointercancel');
    capturedPointerIdRef.current = null;
    pointerDownRef.current = null;
    marqueeArmedRef.current = false;
    setInteractionDragActive(false);
    setSelectionBox(null);
    setCursorOverride(null);
  };

  const handleLostPointerCapture = () => {
    cancelActiveEngineSession('lostpointercapture');
    capturedPointerIdRef.current = null;
    pointerDownRef.current = null;
    marqueeArmedRef.current = false;
    setInteractionDragActive(false);
    setSelectionBox(null);
    setCursorOverride(null);
  };

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (runtimeRef.current?.isInteractionActive?.() && dragRef.current.type !== 'engine_session') {
      cancelActiveEngineSession('stale_before_pointerdown');
    }

    (evt.currentTarget as HTMLDivElement).setPointerCapture(evt.pointerId);
    capturedPointerIdRef.current = evt.pointerId;

    // Text Edit Priority
    if (engineTextEditState.active && textToolRef.current) {
      const world = toWorldPoint(evt, viewTransform);
      const activeTextId = engineTextEditState.textId;
      if (activeTextId !== null && runtimeRef.current?.pickEx && runtimeRef.current?.getEntityAabb) {
        const runtime = runtimeRef.current;
        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
        const res = runtime.pickEx(world.x, world.y, tolerance, 0xFF);
        if (res.id === activeTextId) {
          const aabb = runtime.getEntityAabb(activeTextId);
          if (aabb.valid) {
            const meta = getTextMeta(activeTextId);
            const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
            const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;
            textToolRef.current.handlePointerDown(activeTextId, world.x - aabb.minX, world.y - aabb.maxY, evt.shiftKey, aabb.minX, aabb.maxY, 0, boxMode, constraintWidth);
            textInputProxyRef.current?.focus();
            evt.preventDefault();
            evt.stopPropagation();
            return;
          }
        }
      }
      textToolRef.current.commitAndExit();
    }

    // Pan/Polyline right-click
    if (evt.button === 2 && activeTool === 'polyline' && draft.kind === 'polyline') {
      evt.preventDefault();
      commitPolyline(draft.current ? [...draft.points, draft.current] : draft.points);
      setDraft({ kind: 'none' });
      return;
    }

    if (evt.button === 1 || evt.button === 2 || evt.altKey || activeTool === 'pan') {
      beginPan(evt);
      return;
    }

    if (evt.button !== 0) return;

    const world = toWorldPoint(evt, viewTransform);
    let snapped = world;
    if (runtimeRef.current?.getSnappedPoint) {
      const p = runtimeRef.current.getSnappedPoint(world.x, world.y);
      snapped = { x: p.x, y: p.y };
    }
    pointerDownRef.current = { x: evt.clientX, y: evt.clientY, world: snapped };

    if (activeTool === 'select') { handleSelectPointerDown(evt, world, snapped); return; }
    if (activeTool === 'text') { textDragStartRef.current = snapped; return; }
    if (activeTool === 'move') {
      const activeIds = readSelectionIds();
      if (activeIds.length > 0 && beginEngineSession(activeIds, TransformMode.Move, 0, -1, snapped.x, snapped.y)) {
        dragRef.current = { type: 'engine_session', startWorld: snapped };
      }
      return;
    }
    draftHandlePointerDown(snapped, evt.button, evt.altKey);
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) { updatePan(evt); return; }

    const world = toWorldPoint(evt, viewTransform);
    let snapped = world;
    if (runtimeRef.current?.getSnappedPoint) {
      const p = runtimeRef.current.getSnappedPoint(world.x, world.y);
      snapped = { x: p.x, y: p.y };
    }

    if (dragRef.current.type === 'engine_session') {
      runtimeRef.current?.updateTransform(world.x, world.y);
      return;
    }

    // Text Edit Hover
    if (engineTextEditState.active && textToolRef.current && engineTextEditState.textId !== null) {
      const runtime = runtimeRef.current;
      if (runtime?.getEntityAabb && runtime.pickEx) {
        const activeTextId = engineTextEditState.textId;
        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
        const res = runtime.pickEx(world.x, world.y, tolerance, 0xFF);
        setCursorOverride(res.id === activeTextId ? 'text' : null);
        const aabb = runtime.getEntityAabb(activeTextId);
        if (aabb.valid) textToolRef.current.handlePointerMove(activeTextId, world.x - aabb.minX, world.y - aabb.maxY);
      }
      return;
    }

    if (activeTool === 'select') { handleSelectPointerMove(world, snapped, pointerDownRef.current); return; }
    draftHandlePointerMove(snapped, evt.shiftKey);
  };

  const handlePointerUp = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) { endPan(); return; }
    if (evt.button !== 0) return;

    if (dragRef.current.type !== 'none') { commitEngineSession(); return; }

    // Text Tool
    if (activeTool === 'text' && textDragStartRef.current) {
      let snapped = toWorldPoint(evt, viewTransform);
      if (runtimeRef.current?.getSnappedPoint) {
        const p = runtimeRef.current.getSnappedPoint(snapped.x, snapped.y);
        snapped = { x: p.x, y: p.y };
      }
      const start = textDragStartRef.current;
      textDragStartRef.current = null;
      if (textToolRef.current) {
        if (Math.hypot(snapped.x - start.x, snapped.y - start.y) > 10) {
          textToolRef.current.handleDrag(start.x, start.y, snapped.x, snapped.y);
        } else {
          textToolRef.current.handleClick(start.x, start.y);
        }
        requestAnimationFrame(() => textInputProxyRef.current?.focus());
      }
      return;
    }

    if (engineTextEditState.active) { textToolRef.current?.handlePointerUp(); return; }

    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    const clickNoDrag = !!down && !isDrag(evt.clientX - down.x, evt.clientY - down.y);

    if (activeTool === 'select') { handleSelectPointerUp(evt, down, clickNoDrag); return; }
    draftHandlePointerUp(down ? down.world : { x: 0, y: 0 }, clickNoDrag);
  };

  const handleDoubleClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'select') {
      const world = toWorldPoint({ currentTarget: evt.currentTarget, clientX: evt.clientX, clientY: evt.clientY } as React.PointerEvent<HTMLDivElement>, viewTransform);
      const runtime = runtimeRef.current;
      if (!runtime) return;
      const res = runtime.pickEx(world.x, world.y, HIT_TOLERANCE / (viewTransform.scale || 1), 3);
      if (res.id !== 0 && res.kind === PickEntityKind.Text && textToolRef.current) {
        useUIStore.getState().setTool('text');
        const aabb = runtime.getEntityAabb?.(res.id);
        if (!aabb?.valid) return;
        const meta = getTextMeta(res.id);
        const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
        const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;
        textToolRef.current.handlePointerDown(res.id, world.x - aabb.minX, world.y - aabb.maxY, evt.shiftKey, aabb.minX, aabb.maxY, 0, boxMode, constraintWidth, false);
        requestAnimationFrame(() => textInputProxyRef.current?.focus());
      }
    } else if (activeTool === 'polyline' && draft.kind === 'polyline') {
      evt.preventDefault();
      commitPolyline(draft.current ? [...draft.points, draft.current] : draft.points);
    }
  };

  // ─── Render ───
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none', cursor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      ref={layerRef}
    >
      <SelectionOverlay hideAnchors={engineTextEditState.active} />
      <MarqueeOverlay selectionBox={selectionBox} viewTransform={viewTransform} canvasSize={canvasSize} />
      <TextInputProxy
        ref={textInputProxyRef}
        active={engineTextEditState.active}
        content={activeTextData.content}
        caretIndex={activeTextData.caretIndex}
        selectionStart={activeTextData.selectionStart}
        selectionEnd={activeTextData.selectionEnd}
        positionHint={engineTextEditState.caretPosition ?? undefined}
        onInput={(delta: TextInputDelta) => textToolRef.current?.handleInputDelta(delta)}
        onSelectionChange={(start, end) => textToolRef.current?.handleSelectionChange(start, end)}
        onSpecialKey={(key, e) => textToolRef.current?.handleSpecialKey(key, e)}
      />
      <TextCaretOverlay caret={caret} selectionRects={selectionRects} viewTransform={viewTransform} anchor={anchor} rotation={rotation} />
      {polygonSidesModal && (
        <>
          <div className="absolute inset-0 z-[60]" onPointerDown={() => setPolygonSidesModal(null)} />
          <div className="absolute left-1/2 top-1/2 z-[61] -translate-x-1/2 -translate-y-1/2 w-[280px]" onPointerDown={(e) => e.stopPropagation()}>
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-3 text-slate-100">
              <div className="text-xs font-semibold mb-2">Lados do polígono</div>
              <div className="flex items-center gap-2">
                <input type="number" min={3} max={24} value={polygonSidesValue} onChange={(e) => setPolygonSidesValue(Number.parseInt(e.target.value, 10))} className="w-full h-8 bg-slate-800 border border-slate-700 rounded px-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500" autoFocus />
                <button type="button" className="h-8 px-3 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium" onClick={() => { commitDefaultPolygonAt(polygonSidesModal.center, Math.max(3, Math.min(24, polygonSidesValue || toolDefaults.polygonSides || 6))); setPolygonSidesModal(null); }}>OK</button>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">Min 3, max 24. Tamanho inicial 100×100.</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EngineInteractionLayer;
