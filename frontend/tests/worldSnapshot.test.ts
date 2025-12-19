import { describe, expect, it } from 'vitest';
import { decodeWorldSnapshot, encodeWorldSnapshot, type WorldSnapshotV3 } from '../src/next/worldSnapshot';

describe('worldSnapshot v2', () => {
  it('encodes/decodes a minimal snapshot deterministically', () => {
    const snapshot: WorldSnapshotV3 = {
      version: 3,
      rects: [{ id: 1, x: 0, y: 0, w: 10, h: 5 }],
      lines: [{ id: 2, x0: 0, y0: 0, x1: 3, y1: 4 }],
      polylines: [],
      points: [],
      symbols: [],
      nodes: [],
      conduits: [],
    };

    const bytes1 = encodeWorldSnapshot(snapshot);
    const bytes2 = encodeWorldSnapshot(snapshot);
    expect(bytes1).toEqual(bytes2);

    const decoded = decodeWorldSnapshot(bytes1);
    expect(decoded.version).toBe(3);
    expect(decoded.rects.length).toBe(1);
    expect(decoded.lines.length).toBe(1);
  });
});
