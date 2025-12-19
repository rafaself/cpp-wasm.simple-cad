import { initCadEngineModule } from '@/wasm/getCadEngineFactory';
import { encodeCommandBuffer, type EngineCommand } from './commandBuffer';
import { createIdAllocator, type IdMaps } from './idAllocator';

export type BufferMeta = {
  generation: number;
  vertexCount: number;
  capacity: number;
  floatCount: number;
  ptr: number;
};

export type SnapshotBufferMeta = {
  generation: number;
  byteCount: number;
  ptr: number;
};

export type CadEngineInstance = {
  clear: () => void;
  allocBytes: (byteCount: number) => number;
  freeBytes: (ptr: number) => void;
  applyCommandBuffer: (ptr: number, byteCount: number) => void;
  getPositionBufferMeta: () => BufferMeta;
  getLineBufferMeta: () => BufferMeta;
  getSnapshotBufferMeta: () => SnapshotBufferMeta;
  getStats: () => {
    generation: number;
    rectCount: number;
    lineCount: number;
    polylineCount: number;
    pointCount: number;
    triangleVertexCount: number;
    lineVertexCount: number;
    lastLoadMs: number;
    lastRebuildMs: number;
    lastApplyMs?: number;
  };
};

export type WasmModule = {
  CadEngine: new () => CadEngineInstance;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
};

export class EngineRuntime {
  public static async create(): Promise<EngineRuntime> {
    const module = await initCadEngineModule<WasmModule>();
    const engine = new module.CadEngine();
    return new EngineRuntime(module, engine);
  }

  public readonly ids = createIdAllocator();
  private constructor(
    public readonly module: WasmModule,
    public readonly engine: CadEngineInstance,
  ) {}

  public getIdMaps(): IdMaps {
    return this.ids.maps;
  }

  public clear(): void {
    this.engine.clear();
  }

  public apply(commands: readonly EngineCommand[]): void {
    if (commands.length === 0) return;

    const bytes = encodeCommandBuffer(commands);
    const ptr = this.engine.allocBytes(bytes.byteLength);
    try {
      this.module.HEAPU8.set(bytes, ptr);
      this.engine.applyCommandBuffer(ptr, bytes.byteLength);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }
}

