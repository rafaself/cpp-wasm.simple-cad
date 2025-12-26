import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layer, Patch, Point, Shape } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { toWorldPoint, clampTiny, snapToGrid, isDrag, getCursorForTool } from '@/features/editor/utils/interactionHelpers';
import SelectionOverlay from './SelectionOverlay';
import { HIT_TOLERANCE } from '@/config/constants';
import { getEngineRuntime } from '@/engine/core/singleton';
import { applyCommitOpToShape, TransformMode, TransformOpCode } from '@/engine/core/interactionSession';
import { TextTool } from '@/engine/tools/TextTool';
import { TextInputProxy, type TextInputProxyRef } from '@/components/TextInputProxy';
import { TextCaretOverlay } from '@/components/TextCaretOverlay';
import type { TextInputDelta } from '@/types/text';
import { TextBoxMode } from '@/types/text';
import { getTextIdForShape, getShapeIdForText } from '@/engine/core/textEngineSync';
import { getShapeBoundingBox, worldToScreen } from '@/utils/geometry';
import { PickSubTarget } from '@/types/picking';
import { getEngineId, getShapeId as getShapeIdFromRegistry } from '@/engine/core/IdRegistry';
import { isShapeInteractable } from '@/utils/visibility';
import { supportsEngineResize } from '@/engine/core/capabilities';

// New hooks
import { useSelectInteraction, type MoveState } from '@/features/editor/hooks/useSelectInteraction';
import { useDraftHandler } from '@/features/editor/hooks/useDraftHandler';
import { useTextEditHandler, type TextBoxMeta } from '@/features/editor/hooks/useTextEditHandler';
import { usePanZoom } from '@/features/editor/hooks/interaction/usePanZoom';

// Minimal internal drag state for engine-first interaction
type DragMode =
  | { type: "none" }
  | { type: "move"; id: string }
  | { type: "vertex"; id: string; vertexIndex: number; startWorld: Point; snapshot: Shape }
  | { type: "edge"; id: string; edgeIndex: number; startWorld: Point; snapshot: Shape } // Placeholder
  | { type: "engine_session"; startWorld: Point; vertexIndex?: number; activeId?: string };

const EngineInteractionLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const activeTool = useUIStore((s) => s.activeTool);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const setSelectedShapeIds = useUIStore((s) => s.setSelectedShapeIds);
  const setEngineInteractionActive = useUIStore((s) => s.setEngineInteractionActive);
  const setInteractionDragActive = useUIStore((s) => s.setInteractionDragActive);
  const canvasSize = useUIStore((s) => s.canvasSize);

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);
  const snapOptions = useSettingsStore((s) => s.snap);
  const gridSize = useSettingsStore((s) => s.grid.size);
  const enableEngineResize = useSettingsStore((s) => s.featureFlags.enableEngineResize);
  const engineCapabilitiesMask = useSettingsStore((s) => s.engineCapabilitiesMask);
  const engineResizeEnabled = enableEngineResize && supportsEngineResize(engineCapabilitiesMask);

  const layerRef = useRef<HTMLDivElement | null>(null);
  const capturedPointerIdRef = useRef<number | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  const dragRef = useRef<DragMode>({ type: "none" });
  const marqueeArmedRef = useRef(false);
  
  // Pan/Zoom hook
  const { isPanningRef, beginPan, updatePan, endPan, handleWheel } = usePanZoom();

  const runtimeRef = useRef<Awaited<ReturnType<typeof getEngineRuntime>> | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);

  const textToolRef = useRef<TextTool | null>(null);
  const textInputProxyRef = useRef<TextInputProxyRef>(null);
  const textBoxMetaRef = useRef<Map<number, TextBoxMeta>>(new Map());

  // Track if we're dragging for FixedWidth text creation
  const textDragStartRef = useRef<{ x: number; y: number } | null>(null);

  const isShapeSelectable = useCallback(
    (shape: Shape | undefined, layers: Layer[]): boolean => {
      if (!shape) return false;
      const layer = layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) return false;
      return isShapeInteractable(shape, {
        activeFloorId: activeFloorId ?? 'terreo',
      });
    },
    [activeFloorId],
  );

  const beginEngineSession = useCallback(
    (ids: number[], mode: TransformMode, specificId: number, vertexIndex: number, startX: number, startY: number): boolean => {
      const runtime = runtimeRef.current;
      if (!runtime) return false;
      if (typeof runtime.engine?.beginTransform !== 'function') return false;
      setEngineInteractionActive(true);
      runtime.beginTransform(ids, mode, specificId, vertexIndex, startX, startY);
      return true;
    },
    [setEngineInteractionActive],
  );

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

  const pickShape = useCallback((world: Point, screen: Point, tolerance: number): string | null => {
    // Legacy pickShape is less critical now for selection if we use pickEx in pointerDown,
    // but useful for hover cursors or double click.
    if (runtimeRef.current) {
        const pickMask = 3; // Body(1) | Edge(2)
        const res = runtimeRef.current.pickEx(world.x, world.y, tolerance, pickMask);
        if (res.id !== 0) {
            const data = useDataStore.getState();
            const shapeId = getShapeIdFromRegistry(res.id);
            if (!shapeId) return null;
            if (!isShapeSelectable(data.shapes[shapeId], data.layers)) return null;
            return shapeId;
        }
    }
    return null;
  }, [isShapeSelectable, viewTransform]);

  const {
      selectionBox,
      setSelectionBox,
      cursorOverride,
      setCursorOverride,
      handlePointerDown: selectHandlePointerDown,
      handlePointerMove: selectHandlePointerMove,
      handlePointerUp: selectHandlePointerUp
  } = useSelectInteraction({
      viewTransform,
      shapes: useDataStore((s) => s.shapes),
      layers: useDataStore((s) => s.layers),
      onSetSelectedShapeIds: setSelectedShapeIds,
      runtime: runtimeRef.current
  });

  const cancelActiveEngineSession = useCallback(
    (reason: string): boolean => {
      const runtime = runtimeRef.current;
      const interactionActive = !!runtime?.isInteractionActive?.() || dragRef.current.type === 'engine_session';
      if (!interactionActive) return false;

      if (import.meta.env.DEV && localStorage.getItem("DEV_TRACE_INTERACTION") === "1") {
        console.log(`[EngineInteractionLayer] cancelActiveEngineSession reason=${reason}`);
      }

      runtime?.cancelTransform?.();

      // Best-effort: release pointer capture if we still hold it.
      try {
        const el = layerRef.current;
        const pid = capturedPointerIdRef.current;
        if (el && pid !== null) {
          el.releasePointerCapture(pid);
        }
      } catch {
        // ignore
      }

      capturedPointerIdRef.current = null;
      pointerDownRef.current = null;
      dragRef.current = { type: "none" };
      marqueeArmedRef.current = false;
      setSelectionBox(null);
      setCursorOverride(null);
      setEngineInteractionActive(false);
      return true;
    },
    [setCursorOverride, setEngineInteractionActive, setSelectionBox],
  );

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (engineTextEditState.active) return;
      const canceled = cancelActiveEngineSession('escape');
      if (canceled) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelActiveEngineSession, engineTextEditState.active]);

  useEffect(() => {
    const handleBlur = () => {
      if (engineTextEditState.active) return;
      cancelActiveEngineSession('blur');
    };

    const handleVisibilityChange = () => {
      if (engineTextEditState.active) return;
      if (document.visibilityState === 'hidden') {
        cancelActiveEngineSession('visibilitychange:hidden');
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cancelActiveEngineSession, engineTextEditState.active]);

  const cursor = useMemo(() => {
    if (engineTextEditState.active) return 'text';
    return cursorOverride ? cursorOverride : getCursorForTool(activeTool);
  }, [activeTool, cursorOverride, engineTextEditState.active]);

  const handlePointerCancel = (evt: React.PointerEvent<HTMLDivElement>) => {
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
    // If the engine reports an active interaction but the local drag state is not tracking it,
    // we are likely in a stuck state (lost pointer events). Cancel defensively to unblock sync.
    if (runtimeRef.current?.isInteractionActive?.() && dragRef.current.type !== 'engine_session') {
      cancelActiveEngineSession('stale_before_pointerdown');
    }

    (evt.currentTarget as HTMLDivElement).setPointerCapture(evt.pointerId);
    capturedPointerIdRef.current = evt.pointerId;

    // Text Edit Logic Priority
    if (engineTextEditState.active && textToolRef.current) {
      const world = toWorldPoint(evt, viewTransform);
      const activeTextId = engineTextEditState.textId;
      const activeShapeId = activeTextId !== null ? getShapeIdForText(activeTextId) : null;
      if (activeShapeId) {
        const data = useDataStore.getState();
        const shape = data.shapes[activeShapeId];
        if (shape) {
            // ... (Existing text hit check logic simplified for brevity, rely on textToolRef internal hitTest or bounds check)
            // For now, keeping existing bounding box logic to respect current implementation structure
            const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
            const meta = textBoxMetaRef.current.get(activeTextId!);
            const boxWidth = Math.max(0, meta ? meta.boxMode === TextBoxMode.FixedWidth ? meta.constraintWidth : meta.maxAutoWidth ?? (shape.width || 0) : shape.width || 0);
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

    // Pan/Zoom/Polyline right-click logic
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

	    if (activeTool === 'select') {
	        setSelectionBox(null);
	        marqueeArmedRef.current = false;

	        // ------------------------------------------------------------------
	        // NEW: Engine-First Picking Logic
	        // ------------------------------------------------------------------
	        if (runtimeRef.current) {
	            const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
	            // Mask: Body | Edge | Vertex (+ Handles behind feature flag)
	            const pickMask = engineResizeEnabled ? 15 : 7; // Body(1) | Edge(2) | Vertex(4) | Handle(8)
	            // PickSubTarget: None=0, Body=1, Edge=2, Vertex=3, ResizeHandle=4, RotateHandle=5, TextBody=6, TextCaret=7
	            // PickMask in pick_system.cpp: PICK_BODY=1, PICK_EDGE=2, PICK_VERTEX=4, PICK_HANDLES=8

            const res = runtimeRef.current.pickEx(world.x, world.y, tolerance, pickMask);

            if (import.meta.env.DEV && localStorage.getItem("DEV_TRACE_PICK") === "1") {
                 console.log(`[EngineInteractionLayer] pickEx input: x=${world.x.toFixed(2)} y=${world.y.toFixed(2)} tol=${tolerance.toFixed(2)} mask=${pickMask}`);
                 console.log("[EngineInteractionLayer] pickEx result:", res);
            }

            // CRITICAL: Fallback path check.
            // If WASM is old, pickEx returns subTarget: None, even if it hit an ID (id != 0).
            // We must detect this case.
            // PickResult { id, kind, subTarget, ... }
            // If id != 0 BUT subTarget == None, it implies legacy pick behavior (or weird miss on subtarget).
            // Actually, safe fallback in EngineRuntime returns subTarget: None.

            // If subTarget != None, we have granular info.
            if (res.subTarget !== PickSubTarget.None && res.id !== 0) {
                 const data = useDataStore.getState();
                 const strId = getShapeIdFromRegistry(res.id);
                 const shape = strId ? data.shapes[strId] : undefined;
                 if (strId && isShapeSelectable(shape, data.layers)) {
	                     // Ensure selection
	                     const nextSelectionIds = selectedShapeIds.has(strId) ? selectedShapeIds : new Set([strId]);
	                     if (nextSelectionIds !== selectedShapeIds) {
	                        setSelectedShapeIds(nextSelectionIds);
	                     }

                     // Prepare IDs for Engine Session
                     // We need to pass ALL selected IDs if we are moving?
                     // Or just the one we clicked if it's vertex/resize?
                     // Verify: Engine supports multi-selection move?
                     // beginTransform takes a list of IDs.
                     // If moving, pass all selected IDs.
                     // If vertex drag, usually only one shape is active for vertex edit at a time?
                     // Assuming single shape vertex edit for MVP.
                     
	                     const activeIds = Array.from(nextSelectionIds)
	                        .filter((id) => isShapeSelectable(data.shapes[id], data.layers))
	                        .map((id) => getEngineId(id))
	                        .filter((x): x is number => x !== null && x !== 0);

	                     if (engineResizeEnabled && res.subTarget === PickSubTarget.ResizeHandle && res.subIndex >= 0 && shape) {
	                         // Engine-first bbox resize (dev-flagged). For now, force single-shape resize.
	                         if (shape.type === 'rect' || shape.type === 'circle' || shape.type === 'polygon') {
	                           const nextSingle = new Set([strId]);
	                           if (selectedShapeIds.size !== 1 || !selectedShapeIds.has(strId)) {
	                             setSelectedShapeIds(nextSingle);
	                           }

	                           const idHash = getEngineId(strId);
	                           if (idHash !== null) {
	                             const cursor = res.subIndex === 0 || res.subIndex === 2 ? 'nesw-resize' : 'nwse-resize';
	                             setCursorOverride(cursor);
	                             if (beginEngineSession([idHash], TransformMode.Resize, idHash, res.subIndex, snapped.x, snapped.y)) {
	                               dragRef.current = { type: "engine_session", startWorld: snapped, vertexIndex: res.subIndex, activeId: strId };
	                               return;
	                             }
	                           }
	                         }
	                     }

	                     if (res.subTarget === PickSubTarget.Vertex && res.subIndex >= 0 && shape) {
	                         // Shape Vertex Drag
	                         const idHash = getEngineId(strId);
	                         if (idHash !== null) {
	                           setCursorOverride('move');
	                           if (beginEngineSession([idHash], TransformMode.VertexDrag, idHash, res.subIndex, snapped.x, snapped.y)) {
	                             dragRef.current = { type: "engine_session", startWorld: snapped, vertexIndex: res.subIndex, activeId: strId };
	                             return;
	                           }
	                         }
	                     } 
	                     else if (res.subTarget === PickSubTarget.Edge) {
                          // Edge Drag (treat as Move for now, or implement edge drag if engine supports it)
                          // Engine supports EdgeDrag (2).
	                          // For now, let's Map Edge Drag to Move if we want standard behavior, 
	                          // OR pass EdgeDrag to engine if engine implements it.
	                          // Engine implementation: EdgeDrag -> updates x/y? 
	                          // Let's use Move behavior for Edge/Body hits for now to support multi-select move.
	                          if (activeIds.length > 0) {
	                              setCursorOverride('move');
	                              if (beginEngineSession(activeIds, TransformMode.Move, 0, -1, snapped.x, snapped.y)) {
	                                dragRef.current = { type: "engine_session", startWorld: snapped };
	                                return;
	                              }
	                          }
	                     }
	                     else if (res.subTarget === PickSubTarget.Body || res.subTarget === PickSubTarget.TextBody) {
	                          if (activeIds.length > 0) {
	                              setCursorOverride('move');
	                              if (beginEngineSession(activeIds, TransformMode.Move, 0, -1, snapped.x, snapped.y)) {
	                                dragRef.current = { type: "engine_session", startWorld: snapped };
	                                return;
	                              }
	                          }
	                     }
                 }
            }
	            if (res.id !== 0 && res.subTarget === PickSubTarget.None) {
	                 const data = useDataStore.getState();
	                 const strId = getShapeIdFromRegistry(res.id);
	                 const shape = strId ? data.shapes[strId] : undefined;
	                 if (strId && isShapeSelectable(shape, data.layers)) {
	                     const nextSelectionIds = selectedShapeIds.has(strId) ? selectedShapeIds : new Set([strId]);
	                     if (nextSelectionIds !== selectedShapeIds) {
	                         setSelectedShapeIds(nextSelectionIds);
	                     }
		                     const activeIds = Array.from(nextSelectionIds)
		                        .filter((id) => isShapeSelectable(data.shapes[id], data.layers))
		                        .map((id) => getEngineId(id))
		                        .filter((x): x is number => x !== null && x !== 0);
		                     if (activeIds.length > 0) {
		                         setCursorOverride('move');
		                         if (beginEngineSession(activeIds, TransformMode.Move, 0, -1, snapped.x, snapped.y)) {
		                           dragRef.current = { type: "engine_session", startWorld: snapped };
		                           return;
		                         }
	                     }
                 }
            }
	            // Miss → marquee selection (handled by useSelectInteraction).
	        }

	        marqueeArmedRef.current = true;
	        selectHandlePointerDown(evt, world);
	        return;
	    }

    // Tools logic
    if (activeTool === 'text') {
      textDragStartRef.current = snapped;
      setDraft({ kind: 'text', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'move') {
      const data = useDataStore.getState();
      const selected = Array.from(selectedShapeIds).map((id) => data.shapes[id]).filter(Boolean) as Shape[];
      const movable = selected.filter((s) => {
        const layer = data.layers.find((l) => l.id === s.layerId);
        return !(layer?.locked);
      });
      if (movable.length > 0) {
        moveRef.current = { start: snapped, snapshot: new Map(movable.map((s) => [s.id, s])) };
        setInteractionDragActive(true);
      } else {
        setInteractionDragActive(false);
      }
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

    const world = toWorldPoint(evt, viewTransform);
    const snapped = activeTool === 'select' ? world : (snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world);

    // ------------------------------------------------------------------
    // NEW: Handle Drag Modes
    // ------------------------------------------------------------------
    if (dragRef.current.type === 'engine_session') {
        if (runtimeRef.current) {
            runtimeRef.current.updateTransform(snapped.x, snapped.y);
        }
        return;
    }

    if (dragRef.current.type === 'vertex') {
        const { id, vertexIndex, startWorld, snapshot } = dragRef.current;
        const data = useDataStore.getState();
        const shape = data.shapes[id];
        if (shape && shape.points) {
             // Basic vertex drag logic
             // No complex snapping or 45-deg constraint logic duplicated here yet (MVP)
             const nextPoints = [...shape.points];
             nextPoints[vertexIndex] = { x: clampTiny(snapped.x), y: clampTiny(snapped.y) };
             data.updateShape(id, { points: nextPoints }, { skipConnectionSync: true, recordHistory: false });
        }
        return;
    }

    // Text edit logic
    if (engineTextEditState.active) {
       // ... (existing hover logic)
       if (textToolRef.current && engineTextEditState.textId !== null) {
          const activeTextId = engineTextEditState.textId;
          const activeShapeId = getShapeIdForText(activeTextId);
          if (activeShapeId) {
             const data = useDataStore.getState();
             const shape = data.shapes[activeShapeId];
             if (shape) {
                const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
                const bbox = getShapeBoundingBox(shape);
                const inside = world.x >= bbox.x - tolerance && world.x <= bbox.x + bbox.width + tolerance &&
                               world.y >= bbox.y - tolerance && world.y <= bbox.y + bbox.height + tolerance;
                setCursorOverride(inside ? 'text' : null);
                const anchorY = (shape.y || 0) + (shape.height || 0);
                const anchorX = (shape.x || 0);
                textToolRef.current.handlePointerMove(activeTextId, world.x - anchorX, world.y - anchorY);
             }
          }
       }
       return;
    }

    if (activeTool === 'text') {
      if (textDragStartRef.current) {
        setDraft({ kind: 'text', start: textDragStartRef.current, current: snapped });
      }
      return;
    }

	    if (activeTool === 'select') {
	      const down = pointerDownRef.current;
	      if (!down) {
	        const runtime = runtimeRef.current;
	        if (!runtime) {
	          setCursorOverride(null);
	          return;
	        }

	        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
	        const pickMask = engineResizeEnabled ? 15 : 3; // Body(1) | Edge(2) | Vertex(4) | Handle(8)
	        const res = runtime.pickEx(world.x, world.y, tolerance, pickMask);
	        if (res.id !== 0) {
	          const data = useDataStore.getState();
	          const shapeId = getShapeIdFromRegistry(res.id);
	          const shape = shapeId ? data.shapes[shapeId] : undefined;
	          if (!isShapeSelectable(shape, data.layers)) {
	            setCursorOverride(null);
	            return;
	          }
	          if (engineResizeEnabled && res.subTarget === PickSubTarget.ResizeHandle) {
	            const cursor = res.subIndex === 0 || res.subIndex === 2 ? 'nesw-resize' : 'nwse-resize';
	            setCursorOverride(cursor);
	            return;
	          }
	          setCursorOverride('move');
	          return;
	        }
	        setCursorOverride(null);
	        return;
	      }

	      selectHandlePointerMove(evt, down, snapped);
	      return;
	    }

    if (activeTool === 'move') {
       // ... existing move logic
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
          // Text move sync omitted for brevity, reusing existing structure
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

    // ------------------------------------------------------------------
    // NEW: Cleanup Drag Modes
    // ------------------------------------------------------------------
    if (dragRef.current.type !== 'none') {
        const mode = dragRef.current;
        dragRef.current = { type: 'none' };

        if (mode.type === 'vertex') {
             // Commit history
             const data = useDataStore.getState();
             const curr = data.shapes[mode.id];
             if (curr) {
                 const diff: Partial<Shape> = { points: curr.points };
                 data.saveToHistory([{ type: 'UPDATE', id: mode.id, diff, prev: mode.snapshot }]);
             }
             pointerDownRef.current = null;
             return;
        }

	        if (mode.type === 'engine_session') {
	            if (runtimeRef.current) {
	                const result = runtimeRef.current.commitTransform();
	                if (result) {
	                    const { ids, opCodes, payloads } = result;
	                    const data = useDataStore.getState();
	                    const patches: Patch[] = [];

	                    for(let i=0; i<ids.length; i++) {
	                        const engineId = ids[i];
	                        const strId = getShapeIdFromRegistry(engineId);
	                        if (!strId) continue;
	                        
	                        const prevShape = data.shapes[strId];
	                        if (!prevShape) continue;

	                        const op = opCodes[i] as TransformOpCode;
	                        const diff = applyCommitOpToShape(prevShape, op, payloads, i);

	                        if (diff && Object.keys(diff).length > 0) {
	                            data.updateShape(strId, diff, { skipConnectionSync: true, recordHistory: false });
	                            patches.push({ type: 'UPDATE', id: strId, diff, prev: prevShape });
	                        } else if (import.meta.env.DEV && localStorage.getItem("DEV_TRACE_INTERACTION") === "1") {
	                            console.warn(`[EngineInteractionLayer] Ignored commit entry: id=${engineId} op=${op}`);
	                        }
	                    }

	                    if (patches.length > 0) {
	                        data.saveToHistory(patches);
	                    }
                }
            }
            pointerDownRef.current = null;
            setEngineInteractionActive(false);
            return;
        }
    }

    if (engineTextEditState.active) {
       textToolRef.current?.handlePointerUp();
       return;
    }

    if (activeTool === 'text' && textDragStartRef.current) {
       // ... text creation logic
      const snapped = snapOptions.enabled && snapOptions.grid ? snapToGrid(toWorldPoint(evt, viewTransform), gridSize) : toWorldPoint(evt, viewTransform);
      const start = textDragStartRef.current;
      textDragStartRef.current = null;
      if (textToolRef.current) {
        const dx = snapped.x - start.x;
        const dy = snapped.y - start.y;
        if (Math.hypot(dx, dy) > 10) {
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
      setInteractionDragActive(false);
      return;
    }

    const down = pointerDownRef.current;
    pointerDownRef.current = null;
    const clickNoDrag = !!down && !isDrag(evt.clientX - down.x, evt.clientY - down.y);

	    if (activeTool === 'select') {
	        selectHandlePointerUp(evt, down);
	        if (clickNoDrag && marqueeArmedRef.current) {
	          setSelectedShapeIds(new Set());
	        }
	        marqueeArmedRef.current = false;
	        return;
	    }

    draftHandlePointerUp(down ? down.world : {x:0, y:0}, clickNoDrag);
  };

  const handleDoubleClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    // ... existing double click logic
    if (activeTool === 'select') {
      const world = toWorldPoint({
        currentTarget: evt.currentTarget,
        clientX: evt.clientX,
        clientY: evt.clientY
      } as React.PointerEvent<HTMLDivElement>, viewTransform);

      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      // We can use pickShape (which calls pickEx) here comfortably
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
            const meta = textBoxMetaRef.current.get(foundTextId);
            const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
            const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;
            textToolRef.current.handlePointerDown(foundTextId, world.x - anchorX, anchorY - world.y, evt.shiftKey, anchorX, anchorY, shape.rotation || 0, boxMode, constraintWidth, false);
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

  const selectionSvg = useMemo(() => {
    if (!selectionBox) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const a = worldToScreen(selectionBox.start, viewTransform);
    const b = worldToScreen(selectionBox.current, viewTransform);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);

    const stroke = '#3b82f6';
    const fill = 'rgba(59, 130, 246, 0.2)';
    const strokeDash = selectionBox.direction === 'RTL' ? '5 5' : undefined; // Crossing (RTL) vs Window (LTR)

    return (
      <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25 }}>
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1} strokeDasharray={strokeDash} />
      </svg>
    );
  }, [selectionBox, viewTransform, canvasSize]);

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
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostPointerCapture}
      ref={layerRef}
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
