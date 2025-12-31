import { beforeEach, describe, expect, it } from 'vitest';

import { syncHistoryMetaFromEngine } from '@/engine/core/engineStateSync';
import { useUIStore } from '@/stores/useUIStore';

describe('history meta sync', () => {
  beforeEach(() => {
    useUIStore.getState().setHistoryMeta({ depth: 0, cursor: 0, generation: 0 });
  });

  it('maps history meta to canUndo/canRedo in UI state', () => {
    const runtime = {
      getHistoryMeta: () => ({ depth: 3, cursor: 1, generation: 7 }),
    } as any;

    syncHistoryMetaFromEngine(runtime);

    const history = useUIStore.getState().history;
    expect(history.depth).toBe(3);
    expect(history.cursor).toBe(1);
    expect(history.generation).toBe(7);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(true);
  });
});
