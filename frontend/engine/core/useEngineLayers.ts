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
    if (!runtime) return [];

    const layers = runtime.getLayersSnapshot();
    const out: EngineLayerSnapshot[] = layers.map((rec) => ({
      id: rec.id,
      name: runtime.getLayerName(rec.id),
      visible: (rec.flags & EngineLayerFlags.Visible) !== 0,
      locked: (rec.flags & EngineLayerFlags.Locked) !== 0,
      order: rec.order,
    }));
    return out.sort((a, b) => a.order - b.order);
  }, [runtime, generation]);
};
