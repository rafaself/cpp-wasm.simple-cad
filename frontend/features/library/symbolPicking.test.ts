import { describe, expect, it } from 'vitest';
import type { Shape } from '@/types';
import { isSymbolInstanceHitAtWorldPoint, worldToSymbolUv } from '@/features/library/symbolPicking';

const makeSymbolShape = (overrides: Partial<Shape> = {}): Shape => ({
  id: 's1',
  layerId: 'l1',
  type: 'rect',
  points: [],
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  strokeColor: '#000000',
  fillColor: '#ffffff',
  svgSymbolId: 'sym1',
  ...overrides,
});

describe('symbolPicking', () => {
  it('maps world point to symbol UV', () => {
    const shape = makeSymbolShape();
    expect(worldToSymbolUv(shape, { x: 5, y: 5 })).toEqual({ u: 0.5, v: 0.5 });
    expect(worldToSymbolUv(shape, { x: 0, y: 0 })).toEqual({ u: 0, v: 0 });
    expect(worldToSymbolUv(shape, { x: 10, y: 10 })).toEqual({ u: 1, v: 1 });
  });

  it('rejects transparent samples when alpha mask exists', () => {
    const shape = makeSymbolShape();
    const sampler = (_id: string, u: number) => (u > 0.5 ? 255 : 0);
    expect(isSymbolInstanceHitAtWorldPoint(shape, { x: 8, y: 5 }, sampler)).toBe(true);
    expect(isSymbolInstanceHitAtWorldPoint(shape, { x: 2, y: 5 }, sampler)).toBe(false);
  });

  it('accepts hits conservatively when alpha mask is missing', () => {
    const shape = makeSymbolShape();
    const sampler = () => null;
    expect(isSymbolInstanceHitAtWorldPoint(shape, { x: 2, y: 5 }, sampler)).toBe(true);
  });

  it('supports a small tolerance by clamping to the nearest inside point', () => {
    const shape = makeSymbolShape();
    const sampler = (_id: string, u: number) => (u < 0.01 ? 255 : 0);
    expect(isSymbolInstanceHitAtWorldPoint(shape, { x: -0.2, y: 5 }, sampler)).toBe(false);
    expect(isSymbolInstanceHitAtWorldPoint(shape, { x: -0.2, y: 5 }, sampler, { toleranceWorld: 1 })).toBe(true);
  });

  it('rejects points far outside regardless of alpha', () => {
    const shape = makeSymbolShape();
    const sampler = () => 255;
    expect(isSymbolInstanceHitAtWorldPoint(shape, { x: 20, y: 5 }, sampler, { toleranceWorld: 0.1 })).toBe(false);
  });
});

