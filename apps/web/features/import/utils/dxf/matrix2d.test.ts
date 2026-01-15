import { describe, it, expect } from 'vitest';

import {
  identity,
  multiply,
  applyToPoint,
  fromTranslation,
  fromRotation,
  fromScaling,
  fromTRS,
} from './matrix2d';

describe('Matrix2D', () => {
  it('should return identity matrix', () => {
    const m = identity();
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it('should translate point', () => {
    const m = fromTranslation(10, 20);
    const p = { x: 5, y: 5 };
    const p2 = applyToPoint(m, p);
    expect(p2).toEqual({ x: 15, y: 25 });
  });

  it('should scale point', () => {
    const m = fromScaling(2, 0.5);
    const p = { x: 10, y: 10 };
    const p2 = applyToPoint(m, p);
    expect(p2).toEqual({ x: 20, y: 5 });
  });

  it('should rotate point', () => {
    const m = fromRotation(Math.PI / 2); // 90 degrees
    const p = { x: 10, y: 0 };
    const p2 = applyToPoint(m, p);
    // x' = 10*0 + 0*(-1) = 0
    // y' = 10*1 + 0*0 = 10
    expect(p2.x).toBeCloseTo(0);
    expect(p2.y).toBeCloseTo(10);
  });

  it('should multiply matrices correctly (T * S)', () => {
    const T = fromTranslation(10, 20);
    const S = fromScaling(2, 2);
    // T * S means Scale first, then Translate (if applied as T * S * p)
    // Wait, M = M1 * M2. p' = M * p = M1 * (M2 * p).
    // So T * S * p means Apply S then Apply T.

    const m = multiply(T, S);
    const p = { x: 5, y: 5 };
    // S(p) = 10, 10
    // T(10, 10) = 20, 30
    const p2 = applyToPoint(m, p);
    expect(p2).toEqual({ x: 20, y: 30 });
  });

  it('should create from TRS correctly', () => {
    const m = fromTRS(10, 20, 90, 2, 0.5);
    const p = { x: 1, y: 0 };
    // 1. Scale(1, 0) -> (2, 0)
    // 2. Rotate 90 (2, 0) -> (0, 2)
    // 3. Translate(10, 20) (0, 2) -> (10, 22)

    const p2 = applyToPoint(m, p);
    expect(p2.x).toBeCloseTo(10);
    expect(p2.y).toBeCloseTo(22);
  });
});
