import type { CadEngineInstance } from '../wasm-types';
import type { EngineStats } from '../protocol';

export class StatsSystem {
  constructor(private readonly engine: CadEngineInstance) {}

  public getStats(): EngineStats | null {
    return this.engine.getStats ? this.engine.getStats() : null;
  }
}
