import { CadEngineInstance, WasmModule } from '../wasm-types';
import { EntityId } from '../protocol';

export class TransformSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance
  ) {}

  public beginTransform(
    ids: EntityId[],
    mode: number,
    specificId: EntityId = 0,
    vertexIndex: number = -1,
    startX: number = 0,
    startY: number = 0
  ): void {
    if (!this.engine.beginTransform || !this.engine.allocBytes || !this.engine.freeBytes) {
       console.warn("WASM engine does not support beginTransform");
       return;
    }

    const ptr = this.engine.allocBytes(ids.length * 4);
    try {
        const u32 = new Uint32Array(this.module.HEAPU8.buffer, ptr, ids.length);
        u32.set(ids);
        this.engine.beginTransform(ptr, ids.length, mode, specificId, vertexIndex, startX, startY);
    } catch(e) { 
        console.error(e);
    } finally {
        this.engine.freeBytes(ptr);
    }
  }

  public updateTransform(worldX: number, worldY: number): void {
      this.engine.updateTransform?.(worldX, worldY);
  }

  public cancelTransform(): void {
      this.engine.cancelTransform?.();
  }

  public isInteractionActive(): boolean {
      return !!this.engine.isInteractionActive?.();
  }

  public commitTransform(): { ids: Uint32Array, opCodes: Uint8Array, payloads: Float32Array } | null {
      if (!this.engine.commitTransform) return null;
      
      this.engine.commitTransform();
      
      const count = this.engine.getCommitResultCount?.() ?? 0;
      if (count === 0) return null;

      const idsPtr = this.engine.getCommitResultIdsPtr!();
      const opCodesPtr = this.engine.getCommitResultOpCodesPtr!();
      const payloadsPtr = this.engine.getCommitResultPayloadsPtr!();
      
      const idsView = new Uint32Array(this.module.HEAPU8.buffer, idsPtr, count);
      const opCodesView = new Uint8Array(this.module.HEAPU8.buffer, opCodesPtr, count);
      const payloadsView = new Float32Array(this.module.HEAPU8.buffer, payloadsPtr, count * 4); 

      return {
          ids: idsView.slice(),
          opCodes: opCodesView.slice(),
          payloads: payloadsView.slice()
      };
  }

  public setSnapOptions(enabled: boolean, gridEnabled: boolean, gridSize: number): void {
      this.engine.setSnapOptions?.(enabled, gridEnabled, gridSize);
  }

  public getSnappedPoint(x: number, y: number): { x: number, y: number } {
      if (!this.engine.getSnappedPoint) return { x, y };
      if (this.engine.getSnappedPoint) {
         try {
           const p = this.engine.getSnappedPoint(x, y);
           return { x: p[0], y: p[1] };
         } catch (e) {
           return { x, y };
         }
      }
      return { x, y };
  }
}
