/**
 * Command Types
 *
 * Type definitions for the engine command protocol.
 * Defines all command opcodes, payload types, and the unified EngineCommand union type.
 */

export const COMMAND_BUFFER_MAGIC = 0x43445745; // "EWDC" little-endian bytes

import type { EntityId, StyleTarget } from './protocol';

export const enum CommandOp {
  ClearAll = 1,
  UpsertRect = 2,
  UpsertLine = 3,
  UpsertPolyline = 4,
  DeleteEntity = 5,
  SetDrawOrder = 9,
  SetViewScale = 10,
  UpsertCircle = 11,
  UpsertPolygon = 12,
  UpsertArrow = 13,
  // Text commands (Engine-Native Text Pipeline)
  // Text commands (Engine-Native Text Pipeline)
  UpsertText = 14,
  DeleteText = 15,
  SetTextCaret = 16,
  SetTextSelection = 17,
  InsertTextContent = 18,
  DeleteTextContent = 19,
  ReplaceTextContent = 25,
  BeginDraft = 20,
  UpdateDraft = 21,
  CommitDraft = 22,
  CancelDraft = 23,
  AppendDraftPoint = 24,
  ApplyTextStyle = 42, // 0x2A
  SetTextAlign = 43, // 0x2B
  SetLayerStyle = 50,
  SetLayerStyleEnabled = 51,
  SetEntityStyleOverride = 52,
  ClearEntityStyleOverride = 53,
  SetEntityStyleEnabled = 54,
}

export type RectPayload = {
  x: number;
  y: number;
  w: number;
  h: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  strokeR: number;
  strokeG: number;
  strokeB: number;
  strokeA: number;
  strokeEnabled: number; // 0 or 1
  strokeWidthPx: number;
  elevationZ: number;
};
export type LinePayload = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  g: number;
  b: number;
  a: number;
  enabled: number;
  strokeWidthPx: number;
  elevationZ: number;
};
export type PolylinePayload = {
  points: ReadonlyArray<{ x: number; y: number }>;
  r: number;
  g: number;
  b: number;
  a: number;
  enabled: number;
  strokeWidthPx: number;
  elevationZ: number;
};

export type SetViewScalePayload = {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
};

// ... (omitted)

export type SetDrawOrderPayload = { ids: readonly EntityId[] };

export type CirclePayload = {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  sx: number;
  sy: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  strokeR: number;
  strokeG: number;
  strokeB: number;
  strokeA: number;
  strokeEnabled: number; // 0 or 1
  strokeWidthPx: number;
  elevationZ: number;
};
export type PolygonPayload = CirclePayload & { sides: number };
export type ArrowPayload = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  head: number;
  strokeR: number;
  strokeG: number;
  strokeB: number;
  strokeA: number;
  strokeEnabled: number; // 0 or 1
  strokeWidthPx: number;
  elevationZ: number;
};

export type LayerStylePayload = {
  target: StyleTarget;
  colorRGBA: number;
};

export type LayerStyleEnabledPayload = {
  target: StyleTarget;
  enabled: boolean;
};

export type EntityStylePayload = {
  target: StyleTarget;
  colorRGBA: number;
  ids: readonly EntityId[];
};

export type EntityStyleClearPayload = {
  target: StyleTarget;
  ids: readonly EntityId[];
};

export type EntityStyleEnabledPayload = {
  target: StyleTarget;
  enabled: boolean;
  ids: readonly EntityId[];
};

// Text command payloads
export type TextRunPayload = {
  startIndex: number; // UTF-8 byte offset
  length: number; // UTF-8 byte length
  fontId: number;
  fontSize: number;
  colorRGBA: number; // Packed 0xRRGGBBAA
  flags: number; // TextStyleFlags bitfield
};

export type TextPayload = {
  x: number;
  y: number;
  rotation: number;
  boxMode: number; // 0 = AutoWidth, 1 = FixedWidth
  align: number; // 0 = Left, 1 = Center, 2 = Right
  constraintWidth: number;
  elevationZ: number;
  runs: readonly TextRunPayload[];
  content: string; // UTF-8 text
};

export type TextCaretPayload = {
  textId: EntityId;
  caretIndex: number; // UTF-8 byte position
};

export type TextSelectionPayload = {
  textId: EntityId;
  selectionStart: number;
  selectionEnd: number;
};

export type TextInsertPayload = {
  textId: EntityId;
  insertIndex: number; // UTF-8 byte position
  content: string; // UTF-8 text to insert
};

export type TextDeletePayload = {
  textId: EntityId;
  startIndex: number; // UTF-8 byte start (inclusive)
  endIndex: number; // UTF-8 byte end (exclusive)
};

export type TextReplacePayload = {
  textId: EntityId;
  startIndex: number; // UTF-8 byte start (inclusive)
  endIndex: number; // UTF-8 byte end (exclusive)
  content: string; // UTF-8 text to insert
};

export type TextAlignmentPayload = {
  textId: EntityId;
  align: number; // TextAlign enum
};

export type BeginDraftPayload = {
  kind: number;
  x: number;
  y: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  strokeR: number;
  strokeG: number;
  strokeB: number;
  strokeA: number;
  strokeEnabled: number;
  strokeWidthPx: number;
  sides: number;
  head: number;
  flags: number;
};
export type UpdateDraftPayload = { x: number; y: number; modifiers: number };

// Text style apply payload (logical indices are UTF-16 code units; engine maps to UTF-8 internally)
export type ApplyTextStylePayload = {
  textId: EntityId;
  rangeStartLogical: number;
  rangeEndLogical: number;
  flagsMask: number; // bits: bold/italic/underline/strike
  flagsValue: number; // applied where mask=1; ignored if mode=toggle
  mode: 0 | 1 | 2; // 0=set, 1=clear, 2=toggle
  styleParamsVersion: number; // 0 = none
  styleParams: Uint8Array; // TLV block; may be empty when version=0
};

export type EngineCommand =
  | { op: CommandOp.ClearAll }
  | { op: CommandOp.DeleteEntity; id: EntityId }
  | { op: CommandOp.UpsertRect; id: EntityId; rect: RectPayload }
  | { op: CommandOp.UpsertLine; id: EntityId; line: LinePayload }
  | { op: CommandOp.UpsertPolyline; id: EntityId; polyline: PolylinePayload }
  | { op: CommandOp.SetViewScale; view: SetViewScalePayload }
  | { op: CommandOp.SetDrawOrder; order: SetDrawOrderPayload }
  | { op: CommandOp.UpsertCircle; id: EntityId; circle: CirclePayload }
  | { op: CommandOp.UpsertPolygon; id: EntityId; polygon: PolygonPayload }
  | { op: CommandOp.UpsertArrow; id: EntityId; arrow: ArrowPayload }
  // Text commands
  | { op: CommandOp.UpsertText; id: EntityId; text: TextPayload }
  | { op: CommandOp.DeleteText; id: EntityId }
  | { op: CommandOp.SetTextCaret; caret: TextCaretPayload }
  | { op: CommandOp.SetTextSelection; selection: TextSelectionPayload }
  | { op: CommandOp.InsertTextContent; insert: TextInsertPayload }
  | { op: CommandOp.DeleteTextContent; del: TextDeletePayload }
  | { op: CommandOp.ReplaceTextContent; replace: TextReplacePayload }
  | { op: CommandOp.ApplyTextStyle; id: EntityId; style: ApplyTextStylePayload }
  | { op: CommandOp.SetTextAlign; align: TextAlignmentPayload }
  | { op: CommandOp.SetLayerStyle; id: EntityId; style: LayerStylePayload }
  | { op: CommandOp.SetLayerStyleEnabled; id: EntityId; style: LayerStyleEnabledPayload }
  | { op: CommandOp.SetEntityStyleOverride; style: EntityStylePayload }
  | { op: CommandOp.ClearEntityStyleOverride; clear: EntityStyleClearPayload }
  | { op: CommandOp.SetEntityStyleEnabled; enabled: EntityStyleEnabledPayload }
  | { op: CommandOp.BeginDraft; draft: BeginDraftPayload }
  | { op: CommandOp.UpdateDraft; pos: UpdateDraftPayload }
  | { op: CommandOp.AppendDraftPoint; pos: UpdateDraftPayload }
  | { op: CommandOp.CommitDraft }
  | { op: CommandOp.CancelDraft };
