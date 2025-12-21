import type { Point, VectorDocumentV1, VectorSegment, VectorTransform2D } from '@/types';

export type Aabb = { minX: number; minY: number; maxX: number; maxY: number };

const identityTransform: VectorTransform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const applyTransform = (t: VectorTransform2D, p: Point): Point => ({
  x: t.a * p.x + t.c * p.y + t.e,
  y: t.b * p.x + t.d * p.y + t.f,
});

const isFiniteAabb = (b: Aabb): boolean =>
  Number.isFinite(b.minX) && Number.isFinite(b.minY) && Number.isFinite(b.maxX) && Number.isFinite(b.maxY);

const emptyAabb = (): Aabb => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

const expandAabbPoint = (b: Aabb, p: Point) => {
  b.minX = Math.min(b.minX, p.x);
  b.minY = Math.min(b.minY, p.y);
  b.maxX = Math.max(b.maxX, p.x);
  b.maxY = Math.max(b.maxY, p.y);
};

const unionAabb = (a: Aabb, b: Aabb): Aabb => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
});

export const boundsForSegments = (segments: readonly VectorSegment[], transform?: VectorTransform2D): Aabb => {
  const t = transform ?? identityTransform;
  const b = emptyAabb();

  for (const s of segments) {
    switch (s.kind) {
      case 'move':
      case 'line':
        expandAabbPoint(b, applyTransform(t, s.to));
        break;
      case 'quad':
        expandAabbPoint(b, applyTransform(t, s.c));
        expandAabbPoint(b, applyTransform(t, s.to));
        break;
      case 'cubic':
        expandAabbPoint(b, applyTransform(t, s.c1));
        expandAabbPoint(b, applyTransform(t, s.c2));
        expandAabbPoint(b, applyTransform(t, s.to));
        break;
      case 'arc': {
        // Conservative AABB (ignores arc angles), but stable for indexing/culling.
        const c = applyTransform(t, s.center);
        const r0 = Math.abs(s.radius.x);
        const r1 = Math.abs(s.radius.y);
        expandAabbPoint(b, { x: c.x - r0, y: c.y - r1 });
        expandAabbPoint(b, { x: c.x + r0, y: c.y + r1 });
        break;
      }
      case 'close':
        break;
    }
  }

  return b;
};

export const computeDocumentDrawBounds = (doc: VectorDocumentV1): Map<string, Aabb> => {
  const pathById = new Map(doc.paths.map((p) => [p.id, p]));
  const boundsByDrawId = new Map<string, Aabb>();

  for (const d of doc.draws) {
    const path = pathById.get(d.pathId);
    if (!path) continue;
    const b = boundsForSegments(path.segments, d.transform);
    if (!isFiniteAabb(b)) continue;
    boundsByDrawId.set(d.id, b);
  }

  return boundsByDrawId;
};

export type VectorTileIndex = {
  kind: 'tile';
  cellSize: number;
  tiles: Map<string, string[]>; // "ix,iy" -> drawIds
  boundsByDrawId: Map<string, Aabb>;
  bounds: Aabb;
};

const tileCoord = (v: number, cellSize: number): number => Math.floor(v / cellSize);

const tileKey = (ix: number, iy: number): string => `${ix},${iy}`;

export const buildVectorTileIndex = (doc: VectorDocumentV1, cellSize: number): VectorTileIndex => {
  const boundsByDrawId = computeDocumentDrawBounds(doc);
  const tiles = new Map<string, string[]>();

  let overall = emptyAabb();
  for (const b of boundsByDrawId.values()) overall = unionAabb(overall, b);
  if (!isFiniteAabb(overall)) overall = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  for (const [drawId, b] of boundsByDrawId) {
    const ix0 = tileCoord(b.minX, cellSize);
    const ix1 = tileCoord(b.maxX, cellSize);
    const iy0 = tileCoord(b.minY, cellSize);
    const iy1 = tileCoord(b.maxY, cellSize);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        const key = tileKey(ix, iy);
        const list = tiles.get(key);
        if (list) list.push(drawId);
        else tiles.set(key, [drawId]);
      }
    }
  }

  return { kind: 'tile', cellSize, tiles, boundsByDrawId, bounds: overall };
};

export const queryVectorTileIndex = (index: VectorTileIndex, rect: Aabb): string[] => {
  const cs = index.cellSize;
  const ix0 = tileCoord(rect.minX, cs);
  const ix1 = tileCoord(rect.maxX, cs);
  const iy0 = tileCoord(rect.minY, cs);
  const iy1 = tileCoord(rect.maxY, cs);
  const out: string[] = [];
  const seen = new Set<string>();

  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      const list = index.tiles.get(tileKey(ix, iy));
      if (!list) continue;
      for (const id of list) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
};

export type QuadTreeItem = { id: string; bounds: Aabb };

export type VectorQuadTree = {
  kind: 'quadtree';
  bounds: Aabb;
  capacity: number;
  items: QuadTreeItem[];
  children: [VectorQuadTree, VectorQuadTree, VectorQuadTree, VectorQuadTree] | null;
};

const intersectsAabb = (a: Aabb, b: Aabb): boolean =>
  !(b.minX > a.maxX || b.maxX < a.minX || b.minY > a.maxY || b.maxY < a.minY);

const containsAabb = (outer: Aabb, inner: Aabb): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;

const subdivide = (node: VectorQuadTree): [VectorQuadTree, VectorQuadTree, VectorQuadTree, VectorQuadTree] => {
  const midX = (node.bounds.minX + node.bounds.maxX) * 0.5;
  const midY = (node.bounds.minY + node.bounds.maxY) * 0.5;
  const b = node.bounds;
  const cap = node.capacity;

  // NW, NE, SW, SE
  return [
    { kind: 'quadtree', bounds: { minX: b.minX, minY: midY, maxX: midX, maxY: b.maxY }, capacity: cap, items: [], children: null },
    { kind: 'quadtree', bounds: { minX: midX, minY: midY, maxX: b.maxX, maxY: b.maxY }, capacity: cap, items: [], children: null },
    { kind: 'quadtree', bounds: { minX: b.minX, minY: b.minY, maxX: midX, maxY: midY }, capacity: cap, items: [], children: null },
    { kind: 'quadtree', bounds: { minX: midX, minY: b.minY, maxX: b.maxX, maxY: midY }, capacity: cap, items: [], children: null },
  ];
};

const insertQuadTree = (node: VectorQuadTree, item: QuadTreeItem, depth: number, maxDepth: number): void => {
  if (!intersectsAabb(node.bounds, item.bounds)) return;

  if (!node.children && (node.items.length < node.capacity || depth >= maxDepth)) {
    node.items.push(item);
    return;
  }

  if (!node.children) node.children = subdivide(node);

  // Only insert into a child if fully contained; otherwise keep at this node.
  for (const child of node.children) {
    if (containsAabb(child.bounds, item.bounds)) {
      insertQuadTree(child, item, depth + 1, maxDepth);
      return;
    }
  }
  node.items.push(item);
};

export const buildVectorQuadTree = (items: readonly QuadTreeItem[], bounds: Aabb, opts?: { capacity?: number; maxDepth?: number }): VectorQuadTree => {
  const capacity = opts?.capacity ?? 8;
  const maxDepth = opts?.maxDepth ?? 12;
  const root: VectorQuadTree = { kind: 'quadtree', bounds, capacity, items: [], children: null };
  for (const it of items) insertQuadTree(root, it, 0, maxDepth);
  return root;
};

export const queryVectorQuadTree = (tree: VectorQuadTree, rect: Aabb, out: string[] = []): string[] => {
  if (!intersectsAabb(tree.bounds, rect)) return out;
  for (const it of tree.items) {
    if (intersectsAabb(it.bounds, rect)) out.push(it.id);
  }
  if (tree.children) {
    for (const child of tree.children) queryVectorQuadTree(child, rect, out);
  }
  return out;
};

