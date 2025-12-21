import { describe, expect, it } from 'vitest';

import type { VectorDocumentV1 } from '@/types';
import { buildVectorQuadTree, buildVectorTileIndex, computeDocumentDrawBounds, queryVectorQuadTree, queryVectorTileIndex } from './vectorDrawIndex';
import { simplifyRdp, simplifyVectorDocumentForLod, toleranceWorldForViewScale } from './vectorLod';

describe('vector CAD optimizations', () => {
  it('builds a tile index and queries candidates', () => {
    const doc: VectorDocumentV1 = {
      version: 1,
      paths: [
        { id: 'p1', segments: [{ kind: 'move', to: { x: 0, y: 0 } }, { kind: 'line', to: { x: 10, y: 0 } }], closed: false },
        { id: 'p2', segments: [{ kind: 'move', to: { x: 200, y: 200 } }, { kind: 'line', to: { x: 210, y: 200 } }], closed: false },
      ],
      draws: [
        { id: 'd1', pathId: 'p1', style: { stroke: { color: '#000', width: 1, join: 'miter', cap: 'butt' } } },
        { id: 'd2', pathId: 'p2', style: { stroke: { color: '#000', width: 1, join: 'miter', cap: 'butt' } } },
      ],
    };

    const idx = buildVectorTileIndex(doc, 128);
    expect(queryVectorTileIndex(idx, { minX: -1, minY: -1, maxX: 20, maxY: 20 }).sort()).toEqual(['d1']);
    expect(queryVectorTileIndex(idx, { minX: 190, minY: 190, maxX: 260, maxY: 260 }).sort()).toEqual(['d2']);
  });

  it('builds a quadtree index over draw bounds', () => {
    const doc: VectorDocumentV1 = {
      version: 1,
      paths: [
        { id: 'p1', segments: [{ kind: 'move', to: { x: 0, y: 0 } }, { kind: 'line', to: { x: 10, y: 0 } }], closed: false },
        { id: 'p2', segments: [{ kind: 'move', to: { x: 200, y: 200 } }, { kind: 'line', to: { x: 210, y: 200 } }], closed: false },
      ],
      draws: [
        { id: 'd1', pathId: 'p1', style: { stroke: { color: '#000', width: 1, join: 'miter', cap: 'butt' } } },
        { id: 'd2', pathId: 'p2', style: { stroke: { color: '#000', width: 1, join: 'miter', cap: 'butt' } } },
      ],
    };
    const boundsByDrawId = computeDocumentDrawBounds(doc);
    const items = [...boundsByDrawId.entries()].map(([id, bounds]) => ({ id, bounds }));
    const root = buildVectorQuadTree(items, { minX: -10, minY: -10, maxX: 300, maxY: 300 }, { capacity: 1, maxDepth: 8 });
    expect(queryVectorQuadTree(root, { minX: -1, minY: -1, maxX: 20, maxY: 20 }).sort()).toEqual(['d1']);
    expect(queryVectorQuadTree(root, { minX: 190, minY: 190, maxX: 260, maxY: 260 }).sort()).toEqual(['d2']);
  });

  it('simplifies polylines deterministically with RDP', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0.01 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    expect(simplifyRdp(points, 0.05)).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }]);
    expect(simplifyRdp(points, 0)).toEqual(points);
  });

  it('computes toleranceWorld from viewScale (LOD by zoom)', () => {
    expect(toleranceWorldForViewScale(1, 1)).toBe(1);
    expect(toleranceWorldForViewScale(1, 2)).toBe(0.5);
  });

  it('simplifies line-only vector paths for LOD without touching curves', () => {
    const doc: VectorDocumentV1 = {
      version: 1,
      paths: [
        {
          id: 'p1',
          segments: [
            { kind: 'move', to: { x: 0, y: 0 } },
            { kind: 'line', to: { x: 1, y: 0.01 } },
            { kind: 'line', to: { x: 2, y: 0 } },
            { kind: 'line', to: { x: 3, y: 0 } },
          ],
          closed: false,
        },
        {
          id: 'p2',
          segments: [
            { kind: 'move', to: { x: 0, y: 0 } },
            { kind: 'cubic', c1: { x: 1, y: 1 }, c2: { x: 2, y: 1 }, to: { x: 3, y: 0 } },
          ],
          closed: false,
        },
      ],
      draws: [
        { id: 'd1', pathId: 'p1', style: { stroke: { color: '#000', width: 1, join: 'miter', cap: 'butt' } } },
        { id: 'd2', pathId: 'p2', style: { stroke: { color: '#000', width: 1, join: 'miter', cap: 'butt' } } },
      ],
    };
    const simplified = simplifyVectorDocumentForLod(doc, 0.05);
    const p1 = simplified.paths.find((p) => p.id === 'p1')!;
    const p2 = simplified.paths.find((p) => p.id === 'p2')!;
    expect(p1.segments.length).toBe(2);
    expect(p2.segments.length).toBe(doc.paths[1]!.segments.length);
  });
});

