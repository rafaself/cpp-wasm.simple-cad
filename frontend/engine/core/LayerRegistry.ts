export type LayerEngineId = number;

class LayerRegistryImpl {
  private nextEngineId: LayerEngineId = 1;
  private layerToEngine = new Map<string, LayerEngineId>();
  private engineToLayer = new Map<LayerEngineId, string>();

  ensureEngineId(layerId: string): LayerEngineId {
    let engineId = this.layerToEngine.get(layerId);
    if (engineId === undefined) {
      engineId = this.nextEngineId++;
      this.layerToEngine.set(layerId, engineId);
      this.engineToLayer.set(engineId, layerId);
    }
    return engineId;
  }

  getEngineId(layerId: string): LayerEngineId | null {
    return this.layerToEngine.get(layerId) ?? null;
  }

  getLayerId(engineId: LayerEngineId): string | null {
    return this.engineToLayer.get(engineId) ?? null;
  }

  registerEngineId(engineId: LayerEngineId, layerId: string): void {
    this.layerToEngine.set(layerId, engineId);
    this.engineToLayer.set(engineId, layerId);
    if (engineId >= this.nextEngineId) {
      this.nextEngineId = engineId + 1;
    }
  }

  ensureLayerId(engineId: LayerEngineId): string {
    const existing = this.getLayerId(engineId);
    if (existing) return existing;
    const synthetic = `layer-${engineId}`;
    this.registerEngineId(engineId, synthetic);
    return synthetic;
  }

  clear(): void {
    this.layerToEngine.clear();
    this.engineToLayer.clear();
    this.nextEngineId = 1;
  }
}

export const LayerRegistry = new LayerRegistryImpl();

export const ensureLayerEngineId = (layerId: string): LayerEngineId =>
  LayerRegistry.ensureEngineId(layerId);
export const getLayerEngineId = (layerId: string): LayerEngineId | null =>
  LayerRegistry.getEngineId(layerId);
export const getLayerIdFromEngine = (engineId: LayerEngineId): string | null =>
  LayerRegistry.getLayerId(engineId);
export const ensureLayerIdFromEngine = (engineId: LayerEngineId): string =>
  LayerRegistry.ensureLayerId(engineId);
