import { decodeEngineEvents } from '../engineEventDecoder';
import { CadEngineInstance, WasmModule } from '../wasm-types';
import { EngineEvent } from '../protocol';

export class EventSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance
  ) {}

  public pollEvents(maxEvents: number): { generation: number; events: EngineEvent[] } {
    const meta = this.engine.pollEvents(maxEvents);
    return {
      generation: meta.generation,
      events: decodeEngineEvents(this.module.HEAPU8, meta.ptr, meta.count),
    };
  }

  public hasPendingEvents(): boolean {
    if (typeof this.engine.hasPendingEvents === 'function') {
      return this.engine.hasPendingEvents();
    }
    return true;
  }

  public ackResync(resyncGeneration: number): void {
    this.engine.ackResync(resyncGeneration);
  }
}
