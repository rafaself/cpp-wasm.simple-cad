import { initCadEngineModule } from '../bridge/getCadEngineFactory';
import { encodeCommandBuffer, type EngineCommand } from './commandBuffer';
import { IdRegistry } from './IdRegistry';
import { LayerRegistry } from './LayerRegistry';
import { supportsEngineResize, type EngineCapability } from './capabilities';
import {
  validateProtocolOrThrow,
  type ProtocolInfo,
  type EntityId,
  type LayerRecord,
  type SelectionMode,
  type ReorderAction,
  type DocumentDigest,
} from './protocol';
import type { TextCaretPosition, TextHitResult, TextQuadBufferMeta, TextureBufferMeta } from '@/types/text';
import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';
import { useSettingsStore } from '@/stores/useSettingsStore';

export type BufferMeta = {
  generation: number;
  vertexCount: number;
  capacity: number;
  floatCount: number;
  ptr: number;
};

type WasmU32Vector = {
  size: () => number;
  get: (index: number) => number;
  delete: () => void;
};

type WasmLayerVector = {
  size: () => number;
  get: (index: number) => LayerRecord;
  delete: () => void;
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
  saveSnapshot?: () => SnapshotBufferMeta;
  getSnapshotBufferMeta: () => SnapshotBufferMeta;
  getCapabilities?: () => number;
  getProtocolInfo: () => ProtocolInfo;
  getDocumentDigest?: () => DocumentDigest;
  getLayersSnapshot?: () => WasmLayerVector;
  getLayerName?: (layerId: number) => string;
  setLayerProps?: (layerId: number, propsMask: number, flagsValue: number, name: string) => void;
  deleteLayer?: (layerId: number) => boolean;
  getEntityFlags?: (entityId: EntityId) => number;
  setEntityFlags?: (entityId: EntityId, flagsMask: number, flagsValue: number) => void;
  setEntityLayer?: (entityId: EntityId, layerId: number) => void;
  getEntityLayer?: (entityId: EntityId) => number;
  getSelectionIds?: () => WasmU32Vector;
  getSelectionGeneration?: () => number;
  clearSelection?: () => void;
  setSelection?: (idsPtr: number, idCount: number, mode: number) => void;
  selectByPick?: (pick: PickResult, modifiers: number) => void;
  marqueeSelect?: (minX: number, minY: number, maxX: number, maxY: number, mode: number, hitMode: number) => void;
  getDrawOrderSnapshot?: () => WasmU32Vector;
  reorderEntities?: (idsPtr: number, idCount: number, action: number, refId: number) => void;
  pick: (x: number, y: number, tolerance: number) => EntityId;

  // New extended pick (optional during migration)
  pickEx?: (x: number, y: number, tolerance: number, pickMask: number) => PickResult;
  queryArea?: (minX: number, minY: number, maxX: number, maxY: number) => WasmU32Vector;
  queryMarquee?: (minX: number, minY: number, maxX: number, maxY: number, mode: number) => WasmU32Vector;

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
  beginTransform?: (idsPtr: number, idCount: number, mode: number, specificId: EntityId, vertexIndex: number, startX: number, startY: number) => void;
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
    if (typeof engine.getProtocolInfo !== 'function') {
      throw new Error('[EngineRuntime] Missing getProtocolInfo() in WASM. Rebuild engine to match frontend.');
    }
    const protocolInfo = engine.getProtocolInfo();
    validateProtocolOrThrow(protocolInfo);
    const runtime = new EngineRuntime(module, engine);
    runtime.applyCapabilityGuards();
    return runtime;
  }

  private constructor(
    public readonly module: WasmModule,
    public readonly engine: CadEngineInstance,
  ) {
    this.capabilitiesMask = EngineRuntime.readCapabilities(engine);
  }

  public readonly capabilitiesMask: number;

  public resetIds(): void {
    IdRegistry.clear();
    LayerRegistry.clear();
  }

  public hasCapability(capability: EngineCapability): boolean {
    return (this.capabilitiesMask & capability) !== 0;
  }

  public clear(): void {
    IdRegistry.clear();
    LayerRegistry.clear();
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

  public saveSnapshotBytes(): Uint8Array {
    const meta =
      (typeof this.engine.saveSnapshot === 'function' ? this.engine.saveSnapshot() : null) ??
      this.engine.getSnapshotBufferMeta();
    if (!meta || meta.byteCount === 0) return new Uint8Array();
    return new Uint8Array(this.module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount));
  }

  public getDocumentDigest(): DocumentDigest | null {
    if (typeof this.engine.getDocumentDigest !== 'function') return null;
    return this.engine.getDocumentDigest();
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

  private readU32Vector(vec: WasmU32Vector): Uint32Array {
    const count = vec.size();
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      out[i] = vec.get(i);
    }
    vec.delete();
    return out;
  }

  private static readCapabilities(engine: CadEngineInstance): number {
    if (typeof engine.getCapabilities === 'function') {
      return engine.getCapabilities();
    }
    if (import.meta.env.DEV) {
      console.warn('[EngineRuntime] getCapabilities not found; assuming legacy WASM.');
    }
    return 0;
  }

  private applyCapabilityGuards(): void {
    const store = useSettingsStore.getState();
    store.setEngineCapabilitiesMask(this.capabilitiesMask);

    const supportsResize = supportsEngineResize(this.capabilitiesMask);
    if (!supportsResize) {
      const wasEnabled = store.featureFlags.enableEngineResize;
      store.setEngineResizeEnabled(false);
      if (wasEnabled && import.meta.env.DEV) {
        console.warn('[EngineRuntime] Engine resize disabled: WASM lacks resize capabilities.');
      }
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

  public getSelectionIds(): Uint32Array {
    if (!this.engine.getSelectionIds) return new Uint32Array();
    const vec = this.engine.getSelectionIds();
    return this.readU32Vector(vec);
  }

  public clearSelection(): void {
    this.engine.clearSelection?.();
  }

  public setSelection(ids: EntityId[], mode: SelectionMode): void {
    if (!this.engine.setSelection || !this.engine.allocBytes || !this.engine.freeBytes) {
      console.warn('[EngineRuntime] WASM engine does not support setSelection');
      return;
    }
    const ptr = this.engine.allocBytes(ids.length * 4);
    try {
      const u32 = new Uint32Array(this.module.HEAPU8.buffer, ptr, ids.length);
      u32.set(ids);
      this.engine.setSelection(ptr, ids.length, mode);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }

  public selectByPick(pick: PickResult, modifiers: number): void {
    this.engine.selectByPick?.(pick, modifiers);
  }

  public marqueeSelect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    mode: SelectionMode,
    hitMode: number,
  ): void {
    this.engine.marqueeSelect?.(minX, minY, maxX, maxY, mode, hitMode);
  }

  public getDrawOrderSnapshot(): Uint32Array {
    if (!this.engine.getDrawOrderSnapshot) return new Uint32Array();
    const vec = this.engine.getDrawOrderSnapshot();
    return this.readU32Vector(vec);
  }

  public reorderEntities(ids: EntityId[], action: ReorderAction, refId = 0): void {
    if (!this.engine.reorderEntities || !this.engine.allocBytes || !this.engine.freeBytes) {
      console.warn('[EngineRuntime] WASM engine does not support reorderEntities');
      return;
    }
    const ptr = this.engine.allocBytes(ids.length * 4);
    try {
      const u32 = new Uint32Array(this.module.HEAPU8.buffer, ptr, ids.length);
      u32.set(ids);
      this.engine.reorderEntities(ptr, ids.length, action, refId);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }


  // ========================================================================
  // Interaction Session wrappers
  // ========================================================================

  public beginTransform(
    ids: EntityId[],
    mode: number,
    specificId: EntityId = 0,
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
