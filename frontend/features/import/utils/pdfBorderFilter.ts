import type { Shape } from '../../../types';
import { getShapeBoundingBox } from '../../../utils/geometry';

export interface PdfBorderFilterOptions {
  /**
   * When enabled, removes likely page/frame borders that match the overall extents.
   * Disabled by default (user-controlled via Import Options).
   */
  enabled: boolean;
}

const isTransparent = (color: string | undefined): boolean => !color || color === 'transparent' || color === 'none';

const approxEqual = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

const isClosedPolyline = (shape: Shape): boolean => {
  if (shape.type !== 'polyline') return false;
  const pts = shape.points ?? [];
  if (pts.length < 4) return false;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
};

/**
 * Removes outer frame/border shapes from PDF imports. This is intentionally conservative.
 */
export const removePdfBorderShapes = (shapes: readonly Shape[], options: PdfBorderFilterOptions): Shape[] => {
  if (!options.enabled) return [...shapes];
  if (shapes.length === 0) return [];

  // Compute global bounds for all shapes.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shapes.forEach((s) => {
    const b = getShapeBoundingBox(s);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return [...shapes];

  const totalW = Math.max(1, maxX - minX);
  const totalH = Math.max(1, maxY - minY);

  // Tolerance: allow small numeric drift and stroke thickness.
  const tol = Math.max(2, Math.min(totalW, totalH) * 0.005); // 0.5% of smaller dim, min 2

  const isLikelyBorder = (s: Shape): boolean => {
    // Borders are typically strokes with no fill.
    const strokeEnabled = s.strokeEnabled !== false && !isTransparent(s.strokeColor);
    const fillEnabled = s.fillEnabled !== false && !isTransparent(s.fillColor);
    if (!strokeEnabled) return false;
    if (fillEnabled) return false;

    // Only consider rect containers without svgRaw, or closed polylines.
    const isRect = s.type === 'rect' && !s.svgRaw;
    const isClosed = isClosedPolyline(s);
    if (!isRect && !isClosed) return false;

    const b = getShapeBoundingBox(s);
    // Must match global extents closely.
    return (
      approxEqual(b.x, minX, tol) &&
      approxEqual(b.y, minY, tol) &&
      approxEqual(b.x + b.width, maxX, tol) &&
      approxEqual(b.y + b.height, maxY, tol)
    );
  };

  // Remove at most one border candidate (avoid deleting real geometry accidentally).
  let removed = false;
  const next: Shape[] = [];
  for (const s of shapes) {
    if (!removed && isLikelyBorder(s)) {
      removed = true;
      continue;
    }
    next.push(s);
  }
  return next;
};

