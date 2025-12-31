import { useUIStore } from '@/stores/useUIStore';

import { bumpDocumentSignal } from './engineDocumentSignals';
import { syncHistoryMetaFromEngine } from './engineStateSync';

import type { EngineRuntime } from './EngineRuntime';

export const applyFullResync = (runtime: EngineRuntime, resyncGeneration: number): void => {
  const bytes = runtime.getFullSnapshotBytes();
  if (bytes.byteLength === 0) {
    syncHistoryMetaFromEngine(runtime);
    bumpDocumentSignal('layers');
    bumpDocumentSignal('selection');
    bumpDocumentSignal('order');
    runtime.ackResync(resyncGeneration);
    return;
  }

  runtime.resetIds();
  runtime.loadSnapshotBytes(bytes);

  const layers = runtime.getLayersSnapshot();
  if (layers.length > 0) {
    const first = layers.reduce<{ id: number; order: number } | null>((acc, rec) => {
      if (!acc || rec.order < acc.order) return { id: rec.id, order: rec.order };
      return acc;
    }, null);
    if (first) useUIStore.getState().setActiveLayerId(first.id);
  }

  bumpDocumentSignal('layers');
  bumpDocumentSignal('selection');
  bumpDocumentSignal('order');
  syncHistoryMetaFromEngine(runtime);

  runtime.ackResync(resyncGeneration);
};
