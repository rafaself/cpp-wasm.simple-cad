import { useEffect } from 'react';
import type { Layer } from '@/types';
import { normalizeLayerStyle } from '@/utils/storeNormalization';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import { getEngineRuntime } from './singleton';
import { ChangeMask, EventType } from './protocol';
import { syncDrawOrderFromEngine, syncSelectionFromEngine } from './engineStateSync';
import { ensureLayerIdFromEngine } from './LayerRegistry';
import { applyFullResync } from './engineEventResync';

type EngineLayerSnapshot = {
  engineId: number;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
};

const readEngineLayerSnapshot = (runtime: Awaited<ReturnType<typeof getEngineRuntime>>): EngineLayerSnapshot[] | null => {
  const getLayersSnapshot = runtime.engine.getLayersSnapshot;
  const getLayerName = runtime.engine.getLayerName;
  if (!getLayersSnapshot || !getLayerName) return null;

  const vec = getLayersSnapshot();
  const count = vec.size();
  const out: EngineLayerSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const rec = vec.get(i);
    out.push({
      engineId: rec.id,
      name: getLayerName(rec.id),
      visible: (rec.flags & 1) !== 0,
      locked: (rec.flags & 2) !== 0,
      order: rec.order,
    });
  }
  vec.delete();
  return out;
};

const mergeEngineLayers = (snapshot: EngineLayerSnapshot[], prevLayers: readonly Layer[]): Layer[] => {
  const prevById = new Map(prevLayers.map((layer) => [layer.id, layer]));
  const sorted = [...snapshot].sort((a, b) => a.order - b.order);

  return sorted.map((rec) => {
    const layerId = ensureLayerIdFromEngine(rec.engineId);
    const prev = prevById.get(layerId);
    const base: Layer = prev ?? {
      id: layerId,
      name: rec.name || 'Layer',
      strokeColor: '#000000',
      strokeEnabled: true,
      fillColor: '#ffffff',
      fillEnabled: true,
      visible: rec.visible,
      locked: rec.locked,
    };
    return normalizeLayerStyle({
      ...base,
      name: rec.name || base.name,
      visible: rec.visible,
      locked: rec.locked,
    });
  });
};

const layerStateEqual = (a: readonly Layer[], b: readonly Layer[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) return false;
    if (
      left.id !== right.id ||
      left.name !== right.name ||
      left.visible !== right.visible ||
      left.locked !== right.locked
    ) {
      return false;
    }
  }
  return true;
};

const syncEngineLayersToStore = (runtime: Awaited<ReturnType<typeof getEngineRuntime>>): void => {
  const snapshot = readEngineLayerSnapshot(runtime);
  if (!snapshot) return;

  const data = useDataStore.getState();
  const merged = mergeEngineLayers(snapshot, data.layers);
  if (layerStateEqual(merged, data.layers)) return;

  const nextActive = merged.some((layer) => layer.id === data.activeLayerId)
    ? data.activeLayerId
    : (merged[0]?.id ?? data.activeLayerId);

  useDataStore.setState({
    layers: merged,
    activeLayerId: nextActive,
  });
};

export const useEngineEvents = (): void => {
  useEffect(() => {
    let disposed = false;
    let rafId = 0;
    let resyncing = false;
    let bootstrapped = false;
    let sourceSet = false;

    const tick = async () => {
      if (disposed) return;
      const runtime = await getEngineRuntime();
      if (disposed) return;

      if (!sourceSet) {
        useUIStore.getState().setDocumentSource('engine');
        sourceSet = true;
      }
      if (!bootstrapped) {
        syncEngineLayersToStore(runtime);
        syncSelectionFromEngine(runtime);
        syncDrawOrderFromEngine(runtime);
        bootstrapped = true;
      }

      const { events } = runtime.pollEvents(512);
      if (events.length === 0) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const overflowEvent = events.find((ev) => ev.type === EventType.Overflow);
      if (overflowEvent) {
        if (!resyncing) {
          resyncing = true;
          applyFullResync(runtime, overflowEvent.a);
          resyncing = false;
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      let needsLayers = false;
      let needsSelection = false;
      let needsOrder = false;

      for (const ev of events) {
        switch (ev.type) {
          case EventType.LayerChanged:
            needsLayers = true;
            break;
          case EventType.SelectionChanged:
            needsSelection = true;
            break;
          case EventType.OrderChanged:
            needsOrder = true;
            break;
          case EventType.DocChanged: {
            const mask = ev.a >>> 0;
            if ((mask & ChangeMask.Layer) !== 0) needsLayers = true;
            if ((mask & ChangeMask.Order) !== 0) needsOrder = true;
            break;
          }
          default:
            break;
        }
      }

      if (needsLayers) syncEngineLayersToStore(runtime);
      if (needsSelection) syncSelectionFromEngine(runtime);
      if (needsOrder) syncDrawOrderFromEngine(runtime);

      rafId = requestAnimationFrame(tick);
    };

    void tick();

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
};
