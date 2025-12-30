import type { EngineStats } from '../protocol';
import type { CadEngineInstance } from '../wasm-types';

export class StatsSystem {
  constructor(private readonly engine: CadEngineInstance) {}

  public getStats(): EngineStats | null {
    return this.engine.getStats ? this.engine.getStats() : null;
  }
}
