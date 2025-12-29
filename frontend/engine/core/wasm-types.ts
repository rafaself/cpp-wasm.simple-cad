import type { 
    ProtocolInfo, EntityId, LayerRecord, DocumentDigest, 
    EventBufferMeta, OverlayBufferMeta, EntityAabb, HistoryMeta
  } from './protocol';
  
  import type { 
    TextCaretPosition, TextHitResult, TextQuadBufferMeta, 
    TextureBufferMeta, TextContentMeta 
  } from '@/types/text';
  
  import type { PickResult } from '@/types/picking';
  
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
  
  export type TextEntityMeta = {
    id: number;
    boxMode: number;
    constraintWidth: number;
  };
  
  type WasmTextMetaVector = {
    size: () => number;
    get: (index: number) => TextEntityMeta;
    delete: () => void;
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
    getFullSnapshotMeta: () => SnapshotBufferMeta;
    getCapabilities?: () => number;
    getProtocolInfo: () => ProtocolInfo;
    getTextContentMeta?: (textId: number) => TextContentMeta;
    allocateEntityId?: () => EntityId;
    allocateLayerId?: () => number;
    getDocumentDigest?: () => DocumentDigest;
    getHistoryMeta?: () => HistoryMeta;
    canUndo?: () => boolean;
    canRedo?: () => boolean;
    undo?: () => void;
    redo?: () => void;
    pollEvents: (maxEvents: number) => EventBufferMeta;
    ackResync: (resyncGeneration: number) => void;
    hasPendingEvents?: () => boolean;
    getSelectionOutlineMeta?: () => OverlayBufferMeta;
    getSelectionHandleMeta?: () => OverlayBufferMeta;
    getEntityAabb?: (entityId: EntityId) => EntityAabb;
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
  
    // New extended pick
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
      rebuildAllGeometryCount?: number;
      lastLoadMs: number;
      lastRebuildMs: number;
      lastApplyMs?: number;
    };
  
    initializeTextSystem?: () => boolean;
    loadFont?: (fontId: number, fontDataPtr: number, dataSize: number) => boolean;
    hitTestText?: (textId: number, localX: number, localY: number) => TextHitResult;
    getTextCaretPosition?: (textId: number, charIndex: number) => TextCaretPosition;
    rebuildTextQuadBuffer?: () => void;
    getTextQuadBufferMeta?: () => TextQuadBufferMeta;
    getAtlasTextureMeta?: () => TextureBufferMeta;
    isAtlasDirty?: () => boolean;
    isTextQuadsDirty?: () => boolean;
    getAllTextMetas?: () => WasmTextMetaVector;
    
    // Optional methods
    setTextConstraintWidth?: (textId: number, width: number) => boolean;
    setTextPosition?: (textId: number, x: number, y: number, boxMode: number, constraintWidth: number) => boolean;
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
  
    // Snapping
    setSnapOptions?: (enabled: boolean, gridEnabled: boolean, gridSize: number) => void;
    getSnappedPoint?: (x: number, y: number) => Float32Array; 
  };
  
  export type WasmModule = {
    CadEngine: new () => CadEngineInstance;
    HEAPU8: Uint8Array;
    HEAPF32: Float32Array;
  };
