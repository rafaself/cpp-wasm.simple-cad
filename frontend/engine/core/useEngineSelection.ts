import { useMemo } from 'react';

import { useDocumentSignal } from './engineDocumentSignals';
import { useEngineRuntime } from './useEngineRuntime';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import type { EntityId } from './protocol';

export const useEngineSelectionIds = (): EntityId[] => {
  const runtime = useEngineRuntime();
  const generation = useDocumentSignal('selection');

  return useMemo(() => {
    void generation;
    if (!runtime) return [];
    const ids = Array.from(runtime.getSelectionIds());
    cadDebugLog('selection', 'ids', () => ({ generation, ids }));
    return ids;
  }, [runtime, generation]);
};

export const useEngineSelectionCount = (): number => {
  const ids = useEngineSelectionIds();
  return ids.length;
};
