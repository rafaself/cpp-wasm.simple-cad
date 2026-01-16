import {
  EntityId,
  SelectionMode,
  OverlayBufferMeta,
  OrientedHandleMeta,
  EntityAabb,
} from '../protocol';
import { CadEngineInstance, WasmModule } from '../wasm-types';

import type { PickResult } from '@/types/picking';

/**
 * Selection System with caching to avoid hot-path allocations.
 *
 * The cache is invalidated when selection-mutating methods are called.
 * This avoids allocating new Uint32Array on every getSelectionIds() call
 * during pointermove events.
 */
export class SelectionSystem {
  // Cache for selection IDs to avoid allocation in hot paths
  private _cachedSelectionIds: Uint32Array | null = null;
  private _cacheVersion = 0;

  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance,
  ) {}

  /**
   * Invalidates the cached selection IDs.
   * Called internally when selection changes.
   */
  private invalidateCache(): void {
    this._cachedSelectionIds = null;
    this._cacheVersion++;
  }

  /**
   * Gets cached selection IDs, only allocating when cache is invalidated.
   * Safe to call frequently in hot paths (pointermove).
   */
  public getSelectionIds(): Uint32Array {
    // Return cached result if available
    if (this._cachedSelectionIds !== null) {
      return this._cachedSelectionIds;
    }

    if (!this.engine.getSelectionIds) {
      this._cachedSelectionIds = new Uint32Array(0);
      return this._cachedSelectionIds;
    }

    const vec = this.engine.getSelectionIds();
    const count = vec.size();
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = vec.get(i);
    }
    vec.delete();

    this._cachedSelectionIds = out;
    return out;
  }

  /**
   * Gets the current cache version for external invalidation tracking.
   */
  public getCacheVersion(): number {
    return this._cacheVersion;
  }

  /**
   * Force invalidation of cache (e.g., after external engine operations).
   */
  public forceInvalidate(): void {
    this.invalidateCache();
  }

  public clearSelection(): void {
    this.engine.clearSelection?.();
    this.invalidateCache();
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
    this.invalidateCache();
  }

  public selectByPick(pick: PickResult, modifiers: number): void {
    this.engine.selectByPick?.(pick, modifiers);
    this.invalidateCache();
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
    this.invalidateCache();
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

  public getOrientedHandleMeta(): OrientedHandleMeta {
    if (!this.engine.getOrientedHandleMeta) {
      throw new Error('[EngineRuntime] getOrientedHandleMeta() missing in WASM build.');
    }
    return this.engine.getOrientedHandleMeta();
  }

  public getSelectionBounds(): EntityAabb {
    if (!this.engine.getSelectionBounds) {
      throw new Error('[EngineRuntime] getSelectionBounds() missing in WASM build.');
    }
    return this.engine.getSelectionBounds();
  }
}
