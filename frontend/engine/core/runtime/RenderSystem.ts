import type { CadEngineInstance } from '../wasm-types';

export class RenderSystem {
  constructor(private readonly engine: CadEngineInstance) {}

  public getPositionBufferMeta() {
    return this.engine.getPositionBufferMeta?.();
  }

  public getLineBufferMeta() {
    return this.engine.getLineBufferMeta?.();
  }

  public isTextQuadsDirty(): boolean {
    return this.engine.isTextQuadsDirty ? this.engine.isTextQuadsDirty() : false;
  }

  public rebuildTextQuadBuffer(): void {
    this.engine.rebuildTextQuadBuffer?.();
  }

  public getTextQuadBufferMeta() {
    return this.engine.getTextQuadBufferMeta?.();
  }

  public getAtlasTextureMeta() {
    return this.engine.getAtlasTextureMeta?.();
  }
}
