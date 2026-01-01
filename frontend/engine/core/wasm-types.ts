import type {
  ProtocolInfo,
  EntityId,
  LayerRecord,
  DocumentDigest,
  EventBufferMeta,
  OverlayBufferMeta,
  EntityAabb,
  HistoryMeta,
  EngineStats,
} from './protocol';
import type { PickResult } from '@/types/picking';
import type {
  TextCaretPosition,
  TextHitResult,
  TextQuadBufferMeta,
  TextureBufferMeta,
  TextContentMeta,
  TextBoundsResult,
  TextSelectionRect,
  TextStyleSnapshot,
} from '@/types/text';

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
  getSnapOverlayMeta?: () => OverlayBufferMeta;
  getEntityAabb?: (entityId: EntityId) => EntityAabb;
  getSelectionBounds?: () => EntityAabb;
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
  marqueeSelect?: (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    mode: number,
    hitMode: number,
  ) => void;
  getDrawOrderSnapshot?: () => WasmU32Vector;
  reorderEntities?: (idsPtr: number, idCount: number, action: number, refId: number) => void;
  pick: (x: number, y: number, tolerance: number) => EntityId;

  // New extended pick
  pickEx?: (x: number, y: number, tolerance: number, pickMask: number) => PickResult;
  queryArea?: (minX: number, minY: number, maxX: number, maxY: number) => WasmU32Vector;
  queryMarquee?: (
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    mode: number,
  ) => WasmU32Vector;

  getStats: () => EngineStats;

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
  getTextBounds?: (textId: number) => TextBoundsResult;
  getTextSelectionRects?: (
    textId: number,
    start: number,
    end: number,
  ) => { size: () => number; get: (index: number) => TextSelectionRect; delete: () => void };
  getTextStyleSnapshot?: (textId: number) => TextStyleSnapshot | null;
  getVisualPrevCharIndex?: (textId: number, charIndex: number) => number;
  getVisualNextCharIndex?: (textId: number, charIndex: number) => number;
  getWordLeftIndex?: (textId: number, charIndex: number) => number;
  getWordRightIndex?: (textId: number, charIndex: number) => number;
  getLineStartIndex?: (textId: number, charIndex: number) => number;
  getLineEndIndex?: (textId: number, charIndex: number) => number;
  getLineUpIndex?: (textId: number, charIndex: number) => number;
  getLineDownIndex?: (textId: number, charIndex: number) => number;

  // Optional methods
  setTextConstraintWidth?: (textId: number, width: number) => boolean;
  setTextPosition?: (
    textId: number,
    x: number,
    y: number,
    boxMode: number,
    constraintWidth: number,
  ) => boolean;
  clearAtlasDirty?: () => void;

  // Interaction Session
  beginTransform?: (
    idsPtr: number,
    idCount: number,
    mode: number,
    specificId: EntityId,
    vertexIndex: number,
    startX: number,
    startY: number,
  ) => void;
  updateTransform?: (worldX: number, worldY: number) => void;
  commitTransform?: () => void;
  cancelTransform?: () => void;
  isInteractionActive?: () => boolean;
  getCommitResultCount?: () => number;
  getCommitResultIdsPtr?: () => number;
  getCommitResultOpCodesPtr?: () => number;
  getCommitResultPayloadsPtr?: () => number;

  // Snapping
  setSnapOptions?: (
    enabled: boolean,
    gridEnabled: boolean,
    gridSize: number,
    tolerancePx: number,
    endpointEnabled: boolean,
    midpointEnabled: boolean,
    centerEnabled: boolean,
    nearestEnabled: boolean,
  ) => void;
  getSnappedPoint?: (x: number, y: number) => Float32Array;

  // Draft System
  getDraftDimensions?: () => DraftDimensions;
};

/**
 * Draft dimensions returned from the engine during shape creation.
 * Contains bounding box and computed dimensions for overlay rendering.
 */
export type DraftDimensions = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  kind: number;
  active: boolean;
};

export type WasmModule = {
  CadEngine: new () => CadEngineInstance;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
};
