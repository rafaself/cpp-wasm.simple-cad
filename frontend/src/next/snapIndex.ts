import type { Point } from '../../types/index.ts';
import type { WorldSnapshot } from './worldSnapshot';

type CellMap = Map<number, Map<number, Point[]>>;

export type SnapIndex = {
  cellSize: number;
  cells: CellMap;
  candidateCount: number;
};

const cellCoord = (value: number, cellSize: number): number => Math.floor(value / cellSize);

const pushPoint = (cells: CellMap, cellSize: number, p: Point) => {
  const ix = cellCoord(p.x, cellSize);
  const iy = cellCoord(p.y, cellSize);
  let col = cells.get(ix);
  if (!col) {
    col = new Map();
    cells.set(ix, col);
  }
  let bucket = col.get(iy);
  if (!bucket) {
    bucket = [];
    col.set(iy, bucket);
  }
  bucket.push(p);
};

export function buildSnapIndex(snapshot: WorldSnapshot, cellSize: number): SnapIndex {
  const cells: CellMap = new Map();
  let candidateCount = 0;

  const add = (p: Point) => {
    pushPoint(cells, cellSize, p);
    candidateCount++;
  };

  for (const r of snapshot.rects) {
    const x0 = r.x;
    const y0 = r.y;
    const x1 = r.x + r.w;
    const y1 = r.y + r.h;
    // corners
    add({ x: x0, y: y0 });
    add({ x: x1, y: y0 });
    add({ x: x1, y: y1 });
    add({ x: x0, y: y1 });
    // midpoints
    add({ x: (x0 + x1) * 0.5, y: y0 });
    add({ x: x1, y: (y0 + y1) * 0.5 });
    add({ x: (x0 + x1) * 0.5, y: y1 });
    add({ x: x0, y: (y0 + y1) * 0.5 });
    // center
    add({ x: (x0 + x1) * 0.5, y: (y0 + y1) * 0.5 });
  }

  for (const l of snapshot.lines) {
    add({ x: l.x0, y: l.y0 });
    add({ x: l.x1, y: l.y1 });
    add({ x: (l.x0 + l.x1) * 0.5, y: (l.y0 + l.y1) * 0.5 });
  }

  for (const pl of snapshot.polylines) {
    if (pl.count < 2) continue;
    const start = pl.offset;
    const end = pl.offset + pl.count;
    if (end > snapshot.points.length) continue;
    for (let i = start; i < end; i++) {
      const p = snapshot.points[i];
      add({ x: p.x, y: p.y });
      if (i + 1 < end) {
        const n = snapshot.points[i + 1];
        add({ x: (p.x + n.x) * 0.5, y: (p.y + n.y) * 0.5 });
      }
    }
  }

  return { cellSize, cells, candidateCount };
}

export function querySnapIndex(index: SnapIndex, point: Point, threshold: number): Point | null {
  const cellSize = index.cellSize;
  const minX = point.x - threshold;
  const maxX = point.x + threshold;
  const minY = point.y - threshold;
  const maxY = point.y + threshold;

  const minIx = cellCoord(minX, cellSize);
  const maxIx = cellCoord(maxX, cellSize);
  const minIy = cellCoord(minY, cellSize);
  const maxIy = cellCoord(maxY, cellSize);

  let best: Point | null = null;
  let bestDist2 = threshold * threshold;

  for (let ix = minIx; ix <= maxIx; ix++) {
    const col = index.cells.get(ix);
    if (!col) continue;
    for (let iy = minIy; iy <= maxIy; iy++) {
      const bucket = col.get(iy);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const c = bucket[i];
        const dx = point.x - c.x;
        const dy = point.y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          best = c;
        }
      }
    }
  }

  return best;
}
