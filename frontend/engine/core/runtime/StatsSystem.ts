import type { EngineStats } from '../protocol';
import type { CadEngineInstance } from '../wasm-types';

export class StatsSystem {
  constructor(private readonly engine: CadEngineInstance) {}

  public getStats(): EngineStats {
    return this.engine.getStats();
  }
}
