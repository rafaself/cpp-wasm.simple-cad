import { bumpDocumentSignal } from './engineDocumentSignals';
import { syncHistoryMetaFromEngine } from './engineStateSync';
import { useUIStore } from '@/stores/useUIStore';
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

  if (runtime.engine.getLayersSnapshot) {
    const vec = runtime.engine.getLayersSnapshot();
    const count = vec.size();
    let firstId: number | null = null;
    let minOrder = Number.POSITIVE_INFINITY;
    for (let i = 0; i < count; i++) {
      const rec = vec.get(i);
      if (rec.order < minOrder) {
        minOrder = rec.order;
        firstId = rec.id;
      }
    }
    vec.delete();
    if (firstId !== null) useUIStore.getState().setActiveLayerId(firstId);
  }

  bumpDocumentSignal('layers');
  bumpDocumentSignal('selection');
  bumpDocumentSignal('order');
  syncHistoryMetaFromEngine(runtime);

  runtime.ackResync(resyncGeneration);
};
