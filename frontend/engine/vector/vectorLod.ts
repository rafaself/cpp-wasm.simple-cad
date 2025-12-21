import type { Point, VectorDocumentV1, VectorSegment } from '@/types';

const distPointToSegment = (p: Point, a: Point, b: Point): number => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const proj = { x: a.x + t * vx, y: a.y + t * vy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
};

export const simplifyRdp = (points: readonly Point[], tolerance: number): Point[] => {
  if (points.length <= 2) return [...points];
  const tol = Math.max(0, tolerance);
  if (tol === 0) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<{ i0: number; i1: number }> = [{ i0: 0, i1: points.length - 1 }];

  while (stack.length) {
    const { i0, i1 } = stack.pop()!;
    const a = points[i0]!;
    const b = points[i1]!;
    let bestI = -1;
    let bestD = 0;
    for (let i = i0 + 1; i < i1; i++) {
      const d = distPointToSegment(points[i]!, a, b);
      if (d > bestD) {
        bestD = d;
        bestI = i;
      }
    }
    if (bestI !== -1 && bestD > tol) {
      keep[bestI] = 1;
      stack.push({ i0, i1: bestI });
      stack.push({ i0: bestI, i1 });
    }
  }

  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]!);
  return out;
};

const isLineOnlyPath = (segments: readonly VectorSegment[]): boolean => {
  // Supports single-subpath move/line[/close] only.
  let sawMove = false;
  for (const s of segments) {
    if (s.kind === 'move') {
      if (sawMove) return false;
      sawMove = true;
      continue;
    }
    if (s.kind === 'line' || s.kind === 'close') continue;
    return false;
  }
  return sawMove;
};

const segmentsToPolyline = (segments: readonly VectorSegment[]): { points: Point[]; closed: boolean } | null => {
  if (!isLineOnlyPath(segments)) return null;
  const pts: Point[] = [];
  let closed = false;
  for (const s of segments) {
    if (s.kind === 'move' || s.kind === 'line') pts.push(s.to);
    if (s.kind === 'close') closed = true;
  }
  if (pts.length < 2) return null;
  return { points: pts, closed };
};

const polylineToSegments = (points: readonly Point[], closed: boolean): VectorSegment[] => {
  const out: VectorSegment[] = [{ kind: 'move', to: points[0]! }];
  for (let i = 1; i < points.length; i++) out.push({ kind: 'line', to: points[i]! });
  if (closed) out.push({ kind: 'close' });
  return out;
};

export const simplifyVectorDocumentForLod = (doc: VectorDocumentV1, toleranceWorld: number): VectorDocumentV1 => {
  if (!(toleranceWorld > 0)) return doc;
  const nextPaths = doc.paths.map((p) => {
    const poly = segmentsToPolyline(p.segments);
    if (!poly) return p;
    const simplified = simplifyRdp(poly.points, toleranceWorld);
    if (simplified.length < 2) return p;
    return { ...p, segments: polylineToSegments(simplified, poly.closed || !!p.closed), closed: poly.closed || !!p.closed };
  });
  return { version: 1, paths: nextPaths, draws: doc.draws };
};

export const toleranceWorldForViewScale = (tolerancePx: number, viewScale: number): number => {
  const eps = 1e-6;
  const scale = Math.max(eps, viewScale);
  return tolerancePx / scale;
};

