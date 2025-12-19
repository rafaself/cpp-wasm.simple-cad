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

export type RectPayload = { x: number; y: number; w: number; h: number };
export type LinePayload = { x0: number; y0: number; x1: number; y1: number };
export type PolylinePayload = { points: ReadonlyArray<{ x: number; y: number }> };
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
export type ConduitPayload = { fromNodeId: number; toNodeId: number };

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
      return 16;
    case CommandOp.UpsertLine:
      return 16;
    case CommandOp.UpsertPolyline:
      return 4 + cmd.polyline.points.length * 8;
    case CommandOp.UpsertSymbol:
      return 40;
    case CommandOp.UpsertNode:
      return 16;
    case CommandOp.UpsertConduit:
      return 8;
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
        break;
      case CommandOp.UpsertLine:
        o = writeF32(view, o, cmd.line.x0);
        o = writeF32(view, o, cmd.line.y0);
        o = writeF32(view, o, cmd.line.x1);
        o = writeF32(view, o, cmd.line.y1);
        break;
      case CommandOp.UpsertPolyline:
        o = writeU32(view, o, cmd.polyline.points.length);
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
        break;
    }
  }

  return new Uint8Array(buf);
};
