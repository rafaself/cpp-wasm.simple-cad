/**
 * Interaction tolerances and thresholds (World Units or Screen Pixels).
 * Pure numeric constants, no colors.
 */

export const INTERACTION = {
  /** Tolerance in world units for connecting lines during join */
  JOIN_TOLERANCE_WU: 10,
  /** Screen-space tolerance for hit testing shapes (px) */
  HIT_TOLERANCE_PX: 10,
  /** Threshold for snap point detection (scaled by zoom) */
  SNAP_THRESHOLD_PX: 20,
  /** Minimum size for shapes during resize (world/screen mixed? usually world) */
  MIN_SHAPE_SIZE_WU: 5,
  /** Default radius for single-click shape creation (world units) */
  DEFAULT_SHAPE_SIZE_WU: 50,
  /** Single click distance threshold (px) */
  SINGLE_CLICK_THRESHOLD_PX: 5,
} as const;

export const HISTORY = {
  /** Maximum undo/redo history entries */
  LIMIT_COUNT: 50,
} as const;
