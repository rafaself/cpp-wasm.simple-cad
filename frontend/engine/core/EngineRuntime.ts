import { initCadEngineModule } from '../bridge/getCadEngineFactory';
import { encodeCommandBuffer, type EngineCommand } from './commandBuffer';
import { createIdAllocator, type IdMaps } from './idAllocator';
import type { TextCaretPosition, TextHitResult, TextQuadBufferMeta, TextureBufferMeta } from '@/types/text';
import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';

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

  // New extended pick (optional during migration)
  pickEx?: (x: number, y: number, tolerance: number, pickMask: number) => PickResult;

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
  isTextQuadsDirty?: () => boolean;

  clearAtlasDirty?: () => void;

  // Interaction Session
  beginTransform?: (idsPtr: number, idCount: number, mode: number, specificId: number, vertexIndex: number, startX: number, startY: number) => void;
  updateTransform?: (worldX: number, worldY: number) => void;
  commitTransform?: () => void;
  cancelTransform?: () => void;
  isInteractionActive?: () => boolean;
  getCommitResultCount?: () => number;
  getCommitResultIdsPtr?: () => number;
  getCommitResultOpCodesPtr?: () => number;
  getCommitResultPayloadsPtr?: () => number;
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

  // Wrapper for pickEx with fallback
  public pickEx(x: number, y: number, tolerance: number, pickMask: number): PickResult {
      // Feature detection: Check if pickEx exists on the WASM instance
      if (typeof this.engine.pickEx === 'function') {
          const res = this.engine.pickEx(x, y, tolerance, pickMask);

          // DEV Assertion: Check for fallback condition where ID is found but subTarget is None
          // This implies the engine found something but didn't classify it correctly in pickEx.
          if (import.meta.env.DEV && res.id !== 0 && res.subTarget === PickSubTarget.None) {
              console.error(`[EngineRuntime] pickEx returned valid ID ${res.id} but subTarget is None! This indicates a gap in pick_system.cpp or binding.`);
          }

          return res;
      }

      // Fallback to legacy pick (ID only)
      // subTarget MUST be None to avoid creating fake interaction states
      const id = this.engine.pick(x, y, tolerance);
      return {
          id,
          kind: PickEntityKind.Unknown,
          subTarget: PickSubTarget.None,
          subIndex: -1,
          distance: id !== 0 ? 0 : Infinity // Placeholder distance for hit
      };
  }


  // ========================================================================
  // Interaction Session wrappers
  // ========================================================================

  public beginTransform(
    ids: number[],
    mode: number,
    specificId: number = 0,
    vertexIndex: number = -1,
    startX: number = 0,
    startY: number = 0
  ): void {
    if (!this.engine.beginTransform || !this.engine.allocBytes || !this.engine.freeBytes) {
       console.warn("WASM engine does not support beginTransform");
       return;
    }

    const ptr = this.engine.allocBytes(ids.length * 4);
    try {
        const u32 = new Uint32Array(this.module.HEAPU8.buffer, ptr, ids.length);
        u32.set(ids);
        this.engine.beginTransform(ptr, ids.length, mode, specificId, vertexIndex, startX, startY);
    } catch(e) { 
        console.error(e);
    } finally {
        this.engine.freeBytes(ptr);
    }
  }

  public updateTransform(worldX: number, worldY: number): void {
      this.engine.updateTransform?.(worldX, worldY);
  }

  public cancelTransform(): void {
      this.engine.cancelTransform?.();
  }

  public isInteractionActive(): boolean {
      return !!this.engine.isInteractionActive?.();
  }

  public commitTransform(): { ids: Uint32Array, opCodes: Uint8Array, payloads: Float32Array } | null {
      if (!this.engine.commitTransform) return null;
      
      this.engine.commitTransform();
      
      const count = this.engine.getCommitResultCount?.() ?? 0;
      if (count === 0) return null;

      // Copy data out of WASM memory immediately
      // Because buffers in WASM might be reused or invalidated? 
      // Actually they are vectors in C++, valid until next clear/reserve.
      // But creating a copy in JS is safer for async/React processing.
      
      const idsPtr = this.engine.getCommitResultIdsPtr!();
      const opCodesPtr = this.engine.getCommitResultOpCodesPtr!();
      const payloadsPtr = this.engine.getCommitResultPayloadsPtr!();
      
      // Access direct views
      const idsView = new Uint32Array(this.module.HEAPU8.buffer, idsPtr, count);
      const opCodesView = new Uint8Array(this.module.HEAPU8.buffer, opCodesPtr, count);
      const payloadsView = new Float32Array(this.module.HEAPU8.buffer, payloadsPtr, count * 4); // Stride 4

      // Slice to copy
      return {
          ids: idsView.slice(),
          opCodes: opCodesView.slice(),
          payloads: payloadsView.slice()
      };
  }
}
