import { initCadEngineModule } from '../bridge/getCadEngineFactory';
import { encodeCommandBuffer, type EngineCommand, CommandOp } from './commandBuffer';
import { createIdAllocator, type IdMaps } from './idAllocator';
import type { TextCaretPosition, TextHitResult, TextQuadBufferMeta, TextureBufferMeta } from '@/types/text';

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
  loadSnapshotFromPtr: (ptr: number, byteCount: number) => void;
  getPositionBufferMeta: () => BufferMeta;
  getLineBufferMeta: () => BufferMeta;
  getSnapshotBufferMeta: () => SnapshotBufferMeta;
  pick: (x: number, y: number, tolerance: number) => number;
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

  // -------------------------------------------------------------------------
  // Optional text system methods (present when WASM is built with text support)
  // -------------------------------------------------------------------------
  initializeTextSystem?: () => boolean;
  loadFont?: (fontId: number, fontDataPtr: number, dataSize: number) => boolean;
  hitTestText?: (textId: number, localX: number, localY: number) => TextHitResult;
  getTextCaretPosition?: (textId: number, charIndex: number) => TextCaretPosition;
  rebuildTextQuadBuffer?: () => void;
  getTextQuadBufferMeta?: () => TextQuadBufferMeta;
  getAtlasTextureMeta?: () => TextureBufferMeta;
  isAtlasDirty?: () => boolean;
  clearAtlasDirty?: () => void;
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

  public resetIds(): void {
    this.ids.maps.idHashToString.clear();
    this.ids.maps.idStringToHash.clear();
  }

  public clear(): void {
    this.engine.clear();
  }

  public loadSnapshotBytes(bytes: Uint8Array): void {
    const ptr = this.engine.allocBytes(bytes.byteLength);
    try {
      this.module.HEAPU8.set(bytes, ptr);
      this.engine.loadSnapshotFromPtr(ptr, bytes.byteLength);
    } finally {
      this.engine.freeBytes(ptr);
    }
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

  // Helper for setting entity flags via command buffer
  public setEntityFlags(id: number, flags: number): void {
    this.apply([{ op: CommandOp.SetEntityFlags, id, flags: { flags } }]);
  }

  // Helper for batch setting entity flags
  public setEntityFlagsBatch(ids: readonly number[], flags: readonly number[]): void {
    if (ids.length !== flags.length || ids.length === 0) return;
    this.apply([{ op: CommandOp.SetEntityFlagsBatch, batch: { ids, flags } }]);
  }
}
