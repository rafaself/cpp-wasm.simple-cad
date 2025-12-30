import { useUIStore } from '@/stores/useUIStore';

import type { EngineRuntime } from './EngineRuntime';
import type { HistoryMeta } from './protocol';

export const syncHistoryMetaFromEngine = (runtime: EngineRuntime): HistoryMeta => {
  const meta = runtime.getHistoryMeta();
  useUIStore.getState().setHistoryMeta(meta);
  return meta;
};
