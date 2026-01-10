/**
 * @file interaction-constants.ts
 * @description Centralized constants for interaction system.
 *
 * This file MUST mirror the values in cpp/engine/interaction/interaction_constants.h
 * The C++ engine is the SOURCE OF TRUTH. Any changes there must be reflected here.
 *
 * Handle Index Order (Engine Authority):
 *   0 = Bottom-Left (BL)
 *   1 = Bottom-Right (BR)
 *   2 = Top-Right (TR)
 *   3 = Top-Left (TL)
 *
 * Side Handle Index:
 *   0 = South (Bottom)
 *   1 = East (Right)
 *   2 = North (Top)
 *   3 = West (Left)
 */

// =============================================================================
// Pick/Hit-test Tolerances (in screen pixels, converted to world via viewScale)
// =============================================================================

/** Tolerance for general picking (body, edges, vertices) */
export const PICK_TOLERANCE_PX = 10;

/** Size of resize handle hit area (half-width of square handle) */
export const RESIZE_HANDLE_SIZE_PX = 5;

/** Diagonal offset from corner to rotation handle center */
export const ROTATE_HANDLE_OFFSET_PX = 15;

/** Radius of rotation handle hit area */
export const ROTATE_HANDLE_RADIUS_PX = 10;

// =============================================================================
// Drag Thresholds (in screen pixels)
// =============================================================================

/** Minimum drag distance to start a transform (prevents accidental moves on click) */
export const DRAG_THRESHOLD_PX = 3;

/** Minimum delta for axis lock detection */
export const AXIS_LOCK_MIN_DELTA_PX = 4;

// =============================================================================
// Axis Lock Ratios
// =============================================================================

/** Ratio threshold to enter axis lock mode (delta_major / delta_minor) */
export const AXIS_LOCK_ENTER_RATIO = 1.1;

/** Ratio threshold to switch axis lock direction */
export const AXIS_LOCK_SWITCH_RATIO = 1.2;

// =============================================================================
// Rotation Snapping
// =============================================================================

/** Angle increment for shift-snap rotation (in degrees) */
export const ROTATION_SNAP_DEGREES = 15;

/** Angle increment for vertex/line shift-snap (in radians, 45°) */
export const VERTEX_SNAP_ANGLE_RAD = Math.PI / 4;

// =============================================================================
// Side Handle Resize
// =============================================================================

/** Corner exclusion zone factor for side handles (prevents overlap with corner handles) */
export const SIDE_HANDLE_CORNER_EXCLUSION_FACTOR = 1.5;

// =============================================================================
// Visual Rendering
// =============================================================================

/** Default stroke width for selection overlay (in pixels) */
export const SELECTION_STROKE_WIDTH_PX = 1;

/** Handle square size for rendering (in pixels) */
export const HANDLE_RENDER_SIZE_PX = 8;

// =============================================================================
// Handle Index Constants (Engine Authority)
// =============================================================================

/** Corner handle indices (clockwise from bottom-left) */
export const CornerIndex = {
  BOTTOM_LEFT: 0,
  BOTTOM_RIGHT: 1,
  TOP_RIGHT: 2,
  TOP_LEFT: 3,
} as const;

/** Side handle indices */
export const SideIndex = {
  SOUTH: 0, // Bottom
  EAST: 1, // Right
  NORTH: 2, // Top
  WEST: 3, // Left
} as const;

/** Base angles for cursor direction (degrees, 0° = East/Right) */
export const CursorBaseAngle = {
  BOTTOM_LEFT: 225, // SW diagonal
  BOTTOM_RIGHT: 315, // SE diagonal
  TOP_RIGHT: 45, // NE diagonal
  TOP_LEFT: 135, // NW diagonal
  SOUTH: 270, // Down
  EAST: 0, // Right
  NORTH: 90, // Up
  WEST: 180, // Left
} as const;

/**
 * Get base angle for corner handle cursor
 * @param cornerIndex - Handle index (0=BL, 1=BR, 2=TR, 3=TL)
 * @returns Base angle in degrees
 */
export function getCornerBaseAngle(cornerIndex: number): number {
  switch (cornerIndex) {
    case CornerIndex.BOTTOM_LEFT:
      return CursorBaseAngle.BOTTOM_LEFT;
    case CornerIndex.BOTTOM_RIGHT:
      return CursorBaseAngle.BOTTOM_RIGHT;
    case CornerIndex.TOP_RIGHT:
      return CursorBaseAngle.TOP_RIGHT;
    case CornerIndex.TOP_LEFT:
      return CursorBaseAngle.TOP_LEFT;
    default:
      return CursorBaseAngle.TOP_RIGHT;
  }
}

/**
 * Get base angle for side handle cursor
 * @param sideIndex - Side index (0=S, 1=E, 2=N, 3=W)
 * @returns Base angle in degrees
 */
export function getSideBaseAngle(sideIndex: number): number {
  switch (sideIndex) {
    case SideIndex.SOUTH:
      return CursorBaseAngle.SOUTH;
    case SideIndex.EAST:
      return CursorBaseAngle.EAST;
    case SideIndex.NORTH:
      return CursorBaseAngle.NORTH;
    case SideIndex.WEST:
      return CursorBaseAngle.WEST;
    default:
      return CursorBaseAngle.NORTH;
  }
}

// =============================================================================
// Cursor Angle Arrays (indexed by handle index)
// =============================================================================

/**
 * Base cursor angles for corner handles, indexed by handle index.
 * Index order: 0=BL(225°), 1=BR(315°), 2=TR(45°), 3=TL(135°)
 */
export const CORNER_HANDLE_CURSOR_ANGLES = [
  CursorBaseAngle.BOTTOM_LEFT, // 0: BL -> 225° (SW diagonal)
  CursorBaseAngle.BOTTOM_RIGHT, // 1: BR -> 315° (SE diagonal)
  CursorBaseAngle.TOP_RIGHT, // 2: TR -> 45° (NE diagonal)
  CursorBaseAngle.TOP_LEFT, // 3: TL -> 135° (NW diagonal)
] as const;

/**
 * Base cursor angles for side handles, indexed by side index.
 * Index order: 0=S(270°), 1=E(0°), 2=N(90°), 3=W(180°)
 */
export const SIDE_HANDLE_CURSOR_ANGLES = [
  CursorBaseAngle.SOUTH, // 0: S -> 270° (Down)
  CursorBaseAngle.EAST, // 1: E -> 0° (Right)
  CursorBaseAngle.NORTH, // 2: N -> 90° (Up)
  CursorBaseAngle.WEST, // 3: W -> 180° (Left)
] as const;
