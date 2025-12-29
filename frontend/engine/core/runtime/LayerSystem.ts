import { CadEngineInstance, WasmModule } from '../wasm-types';
import { LayerRecord } from '../protocol';

export class LayerSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance
  ) {}

  public allocateLayerId(): number {
    if (!this.engine.allocateLayerId) {
      throw new Error('[EngineRuntime] allocateLayerId() missing in WASM build.');
    }
    return this.engine.allocateLayerId();
  }

  public getLayersSnapshot(): LayerRecord[] {
    if (!this.engine.getLayersSnapshot) return [];
    const vec = this.engine.getLayersSnapshot();
    const count = vec.size();
    const out: LayerRecord[] = [];
    for (let i = 0; i < count; i++) {
        out.push(vec.get(i));
    }
    vec.delete();
    return out;
  }

  public getLayerName(layerId: number): string {
      return this.engine.getLayerName?.(layerId) ?? `Layer ${layerId}`;
  }

  public setLayerProps(layerId: number, propsMask: number, flagsValue: number, name: string): void {
      this.engine.setLayerProps?.(layerId, propsMask, flagsValue, name);
  }

  public deleteLayer(layerId: number): boolean {
      return this.engine.deleteLayer?.(layerId) ?? false;
  }
}
