import { useRef, useState } from 'react';
import type { Shape, ViewTransform } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import {
  screenToWorld,
  isDrag,
  isShapeInSelection
} from '@/utils/geometry';
import { HIT_TOLERANCE } from '@/config/constants';
import { isShapeInteractable } from '@/utils/visibility';
import { getShapeId as getShapeIdFromRegistry } from '@/engine/core/IdRegistry';

// --- Types extracted from EngineInteractionLayer ---

export type MoveState = { start: { x: number; y: number }; snapshot: Map<string, Shape> };

export type SelectInteraction =
  | { kind: 'none' }
  | { kind: 'marquee' };

export type SelectionBox = {
  start: { x: number; y: number };
  current: { x: number; y: number };
  direction: 'LTR' | 'RTL';
};

// --- Helper Functions extracted ---

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
  onSetSelectedShapeIds: (ids: Set<string>) => void;
  pickShape: (world: {x:number, y:number}, screen: {x:number, y:number}, tolerance: number) => string | null;
  runtime?: any;
}) {
  const {
    viewTransform,
    selectedShapeIds,
    shapes,
    layers,
    onSetSelectedShapeIds,
    pickShape,
    runtime
  } = params;

  const selectInteractionRef = useRef<SelectInteraction>({ kind: 'none' });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>, world: {x:number, y:number}) => {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };

      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hitId = pickShape(world, screen, tolerance);
      if (hitId) {
        if (!selectedShapeIds.has(hitId) || selectedShapeIds.size !== 1) onSetSelectedShapeIds(new Set([hitId]));
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
        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
        const hit = pickShape(snapped, screen, tolerance);
        setCursorOverride(hit ? 'move' : null);
        return;
      }

      const dx = evt.clientX - down.x;
      const dy = evt.clientY - down.y;
      const dragged = isDrag(dx, dy);

      if (interaction.kind !== 'marquee') {
        if (selectionBox) setSelectionBox(null);
        return;
      }

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

    if (interaction.kind !== 'marquee') return;

    if (isDrag(dx, dy)) {
      const direction: 'LTR' | 'RTL' = evt.clientX >= down.x ? 'LTR' : 'RTL';
      const mode: 'WINDOW' | 'CROSSING' = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
      const worldUp = screenToWorld(screen, viewTransform);
      const rect = normalizeRect(down.world, worldUp);

      const queryRect = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
      // Use runtime queryArea instead of spatialIndex
      let candidates: Shape[] = [];
      if (runtime && runtime.engine.queryArea) {
          const candidatesU32 = runtime.engine.queryArea(queryRect.x, queryRect.y, queryRect.x + queryRect.width, queryRect.y + queryRect.height);
          const count = candidatesU32.size();
          for(let i=0; i<count; ++i) {
              const idHash = candidatesU32.get(i);
              const idStr = getShapeIdFromRegistry(idHash);
              if (idStr && shapes[idStr]) {
                  candidates.push(shapes[idStr]);
              }
          }
          candidatesU32.delete();
      } else {
          // Fallback: legacy JS scan when WASM does not expose queryArea
          candidates = Object.values(shapes);
      }

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
