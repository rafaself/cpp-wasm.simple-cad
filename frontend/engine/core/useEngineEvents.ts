import { useEffect } from 'react';

import { useUIStore } from '@/stores/useUIStore';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import { bumpDocumentSignal } from './engineDocumentSignals';
import { applyFullResync } from './engineEventResync';
import { syncHistoryMetaFromEngine } from './engineStateSync';
import { ChangeMask, EventType } from './protocol';
import { getEngineRuntime } from './singleton';

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
    let rafId: number | null = null;
    let resyncing = false;
    let bootstrapped = false;
    let runtime: Awaited<ReturnType<typeof getEngineRuntime>> | null = null;

    const tick = () => {
      if (disposed || document.hidden || !runtime) return;

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
      cadDebugLog('events', 'poll', () => ({
        count: events.length,
        types: events.map((ev) => EventType[ev.type] ?? ev.type),
      }));

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
      let needsOverlay = false;
      let needsStyle = false;
      let needsGeometry = false;
      let entityCreated = false;

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
          case EventType.EntityCreated:
            entityCreated = true;
            break;
          case EventType.EntityChanged: {
            // EntityChanged: ev.a = entityId, ev.b = changeMask
            const mask = ev.b >>> 0;
            if ((mask & (ChangeMask.Geometry | ChangeMask.Bounds)) !== 0) {
              needsGeometry = true;
              needsOverlay = true;
            }
            if ((mask & ChangeMask.Style) !== 0) needsStyle = true;
            break;
          }
          case EventType.DocChanged: {
            const mask = ev.a >>> 0;
            if ((mask & ChangeMask.Layer) !== 0) needsLayers = true;
            if ((mask & ChangeMask.Order) !== 0) needsOrder = true;
            if ((mask & ChangeMask.Style) !== 0) needsStyle = true;
            if ((mask & (ChangeMask.Geometry | ChangeMask.Bounds)) !== 0) needsGeometry = true;
            if (
              (mask &
                (ChangeMask.Bounds |
                  ChangeMask.Style |
                  ChangeMask.Text |
                  ChangeMask.Geometry |
                  ChangeMask.RenderData)) !==
              0
            ) {
              needsOverlay = true;
            }
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
      if (needsStyle) bumpDocumentSignal('style');
      if (needsGeometry) bumpDocumentSignal('geometry');
      if (needsHistory) syncHistoryMetaFromEngine(runtime);
      if (needsOverlay) {
        useUIStore.getState().bumpOverlayTick();
      }
      if (entityCreated) {
        useUIStore.getState().setSidebarTab('drawing');
      }
      cadDebugLog('events', 'signals', () => ({
        layers: needsLayers,
        selection: needsSelection,
        order: needsOrder,
        style: needsStyle,
        geometry: needsGeometry,
        history: needsHistory,
        overlay: needsOverlay,
      }));

      rafId = requestAnimationFrame(tick);
    };

    const visibilityHandler = () => {
      if (document.hidden && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!document.hidden && rafId === null && runtime) {
        rafId = requestAnimationFrame(tick);
      }
    };

    void getEngineRuntime().then((rt) => {
      if (disposed) return;
      runtime = rt;
      if (!document.hidden) {
        rafId = requestAnimationFrame(tick);
      }
    });

    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      disposed = true;
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, []);
};
