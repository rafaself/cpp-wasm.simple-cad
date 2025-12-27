import { useRef, useState } from 'react';
import type { Shape, ViewTransform } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import {
  screenToWorld,
  isDrag,
  isShapeInSelection
} from '@/utils/geometry';
import { isShapeInteractable } from '@/utils/visibility';
import { ensureId, getShapeId as getShapeIdFromRegistry } from '@/engine/core/IdRegistry';
import type { EntityId } from '@/engine/core/protocol';
import { EngineCapability } from '@/engine/core/capabilities';

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
  shapes: Record<string, Shape>;
  layers: any[]; // ImportedLayer[] or Layer[]
  onSetSelectedEntityIds: (ids: Set<EntityId>) => void;
  runtime?: any;
}) {
  const {
    viewTransform,
    shapes,
    layers,
    onSetSelectedEntityIds,
    runtime
  } = params;

  const selectInteractionRef = useRef<SelectInteraction>({ kind: 'none' });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

  const activeFloorId = useUIStore((s) => s.activeFloorId);

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>, world: {x:number, y:number}) => {
      selectInteractionRef.current = { kind: 'marquee' };
      setCursorOverride(null);
      return;
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>, down: {x:number, y:number, world: {x:number, y:number}} | null, snapped: {x:number, y:number}) => {
      const interaction = selectInteractionRef.current;

      if (!down) {
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

      const selected = new Set<EntityId>();

      // Preferred (Phase 5): Engine returns the final selection set for WINDOW/CROSSING.
      const canUseMarquee =
        !!runtime?.hasCapability?.(EngineCapability.HasQueryMarquee) &&
        typeof runtime?.engine?.queryMarquee === 'function';
      if (runtime && canUseMarquee) {
        const selectedU32 = runtime.engine.queryMarquee(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, mode === 'WINDOW' ? 0 : 1);
        const count = selectedU32.size();
        for (let i = 0; i < count; ++i) {
          const idHash = selectedU32.get(i);
          const idStr = getShapeIdFromRegistry(idHash);
          const shape = idStr ? shapes[idStr] : null;
          if (!shape) continue;

          const layer = layers.find((l) => l.id === shape.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo' })) continue;
          selected.add(idHash);
        }
        selectedU32.delete();
      } else {
        // Fallback (old WASM): engine provides broad-phase candidates only.
        const queryRect = { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
        let candidates: Shape[] = [];
        if (runtime && runtime.engine.queryArea) {
          const candidatesU32 = runtime.engine.queryArea(queryRect.x, queryRect.y, queryRect.x + queryRect.width, queryRect.y + queryRect.height);
          const count = candidatesU32.size();
          for (let i = 0; i < count; ++i) {
            const idHash = candidatesU32.get(i);
            const idStr = getShapeIdFromRegistry(idHash);
            if (idStr && shapes[idStr]) {
              candidates.push(shapes[idStr]);
            }
          }
          candidatesU32.delete();
        } else {
          candidates = Object.values(shapes);
        }

        for (const shape of candidates) {
          const layer = layers.find((l) => l.id === shape.layerId);
          if (layer && (!layer.visible || layer.locked)) continue;
          if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo' })) continue;
          if (!isShapeInSelection(shape, { x: rect.x, y: rect.y, width: rect.w, height: rect.h }, mode)) continue;
          selected.add(ensureId(shape.id));
        }
      }

      setSelectionBox(null);
      onSetSelectedEntityIds(selected);
      return;
    }
    setSelectionBox(null);
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
