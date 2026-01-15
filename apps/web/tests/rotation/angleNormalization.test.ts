import { describe, expect, test } from 'vitest';

import {
  normalizeAngle,
  snapAngle,
  angleFromPivot,
  calculateDeltaAngle,
  rotatePointAroundPivot,
} from '@/utils/geometry/angleNormalization';

describe('normalizeAngle', () => {
  test('keeps angles in range', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(45)).toBe(45);
    expect(normalizeAngle(-45)).toBe(-45);
    expect(normalizeAngle(180)).toBe(180);
    // -180 and 180 represent the same angle; our convention returns 180
    expect(normalizeAngle(-180)).toBe(180);
  });

  test('wraps positive overflow', () => {
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(720)).toBe(0);
  });

  test('wraps negative overflow', () => {
    expect(normalizeAngle(-270)).toBe(90);
    expect(normalizeAngle(-360)).toBe(0);
    expect(normalizeAngle(-450)).toBe(-90);
    expect(normalizeAngle(-720)).toBe(0);
  });

  test('wraps at boundary', () => {
    expect(normalizeAngle(181)).toBe(-179);
    expect(normalizeAngle(-181)).toBe(179);
  });
});

describe('snapAngle', () => {
  test('snaps to 15° increments by default', () => {
    expect(snapAngle(0)).toBe(0);
    expect(snapAngle(7)).toBe(0);
    expect(snapAngle(8)).toBe(15);
    expect(snapAngle(22)).toBe(15);
    expect(snapAngle(23)).toBe(30);
    expect(snapAngle(37)).toBe(30);
    expect(snapAngle(38)).toBe(45);
  });

  test('snaps negative angles', () => {
    expect(snapAngle(-7)).toBe(0);
    expect(snapAngle(-8)).toBe(-15);
    expect(snapAngle(-22)).toBe(-15);
    expect(snapAngle(-23)).toBe(-30);
  });

  test('supports custom snap increments', () => {
    expect(snapAngle(25, 30)).toBe(30);
    expect(snapAngle(44, 30)).toBe(30);
    expect(snapAngle(46, 30)).toBe(60);
    expect(snapAngle(22, 45)).toBe(0);
    expect(snapAngle(23, 45)).toBe(45);
  });
});

describe('angleFromPivot', () => {
  test('calculates angle from pivot to point', () => {
    // Point directly right of pivot (0°)
    expect(angleFromPivot(0, 0, 10, 0)).toBeCloseTo(0);

    // Point directly above pivot (90°)
    expect(angleFromPivot(0, 0, 0, 10)).toBeCloseTo(90);

    // Point directly left of pivot (180° or -180°)
    const leftAngle = angleFromPivot(0, 0, -10, 0);
    expect(Math.abs(leftAngle)).toBeCloseTo(180);

    // Point directly below pivot (-90°)
    expect(angleFromPivot(0, 0, 0, -10)).toBeCloseTo(-90);

    // Point at 45° (top-right)
    expect(angleFromPivot(0, 0, 10, 10)).toBeCloseTo(45);

    // Point at 135° (top-left)
    expect(angleFromPivot(0, 0, -10, 10)).toBeCloseTo(135);

    // Point at -45° (bottom-right)
    expect(angleFromPivot(0, 0, 10, -10)).toBeCloseTo(-45);

    // Point at -135° (bottom-left)
    expect(angleFromPivot(0, 0, -10, -10)).toBeCloseTo(-135);
  });

  test('works with non-zero pivots', () => {
    // Pivot at (100, 100), point at (110, 100) => 0°
    expect(angleFromPivot(100, 100, 110, 100)).toBeCloseTo(0);

    // Pivot at (50, 50), point at (50, 60) => 90°
    expect(angleFromPivot(50, 50, 50, 60)).toBeCloseTo(90);
  });
});

describe('calculateDeltaAngle', () => {
  test('calculates simple delta', () => {
    expect(calculateDeltaAngle(45, 0)).toBe(45);
    expect(calculateDeltaAngle(90, 45)).toBe(45);
    expect(calculateDeltaAngle(0, 45)).toBe(-45);
  });

  test('handles wrap-around from positive to negative', () => {
    // From 170° to -170° is +20° (not -340°)
    expect(calculateDeltaAngle(-170, 170)).toBe(20);
    expect(calculateDeltaAngle(170, -170)).toBe(-20);
  });

  test('handles wrap-around at 180/-180 boundary', () => {
    expect(calculateDeltaAngle(-179, 179)).toBe(2);
    expect(calculateDeltaAngle(179, -179)).toBe(-2);
  });

  test('handles full rotation', () => {
    // Going from 0° to 360° (normalized to 0°) should be 0°
    expect(calculateDeltaAngle(0, 0)).toBe(0);
  });
});

describe('rotatePointAroundPivot', () => {
  test('rotates point 90° clockwise around origin', () => {
    const result = rotatePointAroundPivot(10, 0, 0, 0, 90);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(10, 5);
  });

  test('rotates point 180° around origin', () => {
    const result = rotatePointAroundPivot(10, 5, 0, 0, 180);
    expect(result.x).toBeCloseTo(-10, 5);
    expect(result.y).toBeCloseTo(-5, 5);
  });

  test('rotates point -90° counter-clockwise around origin', () => {
    const result = rotatePointAroundPivot(10, 0, 0, 0, -90);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(-10, 5);
  });

  test('rotates point around non-zero pivot', () => {
    // Point at (20, 10), pivot at (10, 10), rotate 90°
    // Relative position: (10, 0)
    // After 90° rotation: (0, 10)
    // Absolute position: (10, 20)
    const result = rotatePointAroundPivot(20, 10, 10, 10, 90);
    expect(result.x).toBeCloseTo(10, 5);
    expect(result.y).toBeCloseTo(20, 5);
  });

  test('rotating 360° returns original position', () => {
    const result = rotatePointAroundPivot(10, 5, 3, 2, 360);
    expect(result.x).toBeCloseTo(10, 5);
    expect(result.y).toBeCloseTo(5, 5);
  });

  test('rotating 0° returns original position', () => {
    const result = rotatePointAroundPivot(10, 5, 0, 0, 0);
    expect(result.x).toBeCloseTo(10, 5);
    expect(result.y).toBeCloseTo(5, 5);
  });
});
