import { describe, expect, it } from 'vitest';
import { CommandOp } from '@/engine/core/commandBuffer';
import {
  computeLayerDrivenReupsertCommands,
  createStableIdCache,
  getCachedSortedKeys,
} from '@/engine/core/useEngineStoreSync';
import type { Layer, Shape } from '../types';
import { getDefaultColorMode } from '../utils/shapeColors';

const baseLayer = (overrides: Partial<Layer> = {}): Layer => ({
  id: 'layer-1',
  name: 'Layer 1',
  strokeColor: '#111111',
  strokeEnabled: true,
  fillColor: '#ffffff',
  fillEnabled: true,
  visible: true,
  locked: false,
  ...overrides,
});

const rectShape = (id: string, layerId: string): Shape => ({
  id,
  layerId,
  type: 'rect',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  strokeColor: '#000000',
  strokeEnabled: true,
  strokeOpacity: 100,
  fillColor: '#ffffff',
  fillEnabled: true,
  fillOpacity: 100,
  colorMode: getDefaultColorMode(),
  points: [],
});

describe('useEngineStoreSync incremental behaviour', () => {
  it('reuses cached sorted keys when the key set is unchanged', () => {
    const cache = createStableIdCache();
    const first = { a: 1, b: 2 } as Record<string, unknown>;
    const second = { b: 3, a: 4 } as Record<string, unknown>;

    const firstKeys = getCachedSortedKeys(first, cache);
    const secondKeys = getCachedSortedKeys(second, cache);

    expect(firstKeys).toBe(secondKeys);
    expect(secondKeys).toEqual(['a', 'b']);
  });

  it('only reupserts shapes on layers that actually changed', () => {
    const shapes: Record<string, Shape> = {
      a: rectShape('a', 'layer-1'),
      b: rectShape('b', 'layer-2'),
    };
    const visible = new Set(['a', 'b']);
    const layers = [baseLayer(), baseLayer({ id: 'layer-2', name: 'Layer 2' })];
    const changedLayers = new Set(['layer-1']);
    const ensureId = (id: string) => (id === 'a' ? 101 : 202);

    const commands = computeLayerDrivenReupsertCommands(
      shapes,
      visible,
      layers,
      changedLayers,
      ensureId,
      ['b', 'a'],
    );

    expect(commands).toHaveLength(1);
    expect(commands[0]?.op).toBe(CommandOp.UpsertRect);
    expect((commands[0] as any)?.id).toBe(101);
  });
});
