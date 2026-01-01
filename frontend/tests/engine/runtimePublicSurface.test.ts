import { describe, it, expect, vi, beforeEach } from 'vitest';

import { initCadEngineModule } from '@/engine/bridge/getCadEngineFactory';
import {
  EngineRuntime,
  type CadEngineInstance,
  type WasmModule,
} from '@/engine/core/EngineRuntime';
import { EXPECTED_PROTOCOL_INFO } from '@/engine/core/protocol';

vi.mock('@/engine/bridge/getCadEngineFactory', () => ({
  initCadEngineModule: vi.fn(),
}));

describe('EngineRuntime public API surface', () => {
  let mockEngine: CadEngineInstance;
  let mockModule: WasmModule;

  beforeEach(() => {
    mockEngine = {
      getProtocolInfo: vi.fn(() => EXPECTED_PROTOCOL_INFO),
      clear: vi.fn(),
      allocBytes: vi.fn(() => 0),
      freeBytes: vi.fn(),
      applyCommandBuffer: vi.fn(),
      loadSnapshotFromPtr: vi.fn(),
      getFullSnapshotMeta: vi.fn(() => ({ generation: 0, byteCount: 0, ptr: 0 })),
      pollEvents: vi.fn(() => ({ generation: 0, count: 0, ptr: 0 })),
      ackResync: vi.fn(),
      allocateEntityId: vi.fn(() => 1),
      getSelectionOutlineMeta: vi.fn(() => ({
        generation: 0,
        primitiveCount: 0,
        floatCount: 0,
        primitivesPtr: 0,
        dataPtr: 0,
      })),
      getSelectionHandleMeta: vi.fn(() => ({
        generation: 0,
        primitiveCount: 0,
        floatCount: 0,
        primitivesPtr: 0,
        dataPtr: 0,
      })),
      getSnapOverlayMeta: vi.fn(() => ({
        generation: 0,
        primitiveCount: 0,
        floatCount: 0,
        primitivesPtr: 0,
        dataPtr: 0,
      })),
      getEntityAabb: vi.fn(() => ({ minX: 0, minY: 0, maxX: 0, maxY: 0, valid: 0 })),
      getSelectionBounds: vi.fn(() => ({ minX: 0, minY: 0, maxX: 0, maxY: 0, valid: 0 })),
      getHistoryMeta: vi.fn(() => ({ depth: 0, cursor: 0, generation: 0 })),
      canUndo: vi.fn(() => false),
      canRedo: vi.fn(() => false),
      undo: vi.fn(),
      redo: vi.fn(),
      getStats: vi.fn(() => ({ generation: 0 }) as any),
    } as unknown as CadEngineInstance;

    const MockCadEngine = class {
      constructor() {
        return mockEngine;
      }
    };

    mockModule = {
      CadEngine: MockCadEngine as any,
      HEAPU8: new Uint8Array(256) as any,
      HEAPF32: new Float32Array(64) as any,
    } as unknown as WasmModule;

    (initCadEngineModule as any).mockResolvedValue(mockModule);
  });

  it('matches the approved public surface', async () => {
    const runtime = await EngineRuntime.create();

    const allowedInstanceKeys = [
      'module',
      'capabilitiesMask',
      'text',
      'pick',
      'draft',
      'transform',
      'io',
      'render',
      'stats',
    ];
    const instanceKeys = Object.keys(runtime).filter((k) => allowedInstanceKeys.includes(k));
    const protoKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(runtime)).filter(
      (k) => k !== 'constructor',
    );
    const surface = new Set([...instanceKeys, ...protoKeys]);

    const expected = new Set([
      'module',
      'capabilitiesMask',
      'text',
      'pick',
      'draft',
      'transform',
      'io',
      'render',
      'stats',
      'resetIds',
      'hasCapability',
      'clear',
      'dispose',
      'apply',
      'pollEvents',
      'hasPendingEvents',
      'ackResync',
      'loadSnapshotBytes',
      'saveSnapshotBytes',
      'getFullSnapshotBytes',
      'getDocumentDigest',
      'getHistoryMeta',
      'canUndo',
      'canRedo',
      'undo',
      'redo',
      'pickEx',
      'pickExSmart',
      'pickExCached',
      'applyCapabilityGuards',
      'getSelectionIds',
      'clearSelection',
      'setSelection',
      'selectByPick',
      'marqueeSelect',
      'queryMarquee',
      'quickBoundsCheck',
      'getSelectionOutlineMeta',
      'getSelectionHandleMeta',
      'getSnapOverlayMeta',
      'getSelectionBounds',
      'beginTransform',
      'updateTransform',
      'commitTransform',
      'cancelTransform',
      'isInteractionActive',
      'setSnapOptions',
      'getSnappedPoint',
      'getTextContent',
      'getTextEntityMeta',
      'getAllTextMetas',
      'allocateLayerId',
      'getLayersSnapshot',
      'getLayerName',
      'setLayerProps',
      'deleteLayer',
      'allocateEntityId',
      'getEntityAabb',
      'getEntityFlags',
      'setEntityFlags',
      'setEntityLayer',
      'getEntityLayer',
      'getDrawOrderSnapshot',
      'reorderEntities',
      'updateDraft',
      'appendDraftPoint',
      'getPositionBufferMeta',
      'getLineBufferMeta',
      'isTextQuadsDirty',
      'rebuildTextQuadBuffer',
      'getTextQuadBufferMeta',
      'getAtlasTextureMeta',
      'getStats',
    ]);

    expect(surface).toEqual(expected);
  });
});
