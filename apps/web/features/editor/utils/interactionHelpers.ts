/**
 * Interaction Helper Utilities
 * Pure functions extracted from EngineInteractionLayer for reusability.
 *
 * Note: toWorldPoint removed - use runtime.viewport.screenToWorldWithTransform instead.
 * Coordinate transformations should go through the runtime layer per engine-first principles.
 */

import type { ViewTransform, Point } from '@/types';

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
export const getCursorForTool = (tool: string): string => {
  if (tool === 'pan') return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'move' || tool === 'rotate') return 'default';
  return 'crosshair';
};
