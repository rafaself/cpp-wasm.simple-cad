import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler } from '../types';

export class IdleHandler extends BaseInteractionHandler {
  name = 'idle';

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    // In idle state, we usually don't do much unless we transition to a specific tool.
    // However, if we are in "Select Tool" mode (default), clicking might start a selection box or drag.
    // Ideally, the InteractionManager will swap IdleHandler for SelectHandler immediately if the active tool is 'select'.
    return undefined;
  }
}
