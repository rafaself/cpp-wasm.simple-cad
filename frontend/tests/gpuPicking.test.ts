import { describe, it, expect } from 'vitest';
import { createPickIdMaps, decodePickId, encodePickId, getShapeIdFromPixel } from '../engine/picking/pickId';

describe('gpu picking id encoding', () => {
  it('round-trips pick ids through RGBA bytes', () => {
    const ids = [1, 255, 256, 65535, 0x12345678, 0xff00ff00];
    for (const id of ids) {
      const encoded = encodePickId(id);
      const bytes = new Uint8Array(encoded.map((c) => Math.round(c * 255)));
      const decoded = decodePickId(bytes);
      expect(decoded).toBe(id >>> 0);
    }
  });

  it('maps pick ids back to shape ids', () => {
    const maps = createPickIdMaps(['shape-a', 'shape-b']);
    const pickId = maps.toPickId.get('shape-b');
    expect(pickId).toBeDefined();
    const encoded = encodePickId(pickId ?? 0);
    const bytes = new Uint8Array(encoded.map((c) => Math.round(c * 255)));
    expect(getShapeIdFromPixel(bytes, maps.toShapeId)).toBe('shape-b');
    expect(getShapeIdFromPixel(new Uint8Array([0, 0, 0, 0]), maps.toShapeId)).toBeNull();
  });
});
