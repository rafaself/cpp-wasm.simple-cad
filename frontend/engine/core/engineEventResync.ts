import { decodeEsnpSnapshot } from '@/persistence/esnpSnapshot';
import { clearTextMappings, registerTextMapping, setTextMeta } from './textEngineSync';
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

  runtime.loadSnapshotBytes(bytes);
  runtime.resetIds();
  clearTextMappings();

  const snapshot = decodeEsnpSnapshot(bytes);
  for (const text of snapshot.texts) {
    const shapeId = `entity-${text.id}`;
    registerTextMapping(text.id, shapeId);
    setTextMeta(text.id, text.boxMode, text.constraintWidth);
  }

  bumpDocumentSignal('layers');
  bumpDocumentSignal('selection');
  bumpDocumentSignal('order');
  syncHistoryMetaFromEngine(runtime);

  runtime.ackResync(resyncGeneration);
};
