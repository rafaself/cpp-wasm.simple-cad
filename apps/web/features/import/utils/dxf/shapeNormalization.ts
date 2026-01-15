/**
 * Shape bounds calculation and normalization utilities for DXF import.
 */
import { Shape, Point } from '../../../../types';

export interface BoundsResult {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Calculate bounds of all shapes. */
export function calculateBounds(shapes: Shape[]): BoundsResult {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of shapes) {
    if (s.points && s.points.length > 0) {
      for (const p of s.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    } else if (s.x !== undefined && s.y !== undefined) {
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Translate all shapes so origin is at (0,0). */
export function normalizeShapesToOrigin(shapes: Shape[], bounds: BoundsResult): void {
  if (bounds.minX === Infinity) return;
  const { minX, minY } = bounds;
  for (const s of shapes) {
    if (s.points && s.points.length > 0) {
      s.points = s.points.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    } else if (s.x !== undefined && s.y !== undefined) {
      s.x -= minX;
      s.y -= minY;
    }
  }
}

/** Normalize text shapes: bake scale magnitude into fontSize. */
export function normalizeTextScaling(shapes: Shape[]): void {
  for (const s of shapes) {
    if (s.type !== 'text' || !s.fontSize) continue;
    const rawScaleY = s.scaleY ?? -1;
    const scaleYAbs = Math.abs(rawScaleY);
    if (!isFinite(scaleYAbs) || scaleYAbs === 0) continue;
    const rawScaleX = s.scaleX ?? scaleYAbs;
    s.fontSize *= scaleYAbs;
    s.scaleX = rawScaleX / scaleYAbs;
    s.scaleY = rawScaleY < 0 ? -1 : 1;
  }
}
