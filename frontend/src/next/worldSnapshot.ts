import { SerializedProject, Shape } from '@/types';

export const WORLD_SNAPSHOT_MAGIC_EWC1 = 0x31435745; // "EWC1" little-endian bytes
export const WORLD_SNAPSHOT_VERSION_LATEST = 1 as const;

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

export type WorldSnapshot = WorldSnapshotV1;

export type WorldSnapshotImportReport = {
  idMap: Map<number, string>;
  supportedCount: number;
  droppedByType: Record<string, number>;
};

export function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function snapshotFromLegacyProject(project: SerializedProject): { snapshot: WorldSnapshotV1; report: WorldSnapshotImportReport } {
  const rects: WorldRect[] = [];
  const lines: WorldLine[] = [];
  const polylines: WorldPolyline[] = [];
  const points: WorldPoint2[] = [];

  const idMap = new Map<number, string>();
  const droppedByType: Record<string, number> = {};
  let supportedCount = 0;

  const rememberId = (idHash: number, idStr: string) => {
    // Best-effort collision handling: keep first occurrence.
    if (!idMap.has(idHash)) idMap.set(idHash, idStr);
  };

  for (const shape of project.shapes) {
    const idHash = fnv1a32(shape.id);
    rememberId(idHash, shape.id);

    if (shape.type === 'rect') {
      if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) continue;
      rects.push({ id: idHash, x: shape.x, y: shape.y, w: shape.width, h: shape.height });
      supportedCount++;
      continue;
    }

    if (shape.type === 'line') {
      if (!shape.points || shape.points.length < 2) continue;
      const p0 = shape.points[0];
      const p1 = shape.points[1];
      lines.push({ id: idHash, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y });
      supportedCount++;
      continue;
    }

    if (shape.type === 'polyline') {
      if (!shape.points || shape.points.length < 2) continue;
      const offset = points.length;
      for (const p of shape.points) points.push({ x: p.x, y: p.y });
      polylines.push({ id: idHash, offset, count: shape.points.length });
      supportedCount++;
      continue;
    }

    droppedByType[shape.type] = (droppedByType[shape.type] ?? 0) + 1;
  }

  return {
    snapshot: {
      version: 1,
      rects,
      lines,
      polylines,
      points,
    },
    report: {
      idMap,
      supportedCount,
      droppedByType,
    },
  };
}

export function encodeWorldSnapshot(snapshot: WorldSnapshotV1): Uint8Array {
  if (snapshot.version !== 1) throw new Error(`Unsupported snapshot version ${String((snapshot as any).version)}`);

  const headerBytes = 8 * 4;
  const rectBytes = snapshot.rects.length * 20;
  const lineBytes = snapshot.lines.length * 20;
  const polyBytes = snapshot.polylines.length * 12;
  const pointBytes = snapshot.points.length * 8;

  const totalBytes = headerBytes + rectBytes + lineBytes + polyBytes + pointBytes;
  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  let o = 0;

  view.setUint32(o, WORLD_SNAPSHOT_MAGIC_EWC1, true); o += 4;
  view.setUint32(o, 1, true); o += 4;
  view.setUint32(o, snapshot.rects.length, true); o += 4;
  view.setUint32(o, snapshot.lines.length, true); o += 4;
  view.setUint32(o, snapshot.polylines.length, true); o += 4;
  view.setUint32(o, snapshot.points.length, true); o += 4;
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

  return new Uint8Array(buf);
}

export function decodeWorldSnapshot(bytes: Uint8Array): WorldSnapshotV1 {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;

  const magic = view.getUint32(o, true); o += 4;
  if (magic !== WORLD_SNAPSHOT_MAGIC_EWC1) throw new Error(`Invalid snapshot magic: 0x${magic.toString(16)}`);

  const version = view.getUint32(o, true); o += 4;
  if (version !== 1) throw new Error(`Unsupported snapshot version: ${version}`);

  const rectCount = view.getUint32(o, true); o += 4;
  const lineCount = view.getUint32(o, true); o += 4;
  const polyCount = view.getUint32(o, true); o += 4;
  const pointCount = view.getUint32(o, true); o += 4;
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

  return { version: 1, rects, lines, polylines, points };
}

export function migrateWorldSnapshotToLatest(snapshot: WorldSnapshot): WorldSnapshotV1 {
  // v1 is the current latest.
  if (snapshot.version === 1) return snapshot;
  throw new Error(`Unhandled snapshot version ${(snapshot as any).version}`);
}

export function snapshotFromLegacyShapes(shapes: Shape[]): WorldSnapshotV1 {
  // Convenience for callers that only have shapes (no layers/electrical/etc).
  return snapshotFromLegacyProject({ layers: [], shapes, activeLayerId: '', electricalElements: [], connectionNodes: [], diagramNodes: [], diagramEdges: [] }).snapshot;
}
