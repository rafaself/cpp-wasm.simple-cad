import { CadEngineInstance } from '../wasm-types';
import { HistoryMeta } from '../protocol';

export class HistorySystem {
  constructor(
    private readonly engine: CadEngineInstance
  ) {}

  public getHistoryMeta(): HistoryMeta {
    if (!this.engine.getHistoryMeta) {
      throw new Error('[EngineRuntime] getHistoryMeta() missing in WASM build.');
    }
    return this.engine.getHistoryMeta();
  }

  public canUndo(): boolean {
    if (!this.engine.canUndo) throw new Error('[EngineRuntime] canUndo() missing in WASM build.');
    return this.engine.canUndo();
  }

  public canRedo(): boolean {
    if (!this.engine.canRedo) throw new Error('[EngineRuntime] canRedo() missing in WASM build.');
    return this.engine.canRedo();
  }

  public undo(): void {
    if (!this.engine.undo) throw new Error('[EngineRuntime] undo() missing in WASM build.');
    this.engine.undo();
  }

  public redo(): void {
    if (!this.engine.redo) throw new Error('[EngineRuntime] redo() missing in WASM build.');
    this.engine.redo();
  }
}
