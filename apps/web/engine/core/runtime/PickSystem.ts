import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';
import { getPickProfiler } from '@/utils/pickProfiler';

import { CadEngineInstance, WasmModule } from '../wasm-types';

import type { EntityId, EntityAabb } from '../protocol';

export class PickSystem {
  constructor(
    private readonly _module: WasmModule,
    private readonly engine: CadEngineInstance,
  ) {}

  public getEntityAabb(entityId: EntityId): EntityAabb {
    if (!this.engine.getEntityAabb) {
      throw new Error('[EngineRuntime] getEntityAabb() missing in WASM build.');
    }
    return this.engine.getEntityAabb(entityId);
  }

  public pickEx(x: number, y: number, tolerance: number, pickMask: number): PickResult {
    if (typeof this.engine.pickEx === 'function') {
      const res = this.engine.pickEx(x, y, tolerance, pickMask);
      if (import.meta.env.DEV && res.id !== 0 && res.subTarget === PickSubTarget.None) {
        console.error(`[EngineRuntime] pickEx returned valid ID ${res.id} but subTarget is None!`);
      }
      return res;
    }

    const id = this.engine.pick(x, y, tolerance);
    return {
      id,
      kind: PickEntityKind.Unknown,
      subTarget: PickSubTarget.None,
      subIndex: -1,
      distance: id !== 0 ? 0 : Infinity,
    };
  }

  public pickExSmart(x: number, y: number, tolerance: number, pickMask: number): PickResult {
    const profiler = getPickProfiler();
    const wrappedPick = profiler.wrap(this.pickEx.bind(this));
    return wrappedPick(x, y, tolerance, pickMask);
  }

  public pickCandidates(x: number, y: number, tolerance: number, pickMask: number): PickResult[] {
    if (typeof this.engine.pickCandidates === 'function') {
      const vec = this.engine.pickCandidates(x, y, tolerance, pickMask);
      const count = vec.size();
      const out: PickResult[] = [];
      for (let i = 0; i < count; i += 1) {
        out.push(vec.get(i));
      }
      vec.delete();
      return out;
    }

    const single = this.pickEx(x, y, tolerance, pickMask);
    return single.id !== 0 ? [single] : [];
  }

  public pickSideHandle(x: number, y: number, tolerance: number): PickResult | null {
    if (typeof this.engine.pickSideHandle !== 'function') {
      throw new Error('[EngineRuntime] pickSideHandle() missing in WASM build.');
    }
    return this.engine.pickSideHandle(x, y, tolerance);
  }

  public pickSelectionHandle(x: number, y: number, tolerance: number): PickResult | null {
    if (typeof this.engine.pickSelectionHandle !== 'function') {
      throw new Error('[EngineRuntime] pickSelectionHandle() missing in WASM build.');
    }
    return this.engine.pickSelectionHandle(x, y, tolerance);
  }

  /**
   * Quick bounds check to see if there are any entities near the given point.
   * This is a fast early-out check before performing more expensive operations.
   * Returns true if there might be something to pick, false if definitely nothing.
   */
  public quickBoundsCheck(x: number, y: number, tolerance: number): boolean {
    // Check if engine has native quickBoundsCheck
    if (typeof (this.engine as any).quickBoundsCheck === 'function') {
      return (this.engine as any).quickBoundsCheck(x, y, tolerance);
    }
    // Fallback: do a quick pick and check if we hit anything
    // Using a broad mask (0xFFFF) to detect any entity type
    const result = this.pickEx(x, y, tolerance, 0xffff);
    return result.id !== 0;
  }
}
