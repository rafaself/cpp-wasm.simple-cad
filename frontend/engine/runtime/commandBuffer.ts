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
};
export type LinePayload = { x0: number; y0: number; x1: number; y1: number; r: number; g: number; b: number; a: number; enabled: number };
export type PolylinePayload = { points: ReadonlyArray<{ x: number; y: number }>; r: number; g: number; b: number; a: number; enabled: number };
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
export type ConduitPayload = { fromNodeId: number; toNodeId: number; r: number; g: number; b: number; a: number; enabled: number };

export type EngineCommand =
  | { op: CommandOp.ClearAll }
  | { op: CommandOp.DeleteEntity; id: number }
  | { op: CommandOp.UpsertRect; id: number; rect: RectPayload }
  | { op: CommandOp.UpsertLine; id: number; line: LinePayload }
  | { op: CommandOp.UpsertPolyline; id: number; polyline: PolylinePayload }
  | { op: CommandOp.UpsertSymbol; id: number; symbol: SymbolPayload }
  | { op: CommandOp.UpsertNode; id: number; node: NodePayload }
  | { op: CommandOp.UpsertConduit; id: number; conduit: ConduitPayload };

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
      return 0;
    case CommandOp.UpsertRect:
      return 52; // 13 floats * 4 bytes/float
    case CommandOp.UpsertLine:
      return 36; // 9 floats * 4 bytes/float
    case CommandOp.UpsertPolyline:
      return 28 + cmd.polyline.points.length * 8; // header (5 floats + u32 count + u32 reserved) + points
    case CommandOp.UpsertSymbol:
      return 40;
    case CommandOp.UpsertNode:
      return 16;
    case CommandOp.UpsertConduit:
      return 28; // 2 u32 + 5 floats
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
  o = writeU32(view, o, 1); // version
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
        break;
      case CommandOp.UpsertPolyline:
        o = writeF32(view, o, cmd.polyline.r);
        o = writeF32(view, o, cmd.polyline.g);
        o = writeF32(view, o, cmd.polyline.b);
        o = writeF32(view, o, cmd.polyline.a);
        o = writeF32(view, o, cmd.polyline.enabled);
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
        break;
    }
  }

  return new Uint8Array(buf);
};
