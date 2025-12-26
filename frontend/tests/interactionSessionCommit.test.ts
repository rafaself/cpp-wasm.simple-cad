import { describe, expect, it } from 'vitest';
import type { Shape } from '@/types';
import { applyCommitOpToShape, TransformOpCode } from '@/engine/core/interactionSession';
import { getDefaultColorMode } from '@/utils/shapeColors';

const baseShape = (overrides: Partial<Shape>): Shape => ({
  id: 's1',
  layerId: 'layer-1',
  type: 'polyline',
  points: [],
  strokeColor: '#ffffff',
  fillColor: '#ffffff',
  strokeEnabled: true,
  fillEnabled: false,
  strokeOpacity: 100,
  fillOpacity: 100,
  colorMode: getDefaultColorMode(),
  ...overrides,
});

describe('interactionSession commit decoding (Phase 0)', () => {
  it('applies MOVE to x/y but does not emit points when points are empty', () => {
    const shape = baseShape({ type: 'rect', x: 10, y: 20, width: 5, height: 5, points: [] });
    const payloads = new Float32Array([5, -3, 0, 0]);

    const diff = applyCommitOpToShape(shape, TransformOpCode.MOVE, payloads, 0);
    expect(diff).toEqual({ x: 15, y: 17 });
    expect((diff as any)?.points).toBeUndefined();
  });

  it('applies MOVE to points-only shapes', () => {
    const shape = baseShape({
      type: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      x: undefined,
      y: undefined,
    });
    const payloads = new Float32Array([2, 3, 0, 0]);

    const diff = applyCommitOpToShape(shape, TransformOpCode.MOVE, payloads, 0);
    expect(diff).toEqual({
      points: [
        { x: 2, y: 3 },
        { x: 12, y: 3 },
      ],
    });
  });

  it('decodes VERTEX_SET payload as [idx, x, y, _] and applies to the correct point', () => {
    const shape = baseShape({
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    });
    const payloads = new Float32Array([1, 10, 20, 0]);

    const diff = applyCommitOpToShape(shape, TransformOpCode.VERTEX_SET, payloads, 0);
    expect(diff).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 20 },
        { x: 2, y: 2 },
      ],
    });
  });

  it('coerces near-integer VERTEX_SET indices defensively', () => {
    const shape = baseShape({
      type: 'polyline',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    const payloads = new Float32Array([1.0004, 9, 9, 0]);

    const diff = applyCommitOpToShape(shape, TransformOpCode.VERTEX_SET, payloads, 0);
    expect(diff).toEqual({ points: [{ x: 0, y: 0 }, { x: 9, y: 9 }] });
  });
});

