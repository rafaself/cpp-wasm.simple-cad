import { describe, expect, it } from 'vitest';

import type { VectorDocumentV1 } from '@/types';
import { buildVectorQuadTree, buildVectorTileIndex, computeDocumentDrawBounds, queryVectorQuadTree, queryVectorTileIndex } from '@/engine/vector/vectorDrawIndex';

const makeGridDoc = (cols: number, rows: number, spacing: number): VectorDocumentV1 => {
  const paths = [];
  const draws = [];

  let p = 0;
  let d = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      p += 1;
      d += 1;
      const idP = `p${p}`;
      const idD = `d${d}`;
      const cx = x * spacing + 0.5;
      const cy = y * spacing + 0.5;
      paths.push({
        id: idP,
        segments: [{ kind: 'move', to: { x: cx, y: cy } }, { kind: 'line', to: { x: cx + 0.1, y: cy } }],
        closed: false,
      });
      draws.push({
        id: idD,
        pathId: idP,
        style: { stroke: { color: '#000000', width: 1, join: 'miter', cap: 'butt' } },
      });
    }
  }

  return { version: 1, paths, draws };
};

describe('perf budgets (deterministic guardrails)', () => {
  it('tile index query returns bounded candidates for a single cell', () => {
    const cols = 64;
    const rows = 64;
    const spacing = 1;
    const doc = makeGridDoc(cols, rows, spacing);

    // With spacing=1 and cellSize=16, each 16x16 tile contains exactly 256 draws.
    const cellSize = 16;
    const idx = buildVectorTileIndex(doc, cellSize);

    const hits = queryVectorTileIndex(idx, { minX: 0, minY: 0, maxX: 15.99, maxY: 15.99 });
    expect(hits.length).toBe(16 * 16);
  });

  it('quadtree query matches tile index candidates for the same rect', () => {
    const doc = makeGridDoc(64, 64, 1);
    const tile = buildVectorTileIndex(doc, 16);
    const boundsByDrawId = computeDocumentDrawBounds(doc);
    const items = [...boundsByDrawId.entries()].map(([id, bounds]) => ({ id, bounds }));
    const qt = buildVectorQuadTree(items, tile.bounds, { capacity: 8, maxDepth: 10 });

    const rect = { minX: 32, minY: 32, maxX: 47.99, maxY: 47.99 };
    const a = queryVectorTileIndex(tile, rect).sort();
    const b = queryVectorQuadTree(qt, rect).sort();
    expect(b).toEqual(a);
  });
});

