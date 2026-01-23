export type EntityId = number;

export enum EngineFeatureFlags {
  FEATURE_PROTOCOL = 1 << 0,
  FEATURE_LAYERS_FLAGS = 1 << 1,
  FEATURE_SELECTION_ORDER = 1 << 2,
  FEATURE_SNAPSHOT_VNEXT = 1 << 3,
  FEATURE_EVENT_STREAM = 1 << 4,
  FEATURE_OVERLAY_QUERIES = 1 << 5,
  FEATURE_INTERACTIVE_TRANSFORM = 1 << 6,
  FEATURE_ENGINE_HISTORY = 1 << 7,
  FEATURE_ENGINE_DOCUMENT_SOT = 1 << 8,
}

export enum EngineLayerFlags {
  Visible = 1 << 0,
  Locked = 1 << 1,
}

export enum EngineEntityFlags {
  Visible = 1 << 0,
  Locked = 1 << 1,
}

export enum LayerPropMask {
  Name = 1 << 0,
  Visible = 1 << 1,
  Locked = 1 << 2,
}

export enum StyleTarget {
  Stroke = 0,
  Fill = 1,
  TextColor = 2,
  TextBackground = 3,
}

export enum StyleState {
  None = 0,
  Layer = 1,
  Override = 2,
  Mixed = 3,
}

export enum TriState {
  Off = 0,
  On = 1,
  Mixed = 2,
}

export enum SelectionMode {
  Replace = 0,
  Add = 1,
  Remove = 2,
  Toggle = 3,
}

export enum SelectionModifier {
  Shift = 1 << 0,
  Ctrl = 1 << 1,
  Alt = 1 << 2,
  Meta = 1 << 3,
}

export enum MarqueeMode {
  Window = 0,
  Crossing = 1,
}

export enum ReorderAction {
  BringToFront = 1,
  SendToBack = 2,
  BringForward = 3,
  SendBackward = 4,
}

export enum EventType {
  Overflow = 1,
  DocChanged = 2,
  EntityChanged = 3,
  EntityCreated = 4,
  EntityDeleted = 5,
  LayerChanged = 6,
  SelectionChanged = 7,
  OrderChanged = 8,
  HistoryChanged = 9,
}

export enum ChangeMask {
  Geometry = 1 << 0,
  Style = 1 << 1,
  Flags = 1 << 2,
  Layer = 1 << 3,
  Order = 1 << 4,
  Text = 1 << 5,
  Bounds = 1 << 6,
  RenderData = 1 << 7,
}

export type LayerRecord = {
  id: number;
  order: number;
  flags: number;
};

export type StyleTargetSummary = {
  state: number;
  enabledState: number;
  supportedState: number;
  reserved: number;
  colorRGBA: number;
  layerId: number;
};

export type SelectionStyleSummary = {
  selectionCount: number;
  stroke: StyleTargetSummary;
  fill: StyleTargetSummary;
  textColor: StyleTargetSummary;
  textBackground: StyleTargetSummary;
};

export type LayerStyleSnapshot = {
  strokeRGBA: number;
  fillRGBA: number;
  textColorRGBA: number;
  textBackgroundRGBA: number;
  strokeEnabled: number;
  fillEnabled: number;
  textBackgroundEnabled: number;
  reserved: number;
};

export type ProtocolInfo = {
  protocolVersion: number;
  commandVersion: number;
  snapshotVersion: number;
  eventStreamVersion: number;
  abiHash: number;
  featureFlags: number;
};

export type DocumentDigest = {
  lo: number;
  hi: number;
};

export type EngineStats = {
  generation: number;
  rectCount: number;
  lineCount: number;
  polylineCount: number;
  pointCount: number;
  triangleVertexCount: number;
  lineVertexCount: number;
  rebuildAllGeometryCount: number;
  lastLoadMs: number;
  lastRebuildMs: number;
  lastApplyMs: number;
  lastTransformUpdateMs: number;
  lastSnapCandidateCount: number;
  lastSnapHitCount: number;
};

export type HistoryMeta = {
  depth: number;
  cursor: number;
  generation: number;
};

export enum TransformLogEvent {
  Begin = 1,
  Update = 2,
  Commit = 3,
  Cancel = 4,
}

export type TransformLogEntry = {
  type: TransformLogEvent;
  mode: number;
  idOffset: number;
  idCount: number;
  specificId: number;
  vertexIndex: number;
  x: number;
  y: number;
  modifiers: number;
  viewX: number;
  viewY: number;
  viewScale: number;
  viewWidth: number;
  viewHeight: number;
  snapEnabled: number;
  snapGridEnabled: number;
  snapGridSize: number;
  snapTolerancePx: number;
  snapEndpointEnabled: number;
  snapMidpointEnabled: number;
  snapCenterEnabled: number;
  snapNearestEnabled: number;
};

export type EngineEvent = {
  type: number;
  flags: number;
  a: number;
  b: number;
  c: number;
  d: number;
};

export type EventBufferMeta = {
  generation: number;
  count: number;
  ptr: number;
};

export enum OverlayKind {
  Polyline = 1,
  Polygon = 2,
  Segment = 3,
  Rect = 4,
  Point = 5,
}

export type OverlayPrimitive = {
  kind: number;
  flags: number;
  count: number;
  offset: number;
};

export type OverlayBufferMeta = {
  generation: number;
  primitiveCount: number;
  floatCount: number;
  primitivesPtr: number;
  dataPtr: number;
};

/**
 * Oriented handle metadata with pre-rotated positions.
 *
 * Handle index order:
 *   0 = Bottom-Left (BL)
 *   1 = Bottom-Right (BR)
 *   2 = Top-Right (TR)
 *   3 = Top-Left (TL)
 */
export type OrientedHandleMeta = {
  generation: number;
  entityId: number;

  // Corner handles in world coordinates (already rotated)
  blX: number;
  blY: number; // Bottom-Left
  brX: number;
  brY: number; // Bottom-Right
  trX: number;
  trY: number; // Top-Right
  tlX: number;
  tlY: number; // Top-Left

  // Rotate handle position in world coordinates
  rotateHandleX: number;
  rotateHandleY: number;

  // Entity center (for cursor calculations)
  centerX: number;
  centerY: number;

  // Entity rotation in radians
  rotationRad: number;

  // Flags
  hasRotateHandle: number; // 1 if rotate handle should be shown
  hasResizeHandles: number; // 1 if corner resize handles should be shown
  valid: number; // 1 if data is valid
};

export type EntityAabb = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  valid: number;
};

export type EntityTransform = {
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotationDeg: number;
  hasRotation: number;
  valid: number;
};

/**
 * Grip metadata for polygon vertex/edge editing.
 * Returns positions of interactive grip points in WCS.
 *
 * Phase 1: Vertex grips only (edgeCount = 0)
 * Phase 2: Adds edge midpoint grips (edgeCount = vertexCount for closed shapes)
 */
export type GripMeta = {
  generation: number;
  vertexCount: number;
  edgeCount: number; // 0 if edges not requested
  floatCount: number; // vertexCount*2 + edgeCount*2
  verticesPtr: number; // Pointer to [x0,y0, x1,y1, ...] in WCS
  edgeMidpointsPtr: number; // Pointer to edge midpoints (if edgeCount > 0)
  valid: number; // 1 if data is valid
};

// Layout constants for OverlayPrimitive to ensure decoder matches ABI hash
export const OVERLAY_PRIMITIVE_LAYOUT = {
  size: 12,
  offsets: {
    kind: 0,
    flags: 2,
    count: 4,
    offset: 8,
  },
} as const;

export const PROTOCOL_VERSION = 4 as const;
export const COMMAND_VERSION = 4 as const;
export const SNAPSHOT_VERSION = 4 as const; // v4: Added elevationZ to persisted entity records
export const EVENT_STREAM_VERSION = 1 as const;

export const REQUIRED_FEATURE_FLAGS =
  EngineFeatureFlags.FEATURE_PROTOCOL | EngineFeatureFlags.FEATURE_ENGINE_DOCUMENT_SOT;

const formatHex = (value: number): string => `0x${(value >>> 0).toString(16)}`;

const ABI_HASH_OFFSET = 2166136261;
const ABI_HASH_PRIME = 16777619;

const hashU32 = (h: number, v: number): number => Math.imul(h ^ (v >>> 0), ABI_HASH_PRIME) >>> 0;

const hashArray = (h: number, values: readonly number[]): number => {
  let out = h;
  for (const value of values) {
    out = hashU32(out, value);
  }
  return out;
};

const hashEnum = (h: number, tag: number, values: readonly number[]): number => {
  let out = hashU32(h, tag);
  out = hashU32(out, values.length);
  return hashArray(out, values);
};

const hashStruct = (h: number, tag: number, size: number, offsets: readonly number[]): number => {
  let out = hashU32(h, tag);
  out = hashU32(out, size);
  out = hashU32(out, offsets.length);
  return hashArray(out, offsets);
};

const computeAbiHash = (): number => {
  let h = ABI_HASH_OFFSET;

  h = hashEnum(
    h,
    0xe0000001,
    [1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 25, 42, 43, 50, 51, 52, 53, 54],
  );

  h = hashEnum(h, 0xe0000002, [0, 1, 2, 3, 4, 5, 6, 7]);

  h = hashEnum(h, 0xe0000003, [0, 1, 2, 3, 4, 5, 6, 7]);

  h = hashEnum(h, 0xe0000004, [0, 1, 2, 3]);

  h = hashEnum(h, 0xe0000005, [1, 2, 3]);

  h = hashEnum(h, 0xe0000006, [1, 2, 4]);

  h = hashEnum(h, 0xe0000007, [0, 1, 2, 4, 8]);

  h = hashEnum(h, 0xe0000008, [0, 1, 2]);

  h = hashEnum(h, 0xe0000009, [0, 1]);

  h = hashEnum(h, 0xe000000a, [
    EngineFeatureFlags.FEATURE_PROTOCOL,
    EngineFeatureFlags.FEATURE_LAYERS_FLAGS,
    EngineFeatureFlags.FEATURE_SELECTION_ORDER,
    EngineFeatureFlags.FEATURE_SNAPSHOT_VNEXT,
    EngineFeatureFlags.FEATURE_EVENT_STREAM,
    EngineFeatureFlags.FEATURE_OVERLAY_QUERIES,
    EngineFeatureFlags.FEATURE_INTERACTIVE_TRANSFORM,
    EngineFeatureFlags.FEATURE_ENGINE_HISTORY,
    EngineFeatureFlags.FEATURE_ENGINE_DOCUMENT_SOT,
  ]);

  h = hashEnum(h, 0xe000000b, [EngineLayerFlags.Visible, EngineLayerFlags.Locked]);

  h = hashEnum(h, 0xe000000c, [EngineEntityFlags.Visible, EngineEntityFlags.Locked]);

  h = hashEnum(h, 0xe000000d, [LayerPropMask.Name, LayerPropMask.Visible, LayerPropMask.Locked]);

  h = hashEnum(h, 0xe0000010, [
    StyleTarget.Stroke,
    StyleTarget.Fill,
    StyleTarget.TextColor,
    StyleTarget.TextBackground,
  ]);

  h = hashEnum(h, 0xe0000011, [
    StyleState.None,
    StyleState.Layer,
    StyleState.Override,
    StyleState.Mixed,
  ]);

  h = hashEnum(h, 0xe0000012, [TriState.Off, TriState.On, TriState.Mixed]);

  h = hashEnum(h, 0xe000000e, [
    SelectionMode.Replace,
    SelectionMode.Add,
    SelectionMode.Remove,
    SelectionMode.Toggle,
  ]);

  h = hashEnum(h, 0xe000000f, [
    SelectionModifier.Shift,
    SelectionModifier.Ctrl,
    SelectionModifier.Alt,
    SelectionModifier.Meta,
  ]);

  h = hashEnum(h, 0xe0000010, [MarqueeMode.Window, MarqueeMode.Crossing]);

  h = hashEnum(h, 0xe0000011, [
    ReorderAction.BringToFront,
    ReorderAction.SendToBack,
    ReorderAction.BringForward,
    ReorderAction.SendBackward,
  ]);

  h = hashEnum(h, 0xe0000012, [
    EventType.Overflow,
    EventType.DocChanged,
    EventType.EntityChanged,
    EventType.EntityCreated,
    EventType.EntityDeleted,
    EventType.LayerChanged,
    EventType.SelectionChanged,
    EventType.OrderChanged,
    EventType.HistoryChanged,
  ]);

  h = hashEnum(h, 0xe0000013, [
    ChangeMask.Geometry,
    ChangeMask.Style,
    ChangeMask.Flags,
    ChangeMask.Layer,
    ChangeMask.Order,
    ChangeMask.Text,
    ChangeMask.Bounds,
    ChangeMask.RenderData,
  ]);

  h = hashEnum(h, 0xe0000014, [
    OverlayKind.Polyline,
    OverlayKind.Polygon,
    OverlayKind.Segment,
    OverlayKind.Rect,
    OverlayKind.Point,
  ]);

  h = hashEnum(h, 0xe0000015, [
    TransformLogEvent.Begin,
    TransformLogEvent.Update,
    TransformLogEvent.Commit,
    TransformLogEvent.Cancel,
  ]);

  h = hashStruct(h, 0x53000001, 24, [0, 4, 8, 12, 16, 20]);

  h = hashStruct(h, 0x53000002, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000003, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000004, 56, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52]);

  h = hashStruct(h, 0x53000005, 24, [0, 4, 6, 8, 12, 16, 20]);

  h = hashStruct(h, 0x53000006, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000007, 16, [0, 4, 8, 12]);

  h = hashStruct(h, 0x53000008, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000009, 12, [0, 4, 8]);

  h = hashStruct(
    h,
    0x5300000a,
    56,
    [0, 4, 8, 12, 16, 20, 24, 26, 30, 34, 38, 39, 40, 41, 42, 46, 50, 54],
  );

  h = hashStruct(h, 0x5300000b, 18, [0, 4, 8, 12, 13, 14, 15, 16]);

  h = hashStruct(h, 0x5300000c, 60, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56]);

  h = hashStruct(h, 0x5300000d, 44, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);

  h = hashStruct(h, 0x5300000e, 36, [0, 4, 8, 12, 16, 20, 24, 28, 32]);

  h = hashStruct(h, 0x5300000f, 8, [0, 4]);

  h = hashStruct(h, 0x53000010, 20, [8]);

  h = hashStruct(
    h,
    0x53000011,
    72,
    [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68],
  );

  h = hashStruct(h, 0x53000012, 76, [68, 72]);

  h = hashStruct(h, 0x53000013, 48, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]);

  h = hashStruct(h, 0x53000014, 28, [0, 4, 8, 12, 13, 16, 20, 24]);

  h = hashStruct(h, 0x53000015, 24, [0, 4, 8, 12, 16, 20]);

  h = hashStruct(h, 0x53000016, 8, [0, 4]);

  h = hashStruct(h, 0x53000017, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000018, 16, [0, 4, 8, 12]);

  h = hashStruct(h, 0x53000019, 16, [0, 4, 8, 12]);

  h = hashStruct(h, 0x5300001e, 16, [0, 4, 8, 12]);

  h = hashStruct(h, 0x5300001a, 8, [0, 4]);

  h = hashStruct(h, 0x5300001b, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x5300001c, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x5300001d, 12, [0, 4, 8]);

  h = hashStruct(h, 0x5300001e, 12, [0, 1, 2, 3, 4, 8]);

  h = hashStruct(h, 0x5300001f, 52, [0, 4, 16, 28, 40]);

  h = hashStruct(h, 0x53000020, 20, [0, 4, 8, 12, 16, 17, 18, 19]);

  h = hashStruct(h, 0x5300001e, 8, [0, 4]);

  h = hashStruct(h, 0x5300001f, 20, [0, 2, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000020, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000021, OVERLAY_PRIMITIVE_LAYOUT.size, [
    OVERLAY_PRIMITIVE_LAYOUT.offsets.kind,
    OVERLAY_PRIMITIVE_LAYOUT.offsets.flags,
    OVERLAY_PRIMITIVE_LAYOUT.offsets.count,
    OVERLAY_PRIMITIVE_LAYOUT.offsets.offset,
  ]);

  h = hashStruct(h, 0x53000022, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000023, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000026, 28, [0, 4, 8, 12, 16, 20, 24]);

  h = hashStruct(h, 0x53000024, 12, [0, 4, 8]);

  h = hashStruct(
    h,
    0x53000025,
    88,
    [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 84],
  );

  return h >>> 0;
};

const COMPUTED_ABI_HASH = computeAbiHash();
export const EXPECTED_ABI_HASH = COMPUTED_ABI_HASH;

export const EXPECTED_PROTOCOL_INFO: ProtocolInfo = {
  protocolVersion: PROTOCOL_VERSION,
  commandVersion: COMMAND_VERSION,
  snapshotVersion: SNAPSHOT_VERSION,
  eventStreamVersion: EVENT_STREAM_VERSION,
  abiHash: EXPECTED_ABI_HASH,
  featureFlags: REQUIRED_FEATURE_FLAGS,
};

export const validateProtocolOrThrow = (info: ProtocolInfo): void => {
  const errors: string[] = [];

  if (info.protocolVersion !== PROTOCOL_VERSION) {
    errors.push(`protocolVersion required=${PROTOCOL_VERSION} provided=${info.protocolVersion}`);
  }
  if (info.commandVersion !== COMMAND_VERSION) {
    errors.push(`commandVersion required=${COMMAND_VERSION} provided=${info.commandVersion}`);
  }
  if (info.snapshotVersion !== SNAPSHOT_VERSION) {
    errors.push(`snapshotVersion required=${SNAPSHOT_VERSION} provided=${info.snapshotVersion}`);
  }
  if (info.eventStreamVersion !== EVENT_STREAM_VERSION) {
    errors.push(
      `eventStreamVersion required=${EVENT_STREAM_VERSION} provided=${info.eventStreamVersion}`,
    );
  }
  if (info.abiHash !== EXPECTED_ABI_HASH) {
    errors.push(
      `abiHash required=${formatHex(EXPECTED_ABI_HASH)} provided=${formatHex(info.abiHash)}`,
    );
  }
  if ((info.featureFlags & REQUIRED_FEATURE_FLAGS) !== REQUIRED_FEATURE_FLAGS) {
    errors.push(
      `featureFlags required=${formatHex(REQUIRED_FEATURE_FLAGS)} provided=${formatHex(info.featureFlags)}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(`[EngineProtocol] Incompatible WASM. ${errors.join(' | ')}`);
  }
};
