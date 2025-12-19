import { SerializedProject, Shape } from '../../types/index.ts';

export const WORLD_SNAPSHOT_MAGIC_EWC1 = 0x31435745; // "EWC1" little-endian bytes
export const WORLD_SNAPSHOT_VERSION_LATEST = 2 as const;

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

export type WorldSnapshot = WorldSnapshotV1 | WorldSnapshotV2;

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

export function snapshotFromLegacyProject(project: SerializedProject): { snapshot: WorldSnapshotV2; report: WorldSnapshotImportReport } {
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

  // Phase 6 hardening: avoid hash collisions by allocating deterministic numeric IDs.
  // Determinism rule: sort by legacy string id so the same project produces the same IDs.
  const sorted = [...project.shapes].sort((a, b) => a.id.localeCompare(b.id));
  let nextId = 1;

  for (const shape of sorted) {
    if (shape.type !== 'rect' && shape.type !== 'line' && shape.type !== 'polyline') {
      droppedByType[shape.type] = (droppedByType[shape.type] ?? 0) + 1;
      continue;
    }

    const id = nextId++;
    rememberId(id, shape.id);

    if (shape.type === 'rect') {
      if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) continue;
      rects.push({ id, x: shape.x, y: shape.y, w: shape.width, h: shape.height });
      supportedCount++;
      continue;
    }

    if (shape.type === 'line') {
      if (!shape.points || shape.points.length < 2) continue;
      const p0 = shape.points[0];
      const p1 = shape.points[1];
      lines.push({ id, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y });
      supportedCount++;
      continue;
    }

    if (shape.type === 'polyline') {
      if (!shape.points || shape.points.length < 2) continue;
      const offset = points.length;
      for (const p of shape.points) points.push({ x: p.x, y: p.y });
      polylines.push({ id, offset, count: shape.points.length });
      supportedCount++;
    }
  }

  return {
    snapshot: { version: 2, rects, lines, polylines, points },
    report: { idMap, supportedCount, droppedByType },
  };
}

export function encodeWorldSnapshot(snapshot: WorldSnapshot): Uint8Array {
  if (snapshot.version !== 1 && snapshot.version !== 2) {
    throw new Error(`Unsupported snapshot version ${String((snapshot as any).version)}`);
  }

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
  view.setUint32(o, snapshot.version, true); o += 4;
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

export function decodeWorldSnapshot(bytes: Uint8Array): WorldSnapshot {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;

  const magic = view.getUint32(o, true); o += 4;
  if (magic !== WORLD_SNAPSHOT_MAGIC_EWC1) throw new Error(`Invalid snapshot magic: 0x${magic.toString(16)}`);

  const version = view.getUint32(o, true); o += 4;
  if (version !== 1 && version !== 2) throw new Error(`Unsupported snapshot version: ${version}`);

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

  return { version: version as 1 | 2, rects, lines, polylines, points };
}

export function migrateWorldSnapshotToLatest(snapshot: WorldSnapshot): WorldSnapshotV2 {
  if (snapshot.version === 2) return snapshot;
  // v1 -> v2: binary layout is identical, but v1 IDs may be hashes (collision possible).
  // We preserve the IDs for compatibility; new exports should be v2.
  return { version: 2, rects: snapshot.rects, lines: snapshot.lines, polylines: snapshot.polylines, points: snapshot.points };
}

export function snapshotFromLegacyShapes(shapes: Shape[]): WorldSnapshotV2 {
  // Convenience for callers that only have shapes (no layers/electrical/etc).
  return snapshotFromLegacyProject({ layers: [], shapes, activeLayerId: '', electricalElements: [], connectionNodes: [], diagramNodes: [], diagramEdges: [] }).snapshot;
}
