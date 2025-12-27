import { beforeEach, describe, expect, it } from 'vitest';
import { useDataStore, __resetDataStoreForTests } from '@/stores/useDataStore';
import { IdRegistry, ensureId } from '@/engine/core/IdRegistry';
import { syncDrawOrderFromEngine } from '@/engine/core/engineStateSync';

describe('engine state sync', () => {
  beforeEach(() => {
    __resetDataStoreForTests();
    IdRegistry.clear();
  });

  it('syncs draw order snapshot into the store', () => {
    useDataStore.setState({
      shapes: {
        a: { id: 'a', type: 'rect', layerId: 'desenho', points: [], x: 0, y: 0, width: 1, height: 1, strokeColor: '#000000', fillColor: '#ffffff' },
        b: { id: 'b', type: 'rect', layerId: 'desenho', points: [], x: 0, y: 0, width: 1, height: 1, strokeColor: '#000000', fillColor: '#ffffff' },
        c: { id: 'c', type: 'rect', layerId: 'desenho', points: [], x: 0, y: 0, width: 1, height: 1, strokeColor: '#000000', fillColor: '#ffffff' },
      },
      shapeOrder: ['a', 'b', 'c'],
    });

    const idB = ensureId('b');
    const idA = ensureId('a');

    const runtime = {
      getDrawOrderSnapshot: () => new Uint32Array([idB, idA]),
    } as any;

    syncDrawOrderFromEngine(runtime);

    expect(useDataStore.getState().shapeOrder).toEqual(['b', 'a', 'c']);
  });
});
