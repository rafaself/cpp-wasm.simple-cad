import { getPickProfiler } from '@/utils/pickProfiler';
import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';
import { CadEngineInstance, WasmModule } from '../wasm-types';
import type { EntityId, EntityAabb } from '../protocol';

export class PickSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance
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
      distance: id !== 0 ? 0 : Infinity
    };
  }

  public quickBoundsCheck(x: number, y: number, tolerance: number): boolean {
    const stats = this.engine.getStats();
    const totalEntities = 
      stats.rectCount + 
      stats.lineCount + 
      stats.polylineCount + 
      stats.pointCount;

    if (totalEntities === 0) {
      return false;
    }
    return true;
  }

  public pickExSmart(x: number, y: number, tolerance: number, pickMask: number): PickResult {
    const profiler = getPickProfiler();

    if (!this.quickBoundsCheck(x, y, tolerance)) {
      profiler.recordSkip();
      return {
        id: 0,
        kind: PickEntityKind.Unknown,
        subTarget: PickSubTarget.None,
        subIndex: -1,
        distance: Infinity,
      };
    }

    const wrappedPick = profiler.wrap(this.pickEx.bind(this));
    return wrappedPick(x, y, tolerance, pickMask);
  }


}
