import { InteractionHandler, InputEventContext } from './types';

export abstract class BaseInteractionHandler implements InteractionHandler {
  abstract name: string;

  onEnter(): void {
    // Optional implementation
  }

  onLeave(): void {
    // Optional implementation
  }

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    return undefined;
  }

  onPointerMove(ctx: InputEventContext): void {
    // Optional implementation
  }

  onPointerUp(ctx: InputEventContext): InteractionHandler | void {
    return undefined;
  }

  onDoubleClick(ctx: InputEventContext): void {
    // Optional implementation
  }

  onCancel(): void {
    // Optional implementation
  }

  protected onUpdate?: () => void;

  setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  protected notifyChange(): void {
    this.onUpdate?.();
  }

  getCursor(): string | null {
    return null;
  }

  renderOverlay(): React.ReactNode {
    return null;
  }
}
