export const COMMAND_BUFFER_MAGIC = 0x43445745; // "EWDC" little-endian bytes

export const enum CommandOp {
  ClearAll = 1,
  UpsertRect = 2,
  UpsertLine = 3,
  UpsertPolyline = 4,
  DeleteEntity = 5,
  UpsertSymbol = 6,
  UpsertNode = 7,
  UpsertConduit = 8,
  SetDrawOrder = 9,
  SetViewScale = 10,
  UpsertCircle = 11,
  UpsertPolygon = 12,
  UpsertArrow = 13,
  // Text commands (Engine-Native Text Pipeline)
  UpsertText = 14,
  DeleteText = 15,
  SetTextCaret = 16,
  SetTextSelection = 17,
  InsertTextContent = 18,
  DeleteTextContent = 19,
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
};
export type LinePayload = { x0: number; y0: number; x1: number; y1: number; r: number; g: number; b: number; a: number; enabled: number; strokeWidthPx: number };
export type PolylinePayload = { points: ReadonlyArray<{ x: number; y: number }>; r: number; g: number; b: number; a: number; enabled: number; strokeWidthPx: number };
export type SymbolPayload = {
  symbolKey: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  connX: number;
  connY: number;
};

export type NodePayload = { kind: 0 | 1; anchorSymbolId: number; x: number; y: number };
export type ConduitPayload = { fromNodeId: number; toNodeId: number; r: number; g: number; b: number; a: number; enabled: number; strokeWidthPx: number };
export type SetViewScalePayload = { scale: number };
export type SetDrawOrderPayload = { ids: readonly number[] };
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
  runs: readonly TextRunPayload[];
  content: string; // UTF-8 text
};

export type TextCaretPayload = {
  textId: number;
  caretIndex: number; // UTF-8 byte position
};

export type TextSelectionPayload = {
  textId: number;
  selectionStart: number;
  selectionEnd: number;
};

export type TextInsertPayload = {
  textId: number;
  insertIndex: number; // UTF-8 byte position
  content: string; // UTF-8 text to insert
};

export type TextDeletePayload = {
  textId: number;
  startIndex: number; // UTF-8 byte start (inclusive)
  endIndex: number; // UTF-8 byte end (exclusive)
};

export type EngineCommand =
  | { op: CommandOp.ClearAll }
  | { op: CommandOp.DeleteEntity; id: number }
  | { op: CommandOp.UpsertRect; id: number; rect: RectPayload }
  | { op: CommandOp.UpsertLine; id: number; line: LinePayload }
  | { op: CommandOp.UpsertPolyline; id: number; polyline: PolylinePayload }
  | { op: CommandOp.UpsertSymbol; id: number; symbol: SymbolPayload }
  | { op: CommandOp.UpsertNode; id: number; node: NodePayload }
  | { op: CommandOp.UpsertConduit; id: number; conduit: ConduitPayload }
  | { op: CommandOp.SetViewScale; view: SetViewScalePayload }
  | { op: CommandOp.SetDrawOrder; order: SetDrawOrderPayload }
  | { op: CommandOp.UpsertCircle; id: number; circle: CirclePayload }
  | { op: CommandOp.UpsertPolygon; id: number; polygon: PolygonPayload }
  | { op: CommandOp.UpsertArrow; id: number; arrow: ArrowPayload }
  // Text commands
  | { op: CommandOp.UpsertText; id: number; text: TextPayload }
  | { op: CommandOp.DeleteText; id: number }
  | { op: CommandOp.SetTextCaret; caret: TextCaretPayload }
  | { op: CommandOp.SetTextSelection; selection: TextSelectionPayload }
  | { op: CommandOp.InsertTextContent; insert: TextInsertPayload }
  | { op: CommandOp.DeleteTextContent; del: TextDeletePayload };

// UTF-8 encoder for text content
const textEncoder = new TextEncoder();

const writeU32 = (view: DataView, offset: number, value: number): number => {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
};

const writeF32 = (view: DataView, offset: number, value: number): number => {
  view.setFloat32(offset, value, true);
  return offset + 4;
};

const payloadByteLength = (cmd: EngineCommand): number => {
  switch (cmd.op) {
    case CommandOp.ClearAll:
    case CommandOp.DeleteEntity:
    case CommandOp.DeleteText:
      return 0;
    case CommandOp.SetViewScale:
      return 4; // 1 float
    case CommandOp.SetDrawOrder:
      return 8 + cmd.order.ids.length * 4; // u32 count + u32 reserved + u32 ids[]
    case CommandOp.UpsertRect:
      return 56; // 14 floats * 4 bytes/float
    case CommandOp.UpsertLine:
      return 40; // 10 floats * 4 bytes/float (includes strokeWidthPx)
    case CommandOp.UpsertPolyline:
      return 32 + cmd.polyline.points.length * 8; // header (6 floats + u32 count + u32 reserved) + points
    case CommandOp.UpsertSymbol:
      return 40;
    case CommandOp.UpsertNode:
      return 16;
    case CommandOp.UpsertConduit:
      return 32; // 2 u32 + 6 floats (includes strokeWidthPx)
    case CommandOp.UpsertCircle:
      return 68; // 17 floats
    case CommandOp.UpsertPolygon:
      return 72; // 17 floats + u32 sides
    case CommandOp.UpsertArrow:
      return 44; // 11 floats
    // Text commands
    case CommandOp.UpsertText: {
      // TextPayloadHeader (28 bytes) + TextRunPayload * runCount (24 bytes each) + UTF-8 content
      const contentBytes = textEncoder.encode(cmd.text.content).length;
      return 28 + cmd.text.runs.length * 24 + contentBytes;
    }
    case CommandOp.SetTextCaret:
      return 8; // textId (u32) + caretIndex (u32)
    case CommandOp.SetTextSelection:
      return 12; // textId (u32) + selectionStart (u32) + selectionEnd (u32)
    case CommandOp.InsertTextContent: {
      // TextInsertPayloadHeader (16 bytes) + UTF-8 content
      const insertBytes = textEncoder.encode(cmd.insert.content).length;
      return 16 + insertBytes;
    }
    case CommandOp.DeleteTextContent:
      return 16; // textId (u32) + startIndex (u32) + endIndex (u32) + reserved (u32)
  }
};

export const encodeCommandBuffer = (commands: readonly EngineCommand[]): Uint8Array => {
  // Header: magic (u32) + version (u32) + commandCount (u32) + reserved (u32)
  const headerBytes = 16;
  // Per command: op (u32) + id (u32) + payloadByteCount (u32) + reserved (u32) + payload...
  const commandHeadersBytes = commands.length * 16;
  const payloadBytes = commands.reduce((sum, c) => sum + payloadByteLength(c), 0);

  const totalBytes = headerBytes + commandHeadersBytes + payloadBytes;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  let o = 0;

  o = writeU32(view, o, COMMAND_BUFFER_MAGIC);
  o = writeU32(view, o, 2); // version
  o = writeU32(view, o, commands.length);
  o = writeU32(view, o, 0);

  for (const cmd of commands) {
    o = writeU32(view, o, cmd.op);
    o = writeU32(view, o, 'id' in cmd ? cmd.id : 0);
    const bytes = payloadByteLength(cmd);
    o = writeU32(view, o, bytes);
    o = writeU32(view, o, 0);

    switch (cmd.op) {
      case CommandOp.ClearAll:
      case CommandOp.DeleteEntity:
        break;
      case CommandOp.SetViewScale:
        o = writeF32(view, o, cmd.view.scale);
        break;
      case CommandOp.SetDrawOrder:
        o = writeU32(view, o, cmd.order.ids.length);
        o = writeU32(view, o, 0);
        for (const id of cmd.order.ids) o = writeU32(view, o, id);
        break;
      case CommandOp.UpsertRect:
        o = writeF32(view, o, cmd.rect.x);
        o = writeF32(view, o, cmd.rect.y);
        o = writeF32(view, o, cmd.rect.w);
        o = writeF32(view, o, cmd.rect.h);
        o = writeF32(view, o, cmd.rect.fillR);
        o = writeF32(view, o, cmd.rect.fillG);
        o = writeF32(view, o, cmd.rect.fillB);
        o = writeF32(view, o, cmd.rect.fillA);
        o = writeF32(view, o, cmd.rect.strokeR);
        o = writeF32(view, o, cmd.rect.strokeG);
        o = writeF32(view, o, cmd.rect.strokeB);
        o = writeF32(view, o, cmd.rect.strokeA);
        o = writeF32(view, o, cmd.rect.strokeEnabled);
        o = writeF32(view, o, cmd.rect.strokeWidthPx);
        break;
      case CommandOp.UpsertLine:
        o = writeF32(view, o, cmd.line.x0);
        o = writeF32(view, o, cmd.line.y0);
        o = writeF32(view, o, cmd.line.x1);
        o = writeF32(view, o, cmd.line.y1);
        o = writeF32(view, o, cmd.line.r);
        o = writeF32(view, o, cmd.line.g);
        o = writeF32(view, o, cmd.line.b);
        o = writeF32(view, o, cmd.line.a);
        o = writeF32(view, o, cmd.line.enabled);
        o = writeF32(view, o, cmd.line.strokeWidthPx);
        break;
      case CommandOp.UpsertPolyline:
        o = writeF32(view, o, cmd.polyline.r);
        o = writeF32(view, o, cmd.polyline.g);
        o = writeF32(view, o, cmd.polyline.b);
        o = writeF32(view, o, cmd.polyline.a);
        o = writeF32(view, o, cmd.polyline.enabled);
        o = writeF32(view, o, cmd.polyline.strokeWidthPx);
        o = writeU32(view, o, cmd.polyline.points.length);
        o = writeU32(view, o, 0);
        for (const p of cmd.polyline.points) {
          o = writeF32(view, o, p.x);
          o = writeF32(view, o, p.y);
        }
        break;
      case CommandOp.UpsertSymbol:
        o = writeU32(view, o, cmd.symbol.symbolKey);
        o = writeF32(view, o, cmd.symbol.x);
        o = writeF32(view, o, cmd.symbol.y);
        o = writeF32(view, o, cmd.symbol.w);
        o = writeF32(view, o, cmd.symbol.h);
        o = writeF32(view, o, cmd.symbol.rotation);
        o = writeF32(view, o, cmd.symbol.scaleX);
        o = writeF32(view, o, cmd.symbol.scaleY);
        o = writeF32(view, o, cmd.symbol.connX);
        o = writeF32(view, o, cmd.symbol.connY);
        break;
      case CommandOp.UpsertNode:
        o = writeU32(view, o, cmd.node.kind);
        o = writeU32(view, o, cmd.node.anchorSymbolId);
        o = writeF32(view, o, cmd.node.x);
        o = writeF32(view, o, cmd.node.y);
        break;
      case CommandOp.UpsertConduit:
        o = writeU32(view, o, cmd.conduit.fromNodeId);
        o = writeU32(view, o, cmd.conduit.toNodeId);
        o = writeF32(view, o, cmd.conduit.r);
        o = writeF32(view, o, cmd.conduit.g);
        o = writeF32(view, o, cmd.conduit.b);
        o = writeF32(view, o, cmd.conduit.a);
        o = writeF32(view, o, cmd.conduit.enabled);
        o = writeF32(view, o, cmd.conduit.strokeWidthPx);
        break;
      case CommandOp.UpsertCircle:
        o = writeF32(view, o, cmd.circle.cx);
        o = writeF32(view, o, cmd.circle.cy);
        o = writeF32(view, o, cmd.circle.rx);
        o = writeF32(view, o, cmd.circle.ry);
        o = writeF32(view, o, cmd.circle.rot);
        o = writeF32(view, o, cmd.circle.sx);
        o = writeF32(view, o, cmd.circle.sy);
        o = writeF32(view, o, cmd.circle.fillR);
        o = writeF32(view, o, cmd.circle.fillG);
        o = writeF32(view, o, cmd.circle.fillB);
        o = writeF32(view, o, cmd.circle.fillA);
        o = writeF32(view, o, cmd.circle.strokeR);
        o = writeF32(view, o, cmd.circle.strokeG);
        o = writeF32(view, o, cmd.circle.strokeB);
        o = writeF32(view, o, cmd.circle.strokeA);
        o = writeF32(view, o, cmd.circle.strokeEnabled);
        o = writeF32(view, o, cmd.circle.strokeWidthPx);
        break;
      case CommandOp.UpsertPolygon:
        o = writeF32(view, o, cmd.polygon.cx);
        o = writeF32(view, o, cmd.polygon.cy);
        o = writeF32(view, o, cmd.polygon.rx);
        o = writeF32(view, o, cmd.polygon.ry);
        o = writeF32(view, o, cmd.polygon.rot);
        o = writeF32(view, o, cmd.polygon.sx);
        o = writeF32(view, o, cmd.polygon.sy);
        o = writeF32(view, o, cmd.polygon.fillR);
        o = writeF32(view, o, cmd.polygon.fillG);
        o = writeF32(view, o, cmd.polygon.fillB);
        o = writeF32(view, o, cmd.polygon.fillA);
        o = writeF32(view, o, cmd.polygon.strokeR);
        o = writeF32(view, o, cmd.polygon.strokeG);
        o = writeF32(view, o, cmd.polygon.strokeB);
        o = writeF32(view, o, cmd.polygon.strokeA);
        o = writeF32(view, o, cmd.polygon.strokeEnabled);
        o = writeF32(view, o, cmd.polygon.strokeWidthPx);
        o = writeU32(view, o, cmd.polygon.sides >>> 0);
        break;
      case CommandOp.UpsertArrow:
        o = writeF32(view, o, cmd.arrow.ax);
        o = writeF32(view, o, cmd.arrow.ay);
        o = writeF32(view, o, cmd.arrow.bx);
        o = writeF32(view, o, cmd.arrow.by);
        o = writeF32(view, o, cmd.arrow.head);
        o = writeF32(view, o, cmd.arrow.strokeR);
        o = writeF32(view, o, cmd.arrow.strokeG);
        o = writeF32(view, o, cmd.arrow.strokeB);
        o = writeF32(view, o, cmd.arrow.strokeA);
        o = writeF32(view, o, cmd.arrow.strokeEnabled);
        o = writeF32(view, o, cmd.arrow.strokeWidthPx);
        break;
      // ========== Text Commands ==========
      case CommandOp.UpsertText: {
        const contentBytes = textEncoder.encode(cmd.text.content);
        // TextPayloadHeader (28 bytes)
        o = writeF32(view, o, cmd.text.x);
        o = writeF32(view, o, cmd.text.y);
        o = writeF32(view, o, cmd.text.rotation);
        view.setUint8(o, cmd.text.boxMode & 0xff);
        view.setUint8(o + 1, cmd.text.align & 0xff);
        view.setUint8(o + 2, 0); // reserved
        view.setUint8(o + 3, 0); // reserved
        o += 4;
        o = writeF32(view, o, cmd.text.constraintWidth);
        o = writeU32(view, o, cmd.text.runs.length);
        o = writeU32(view, o, contentBytes.length);
        // TextRunPayload * runCount (20 bytes each)
        for (const run of cmd.text.runs) {
          o = writeU32(view, o, run.startIndex);
          o = writeU32(view, o, run.length);
          o = writeU32(view, o, run.fontId);
          o = writeF32(view, o, run.fontSize);
          o = writeU32(view, o, run.colorRGBA >>> 0);
          view.setUint8(o, run.flags & 0xff);
          view.setUint8(o + 1, 0); // reserved
          view.setUint8(o + 2, 0); // reserved
          view.setUint8(o + 3, 0); // reserved
          o += 4;
        }
        // UTF-8 content
        new Uint8Array(buf, o, contentBytes.length).set(contentBytes);
        o += contentBytes.length;
        break;
      }
      case CommandOp.DeleteText:
        // No payload, uses command header id
        break;
      case CommandOp.SetTextCaret:
        o = writeU32(view, o, cmd.caret.textId);
        o = writeU32(view, o, cmd.caret.caretIndex);
        break;
      case CommandOp.SetTextSelection:
        o = writeU32(view, o, cmd.selection.textId);
        o = writeU32(view, o, cmd.selection.selectionStart);
        o = writeU32(view, o, cmd.selection.selectionEnd);
        break;
      case CommandOp.InsertTextContent: {
        const insertBytes = textEncoder.encode(cmd.insert.content);
        // TextInsertPayloadHeader (16 bytes)
        o = writeU32(view, o, cmd.insert.textId);
        o = writeU32(view, o, cmd.insert.insertIndex);
        o = writeU32(view, o, insertBytes.length);
        o = writeU32(view, o, 0); // reserved
        // UTF-8 content
        new Uint8Array(buf, o, insertBytes.length).set(insertBytes);
        o += insertBytes.length;
        break;
      }
      case CommandOp.DeleteTextContent:
        o = writeU32(view, o, cmd.del.textId);
        o = writeU32(view, o, cmd.del.startIndex);
        o = writeU32(view, o, cmd.del.endIndex);
        o = writeU32(view, o, 0); // reserved
        break;
    }
  }

  return new Uint8Array(buf);
};
