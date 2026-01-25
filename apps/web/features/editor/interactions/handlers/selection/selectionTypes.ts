import type { TransformMode } from '@/engine/core/EngineRuntime';
import type { SelectionBoxState } from '@/features/editor/components/MarqueeOverlay';

export type SelectionInteractionState =
  | { kind: 'none' }
  | { kind: 'marquee'; box: SelectionBoxState; startScreen: { x: number; y: number } }
  | { kind: 'transform'; startScreen: { x: number; y: number }; mode: TransformMode };

export type SelectionPointerDown = { x: number; y: number; world: { x: number; y: number } } | null;
