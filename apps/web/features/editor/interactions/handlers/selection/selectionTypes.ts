import type { SelectionMode, TransformMode } from '@/engine/core/EngineRuntime';
import type { SelectionBoxState } from '@/features/editor/components/MarqueeOverlay';
import type { PickResult } from '@/types/picking';

export type SelectionInteractionState =
  | { kind: 'none' }
  | {
      kind: 'pending';
      pick: PickResult;
      startScreen: { x: number; y: number };
      selectionModeOnClick: SelectionMode | null;
      selectionModeOnDrag: SelectionMode | null;
    }
  | { kind: 'marquee'; box: SelectionBoxState; startScreen: { x: number; y: number } }
  | { kind: 'transform'; startScreen: { x: number; y: number }; mode: TransformMode };

export type SelectionPointerDown = { x: number; y: number; world: { x: number; y: number } } | null;
