import type { ViewTransform, Point } from '@/types';
import { screenToWorld } from '@/utils/geometry';

/**
 * Convert screen coordinates to world coordinates.
 */
export const toWorldPoint = (
  screenX: number,
  screenY: number,
  viewTransform: ViewTransform,
  rectLeft: number = 0,
  rectTop: number = 0
): Point => {
  const screen = { x: screenX - rectLeft, y: screenY - rectTop };
  return screenToWorld(screen, viewTransform);
};

/**
 * Snap a point to the nearest grid intersection.
 */
export const snapToGrid = (p: Point, gridSize: number): Point => {
  if (!gridSize || gridSize <= 0) return p;
  return { x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
};

/**
 * Clamp tiny values to zero (for floating point stability).
 */
export const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

/**
 * Determine if a movement qualifies as a drag (vs click).
 */
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > 2;

/**
 * Get cursor CSS for current tool.
 */
export const getCursorForTool = (tool: string, cursorOverride?: string | null): string => {
  if (cursorOverride) return cursorOverride;
  if (tool === 'pan') return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'move' || tool === 'rotate') return 'default';
  return 'crosshair';
};
