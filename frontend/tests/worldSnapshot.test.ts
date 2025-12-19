import { describe, expect, it } from 'vitest';
import { decodeWorldSnapshot, encodeWorldSnapshot, fnv1a32, snapshotFromLegacyProject } from '../src/next/worldSnapshot';
import type { SerializedProject } from '../types';

describe('worldSnapshot v2', () => {
  it('fnv1a32 is deterministic', () => {
    expect(fnv1a32('abc')).toBe(fnv1a32('abc'));
    expect(fnv1a32('abc')).not.toBe(fnv1a32('abcd'));
  });

  it('encodes/decodes a minimal snapshot deterministically', () => {
    const project: SerializedProject = {
      layers: [],
      activeLayerId: '',
      shapes: [
        {
          id: 'r1',
          layerId: 'desenho',
          type: 'rect',
          x: 0,
          y: 0,
          width: 10,
          height: 5,
          strokeColor: '#000',
          fillColor: '#fff',
          points: [],
        },
        {
          id: 'l1',
          layerId: 'desenho',
          type: 'line',
          points: [{ x: 0, y: 0 }, { x: 3, y: 4 }],
          strokeColor: '#000',
          fillColor: '#fff',
        },
      ],
      electricalElements: [],
      connectionNodes: [],
      diagramNodes: [],
      diagramEdges: [],
    };

    const { snapshot } = snapshotFromLegacyProject(project);
    const bytes1 = encodeWorldSnapshot(snapshot);
    const bytes2 = encodeWorldSnapshot(snapshot);
    expect(bytes1).toEqual(bytes2);

    const decoded = decodeWorldSnapshot(bytes1);
    expect(decoded.version).toBe(2);
    expect(decoded.rects.length).toBe(1);
    expect(decoded.lines.length).toBe(1);
  });
});
