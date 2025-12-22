// Deterministic benchmark: build/query vector draw indices (tile + quadtree).
// Usage:
// - `node frontend/verification/benchmark_vector_index.mjs 4096`
// - `node frontend/verification/benchmark_vector_index.mjs 65536`

import { performance } from 'node:perf_hooks';

import { buildVectorQuadTree, buildVectorTileIndex, computeDocumentDrawBounds, queryVectorQuadTree, queryVectorTileIndex } from '../engine/vector/vectorDrawIndex.js';

const parseN = () => {
  const raw = process.argv[2] ?? '4096';
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

const N = parseN();
if (!N) {
  console.error('Invalid N. Example: node frontend/verification/benchmark_vector_index.mjs 4096');
  process.exit(1);
}

const cols = Math.ceil(Math.sqrt(N));
const rows = Math.ceil(N / cols);
const spacing = 1;

const makeDoc = () => {
  const paths = [];
  const draws = [];
  let i = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (i >= N) break;
      i += 1;
      const idP = `p${i}`;
      const idD = `d${i}`;
      const cx = x * spacing + 0.5;
      const cy = y * spacing + 0.5;
      paths.push({ id: idP, segments: [{ kind: 'move', to: { x: cx, y: cy } }, { kind: 'line', to: { x: cx + 0.1, y: cy } }], closed: false });
      draws.push({ id: idD, pathId: idP, style: { stroke: { color: '#000000', width: 1, join: 'miter', cap: 'butt' } } });
    }
  }
  return { version: 1, paths, draws };
};

const t0 = performance.now();
const doc = makeDoc();
const t1 = performance.now();

const cellSize = 64;
const t2 = performance.now();
const tile = buildVectorTileIndex(doc, cellSize);
const t3 = performance.now();

const t4 = performance.now();
const boundsByDrawId = computeDocumentDrawBounds(doc);
const items = [...boundsByDrawId.entries()].map(([id, bounds]) => ({ id, bounds }));
const qt = buildVectorQuadTree(items, tile.bounds, { capacity: 8, maxDepth: 12 });
const t5 = performance.now();

// Deterministic query set: 100 fixed rects.
const queries = [];
for (let i = 0; i < 100; i++) {
  const x = ((i * 73) % cols) * spacing;
  const y = ((i * 41) % rows) * spacing;
  queries.push({ minX: x, minY: y, maxX: x + cellSize * 0.25, maxY: y + cellSize * 0.25 });
}

let tileHits = 0;
const t6 = performance.now();
for (const q of queries) tileHits += queryVectorTileIndex(tile, q).length;
const t7 = performance.now();

let qtHits = 0;
const t8 = performance.now();
for (const q of queries) qtHits += queryVectorQuadTree(qt, q).length;
const t9 = performance.now();

console.log(JSON.stringify({
  N,
  cols,
  rows,
  build: {
    docMs: Number((t1 - t0).toFixed(2)),
    tileIndexMs: Number((t3 - t2).toFixed(2)),
    quadTreeMs: Number((t5 - t4).toFixed(2)),
  },
  query: {
    queryCount: queries.length,
    tileMs: Number((t7 - t6).toFixed(2)),
    quadTreeMs: Number((t9 - t8).toFixed(2)),
    tileTotalHits: tileHits,
    quadTreeTotalHits: qtHits,
  },
  tiles: tile.tiles.size,
}));

