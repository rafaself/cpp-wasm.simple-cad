import { useMemo } from 'react';

import { useDocumentSignal } from './engineDocumentSignals';
import { useEngineRuntime } from './useEngineRuntime';

import type { EntityId } from './protocol';

export const useEngineSelectionIds = (): EntityId[] => {
  const runtime = useEngineRuntime();
  const generation = useDocumentSignal('selection');

  return useMemo(() => {
    if (!runtime) return [];
    return Array.from(runtime.getSelectionIds());
  }, [runtime, generation]);
};

export const useEngineSelectionCount = (): number => {
  const ids = useEngineSelectionIds();
  return ids.length;
};
