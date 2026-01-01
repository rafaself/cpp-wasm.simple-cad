import { EntityId, SelectionMode, OverlayBufferMeta, EntityAabb } from '../protocol';
import { CadEngineInstance, WasmModule } from '../wasm-types';

import type { PickResult } from '@/types/picking';

export class SelectionSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance,
  ) {}

  public getSelectionIds(): Uint32Array {
    if (!this.engine.getSelectionIds) return new Uint32Array();
    const vec = this.engine.getSelectionIds();
    const count = vec.size();
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = vec.get(i);
    }
    vec.delete();
    return out;
  }

  public clearSelection(): void {
    this.engine.clearSelection?.();
  }

  public setSelection(ids: EntityId[], mode: SelectionMode): void {
    if (!this.engine.setSelection || !this.engine.allocBytes || !this.engine.freeBytes) {
      console.warn('[EngineRuntime] WASM engine does not support setSelection');
      return;
    }
    const ptr = this.engine.allocBytes(ids.length * 4);
    try {
      const u32 = new Uint32Array(this.module.HEAPU8.buffer, ptr, ids.length);
      u32.set(ids);
      this.engine.setSelection(ptr, ids.length, mode);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }

  public selectByPick(pick: PickResult, modifiers: number): void {
    this.engine.selectByPick?.(pick, modifiers);
  }

  public marqueeSelect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    mode: SelectionMode,
    hitMode: number,
  ): void {
    this.engine.marqueeSelect?.(minX, minY, maxX, maxY, mode, hitMode);
  }

  public queryMarquee(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    hitMode: number,
  ): number[] {
    if (!this.engine.queryMarquee) return [];
    const vec = this.engine.queryMarquee(minX, minY, maxX, maxY, hitMode);
    const count = vec.size();
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(vec.get(i));
    }
    vec.delete();
    return out;
  }

  public getSelectionOutlineMeta(): OverlayBufferMeta {
    if (!this.engine.getSelectionOutlineMeta) {
      throw new Error('[EngineRuntime] getSelectionOutlineMeta() missing in WASM build.');
    }
    return this.engine.getSelectionOutlineMeta();
  }

  public getSelectionHandleMeta(): OverlayBufferMeta {
    if (!this.engine.getSelectionHandleMeta) {
      throw new Error('[EngineRuntime] getSelectionHandleMeta() missing in WASM build.');
    }
    return this.engine.getSelectionHandleMeta();
  }

  public getSelectionBounds(): EntityAabb {
    if (!this.engine.getSelectionBounds) {
      throw new Error('[EngineRuntime] getSelectionBounds() missing in WASM build.');
    }
    return this.engine.getSelectionBounds();
  }
}
