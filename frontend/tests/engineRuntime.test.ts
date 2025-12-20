import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EngineRuntime, type WasmModule, type CadEngineInstance } from '../engine/runtime/EngineRuntime';
import { CommandOp, type EngineCommand } from '../engine/runtime/commandBuffer';

// Mock the factory to avoid loading real WASM
vi.mock('@/wasm/getCadEngineFactory', () => ({
  initCadEngineModule: vi.fn(),
}));

import { initCadEngineModule } from '@/wasm/getCadEngineFactory';

describe('EngineRuntime', () => {
  let mockEngine: CadEngineInstance;
  let mockModule: WasmModule;
  let heapBuffer: Uint8Array;

  beforeEach(() => {
    heapBuffer = new Uint8Array(1024);
    
    mockEngine = {
      clear: vi.fn(),
      allocBytes: vi.fn((size) => 100), // Always return pointer 100
      freeBytes: vi.fn(),
      applyCommandBuffer: vi.fn(),
      loadSnapshotFromPtr: vi.fn(),
      getPositionBufferMeta: vi.fn(),
      getLineBufferMeta: vi.fn(),
      getSnapshotBufferMeta: vi.fn(),
      snapElectrical: vi.fn(),
      getStats: vi.fn(),
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
    expect(runtime.engine).toBe(mockEngine);
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
          strokeEnabled: 1,
        },
      }
    ];

    runtime.apply(commands);

    expect(mockEngine.allocBytes).toHaveBeenCalled();
    expect(mockModule.HEAPU8.set).toHaveBeenCalled();
    expect(mockEngine.applyCommandBuffer).toHaveBeenCalledWith(100, expect.any(Number));
    expect(mockEngine.freeBytes).toHaveBeenCalledWith(100);

    // Verify buffer content magic number
    // Pointer 100. Magic is at 100.
    const magic = new DataView(heapBuffer.buffer).getUint32(100, true);
    expect(magic).toBe(0x43445745); // EWDC
  });

  it('does nothing if command list is empty', async () => {
    const runtime = await EngineRuntime.create();
    runtime.apply([]);
    expect(mockEngine.allocBytes).not.toHaveBeenCalled();
  });
});
