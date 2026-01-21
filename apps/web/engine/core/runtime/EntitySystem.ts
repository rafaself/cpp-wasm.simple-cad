import { EntityId, ReorderAction } from '../protocol';
import { CadEngineInstance, WasmModule } from '../wasm-types';

export class EntitySystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance,
  ) {}

  public allocateEntityId(): EntityId {
    if (!this.engine.allocateEntityId) {
      throw new Error('[EngineRuntime] allocateEntityId() missing in WASM build.');
    }
    return this.engine.allocateEntityId();
  }

  public getEntityFlags(entityId: EntityId): number {
    return this.engine.getEntityFlags?.(entityId) ?? 0;
  }

  public setEntityFlags(entityId: EntityId, flagsMask: number, flagsValue: number): void {
    this.engine.setEntityFlags?.(entityId, flagsMask, flagsValue);
  }

  public setEntityLayer(entityId: EntityId, layerId: number): void {
    this.engine.setEntityLayer?.(entityId, layerId);
  }

  public getEntityLayer(entityId: EntityId): number {
    return this.engine.getEntityLayer?.(entityId) ?? 0;
  }

  public getEntityKind(entityId: EntityId): number {
    return this.engine.getEntityKind?.(entityId) ?? 0;
  }

  public tryGetEntityGeomZ(entityId: EntityId): { ok: boolean; z: number } {
    if (!this.engine.tryGetEntityGeomZ) {
      throw new Error('[EngineRuntime] tryGetEntityGeomZ() missing in WASM build.');
    }
    return this.engine.tryGetEntityGeomZ(entityId);
  }

  public setEntityGeomZ(entityId: EntityId, z: number): boolean {
    if (!this.engine.setEntityGeomZ) {
      throw new Error('[EngineRuntime] setEntityGeomZ() missing in WASM build.');
    }
    return this.engine.setEntityGeomZ(entityId, z);
  }

  public getDrawOrderSnapshot(): Uint32Array {
    if (!this.engine.getDrawOrderSnapshot) return new Uint32Array();
    const vec = this.engine.getDrawOrderSnapshot();
    const count = vec.size();
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = vec.get(i);
    }
    vec.delete();
    return out;
  }

  public reorderEntities(ids: EntityId[], action: ReorderAction, refId = 0): void {
    if (!this.engine.reorderEntities || !this.engine.allocBytes || !this.engine.freeBytes) {
      console.warn('[EngineRuntime] WASM engine does not support reorderEntities');
      return;
    }
    const ptr = this.engine.allocBytes(ids.length * 4);
    try {
      const u32 = new Uint32Array(this.module.HEAPU8.buffer, ptr, ids.length);
      u32.set(ids);
      this.engine.reorderEntities(ptr, ids.length, action, refId);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }
}
