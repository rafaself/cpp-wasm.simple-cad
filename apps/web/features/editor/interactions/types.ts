import type { getEngineRuntime } from '@/engine/core/singleton';
import type { Point, ViewTransform } from '@/types';
import type { PickResult } from '@/types/picking';

export type EngineRuntime = Awaited<ReturnType<typeof getEngineRuntime>>;
export type HoverPickFn = (x: number, y: number, tolerance: number, mask: number) => PickResult;

export interface InputEventContext {
  event: React.PointerEvent | PointerEvent;
  screenPoint: Point;
  worldPoint: Point;
  snappedPoint: Point;
  runtime: EngineRuntime | null;
  hoverPick: HoverPickFn;
  viewTransform: ViewTransform;
  canvasSize: { width: number; height: number }; // Needed for overlays
  cancelToken?: boolean; // To check if operation should be aborted
}

/**
 * Interface for all interaction handlers.
 */
export interface InteractionHandler {
  name: string;

  /** Called when this handler becomes active */
  onEnter?(): void;

  /** Called when this handler is replaced or deactivated */
  onLeave?(): void;

  /**
   * Handle Pointer Down.
   * Returns a new handler to transition to, or void/undefined to stay in current state.
   */
  onPointerDown(ctx: InputEventContext): InteractionHandler | void;

  /** Handle Pointer Move */
  onPointerMove(ctx: InputEventContext): void;

  /** Handle Pointer Up */
  onPointerUp(ctx: InputEventContext): InteractionHandler | void;

  /** Handle Double Click */
  onDoubleClick?(ctx: InputEventContext): void;

  /** Handle context menu (right click) or special cancel actions */
  onCancel?(): void;

  /** Optional: specific cursor for this state */
  getCursor?(): string | null;

  /** Optional: render specific UI overlays for this state */
  renderOverlay?(): React.ReactNode;

  /** Mechanism to notify React that this handler's state has changed and needs re-render */
  setOnUpdate?(callback: () => void): void;
  onKeyDown?(e: KeyboardEvent): void;
  onKeyUp?(e: KeyboardEvent): void;
  onBlur?(): void;
}
