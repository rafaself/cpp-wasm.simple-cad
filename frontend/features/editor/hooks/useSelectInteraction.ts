import { useRef, useState } from 'react';
import type { Shape, ViewTransform } from '@/types';
import { screenToWorld, isDrag } from '@/utils/geometry';
import { EngineCapability } from '@/engine/core/capabilities';
import { MarqueeMode, SelectionMode, SelectionModifier } from '@/engine/core/protocol';
import { syncSelectionFromEngine } from '@/engine/core/engineStateSync';

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
  runtime?: any;
}) {
  const {
    viewTransform,
    runtime
  } = params;

  const selectInteractionRef = useRef<SelectInteraction>({ kind: 'none' });
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [cursorOverride, setCursorOverride] = useState<string | null>(null);

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
      const hitMode = direction === 'LTR' ? MarqueeMode.Window : MarqueeMode.Crossing;
      const worldUp = screenToWorld(screen, viewTransform);
      const rect = normalizeRect(down.world, worldUp);

      let mode = SelectionMode.Replace;
      const modifiers =
        (evt.shiftKey ? SelectionModifier.Shift : 0) |
        (evt.ctrlKey ? SelectionModifier.Ctrl : 0) |
        (evt.metaKey ? SelectionModifier.Meta : 0);
      if ((modifiers & (SelectionModifier.Ctrl | SelectionModifier.Meta)) !== 0) {
        mode = SelectionMode.Toggle;
      } else if ((modifiers & SelectionModifier.Shift) !== 0) {
        mode = SelectionMode.Add;
      }

      if (runtime?.marqueeSelect) {
        runtime.marqueeSelect(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, mode, hitMode);
        syncSelectionFromEngine(runtime);
      } else if (
        runtime?.hasCapability?.(EngineCapability.HasQueryMarquee) &&
        typeof runtime?.engine?.queryMarquee === 'function'
      ) {
        const selectedU32 = runtime.engine.queryMarquee(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h, hitMode);
        const selected: number[] = [];
        const count = selectedU32.size();
        for (let i = 0; i < count; ++i) {
          selected.push(selectedU32.get(i));
        }
        selectedU32.delete();
        runtime.setSelection?.(selected, mode);
        syncSelectionFromEngine(runtime);
      }

      setSelectionBox(null);
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
