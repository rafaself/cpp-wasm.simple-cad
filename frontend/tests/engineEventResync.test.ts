import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetDataStoreForTests } from '@/stores/useDataStore';
import { IdRegistry } from '@/engine/core/IdRegistry';
import { LayerRegistry } from '@/engine/core/LayerRegistry';
import { clearTextMappings } from '@/engine/core/textEngineSync';
import { decodeEngineEvents, ENGINE_EVENT_STRIDE_BYTES } from '@/engine/core/engineEventDecoder';
import { EventType } from '@/engine/core/protocol';

vi.mock('@/persistence/esnpSnapshot', () => ({
  decodeEsnpSnapshot: () => ({
    nextId: 1,
    layers: [],
    rects: [],
    lines: [],
    polylines: [],
    circles: [],
    polygons: [],
    arrows: [],
    points: [],
    drawOrder: [],
    texts: [],
  }),
}));

vi.mock('@/persistence/esnpHydration', () => ({
  buildProjectFromEsnp: () => ({
    project: { layers: [], shapes: [], activeLayerId: 'layer-1' },
    layers: [],
    entities: [],
  }),
}));

let applyFullResync: (runtime: any, resyncGeneration: number) => void;

beforeAll(async () => {
  ({ applyFullResync } = await import('@/engine/core/engineEventResync'));
});

beforeEach(() => {
  __resetDataStoreForTests();
  IdRegistry.clear();
  LayerRegistry.clear();
  clearTextMappings();
});

describe('engine event decoding', () => {
  it('decodes EngineEvent structs from WASM memory', () => {
    const buffer = new ArrayBuffer(ENGINE_EVENT_STRIDE_BYTES * 2);
    const view = new DataView(buffer);

    view.setUint16(0, EventType.DocChanged, true);
    view.setUint16(2, 3, true);
    view.setUint32(4, 0x01020304, true);
    view.setUint32(8, 0x05060708, true);
    view.setUint32(12, 9, true);
    view.setUint32(16, 10, true);

    const offset = ENGINE_EVENT_STRIDE_BYTES;
    view.setUint16(offset, EventType.Overflow, true);
    view.setUint16(offset + 2, 0, true);
    view.setUint32(offset + 4, 99, true);
    view.setUint32(offset + 8, 0, true);
    view.setUint32(offset + 12, 0, true);
    view.setUint32(offset + 16, 0, true);

    const heap = new Uint8Array(buffer);
    const events = decodeEngineEvents(heap, 0, 2);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: EventType.DocChanged,
      flags: 3,
      a: 0x01020304,
      b: 0x05060708,
      c: 9,
      d: 10,
    });
    expect(events[1]).toMatchObject({
      type: EventType.Overflow,
      a: 99,
    });
  });
});

describe('engine full resync', () => {
  it('calls full resync helpers and acknowledges overflow', () => {
    const runtime = {
      getFullSnapshotBytes: vi.fn(() => new Uint8Array([1, 2, 3])),
      loadSnapshotBytes: vi.fn(),
      ackResync: vi.fn(),
      getSelectionIds: () => new Uint32Array(),
      getDrawOrderSnapshot: () => new Uint32Array(),
    } as any;

    applyFullResync(runtime, 42);

    expect(runtime.getFullSnapshotBytes).toHaveBeenCalledTimes(1);
    expect(runtime.loadSnapshotBytes).toHaveBeenCalledTimes(1);
    expect(runtime.ackResync).toHaveBeenCalledWith(42);
  });
});
