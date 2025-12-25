import { useRef, useState } from 'react';
import type { Shape, ViewTransform } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import {
  screenToWorld,
  worldToScreen,
  isDrag,
  getRectCornersWorld,
  getShapeBoundingBox,
  getShapeHandles,
  rotatePoint,
  supportsBBoxResize,
  isPointInShape,
  isShapeInSelection
} from '@/utils/geometry';
import { HIT_TOLERANCE } from '@/config/constants';
import { isShapeInteractable } from '@/utils/visibility';

// --- Types extracted from EngineInteractionLayer ---

export type MoveState = { start: { x: number; y: number }; snapshot: Map<string, Shape> };

export type ResizeState = {
  shapeId: string;
  handleIndex: number; // 0 BL, 1 BR, 2 TR, 3 TL (matches geometry.ts corners order)
  fixedCornerIndex: number;
  fixedCornerWorld: { x: number; y: number };
  startPointerWorld: { x: number; y: number };
  snapshot: Shape;
  applyMode: 'topLeft' | 'center';
  startAspectRatio: number; // height/width at start of resize
};

export type VertexDragState = {
  shapeId: string;
  vertexIndex: number;
  startPointerWorld: { x: number; y: number };
  snapshot: Shape;
};

export type SelectInteraction =
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

// --- Helper Functions extracted ---

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

// --- Hook Implementation ---

export function useSelectInteraction(params: {
  viewTransform: ViewTransform;
  selectedShapeIds: Set<string>;
  shapes: Record<string, Shape>;
  layers: any[]; // ImportedLayer[] or Layer[]
  spatialIndex: any; // QuadTree
  onUpdateShape: (id: string, diff: Partial<Shape>, optionsOrRecordHistory?: boolean | { recordHistory?: boolean; skipConnectionSync?: boolean }) => void;
  onSyncConnections: () => void;
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
    onSyncConnections,
    onSetSelectedShapeIds,
    onSaveToHistory,
    pickShape
  } = params;

  const selectInteractionRef = useRef<SelectInteraction>({ kind: 'none' });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);

  const pickResizeHandleAtScreen = (
    screenPoint: { x: number; y: number },
    view: ViewTransform,
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
        const p = worldToScreen({ x: h.x, y: h.y }, view);
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
    screenPoint: { x: number; y: number },
    view: ViewTransform,
  ): { shapeId: string; vertexIndex: number } | null => {

    let best: { shapeId: string; vertexIndex: number; d2: number } | null = null;
    const hitR2 = HANDLE_HIT_RADIUS_PX * HANDLE_HIT_RADIUS_PX;

    selectedShapeIds.forEach((id) => {
      const shape = shapes[id];
      if (!shape) return;
      if (shape.type !== 'line' && shape.type !== 'arrow' && shape.type !== 'polyline') return;
      const ptsWorld = shape.points ?? [];
      if (ptsWorld.length < 2) return;

      const layer = layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) return;
      if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo', activeDiscipline })) return;

      const pts = ptsWorld.map((p) => worldToScreen(p, view));
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

      const handleHit = pickResizeHandleAtScreen(screen, viewTransform);
      if (handleHit) {
        const shape = shapes[handleHit.shapeId];
        const corners = shape ? getRectCornersWorld(shape) : null;
        if (shape && corners) {
          const bbox0 = getShapeBoundingBox(shape);
          const baseW = Math.max(1e-3, bbox0.width || 1);
          const baseH = Math.max(1e-3, bbox0.height || 1);
          const fixedCornerIndex = (handleHit.handleIndex + 2) % 4;
          selectInteractionRef.current = {
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
              startAspectRatio: baseH / baseW,
            },
          };
          setCursorOverride(handleHit.cursor);
          return;
        }
      }

      const endpointHit = pickVertexHandleAtScreen(screen, viewTransform);
      if (endpointHit) {
        const shape = shapes[endpointHit.shapeId];
        const layer = shape ? layers.find((l) => l.id === shape.layerId) : null;
        const movable = !!shape && !(layer?.locked);
        if (shape && movable) {
          if (!selectedShapeIds.has(shape.id) || selectedShapeIds.size !== 1) onSetSelectedShapeIds(new Set([shape.id]));
          selectInteractionRef.current = {
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
        const movable = !!hitShape && !(layer?.locked);
        if (movable && hitShape) {
          if (hitShape.type === 'line' || hitShape.type === 'arrow' || hitShape.type === 'polyline') {
            const pts = hitShape.points ?? [];
            if (pts.length >= 2) {
              const hitR2 = HANDLE_HIT_RADIUS_PX * HANDLE_HIT_RADIUS_PX;
              let best: { idx: number; d2: number } | null = null;
              for (let i = 0; i < pts.length; i++) {
                const s = worldToScreen(pts[i]!, viewTransform);
                const d2 = (screen.x - s.x) * (screen.x - s.x) + (screen.y - s.y) * (screen.y - s.y);
                if (d2 > hitR2) continue;
                if (!best || d2 < best.d2) best = { idx: i, d2 };
              }
              if (best) {
                selectInteractionRef.current = {
                  kind: 'vertex',
                  moved: false,
                  state: { shapeId: hitShape.id, vertexIndex: best.idx, startPointerWorld: world, snapshot: hitShape },
                };
                setCursorOverride('default');
                return;
              }
            }
          }

          selectInteractionRef.current = {
            kind: 'move',
            moved: false,
            state: { start: world, snapshot: new Map([[hitId, hitShape]]) },
          };
          setCursorOverride('move');
          return;
        }

        selectInteractionRef.current = { kind: 'none' };
        setCursorOverride('move');
        return;
      }

      selectInteractionRef.current = { kind: 'marquee' };
      setCursorOverride(null);
      return;
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>, down: {x:number, y:number, world: {x:number, y:number}} | null, snapped: {x:number, y:number}) => {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

      const interaction = selectInteractionRef.current;

      if (!down) {
        const handleHover = pickResizeHandleAtScreen(screen, viewTransform);
        if (handleHover) {
          setCursorOverride(handleHover.cursor);
          return;
        }

        const endpointHover = pickVertexHandleAtScreen(screen, viewTransform);
        if (endpointHover) {
          setCursorOverride('default');
          return;
        }

        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
        const hit = pickShape(snapped, screen, tolerance);
        setCursorOverride(hit ? 'move' : null);
        return;
      }

      const dx = evt.clientX - down.x;
      const dy = evt.clientY - down.y;
      const dragged = isDrag(dx, dy);

      if (interaction.kind === 'move') {
        if (!interaction.moved && !dragged) return;
        if (!interaction.moved) selectInteractionRef.current = { ...interaction, moved: true };

        const moveState = interaction.state;
        const ddx = snapped.x - moveState.start.x;
        const ddy = snapped.y - moveState.start.y;
        moveState.snapshot.forEach((shape, id) => {
          const curr = shapes[id];
          if (!curr) return;

          const diff: Partial<Shape> = {};
          if (shape.x !== undefined) diff.x = clampTiny(shape.x + ddx);
          if (shape.y !== undefined) diff.y = clampTiny(shape.y + ddy);
          if (shape.points) diff.points = shape.points.map((p) => ({ x: clampTiny(p.x + ddx), y: clampTiny(p.y + ddy) }));

          if (Object.keys(diff).length) onUpdateShape(id, diff, { skipConnectionSync: true, recordHistory: false });

          // Sync text position with engine if this is a text shape
          if (shape.type === 'text' && params.textTool) {
             const textId = params.getTextIdForShape?.(id);
             if (textId != null && params.textBoxMetaRef?.current) {
                const meta = params.textBoxMetaRef.current.get(textId);
                const TextBoxMode = params.TextBoxMode;
                const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
                const constraintWidth = boxMode === TextBoxMode.FixedWidth ? (meta?.constraintWidth ?? 0) : 0;

                const newAnchorX = diff.x ?? shape.x ?? 0;
                const newShapeY = diff.y ?? shape.y ?? 0;
                const height = shape.height ?? 0;
                const newAnchorY = newShapeY + height;
                params.textTool.moveText(textId, newAnchorX, newAnchorY, boxMode, constraintWidth);
             }
          }
        });
        return;
      }

      if (interaction.kind === 'vertex') {
        if (!interaction.moved && !dragged) return;
        if (!interaction.moved) selectInteractionRef.current = { ...interaction, moved: true };

        const { state } = interaction;
        const curr = shapes[state.shapeId];
        if (!curr) return;
        if (!curr.points || curr.points.length < 2) return;

        let nextPoint = { x: clampTiny(snapped.x), y: clampTiny(snapped.y) };
        if ((curr.type === 'line' || curr.type === 'arrow') && curr.points.length >= 2 && evt.shiftKey) {
          const fixedIdx = state.vertexIndex === 0 ? 1 : 0;
          const fixed = curr.points[fixedIdx]!;
          nextPoint = snapVectorTo45Deg(fixed, nextPoint);
        }

        const nextPoints = curr.points.map((p, i) => (i === state.vertexIndex ? nextPoint : p));
        onUpdateShape(state.shapeId, { points: nextPoints }, { skipConnectionSync: true, recordHistory: false });
        return;
      }

      if (interaction.kind === 'resize') {
        if (!interaction.moved && !dragged) return;
        if (!interaction.moved) selectInteractionRef.current = { ...interaction, moved: true };

        const { state } = interaction;
        const curr = shapes[state.shapeId];
        if (!curr) return;

        const rotation = state.snapshot.rotation || 0;
        const fixed = state.fixedCornerWorld;

        const vWorld = { x: snapped.x - fixed.x, y: snapped.y - fixed.y };
        const vLocal = rotateVec(vWorld, -rotation);

        const rawW0 = vLocal.x;
        const rawH0 = vLocal.y;

        const bbox0 = getShapeBoundingBox(state.snapshot);
        const eps = 1e-3;
        const baseW = Math.max(eps, bbox0.width || 1);
        const baseH = Math.max(eps, bbox0.height || 1);
        const ratio = Number.isFinite(state.startAspectRatio) && state.startAspectRatio > 0 ? state.startAspectRatio : (baseH / baseW);

        let rawW = rawW0;
        let rawH = rawH0;

        const constrainProportions = !!state.snapshot.proportionsLinked || evt.shiftKey;
        if (constrainProportions) {
          const wAbs = Math.abs(rawW);
          const hAbs = Math.abs(rawH);
          const wRel = wAbs / baseW;
          const hRel = hAbs / baseH;
          if (wRel >= hRel) {
            rawH = Math.sign(rawH || 1) * wAbs * ratio;
          } else {
            rawW = Math.sign(rawW || 1) * (hAbs / ratio);
          }
        }

        let localMinX = Math.min(0, rawW);
        let localMaxX = Math.max(0, rawW);
        let localMinY = Math.min(0, rawH);
        let localMaxY = Math.max(0, rawH);

        const nextW = Math.max(eps, localMaxX - localMinX);
        let nextH = Math.max(eps, localMaxY - localMinY);

        const baseScaleX = state.snapshot.scaleX ?? 1;
        const baseScaleY = state.snapshot.scaleY ?? 1;
        const expectedSignX = state.handleIndex === 1 || state.handleIndex === 2 ? 1 : -1;
        const expectedSignY = state.handleIndex === 2 || state.handleIndex === 3 ? 1 : -1;

        const nextSignX = Math.sign(rawW || expectedSignX) || expectedSignX;
        const nextSignY = Math.sign(rawH || expectedSignY) || expectedSignY;

        const flippedX = nextSignX !== expectedSignX;
        const flippedY = nextSignY !== expectedSignY;

        let nextScaleX = (flippedX ? -1 : 1) * baseScaleX;
        let nextScaleY = (flippedY ? -1 : 1) * baseScaleY;

        // Text resize
        if (curr.type === 'text' && params.textTool) {
            const textId = params.getTextIdForShape?.(curr.id);
            if (textId != null) {
              const newBounds = params.textTool.resizeText(textId, nextW);
              if (newBounds) {
                 nextH = Math.max(newBounds.height, nextH);
                 const sY = Math.sign(rawH) || expectedSignY || 1;
                 rawH = sY * nextH;
                 nextScaleX = 1;
                 nextScaleY = 1;
                 localMinY = Math.min(0, rawH);
                 localMaxY = Math.max(0, rawH);
              }
            }
        }

        const localCenter = { x: (localMinX + localMaxX) / 2, y: (localMinY + localMaxY) / 2 };
        const center = { x: fixed.x + rotateVec(localCenter, rotation).x, y: fixed.y + rotateVec(localCenter, rotation).y };

        const diff = applyResizeToShape(state.snapshot, state.applyMode, center, nextW, nextH, nextScaleX, nextScaleY);
        onUpdateShape(state.shapeId, diff, { skipConnectionSync: true, recordHistory: false });

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

      if (interaction.kind !== 'marquee') {
        if (selectionBox) setSelectionBox(null);
        return;
      }

      // Marquee selection box.
      if (!dragged) {
        if (selectionBox) setSelectionBox(null);
        return;
      }

      const direction: 'LTR' | 'RTL' = evt.clientX >= down.x ? 'LTR' : 'RTL';
      setSelectionBox({ start: down.world, current: snapped, direction });
      return;
  };

  const handlePointerUp = (evt: React.PointerEvent<HTMLDivElement>, down: {x:number, y:number, world: {x:number, y:number}} | null) => {
    if (!down) return;

    const dx = evt.clientX - down.x;
    const dy = evt.clientY - down.y;
    const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
    const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

    const interaction = selectInteractionRef.current;
    selectInteractionRef.current = { kind: 'none' };
    setCursorOverride(null);

    if (interaction.kind === 'move') {
      if (!interaction.moved) return;
      onSyncConnections();
      const patches: any[] = [];
      interaction.state.snapshot.forEach((prevShape, id) => {
        const curr = shapes[id];
        if (!curr) return;
        const diff: Partial<Shape> = {};
        if (prevShape.x !== curr.x) diff.x = curr.x;
        if (prevShape.y !== curr.y) diff.y = curr.y;
        if (prevShape.points || curr.points) diff.points = curr.points;
        if (Object.keys(diff).length === 0) return;
        patches.push({ type: 'UPDATE', id, diff, prev: prevShape });
      });
      onSaveToHistory(patches);
      return;
    }

    if (interaction.kind === 'resize') {
      if (!interaction.moved) return;
      onSyncConnections();
      const prevShape = interaction.state.snapshot;
      const curr = shapes[interaction.state.shapeId];
      if (!curr) return;
      const diff: Partial<Shape> = {};
      if (prevShape.x !== curr.x) diff.x = curr.x;
      if (prevShape.y !== curr.y) diff.y = curr.y;
      if (prevShape.width !== curr.width) diff.width = curr.width;
      if (prevShape.height !== curr.height) diff.height = curr.height;
      if (prevShape.scaleX !== curr.scaleX) diff.scaleX = curr.scaleX;
      if (prevShape.scaleY !== curr.scaleY) diff.scaleY = curr.scaleY;
      if (Object.keys(diff).length === 0) return;
      onSaveToHistory([{ type: 'UPDATE', id: curr.id, diff, prev: prevShape }]);
      return;
    }

    if (interaction.kind === 'vertex') {
      if (!interaction.moved) return;
      onSyncConnections();
      const prevShape = interaction.state.snapshot;
      const curr = shapes[interaction.state.shapeId];
      if (!curr) return;
      const diff: Partial<Shape> = {};
      if (prevShape.points || curr.points) diff.points = curr.points;
      if (Object.keys(diff).length === 0) return;
      onSaveToHistory([{ type: 'UPDATE', id: curr.id, diff, prev: prevShape }]);
      return;
    }

    if (interaction.kind !== 'marquee') return;

    if (isDrag(dx, dy)) {
      const direction: 'LTR' | 'RTL' = evt.clientX >= down.x ? 'LTR' : 'RTL';
      const mode: 'WINDOW' | 'CROSSING' = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
      const worldUp = screenToWorld(screen, viewTransform);
      const rect = normalizeRect(down.world, worldUp);

      const queryRect = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
      const candidates = spatialIndex
        .query(queryRect)
        .map((c: any) => shapes[c.id])
        .filter(Boolean) as Shape[];

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

    // Click selection (no marquee, no drag interactions).
    const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
    const hit = pickShape(down.world, screen, tolerance);
    setSelectionBox(null);
    onSetSelectedShapeIds(hit ? new Set([hit]) : new Set());
    return;
  };

  return {
    selectInteractionRef,
    selectionBox,
    setSelectionBox,
    cursorOverride,
    setCursorOverride,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp
  };
}
