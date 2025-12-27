import { useDataStore } from '@/stores/useDataStore';
import { decodeEsnpSnapshot } from '@/persistence/esnpSnapshot';
import { buildProjectFromEsnp } from '@/persistence/esnpHydration';
import { ensureLayerIdFromEngine, LayerRegistry } from './LayerRegistry';
import { registerEngineId, setNextEngineId } from './IdRegistry';
import { clearTextMappings, registerTextMapping, setTextMeta } from './textEngineSync';
import { syncDrawOrderFromEngine, syncHistoryMetaFromEngine, syncSelectionFromEngine } from './engineStateSync';
import type { EngineRuntime } from './EngineRuntime';

export const applyFullResync = (runtime: EngineRuntime, resyncGeneration: number): void => {
  const bytes = runtime.getFullSnapshotBytes();
  if (bytes.byteLength === 0) {
    syncHistoryMetaFromEngine(runtime);
    runtime.ackResync(resyncGeneration);
    return;
  }

  runtime.loadSnapshotBytes(bytes);

  LayerRegistry.clear();
  clearTextMappings();

  const snapshot = decodeEsnpSnapshot(bytes);
  const hydration = buildProjectFromEsnp(snapshot, {
    layerIdForEngine: (engineId) => ensureLayerIdFromEngine(engineId),
    shapeIdForEntity: (engineId) => {
      const shapeId = `entity-${engineId}`;
      registerEngineId(engineId, shapeId);
      return shapeId;
    },
  });

  for (const entry of hydration.entities) {
    if (!entry.textMeta) continue;
    registerTextMapping(entry.engineId, entry.shape.id);
    setTextMeta(entry.engineId, entry.textMeta.boxMode, entry.textMeta.constraintWidth);
  }
  setNextEngineId(snapshot.nextId);

  const data = useDataStore.getState();
  data.loadSerializedProject({
    project: hydration.project,
    worldScale: data.worldScale,
    frame: data.frame,
  });
  data.clearDirtyShapeIds();

  syncDrawOrderFromEngine(runtime);
  syncSelectionFromEngine(runtime);
  syncHistoryMetaFromEngine(runtime);

  runtime.ackResync(resyncGeneration);
};
