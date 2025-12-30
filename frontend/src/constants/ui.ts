/**
 * UI constraints, dimensions and grid settings.
 * NO COLORS here.
 */

export const UI = {
  /** Handle size for selection/resize handles */
  HANDLE_SIZE_PX: 10,
  /** Zoom fit padding */
  ZOOM_FIT_PADDING_PX: 50,
  /** Max zoom level */
  MAX_ZOOM_SCALE: 5,
  /** Min zoom level (5%) */
  MIN_ZOOM_SCALE: 0.05,
} as const;

export const GRID = {
  DEFAULT_SIZE_WU: 100,
  MIN_SIZE_WU: 10,
  MAX_SIZE_WU: 500,
  // Color removed (moved to theme.css/tokens)
} as const;
