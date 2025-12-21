import { describe, expect, it } from 'vitest';

import { computeTriangleBatches } from '../engine/renderers/webgl2/triBatching';

const floatsPerVertex = 7;

const v = (alpha: number): number[] => [0, 0, 0, 1, 1, 1, alpha];

describe('computeTriangleBatches', () => {
  it('groups consecutive triangles by blend state without reordering', () => {
    // 4 triangles: opaque, opaque, blended, opaque => 3 batches.
    const data = new Float32Array([
      ...v(1), ...v(1), ...v(1),
      ...v(1), ...v(1), ...v(1),
      ...v(1), ...v(0.5), ...v(1),
      ...v(1), ...v(1), ...v(1),
    ]);

    const batches = computeTriangleBatches(data, floatsPerVertex);
    const totalVertices = batches.reduce((sum, b) => sum + b.vertexCount, 0);
    expect(totalVertices).toBe(12);
    expect(batches).toEqual([
      { firstVertex: 0, vertexCount: 6, blended: false },
      { firstVertex: 6, vertexCount: 3, blended: true },
      { firstVertex: 9, vertexCount: 3, blended: false },
    ]);
  });

  it('returns empty list for empty/invalid inputs', () => {
    expect(computeTriangleBatches(new Float32Array([]), floatsPerVertex)).toEqual([]);
    expect(computeTriangleBatches(new Float32Array([1, 2, 3]), floatsPerVertex)).toEqual([]);
  });
});
