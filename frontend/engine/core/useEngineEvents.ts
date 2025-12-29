import { useEffect } from 'react';

import { useUIStore } from '@/stores/useUIStore';
import { getEngineRuntime } from './singleton';
import { ChangeMask, EventType } from './protocol';
import { syncHistoryMetaFromEngine } from './engineStateSync';
import { applyFullResync } from './engineEventResync';
import { bumpDocumentSignal } from './engineDocumentSignals';

const readFirstLayerId = (runtime: Awaited<ReturnType<typeof getEngineRuntime>>): number | null => {
  const layers = runtime.getLayersSnapshot();
  if (!layers.length) return null;
  const first = layers.reduce<{ id: number; order: number } | null>((acc, rec) => {
    if (!acc || rec.order < acc.order) return { id: rec.id, order: rec.order };
    return acc;
  }, null);
  return first ? first.id : null;
};

const ensureActiveLayer = (runtime: Awaited<ReturnType<typeof getEngineRuntime>>): void => {
  const { activeLayerId, setActiveLayerId } = useUIStore.getState();
  const layers = runtime.getLayersSnapshot();
  const hasActive = layers.some((rec) => rec.id === activeLayerId);

  if (!hasActive) {
    const first = readFirstLayerId(runtime);
    if (first !== null) setActiveLayerId(first);
  }
};

export const useEngineEvents = (): void => {
  useEffect(() => {
    let disposed = false;
    let rafId = 0;
    let resyncing = false;
    let bootstrapped = false;


    const tick = async () => {
      if (disposed) return;
      const runtime = await getEngineRuntime();
      if (disposed) return;



      if (!bootstrapped) {
        bumpDocumentSignal('layers');
        bumpDocumentSignal('selection');
        bumpDocumentSignal('order');
        syncHistoryMetaFromEngine(runtime);
        ensureActiveLayer(runtime);
        bootstrapped = true;
      }

      // Skip polling if no pending events (performance optimization)
      if (!runtime.hasPendingEvents()) {
        rafId = requestAnimationFrame(tick);
        return;
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
      let needsHistory = false;

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
          case EventType.HistoryChanged:
            needsHistory = true;
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

      if (needsLayers) {
        bumpDocumentSignal('layers');
        ensureActiveLayer(runtime);
      }
      if (needsSelection) bumpDocumentSignal('selection');
      if (needsOrder) bumpDocumentSignal('order');
      if (needsHistory) syncHistoryMetaFromEngine(runtime);

      rafId = requestAnimationFrame(tick);
    };

    void tick();

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);
};
