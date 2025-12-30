/**
 * PDF Matrix and color utilities for PDF import.
 */
import { Point } from '../../../types';

export type Matrix = [number, number, number, number, number, number];
export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

export const multiplyMatrix = (m1: Matrix, m2: Matrix): Matrix => {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
};

export const applyMatrix = (p: Point, m: Matrix): Point => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

export const scaleFromMatrix = (m: Matrix): number => {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return 1;
  return (sx + sy) / 2;
};

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const toHex2From01 = (v01: number): string =>
  Math.round(clamp01(v01) * 255)
    .toString(16)
    .padStart(2, '0');

export const formatColor = (args: number[]): string => {
  if (args.length === 1) {
    const h = toHex2From01(args[0]);
    return `#${h}${h}${h}`;
  }
  if (args.length === 3) {
    return `#${toHex2From01(args[0])}${toHex2From01(args[1])}${toHex2From01(args[2])}`;
  }
  if (args.length === 4) {
    const c = clamp01(args[0]),
      m = clamp01(args[1]),
      y = clamp01(args[2]),
      k = clamp01(args[3]);
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    return `#${Math.min(255, Math.max(0, r)).toString(16).padStart(2, '0')}${Math.min(255, Math.max(0, g)).toString(16).padStart(2, '0')}${Math.min(255, Math.max(0, b)).toString(16).padStart(2, '0')}`;
  }
  return '#000000';
};

export const isNearWhiteHex = (hex: string): boolean => {
  if (!hex.startsWith('#') || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r >= 242 && g >= 242 && b >= 242;
};
