import { InteractionHandler, InputEventContext } from './types';

export abstract class BaseInteractionHandler implements InteractionHandler {
  abstract name: string;

  // RAF-batched update state
  private _rafPending = false;

  onEnter(): void {
    // Optional implementation
  }

  onLeave(): void {
    // Optional implementation
  }

  onPointerDown(_ctx: InputEventContext): InteractionHandler | void {
    return undefined;
  }

  onPointerMove(_ctx: InputEventContext): void {
    // Optional implementation
  }

  onPointerUp(_ctx: InputEventContext): InteractionHandler | void {
    return undefined;
  }

  onDoubleClick(_ctx: InputEventContext): void {
    // Optional implementation
  }

  onCancel(): void {
    // Optional implementation
  }

  protected onUpdate?: () => void;

  setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  /**
   * Batched notification using requestAnimationFrame.
   * Multiple calls within the same frame are coalesced into a single update.
   * This prevents excessive re-renders during hot paths like pointermove.
   */
  protected notifyChange(): void {
    if (!this.onUpdate) return;

    // If RAF is already pending, skip - we'll update in the next frame
    if (this._rafPending) return;

    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.onUpdate?.();
    });
  }

  /**
   * Immediate notification without RAF batching.
   * Use sparingly for critical state changes that must be visible immediately.
   */
  protected notifyChangeImmediate(): void {
    this.onUpdate?.();
  }

  getCursor(): string | null {
    return null;
  }

  renderOverlay(): React.ReactNode {
    return null;
  }
}
