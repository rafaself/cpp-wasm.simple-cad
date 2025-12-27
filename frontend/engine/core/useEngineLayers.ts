import { useMemo } from 'react';

import { EngineLayerFlags } from './protocol';
import { useDocumentSignal } from './engineDocumentSignals';
import { useEngineRuntime } from './useEngineRuntime';

export type EngineLayerSnapshot = {
  id: number;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
};

export const useEngineLayers = (): EngineLayerSnapshot[] => {
  const runtime = useEngineRuntime();
  const generation = useDocumentSignal('layers');

  return useMemo(() => {
    if (!runtime || !runtime.engine.getLayersSnapshot || !runtime.engine.getLayerName) return [];

    const vec = runtime.engine.getLayersSnapshot();
    const count = vec.size();
    const out: EngineLayerSnapshot[] = [];

    for (let i = 0; i < count; i++) {
      const rec = vec.get(i);
      out.push({
        id: rec.id,
        name: runtime.engine.getLayerName(rec.id),
        visible: (rec.flags & EngineLayerFlags.Visible) !== 0,
        locked: (rec.flags & EngineLayerFlags.Locked) !== 0,
        order: rec.order,
      });
    }
    vec.delete();
    out.sort((a, b) => a.order - b.order);
    return out;
  }, [runtime, generation]);
};
