import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer } from '@/types';
import { LayerRegistry } from '@/engine/core/LayerRegistry';
import { EngineLayerFlags, LayerPropMask } from '@/engine/core/protocol';
import { applyLayerPropUpdates, computeLayerPropUpdates } from '@/engine/core/useEngineStoreSync';

const baseLayer = (overrides: Partial<Layer> = {}): Layer => ({
  id: 'layer-1',
  name: 'Layer 1',
  strokeColor: '#000000',
  strokeEnabled: true,
  fillColor: '#ffffff',
  fillEnabled: true,
  visible: true,
  locked: false,
  ...overrides,
});

describe('layer prop sync', () => {
  beforeEach(() => {
    LayerRegistry.clear();
  });

  it('sends visibility/lock changes to the engine', () => {
    const setLayerProps = vi.fn();
    const runtime = { engine: { setLayerProps } };

    const prev = [baseLayer({ visible: true, locked: false })];
    const next = [baseLayer({ visible: false, locked: true })];
    const changes = computeLayerPropUpdates(prev, next);

    applyLayerPropUpdates(runtime, changes);

    expect(setLayerProps).toHaveBeenCalledTimes(1);
    expect(setLayerProps).toHaveBeenCalledWith(
      1,
      LayerPropMask.Visible | LayerPropMask.Locked,
      EngineLayerFlags.Locked,
      'Layer 1',
    );
  });

  it('deletes layers removed from the store', () => {
    const setLayerProps = vi.fn();
    const deleteLayer = vi.fn();
    const runtime = { engine: { setLayerProps, deleteLayer } };

    const created = computeLayerPropUpdates([], [baseLayer()]);
    applyLayerPropUpdates(runtime, created);

    const removed = computeLayerPropUpdates([baseLayer()], []);
    applyLayerPropUpdates(runtime, removed);

    expect(deleteLayer).toHaveBeenCalledWith(1);
  });
});
