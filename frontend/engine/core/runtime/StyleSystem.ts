import type { LayerStyleSnapshot, SelectionStyleSummary } from '../protocol';
import type { CadEngineInstance } from '../wasm-types';

export class StyleSystem {
  private engine: CadEngineInstance;

  constructor(engine: CadEngineInstance) {
    this.engine = engine;
  }

  getLayerStyle(layerId: number): LayerStyleSnapshot | null {
    if (!this.engine.getLayerStyle) return null;
    return this.engine.getLayerStyle(layerId);
  }

  getSelectionStyleSummary(): SelectionStyleSummary | null {
    if (!this.engine.getSelectionStyleSummary) return null;
    return this.engine.getSelectionStyleSummary();
  }
}
