/**
 * Interaction Helper Utilities
 * Pure functions extracted from EngineInteractionLayer for reusability.
 */

import type { ViewTransform, Point } from '@/types';
import { screenToWorld } from '@/utils/viewportMath';

/**
 * Convert pointer event to world coordinates.
 */
export const toWorldPoint = (
  evt: React.PointerEvent<HTMLDivElement>,
  viewTransform: ViewTransform,
): Point => {
  const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
  const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  return screenToWorld(screen, viewTransform);
};

/**
 * Clamp tiny values to zero (for floating point stability).
 */
export const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

/**
 * Snap a point to the nearest grid intersection.
 */
export const snapToGrid = (p: Point, gridSize: number): Point => {
  if (!gridSize || gridSize <= 0) return p;
  return { x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
};

/**
 * Determine if a movement qualifies as a drag (vs click).
 */
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > 2;

/**
 * Get cursor CSS for current tool.
 */
export const getCursorForTool = (tool: string): string => {
  if (tool === 'pan') return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'move' || tool === 'rotate') return 'default';
  return 'crosshair';
};
