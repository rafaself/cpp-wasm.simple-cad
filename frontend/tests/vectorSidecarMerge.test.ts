import { describe, expect, it } from 'vitest';

import type { VectorSidecarV1 } from '../types';
import { mergeVectorSidecarsV1 } from '../utils/vectorSidecarMerge';

const sidecarWithOneDraw = (shapeId: string): VectorSidecarV1 => ({
  version: 1,
  document: {
    version: 1,
    paths: [
      {
        id: 'p1',
        segments: [{ kind: 'move', to: { x: 0, y: 0 } }, { kind: 'line', to: { x: 1, y: 0 } }],
        closed: false,
      },
    ],
    draws: [
      {
        id: 'd1',
        pathId: 'p1',
        style: { stroke: { color: '#000000', width: 1, join: 'miter', cap: 'butt' } },
      },
    ],
  },
  bindings: {
    [shapeId]: { drawIds: ['d1'] },
  },
});

describe('mergeVectorSidecarsV1', () => {
  it('remaps ids and preserves bindings when base is null', () => {
    const add = sidecarWithOneDraw('shape-a');
    const merged = mergeVectorSidecarsV1(null, add, 'pdf:shape-a:');
    expect(merged.document.paths[0]?.id).toBe('pdf:shape-a:p1');
    expect(merged.document.draws[0]?.id).toBe('pdf:shape-a:d1');
    expect(merged.bindings['shape-a']?.drawIds).toEqual(['pdf:shape-a:d1']);
  });

  it('merges into an existing sidecar without id collisions', () => {
    const base = sidecarWithOneDraw('shape-a');
    const add = sidecarWithOneDraw('shape-b');
    const merged = mergeVectorSidecarsV1(base, add, 'pdf:shape-b:');
    expect(merged.document.paths).toHaveLength(2);
    expect(merged.document.draws).toHaveLength(2);
    expect(merged.bindings['shape-a']?.drawIds).toEqual(['d1']);
    expect(merged.bindings['shape-b']?.drawIds).toEqual(['pdf:shape-b:d1']);
  });
});

