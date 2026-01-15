import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InteractionHandler } from '../types';

export class PanHandler extends BaseInteractionHandler {
  name = 'pan';

  getCursor() {
    return 'grab';
  }

  onPointerDown(): InteractionHandler | void {
    // Logic handled by EngineInteractionLayer for now to share implementation
    return undefined;
  }
}
