import { describe, it, expect, vi, beforeEach } from 'vitest';

import { initCadEngineModule } from '@/engine/bridge/getCadEngineFactory';
import { CommandOp, type EngineCommand } from '@/engine/core/commandTypes';
import {
  EngineRuntime,
  type WasmModule,
  type CadEngineInstance,
} from '@/engine/core/EngineRuntime';
import { EXPECTED_PROTOCOL_INFO, SelectionMode, ReorderAction } from '@/engine/core/protocol';

// Mock the factory to avoid loading real WASM
vi.mock('@/engine/bridge/getCadEngineFactory', () => ({
  initCadEngineModule: vi.fn(),
}));

describe('EngineRuntime', () => {
  let mockEngine: CadEngineInstance;
  let mockModule: WasmModule;
  let heapBuffer: Uint8Array;
  let selectionIds: number[];
  let drawOrderIds: number[];

  beforeEach(() => {
    heapBuffer = new Uint8Array(1024);
    selectionIds = [];
    drawOrderIds = [1, 2, 3];

    const makeVector = (values: number[]) => ({
      size: () => values.length,
      get: (index: number) => values[index] ?? 0,
      delete: () => undefined,
    });

    mockEngine = {
      clear: vi.fn(),
      allocBytes: vi.fn((size) => 100), // Always return pointer 100
      freeBytes: vi.fn(),
      applyCommandBuffer: vi.fn(),
      loadSnapshotFromPtr: vi.fn(),
      getPositionBufferMeta: vi.fn(),
      getLineBufferMeta: vi.fn(),
      getSnapshotBufferMeta: vi.fn(),
      getFullSnapshotMeta: vi.fn(() => ({ generation: 0, byteCount: 0, ptr: 0 })),
      getStats: vi.fn(),
      getProtocolInfo: vi.fn(() => EXPECTED_PROTOCOL_INFO),
      allocateEntityId: vi.fn(() => 1000),
      getHistoryMeta: vi.fn(() => ({ depth: 0, cursor: 0, generation: 0 })),
      canUndo: vi.fn(() => false),
      canRedo: vi.fn(() => false),
      undo: vi.fn(),
      redo: vi.fn(),
      pollEvents: vi.fn(() => ({ generation: 0, count: 0, ptr: 0 })),
      ackResync: vi.fn(),
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
      getSelectionIds: vi.fn(() => makeVector(selectionIds)),
      clearSelection: vi.fn(() => {
        selectionIds = [];
      }),
      setSelection: vi.fn((ptr, count, mode) => {
        const incoming = Array.from(new Uint32Array(heapBuffer.buffer, ptr, count));
        if (mode === SelectionMode.Replace) {
          selectionIds = incoming;
        } else if (mode === SelectionMode.Add) {
          const set = new Set(selectionIds);
          incoming.forEach((id) => set.add(id));
          selectionIds = Array.from(set);
        } else if (mode === SelectionMode.Remove) {
          const removeSet = new Set(incoming);
          selectionIds = selectionIds.filter((id) => !removeSet.has(id));
        } else if (mode === SelectionMode.Toggle) {
          const set = new Set(selectionIds);
          incoming.forEach((id) => {
            if (set.has(id)) set.delete(id);
            else set.add(id);
          });
          selectionIds = Array.from(set);
        }
      }),
      getDrawOrderSnapshot: vi.fn(() => makeVector(drawOrderIds)),
      reorderEntities: vi.fn((ptr, count, action) => {
        const moveIds = Array.from(new Uint32Array(heapBuffer.buffer, ptr, count));
        if (action === ReorderAction.BringToFront) {
          drawOrderIds = drawOrderIds.filter((id) => !moveIds.includes(id)).concat(moveIds);
        } else if (action === ReorderAction.SendToBack) {
          drawOrderIds = moveIds.concat(drawOrderIds.filter((id) => !moveIds.includes(id)));
        }
      }),
    } as unknown as CadEngineInstance;

    const MockCadEngine = class {
      constructor() {
        return mockEngine;
      }
    };

    mockModule = {
      CadEngine: MockCadEngine as any,
      HEAPU8: {
        set: vi.fn((src, ptr) => {
          // Simulate writing to memory
          heapBuffer.set(src, ptr);
        }),
        buffer: heapBuffer.buffer,
      } as unknown as Uint8Array,
      HEAPF32: new Float32Array(heapBuffer.buffer),
    } as unknown as WasmModule;

    (initCadEngineModule as any).mockResolvedValue(mockModule);
  });

  it('initializes correctly', async () => {
    const runtime = await EngineRuntime.create();
    expect(initCadEngineModule).toHaveBeenCalled();
    const stats = {
      generation: 1,
      rectCount: 0,
      lineCount: 0,
      polylineCount: 0,
      pointCount: 0,
      triangleVertexCount: 0,
      lineVertexCount: 0,
      rebuildAllGeometryCount: 0,
      lastLoadMs: 0,
      lastRebuildMs: 0,
      lastApplyMs: 0,
      lastTransformUpdateMs: 0,
      lastSnapCandidateCount: 0,
      lastSnapHitCount: 0,
    };
    mockEngine.getStats = vi.fn(() => stats as any);
    expect(runtime.getStats()).toEqual(stats);
  });

  it('clears the engine', async () => {
    const runtime = await EngineRuntime.create();
    runtime.clear();
    expect(mockEngine.clear).toHaveBeenCalled();
  });

  it('applies commands via buffer', async () => {
    const runtime = await EngineRuntime.create();
    const commands: EngineCommand[] = [
      { op: CommandOp.ClearAll },
      {
        op: CommandOp.UpsertRect,
        id: 10,
        rect: {
          x: 1,
          y: 2,
          w: 3,
          h: 4,
          fillR: 1,
          fillG: 0,
          fillB: 0,
          fillA: 1,
          strokeR: 0,
          strokeG: 1,
          strokeB: 0,
          strokeA: 1,
          strokeEnabled: 1,
          strokeWidthPx: 1,
        },
      },
    ];

    runtime.apply(commands);

    expect(mockEngine.allocBytes).toHaveBeenCalled();
    expect(mockModule.HEAPU8.set).toHaveBeenCalled();
    expect(mockEngine.applyCommandBuffer).toHaveBeenCalledWith(100, expect.any(Number));
    // Buffer pool optimization: freeBytes is NOT called after apply()
    // Buffer is reused across calls; only freed via dispose()
    expect(mockEngine.freeBytes).not.toHaveBeenCalled();

    // Verify buffer content magic number
    // Pointer 100. Magic is at 100.
    const magic = new DataView(heapBuffer.buffer).getUint32(100, true);
    expect(magic).toBe(0x43445745); // EWDC

    // dispose() should free the pooled buffer
    runtime.dispose();
    expect(mockEngine.freeBytes).toHaveBeenCalledWith(100);
  });

  it('does nothing if command list is empty', async () => {
    const runtime = await EngineRuntime.create();
    runtime.apply([]);
    expect(mockEngine.allocBytes).not.toHaveBeenCalled();
  });

  it('roundtrips selection ids through setSelection/getSelectionIds', async () => {
    const runtime = await EngineRuntime.create();
    runtime.setSelection([10, 20], SelectionMode.Replace);
    expect(runtime.getSelectionIds()).toEqual(new Uint32Array([10, 20]));
  });

  it('updates draw order via reorderEntities', async () => {
    const runtime = await EngineRuntime.create();
    runtime.reorderEntities([1], ReorderAction.BringToFront);
    expect(runtime.getDrawOrderSnapshot()).toEqual(new Uint32Array([2, 3, 1]));
  });
});
