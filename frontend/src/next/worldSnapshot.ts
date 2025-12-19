export const WORLD_SNAPSHOT_MAGIC_EWC1 = 0x31435745; // "EWC1" little-endian bytes
export const WORLD_SNAPSHOT_VERSION_LATEST = 3 as const;

export type WorldRect = { id: number; x: number; y: number; w: number; h: number };
export type WorldLine = { id: number; x0: number; y0: number; x1: number; y1: number };
export type WorldPolyline = { id: number; offset: number; count: number };
export type WorldPoint2 = { x: number; y: number };

export type WorldSnapshotV1 = {
  version: 1;
  rects: WorldRect[];
  lines: WorldLine[];
  polylines: WorldPolyline[];
  points: WorldPoint2[];
};

export type WorldSnapshotV2 = {
  version: 2;
  rects: WorldRect[];
  lines: WorldLine[];
  polylines: WorldPolyline[];
  points: WorldPoint2[];
};

export type WorldSymbol = {
  id: number;
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

export type WorldNode = { id: number; kind: 0 | 1; anchorSymbolId: number; x: number; y: number };
export type WorldConduit = { id: number; fromNodeId: number; toNodeId: number };

export type WorldSnapshotV3 = {
  version: 3;
  rects: WorldRect[];
  lines: WorldLine[];
  polylines: WorldPolyline[];
  points: WorldPoint2[];
  symbols: WorldSymbol[];
  nodes: WorldNode[];
  conduits: WorldConduit[];
};

export type WorldSnapshot = WorldSnapshotV1 | WorldSnapshotV2 | WorldSnapshotV3;

export function encodeWorldSnapshot(snapshot: WorldSnapshot): Uint8Array {
  if (snapshot.version !== 1 && snapshot.version !== 2 && snapshot.version !== 3) {
    throw new Error(`Unsupported snapshot version ${String((snapshot as any).version)}`);
  }

  const headerBytes = snapshot.version === 3 ? 11 * 4 : 8 * 4;
  const rectBytes = snapshot.rects.length * 20;
  const lineBytes = snapshot.lines.length * 20;
  const polyBytes = snapshot.polylines.length * 12;
  const pointBytes = snapshot.points.length * 8;
  const symbolBytes = snapshot.version === 3 ? snapshot.symbols.length * 44 : 0;
  const nodeBytes = snapshot.version === 3 ? snapshot.nodes.length * 20 : 0;
  const conduitBytes = snapshot.version === 3 ? snapshot.conduits.length * 12 : 0;

  const totalBytes = headerBytes + rectBytes + lineBytes + polyBytes + pointBytes + symbolBytes + nodeBytes + conduitBytes;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  let o = 0;

  view.setUint32(o, WORLD_SNAPSHOT_MAGIC_EWC1, true); o += 4;
  view.setUint32(o, snapshot.version, true); o += 4;
  view.setUint32(o, snapshot.rects.length, true); o += 4;
  view.setUint32(o, snapshot.lines.length, true); o += 4;
  view.setUint32(o, snapshot.polylines.length, true); o += 4;
  view.setUint32(o, snapshot.points.length, true); o += 4;
  if (snapshot.version === 3) {
    view.setUint32(o, snapshot.symbols.length, true); o += 4;
    view.setUint32(o, snapshot.nodes.length, true); o += 4;
    view.setUint32(o, snapshot.conduits.length, true); o += 4;
  }
  view.setUint32(o, 0, true); o += 4;
  view.setUint32(o, 0, true); o += 4;

  for (const r of snapshot.rects) {
    view.setUint32(o, r.id >>> 0, true); o += 4;
    view.setFloat32(o, r.x, true); o += 4;
    view.setFloat32(o, r.y, true); o += 4;
    view.setFloat32(o, r.w, true); o += 4;
    view.setFloat32(o, r.h, true); o += 4;
  }

  for (const l of snapshot.lines) {
    view.setUint32(o, l.id >>> 0, true); o += 4;
    view.setFloat32(o, l.x0, true); o += 4;
    view.setFloat32(o, l.y0, true); o += 4;
    view.setFloat32(o, l.x1, true); o += 4;
    view.setFloat32(o, l.y1, true); o += 4;
  }

  for (const p of snapshot.polylines) {
    view.setUint32(o, p.id >>> 0, true); o += 4;
    view.setUint32(o, p.offset >>> 0, true); o += 4;
    view.setUint32(o, p.count >>> 0, true); o += 4;
  }

  for (const pt of snapshot.points) {
    view.setFloat32(o, pt.x, true); o += 4;
    view.setFloat32(o, pt.y, true); o += 4;
  }

  if (snapshot.version === 3) {
    for (const s of snapshot.symbols) {
      view.setUint32(o, s.id >>> 0, true); o += 4;
      view.setUint32(o, s.symbolKey >>> 0, true); o += 4;
      view.setFloat32(o, s.x, true); o += 4;
      view.setFloat32(o, s.y, true); o += 4;
      view.setFloat32(o, s.w, true); o += 4;
      view.setFloat32(o, s.h, true); o += 4;
      view.setFloat32(o, s.rotation, true); o += 4;
      view.setFloat32(o, s.scaleX, true); o += 4;
      view.setFloat32(o, s.scaleY, true); o += 4;
      view.setFloat32(o, s.connX, true); o += 4;
      view.setFloat32(o, s.connY, true); o += 4;
    }

    for (const n of snapshot.nodes) {
      view.setUint32(o, n.id >>> 0, true); o += 4;
      view.setUint32(o, n.kind >>> 0, true); o += 4;
      view.setUint32(o, n.anchorSymbolId >>> 0, true); o += 4;
      view.setFloat32(o, n.x, true); o += 4;
      view.setFloat32(o, n.y, true); o += 4;
    }

    for (const c of snapshot.conduits) {
      view.setUint32(o, c.id >>> 0, true); o += 4;
      view.setUint32(o, c.fromNodeId >>> 0, true); o += 4;
      view.setUint32(o, c.toNodeId >>> 0, true); o += 4;
    }
  }

  return new Uint8Array(buf);
}

export function decodeWorldSnapshot(bytes: Uint8Array): WorldSnapshot {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;

  const magic = view.getUint32(o, true); o += 4;
  if (magic !== WORLD_SNAPSHOT_MAGIC_EWC1) throw new Error(`Invalid snapshot magic: 0x${magic.toString(16)}`);

  const version = view.getUint32(o, true); o += 4;
  if (version !== 1 && version !== 2 && version !== 3) throw new Error(`Unsupported snapshot version: ${version}`);

  const rectCount = view.getUint32(o, true); o += 4;
  const lineCount = view.getUint32(o, true); o += 4;
  const polyCount = view.getUint32(o, true); o += 4;
  const pointCount = view.getUint32(o, true); o += 4;

  const symbolCount = version === 3 ? view.getUint32(o, true) : 0;
  if (version === 3) o += 4;
  const nodeCount = version === 3 ? view.getUint32(o, true) : 0;
  if (version === 3) o += 4;
  const conduitCount = version === 3 ? view.getUint32(o, true) : 0;
  if (version === 3) o += 4;
  o += 8; // reserved

  const rects: WorldRect[] = new Array(rectCount);
  for (let i = 0; i < rectCount; i++) {
    const id = view.getUint32(o, true); o += 4;
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const w = view.getFloat32(o, true); o += 4;
    const h = view.getFloat32(o, true); o += 4;
    rects[i] = { id, x, y, w, h };
  }

  const lines: WorldLine[] = new Array(lineCount);
  for (let i = 0; i < lineCount; i++) {
    const id = view.getUint32(o, true); o += 4;
    const x0 = view.getFloat32(o, true); o += 4;
    const y0 = view.getFloat32(o, true); o += 4;
    const x1 = view.getFloat32(o, true); o += 4;
    const y1 = view.getFloat32(o, true); o += 4;
    lines[i] = { id, x0, y0, x1, y1 };
  }

  const polylines: WorldPolyline[] = new Array(polyCount);
  for (let i = 0; i < polyCount; i++) {
    const id = view.getUint32(o, true); o += 4;
    const offset = view.getUint32(o, true); o += 4;
    const count = view.getUint32(o, true); o += 4;
    polylines[i] = { id, offset, count };
  }

  const points: WorldPoint2[] = new Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    points[i] = { x, y };
  }

  if (version !== 3) return { version: version as 1 | 2, rects, lines, polylines, points };

  const symbols: WorldSymbol[] = new Array(symbolCount);
  for (let i = 0; i < symbolCount; i++) {
    const id = view.getUint32(o, true); o += 4;
    const symbolKey = view.getUint32(o, true); o += 4;
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    const w = view.getFloat32(o, true); o += 4;
    const h = view.getFloat32(o, true); o += 4;
    const rotation = view.getFloat32(o, true); o += 4;
    const scaleX = view.getFloat32(o, true); o += 4;
    const scaleY = view.getFloat32(o, true); o += 4;
    const connX = view.getFloat32(o, true); o += 4;
    const connY = view.getFloat32(o, true); o += 4;
    symbols[i] = { id, symbolKey, x, y, w, h, rotation, scaleX, scaleY, connX, connY };
  }

  const nodes: WorldNode[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const id = view.getUint32(o, true); o += 4;
    const kind = view.getUint32(o, true) as 0 | 1; o += 4;
    const anchorSymbolId = view.getUint32(o, true); o += 4;
    const x = view.getFloat32(o, true); o += 4;
    const y = view.getFloat32(o, true); o += 4;
    nodes[i] = { id, kind, anchorSymbolId, x, y };
  }

  const conduits: WorldConduit[] = new Array(conduitCount);
  for (let i = 0; i < conduitCount; i++) {
    const id = view.getUint32(o, true); o += 4;
    const fromNodeId = view.getUint32(o, true); o += 4;
    const toNodeId = view.getUint32(o, true); o += 4;
    conduits[i] = { id, fromNodeId, toNodeId };
  }

  return { version: 3, rects, lines, polylines, points, symbols, nodes, conduits };
}

export function migrateWorldSnapshotToLatest(snapshot: WorldSnapshot): WorldSnapshotV3 {
  if (snapshot.version === 3) return snapshot;
  return {
    version: 3,
    rects: snapshot.rects,
    lines: snapshot.lines,
    polylines: snapshot.polylines,
    points: snapshot.points,
    symbols: [],
    nodes: [],
    conduits: [],
  };
}
