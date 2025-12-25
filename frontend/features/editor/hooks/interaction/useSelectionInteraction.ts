import { useRef, useState, useCallback } from 'react';
import type { Shape, ViewTransform, Point } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import {
  screenToWorld,
  worldToScreen,
  isDrag,
  getRectCornersWorld,
  getShapeBoundingBox,
  getShapeHandles,
  supportsBBoxResize,
  isShapeInSelection,
  rotatePoint
} from '@/utils/geometry';
import { HIT_TOLERANCE } from '@/config/constants';
import { isShapeInteractable } from '@/utils/visibility';
import { isConduitShape } from '@/features/editor/utils/tools';

// --- Types ---

export type MoveState = { start: { x: number; y: number }; snapshot: Map<string, Shape> };

export type ResizeState = {
  shapeId: string;
  handleIndex: number; // 0 BL, 1 BR, 2 TR, 3 TL
  fixedCornerIndex: number;
  fixedCornerWorld: { x: number; y: number };
  startPointerWorld: { x: number; y: number };
  snapshot: Shape;
  applyMode: 'topLeft' | 'center';
  startAspectRatio: number;
};

export type VertexDragState = {
  shapeId: string;
  vertexIndex: number;
  startPointerWorld: { x: number; y: number };
  snapshot: Shape;
};

export type SelectionState =
  | { kind: 'none' }
  | { kind: 'marquee' }
  | { kind: 'move'; moved: boolean; state: MoveState }
  | { kind: 'resize'; moved: boolean; state: ResizeState }
  | { kind: 'vertex'; moved: boolean; state: VertexDragState };

export type SelectionBox = {
  start: { x: number; y: number };
  current: { x: number; y: number };
  direction: 'LTR' | 'RTL';
};

// --- Helpers ---

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

const rotateVec = (v: { x: number; y: number }, angle: number): { x: number; y: number } => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

const snapVectorTo45Deg = (from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: from.x, y: from.y };
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snappedAngle = Math.round(angle / step) * step;
  return { x: from.x + len * Math.cos(snappedAngle), y: from.y + len * Math.sin(snappedAngle) };
};

const applyResizeToShape = (
  shape: Shape,
  applyMode: ResizeState['applyMode'],
  center: { x: number; y: number },
  w: number,
  h: number,
  scaleX: number,
  scaleY: number,
): Partial<Shape> => {
  if (applyMode === 'center') {
    return { x: clampTiny(center.x), y: clampTiny(center.y), width: clampTiny(w), height: clampTiny(h), scaleX, scaleY };
  }
  return { x: clampTiny(center.x - w / 2), y: clampTiny(center.y - h / 2), width: clampTiny(w), height: clampTiny(h), scaleX, scaleY };
};

const HANDLE_HIT_RADIUS_PX = 10;

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

// --- Hook ---

export function useSelectionInteraction(params: {
  viewTransform: ViewTransform;
  selectedShapeIds: Set<string>;
  shapes: Record<string, Shape>;
  layers: any[];
  spatialIndex: any;
  onUpdateShape: (id: string, diff: Partial<Shape>, recordHistory: boolean) => void;
  onSetSelectedShapeIds: (ids: Set<string>) => void;
  onSaveToHistory: (patches: any[]) => void;
  pickShape: (world: {x:number, y:number}, screen: {x:number, y:number}, tolerance: number) => string | null;
  textTool?: any;
  getTextIdForShape?: (id: string) => number | null;
  textBoxMetaRef?: React.MutableRefObject<Map<number, any>>;
  TextBoxMode?: any;
}) {
  const {
    viewTransform,
    selectedShapeIds,
    shapes,
    layers,
    spatialIndex,
    onUpdateShape,
    onSetSelectedShapeIds,
    onSaveToHistory,
    pickShape
  } = params;

  const interactionRef = useRef<SelectionState>({ kind: 'none' });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);

  const clearSelection = useCallback(() => {
    onSetSelectedShapeIds(new Set());
    interactionRef.current = { kind: 'none' };
    setSelectionBox(null);
  }, [onSetSelectedShapeIds]);

  const pickResizeHandleAtScreen = (
    screenPoint: { x: number; y: number }
  ): { shapeId: string; handleIndex: number; cursor: string } | null => {

    let best: { shapeId: string; handleIndex: number; cursor: string; d2: number } | null = null;
    const hitR2 = HANDLE_HIT_RADIUS_PX * HANDLE_HIT_RADIUS_PX;

    selectedShapeIds.forEach((id) => {
      const shape = shapes[id];
      if (!shape) return;
      if (!supportsBBoxResize(shape)) return;

      const layer = layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) return;
      if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo', activeDiscipline })) return;

      if (shape.type === 'text') {
        const allowTextResize = useSettingsStore.getState().featureFlags.enableTextResize;
        if (!allowTextResize) return;
      }

      const handles = getShapeHandles(shape).filter((h) => h.type === 'resize');
      for (const h of handles) {
        const p = worldToScreen({ x: h.x, y: h.y }, viewTransform);
        const dx = screenPoint.x - p.x;
        const dy = screenPoint.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > hitR2) continue;
        if (!best || d2 < best.d2) best = { shapeId: id, handleIndex: h.index, cursor: h.cursor, d2 };
      }
    });

    return best ? { shapeId: best.shapeId, handleIndex: best.handleIndex, cursor: best.cursor } : null;
  };

  const pickVertexHandleAtScreen = (
    screenPoint: { x: number; y: number }
  ): { shapeId: string; vertexIndex: number } | null => {

    let best: { shapeId: string; vertexIndex: number; d2: number } | null = null;
    const hitR2 = HANDLE_HIT_RADIUS_PX * HANDLE_HIT_RADIUS_PX;

    selectedShapeIds.forEach((id) => {
      const shape = shapes[id];
      if (!shape) return;
      if (shape.type !== 'line' && shape.type !== 'arrow' && shape.type !== 'polyline') return;
      
      const ptsWorld = shape.points ?? [];
      const layer = layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) return;
      if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo', activeDiscipline })) return;

      const pts = ptsWorld.map((p) => worldToScreen(p, viewTransform));
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const dx = screenPoint.x - p.x;
        const dy = screenPoint.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > hitR2) continue;
        if (!best || d2 < best.d2) best = { shapeId: id, vertexIndex: i, d2 };
      }
    });

    return best ? { shapeId: best.shapeId, vertexIndex: best.vertexIndex } : null;
  };

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>, world: {x:number, y:number}) => {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

      const handleHit = pickResizeHandleAtScreen(screen);
      if (handleHit) {
        const shape = shapes[handleHit.shapeId];
        const corners = shape ? getRectCornersWorld(shape) : null;
        if (shape && corners) {
          const bbox0 = getShapeBoundingBox(shape);
          const fixedCornerIndex = (handleHit.handleIndex + 2) % 4;
          interactionRef.current = {
            kind: 'resize',
            moved: false,
            state: {
              shapeId: shape.id,
              handleIndex: handleHit.handleIndex,
              fixedCornerIndex,
              fixedCornerWorld: corners.corners[fixedCornerIndex],
              startPointerWorld: world,
              snapshot: shape,
              applyMode: shape.type === 'circle' || shape.type === 'polygon' ? 'center' : 'topLeft',
              startAspectRatio: (Math.max(1e-3, bbox0.height || 1)) / (Math.max(1e-3, bbox0.width || 1)),
            },
          };
          setCursorOverride(handleHit.cursor);
          return;
        }
      }

      const endpointHit = pickVertexHandleAtScreen(screen);
      if (endpointHit) {
        const shape = shapes[endpointHit.shapeId];
        const layer = shape ? layers.find((l) => l.id === shape.layerId) : null;
        const movable = !!shape && !(layer?.locked) && !isConduitShape(shape);
        if (shape && movable) {
          if (!selectedShapeIds.has(shape.id) || selectedShapeIds.size !== 1) onSetSelectedShapeIds(new Set([shape.id]));
          interactionRef.current = {
            kind: 'vertex',
            moved: false,
            state: { shapeId: shape.id, vertexIndex: endpointHit.vertexIndex, startPointerWorld: world, snapshot: shape },
          };
          setCursorOverride('default');
          return;
        }
      }

      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hitId = pickShape(world, screen, tolerance);
      if (hitId) {
        if (!selectedShapeIds.has(hitId) || selectedShapeIds.size !== 1) onSetSelectedShapeIds(new Set([hitId]));

        const hitShape = shapes[hitId];
        const layer = hitShape ? layers.find((l) => l.id === hitShape.layerId) : null;
        const movable = !!hitShape && !(layer?.locked) && !isConduitShape(hitShape);
        if (movable && hitShape) {
          if (hitShape.type === 'line' || hitShape.type === 'arrow' || hitShape.type === 'polyline') {
            // Check if checking vertices again here is redundant?
            // Already checked above via pickVertexHandleAtScreen.
            // But dragging "near" vertex vs exactly ON vertex handle might be different logic?
            // Keeping simple: if line/arrow, and clicked ON Shape but NOT on vertex, it's a move.
          }

          interactionRef.current = {
            kind: 'move',
            moved: false,
            state: { start: world, snapshot: new Map([[hitId, hitShape]]) },
          };
          setCursorOverride('move');
          return;
        }
        
        interactionRef.current = { kind: 'none' };
        setCursorOverride('move');
        return;
      }

      interactionRef.current = { kind: 'marquee' };
      setSelectionBox(null);
      setCursorOverride(null);
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>, down: {world: {x:number, y:number}} | null, snapped: Point) => {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

      const interaction = interactionRef.current;

      if (!down) {
        const handleHover = pickResizeHandleAtScreen(screen);
        if (handleHover) {
          setCursorOverride(handleHover.cursor);
          return;
        }

        const endpointHover = pickVertexHandleAtScreen(screen);
        if (endpointHover) {
          setCursorOverride('default');
          return;
        }

        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
        const hit = pickShape(snapped, screen, tolerance);
        setCursorOverride(hit ? 'move' : null);
        return;
      }

      const dx = evt.clientX - (down.world.x * viewTransform.scale + viewTransform.x + rect.left); // Approx screen delta?
      // Wait, let's use client coordinates for drag detection
      // But down object has 'world'. We need screen down.
      // passed 'down' arg in original hook had explicit x/y screen.
      // But here I simplified args. Let's fix handlePointerMove signature in usePointerState to give downScreenPos
      
      // Re-deriving screen down from somewhere? 
      // Actually we should assume the caller passes down info correctly. 
      // The caller (EngineInteractionLayer) has pointerRef. 
      // Let's assume passed 'down' has screen coordinates if needed, or we calculate drag from world delta if we trust it.
      // isDrag usage in original code used screen delta. 
      
  };

  // Re-define handlePointerMove to accept screen down pos
  const handlePointerMove2 = (
      evt: React.PointerEvent<HTMLDivElement>, 
      down: { x: number, y: number, world: Point } | null, 
      snapped: Point
  ) => {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
      const interaction = interactionRef.current;

      if (!down) {
         // Hover logic
        const handleHover = pickResizeHandleAtScreen(screen);
        if (handleHover) {
           setCursorOverride(handleHover.cursor);
           return;
        }
        const endpointHover = pickVertexHandleAtScreen(screen);
        if (endpointHover) {
           setCursorOverride('default');
           return;
        }
         const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
         const hit = pickShape(snapped, screen, tolerance);
         setCursorOverride(hit ? 'move' : null);
         return;
      }

      const dx = evt.clientX - down.x; // down.x/y should be clientX/Y
      const dy = evt.clientY - down.y;
      const dragged = isDrag(dx, dy);

      if (interaction.kind === 'move') {
          if (!interaction.moved && !dragged) return;
          if (!interaction.moved) interactionRef.current = { ...interaction, moved: true };

          const moveState = interaction.state;
          const ddx = snapped.x - moveState.start.x;
          const ddy = snapped.y - moveState.start.y;
          moveState.snapshot.forEach((shape, id) => {
             const curr = shapes[id];
             if (!curr) return;
             
             const diff: Partial<Shape> = {};
             if (shape.x !== undefined) diff.x = clampTiny(shape.x + ddx);
             if (shape.y !== undefined) diff.y = clampTiny(shape.y + ddy);
             if (shape.points) diff.points = shape.points.map(p => ({ x: clampTiny(p.x + ddx), y: clampTiny(p.y + ddy) }));
             
             if (Object.keys(diff).length) onUpdateShape(id, diff, false);

             // Text Tool Sync
             if (shape.type === 'text' && params.textTool) {
                const textId = params.getTextIdForShape?.(id);
                if (textId != null && params.textBoxMetaRef?.current) {
                   const meta = params.textBoxMetaRef.current.get(textId);
                   const TextBoxMode = params.TextBoxMode;
                   const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
                   const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;
                   const newAnchorX = diff.x ?? shape.x ?? 0;
                   const newAnchorY = (diff.y ?? shape.y ?? 0) + (shape.height ?? 0);
                   params.textTool.moveText(textId, newAnchorX, newAnchorY, boxMode, constraintWidth);
                }
             }
          });
          return;
      }

      if (interaction.kind === 'vertex') {
         if (!interaction.moved && !dragged) return;
         if (!interaction.moved) interactionRef.current = { ...interaction, moved: true };
         const { state } = interaction;
         const curr = shapes[state.shapeId];
         if (!curr || !curr.points) return;
         
         let nextPoint = { x: clampTiny(snapped.x), y: clampTiny(snapped.y) };
         if ((curr.type === 'line' || curr.type === 'arrow') && curr.points.length >= 2 && evt.shiftKey) {
             const fixedIdx = state.vertexIndex === 0 ? 1 : 0;
             const fixed = curr.points[fixedIdx];
             if (fixed) nextPoint = snapVectorTo45Deg(fixed, nextPoint);
         }
         const nextPoints = curr.points.map((p, i) => (i === state.vertexIndex ? nextPoint : p));
         onUpdateShape(state.shapeId, { points: nextPoints }, false);
         return;
      }

      if (interaction.kind === 'resize') {
          if (!interaction.moved && !dragged) return;
          if (!interaction.moved) interactionRef.current = { ...interaction, moved: true };
          
          const { state } = interaction;
          const curr = shapes[state.shapeId];
          if (!curr) return;

          const rotation = state.snapshot.rotation || 0;
          const fixed = state.fixedCornerWorld;
          const vWorld = { x: snapped.x - fixed.x, y: snapped.y - fixed.y };
          const vLocal = rotateVec(vWorld, -rotation);
          
          let rawW = vLocal.x;
          let rawH = vLocal.y;
          
          const bbox0 = getShapeBoundingBox(state.snapshot);
          const baseW = Math.max(1e-3, bbox0.width || 1);
          const baseH = Math.max(1e-3, bbox0.height || 1);
          const ratio = (state.startAspectRatio > 0) ? state.startAspectRatio : (baseH/baseW);

          const constrainProportions = !!state.snapshot.proportionsLinked || evt.shiftKey;
          if (constrainProportions) {
             // Simplify aspect ratio logic
             if (Math.abs(rawW) / baseW >= Math.abs(rawH) / baseH) {
                 rawH = Math.sign(rawH || 1) * Math.abs(rawW) * ratio;
             } else {
                 rawW = Math.sign(rawW || 1) * Math.abs(rawH) / ratio;
             }
          }

          const nextW = Math.max(1e-3, Math.abs(rawW));
          let nextH = Math.max(1e-3, Math.abs(rawH));

          // Text Resize special handling
          if (curr.type === 'text' && params.textTool) {
              const textId = params.getTextIdForShape?.(curr.id);
              if (textId != null) {
                  const newBounds = params.textTool.resizeText(textId, nextW);
                  if (newBounds) {
                     nextH = Math.max(newBounds.height, nextH);
                     // Adjust rawH to match new height direction
                     rawH = Math.sign(rawH || 1) * nextH;
                  }
              }
          }
          
          const nextScaleX = (Math.sign(rawW) || 1) * (state.snapshot.scaleX ?? 1);
          const nextScaleY = (Math.sign(rawH) || 1) * (state.snapshot.scaleY ?? 1);

          // Calculate new center
          // Center of resized rect in local space relative to fixed point is (rawW/2, rawH/2)
          const centerLocal = { x: rawW / 2, y: rawH / 2 };
          const centerWorld = { x: fixed.x + rotateVec(centerLocal, rotation).x, y: fixed.y + rotateVec(centerLocal, rotation).y };

          const diff = applyResizeToShape(state.snapshot, state.applyMode, centerWorld, nextW, nextH, nextScaleX, nextScaleY);
          onUpdateShape(state.shapeId, diff, false);

           if (curr.type === 'text' && params.textTool) {
               const textId = params.getTextIdForShape?.(curr.id);
               if (textId != null && params.textBoxMetaRef?.current) {
                 params.textBoxMetaRef.current.set(textId, {
                   boxMode: params.TextBoxMode.FixedWidth,
                   constraintWidth: nextW,
                   fixedHeight: nextH,
                   maxAutoWidth: nextW,
                 });
               }
           }
           return;
      }
      
      if (interaction.kind === 'marquee' && dragged) {
         const direction: 'LTR' | 'RTL' = evt.clientX >= down.x ? 'LTR' : 'RTL';
         setSelectionBox({ start: down.world, current: snapped, direction });
      }
  };

  const handlePointerUp = (evt: React.PointerEvent<HTMLDivElement>, down: { x: number; y: number; world: Point } | null) => {
     if (!down) return;
     const dx = evt.clientX - down.x;
     const dy = evt.clientY - down.y;
     const interaction = interactionRef.current;
     
     interactionRef.current = { kind: 'none' };
     setCursorOverride(null);

     if (interaction.kind === 'move' && interaction.moved) {
        const patches: any[] = [];
        interaction.state.snapshot.forEach((prevShape, id) => {
           const curr = shapes[id];
           if (curr) {
              // Create patch... logic same as original
              // Simply save history
              onSaveToHistory([{ type: 'UPDATE', id, diff: { x: curr.x, y: curr.y, points: curr.points }, prev: prevShape }]); 
           }
        });
        return;
     }

     if (interaction.kind === 'resize' && interaction.moved) {
         // Save history
         const prev = interaction.state.snapshot;
         onSaveToHistory([{ type: 'UPDATE', id: prev.id, diff: shapes[prev.id], prev }]);
         return;
     }
     
     if (interaction.kind === 'vertex' && interaction.moved) {
         const prev = interaction.state.snapshot;
         onSaveToHistory([{ type: 'UPDATE', id: prev.id, diff: shapes[prev.id], prev }]);
         return;
     }
     
     if (interaction.kind === 'marquee' && isDrag(dx, dy)) {
        const direction: 'LTR' | 'RTL' = evt.clientX >= down.x ? 'LTR' : 'RTL';
        const mode = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
        const rect = normalizeRect(down.world, screenToWorld({ x: evt.clientX - evt.currentTarget.getBoundingClientRect().left, y: evt.clientY - evt.currentTarget.getBoundingClientRect().top }, viewTransform)); // Approx
        const queryRect = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
        
        const candidates = spatialIndex.query(queryRect).map((c: any) => shapes[c.id]).filter(Boolean) as Shape[];
        const selected = new Set<string>();
        for (const shape of candidates) {
             const layer = layers.find((l) => l.id === shape.layerId);
             if (layer && (!layer.visible || layer.locked)) continue;
             if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo', activeDiscipline })) continue;
             if (!isShapeInSelection(shape, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }, mode)) continue;
             selected.add(shape.id);
        }
        setSelectionBox(null);
        onSetSelectedShapeIds(selected);
        return;
     }
     
     if (!isDrag(dx, dy)) {
         // Click selection
         const screen = { x: evt.clientX - evt.currentTarget.getBoundingClientRect().left, y: evt.clientY - evt.currentTarget.getBoundingClientRect().top };
         const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
         const hit = pickShape(down.world, screen, tolerance);
         setSelectionBox(null);
         onSetSelectedShapeIds(hit ? new Set([hit]) : new Set());
     }
  };

  return {
    interactionRef,
    selectionBox,
    cursorOverride,
    clearSelection,
    handlePointerDown,
    handlePointerMove: handlePointerMove2,
    handlePointerUp
  };
}
