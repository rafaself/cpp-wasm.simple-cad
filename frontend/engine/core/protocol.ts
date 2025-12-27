export type EntityId = number;

export enum EngineFeatureFlags {
  FEATURE_PROTOCOL = 1 << 0,
  FEATURE_LAYERS_FLAGS = 1 << 1,
  FEATURE_SELECTION_ORDER = 1 << 2,
  FEATURE_SNAPSHOT_VNEXT = 1 << 3,
  FEATURE_EVENT_STREAM = 1 << 4,
  FEATURE_OVERLAY_QUERIES = 1 << 5,
  FEATURE_INTERACTIVE_TRANSFORM = 1 << 6,
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

export type EntityAabb = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  valid: number;
};

export const PROTOCOL_VERSION = 1 as const;
export const COMMAND_VERSION = 2 as const;
export const SNAPSHOT_VERSION = 1 as const;
export const EVENT_STREAM_VERSION = 1 as const;

export const REQUIRED_FEATURE_FLAGS =
  EngineFeatureFlags.FEATURE_PROTOCOL |
  EngineFeatureFlags.FEATURE_OVERLAY_QUERIES |
  EngineFeatureFlags.FEATURE_INTERACTIVE_TRANSFORM;

const ABI_HASH_OFFSET = 2166136261;
const ABI_HASH_PRIME = 16777619;

const hashU32 = (h: number, v: number): number =>
  Math.imul(h ^ (v >>> 0), ABI_HASH_PRIME) >>> 0;

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

  h = hashEnum(h, 0xE0000001, [
    1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 42, 43,
  ]);

  h = hashEnum(h, 0xE0000002, [0, 1, 2, 3, 4, 5, 6, 7]);

  h = hashEnum(h, 0xE0000003, [0, 1, 2, 3, 4, 5, 6, 7]);

  h = hashEnum(h, 0xE0000004, [0, 1, 2, 3]);

  h = hashEnum(h, 0xE0000005, [1, 2, 3]);

  h = hashEnum(h, 0xE0000006, [1, 2, 4]);

  h = hashEnum(h, 0xE0000007, [0, 1, 2, 4, 8]);

  h = hashEnum(h, 0xE0000008, [0, 1, 2]);

  h = hashEnum(h, 0xE0000009, [0, 1]);

  h = hashEnum(h, 0xE000000A, [
    EngineFeatureFlags.FEATURE_PROTOCOL,
    EngineFeatureFlags.FEATURE_LAYERS_FLAGS,
    EngineFeatureFlags.FEATURE_SELECTION_ORDER,
    EngineFeatureFlags.FEATURE_SNAPSHOT_VNEXT,
    EngineFeatureFlags.FEATURE_EVENT_STREAM,
    EngineFeatureFlags.FEATURE_OVERLAY_QUERIES,
    EngineFeatureFlags.FEATURE_INTERACTIVE_TRANSFORM,
  ]);

  h = hashEnum(h, 0xE000000B, [EngineLayerFlags.Visible, EngineLayerFlags.Locked]);

  h = hashEnum(h, 0xE000000C, [EngineEntityFlags.Visible, EngineEntityFlags.Locked]);

  h = hashEnum(h, 0xE000000D, [LayerPropMask.Name, LayerPropMask.Visible, LayerPropMask.Locked]);

  h = hashEnum(h, 0xE000000E, [
    SelectionMode.Replace,
    SelectionMode.Add,
    SelectionMode.Remove,
    SelectionMode.Toggle,
  ]);

  h = hashEnum(h, 0xE000000F, [
    SelectionModifier.Shift,
    SelectionModifier.Ctrl,
    SelectionModifier.Alt,
    SelectionModifier.Meta,
  ]);

  h = hashEnum(h, 0xE0000010, [MarqueeMode.Window, MarqueeMode.Crossing]);

  h = hashEnum(h, 0xE0000011, [
    ReorderAction.BringToFront,
    ReorderAction.SendToBack,
    ReorderAction.BringForward,
    ReorderAction.SendBackward,
  ]);

  h = hashEnum(h, 0xE0000012, [
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

  h = hashEnum(h, 0xE0000013, [
    ChangeMask.Geometry,
    ChangeMask.Style,
    ChangeMask.Flags,
    ChangeMask.Layer,
    ChangeMask.Order,
    ChangeMask.Text,
    ChangeMask.Bounds,
    ChangeMask.RenderData,
  ]);

  h = hashEnum(h, 0xE0000014, [
    OverlayKind.Polyline,
    OverlayKind.Polygon,
    OverlayKind.Segment,
    OverlayKind.Rect,
    OverlayKind.Point,
  ]);

  h = hashStruct(h, 0x53000001, 24, [0, 4, 8, 12, 16, 20]);

  h = hashStruct(h, 0x53000002, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000003, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000004, 44, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);

  h = hashStruct(h, 0x53000005, 24, [0, 4, 6, 8, 12, 16, 20]);

  h = hashStruct(h, 0x53000006, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000007, 16, [0, 4, 8, 12]);

  h = hashStruct(h, 0x53000008, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000009, 12, [0, 4, 8]);

  h = hashStruct(h, 0x5300000A, 46, [
    0, 4, 8, 12, 16, 20, 24, 26, 30, 34, 38, 39, 40, 44,
  ]);

  h = hashStruct(h, 0x5300000B, 18, [0, 4, 8, 12, 13, 14, 15, 16]);

  h = hashStruct(h, 0x5300000C, 56, [
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52,
  ]);

  h = hashStruct(h, 0x5300000D, 40, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);

  h = hashStruct(h, 0x5300000E, 32, [0, 4, 8, 12, 16, 20, 24, 28]);

  h = hashStruct(h, 0x5300000F, 8, [0, 4]);

  h = hashStruct(h, 0x53000010, 4, [0]);

  h = hashStruct(h, 0x53000011, 68, [
    0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64,
  ]);

  h = hashStruct(h, 0x53000012, 72, [68]);

  h = hashStruct(h, 0x53000013, 44, [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);

  h = hashStruct(h, 0x53000014, 28, [0, 4, 8, 12, 13, 16, 20, 24]);

  h = hashStruct(h, 0x53000015, 24, [0, 4, 8, 12, 16, 20]);

  h = hashStruct(h, 0x53000016, 8, [0, 4]);

  h = hashStruct(h, 0x53000017, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000018, 16, [0, 4, 8, 12]);

  h = hashStruct(h, 0x53000019, 16, [0, 4, 8, 12]);

  h = hashStruct(h, 0x5300001A, 8, [0, 4]);

  h = hashStruct(h, 0x5300001B, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x5300001C, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x5300001D, 12, [0, 4, 8]);

  h = hashStruct(h, 0x5300001E, 8, [0, 4]);

  h = hashStruct(h, 0x5300001F, 20, [0, 2, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000020, 12, [0, 4, 8]);

  h = hashStruct(h, 0x53000021, 12, [0, 2, 4, 8]);

  h = hashStruct(h, 0x53000022, 20, [0, 4, 8, 12, 16]);

  h = hashStruct(h, 0x53000023, 20, [0, 4, 8, 12, 16]);

  return h >>> 0;
};

export const EXPECTED_ABI_HASH = computeAbiHash();

export const EXPECTED_PROTOCOL_INFO: ProtocolInfo = {
  protocolVersion: PROTOCOL_VERSION,
  commandVersion: COMMAND_VERSION,
  snapshotVersion: SNAPSHOT_VERSION,
  eventStreamVersion: EVENT_STREAM_VERSION,
  abiHash: EXPECTED_ABI_HASH,
  featureFlags: REQUIRED_FEATURE_FLAGS,
};

const formatHex = (value: number): string => `0x${(value >>> 0).toString(16)}`;

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
    errors.push(`eventStreamVersion required=${EVENT_STREAM_VERSION} provided=${info.eventStreamVersion}`);
  }
  if (info.abiHash !== EXPECTED_ABI_HASH) {
    errors.push(`abiHash required=${formatHex(EXPECTED_ABI_HASH)} provided=${formatHex(info.abiHash)}`);
  }
  if ((info.featureFlags & REQUIRED_FEATURE_FLAGS) !== REQUIRED_FEATURE_FLAGS) {
    errors.push(`featureFlags required=${formatHex(REQUIRED_FEATURE_FLAGS)} provided=${formatHex(info.featureFlags)}`);
  }

  if (errors.length > 0) {
    throw new Error(`[EngineProtocol] Incompatible WASM. ${errors.join(' | ')}`);
  }
};
