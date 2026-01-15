/**
 * Cursor System Configuration
 *
 * This file centralizes all cursor-related settings for the editor,
 * including offsets, pivots, and handle-to-angle mappings.
 *
 * Philosophy:
 * - 1 SVG per cursor type (rotate, resize, move)
 * - Dynamic rotation via CSS transform
 * - Single source of truth for calibration
 *
 * IMPORTANT: Handle indices follow the engine contract defined in:
 * - docs/agents/handle-index-contract.md
 * - cpp/engine/interaction/interaction_constants.h
 *
 * Handle Index Order (Engine Authority):
 *   Corner: 0=BL, 1=BR, 2=TR, 3=TL (counter-clockwise from bottom-left)
 *   Side:   0=S, 1=E, 2=N, 3=W (starting from bottom)
 */

import {
  CORNER_HANDLE_CURSOR_ANGLES,
  SIDE_HANDLE_CURSOR_ANGLES,
} from './interaction-constants';

/**
 * Cursor asset paths
 */
export const CURSOR_ASSETS = {
  rotate: '/assets/cursor-rotate.svg',
  resize: '/assets/cursor-resize.svg', // Not currently in /assets, needs to be moved
  move: '/assets/cursor-move.svg', // Not currently in /assets, needs to be moved
  default: '/assets/cursor-canva-default.svg',
} as const;

/**
 * Cursor hotspot configuration
 *
 * The hotspot is the exact pixel coordinate in the SVG that should align with the mouse position.
 * These values are derived from analyzing the actual visual center of each SVG icon.
 *
 * Analysis:
 * - cursor-rotate.svg (24×24): Visual center at approximately (12, 12)
 * - cursor-resize.svg (18×18): Visual center at approximately (8.8, 7.8) due to path bounds (1.8, 0.8) to (15.77, 14.77)
 * - cursor-move.svg (20×20): Visual center at approximately (9.8, 8.8) due to asymmetric path distribution
 *
 * The hotspot coordinates are relative to the top-left of the SVG viewBox.
 * We use these to calculate the exact transform offset needed.
 */
export const CURSOR_DIMENSIONS = {
  rotate: {
    width: 24,
    height: 24,
    // Visual hotspot in SVG coordinates
    hotspotX: 12,
    hotspotY: 12,
  },
  resize: {
    width: 18,
    height: 18,
    // Visual hotspot calculated from path bounds: (1.8 + 15.77) / 2, (0.8 + 14.77) / 2
    hotspotX: 8.785,
    hotspotY: 7.785,
  },
  move: {
    width: 20,
    height: 20,
    // Visual hotspot at the intersection of the 4 arrows
    hotspotX: 9.8,
    hotspotY: 8.8,
  },
} as const;

/**
 * Base angle offsets for cursor rotation
 *
 * These offsets compensate for the base orientation of each SVG asset.
 *
 * Rotate cursor (cursor-rotate.svg):
 * - SVG visual: Arrow curving counter-clockwise pointing upper-left (~135°)
 * - The arrow "tip" visually points toward the direction of rotation
 * - When mouse is at angle θ from center, cursor should point tangentially
 * - Offset = 40° aligns the curved arrow with the tangent direction
 * - Formula: cursorRotation = atan2(dy, dx) + offset
 *
 * Resize cursor (cursor-resize.svg):
 * - SVG base orientation: Diagonal NW-SE (135°)
 * - Offset: -135° normalizes to 0° for east-pointing horizontal handles
 * - Formula: cursorRotation = handleBaseAngle + offset
 */
export const CURSOR_ANGLE_OFFSETS = {
  /**
   * Rotation cursor offset.
   * The cursor-rotate.svg base orientation (0°) is at the top-right corner.
   */
  rotate: 0,
  /**
   * Resize cursor offset.
   * The cursor-resize.svg points NW-SE (135°), so we subtract 135°
   * to normalize: when handle angle is 0° (East), cursor points horizontal.
   */
  resize: -45,
} as const;

/**
 * Resize handle types
 */
export type ResizeHandleType = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

/**
 * Handle-to-angle mapping for resize cursors
 *
 * Maps each resize handle to its base angle (before applying SVG offset).
 * These angles represent the direction of resizing in screen space.
 *
 * Convention:
 * - 0° = East (right)
 * - 90° = South (down)
 * - 180° = West (left)
 * - 270° = North (up)
 */
export const RESIZE_HANDLE_ANGLES: Record<ResizeHandleType, number> = {
  e: 0, // horizontal →
  ne: 45, // diagonal ↗
  n: 90, // vertical ↑
  nw: 135, // diagonal ↖
  w: 180, // horizontal ←
  sw: 225, // diagonal ↙
  s: 270, // vertical ↓
  se: 315, // diagonal ↘
};

/**
 * Calculate final rotation angle for a resize handle
 *
 * Uses the engine handle index contract:
 * - Corners: 0=BL, 1=BR, 2=TR, 3=TL (counter-clockwise from bottom-left)
 * - Sides: 4=S, 5=E, 6=N, 7=W (starting from bottom, offset by 4)
 *
 * @param handle - The resize handle type or numeric index from engine
 * @returns The final angle to apply to the cursor (in degrees)
 */
export function getResizeCursorAngle(handle: ResizeHandleType | number): number {
  let baseAngle: number;

  if (typeof handle === 'number') {
    if (handle >= 4) {
      // Sides: 4=S, 5=E, 6=N, 7=W
      // Use centralized constants from interaction-constants.ts
      const sideIndex = handle - 4;
      baseAngle = SIDE_HANDLE_CURSOR_ANGLES[sideIndex] ?? 90;
    } else {
      // Corners: 0=BL, 1=BR, 2=TR, 3=TL
      // Use centralized constants from interaction-constants.ts
      baseAngle = CORNER_HANDLE_CURSOR_ANGLES[handle] ?? 45;
    }
  } else {
    baseAngle = RESIZE_HANDLE_ANGLES[handle];
  }

  return baseAngle + CURSOR_ANGLE_OFFSETS.resize;
}

/**
 * Base angles for rotation cursor based on corner handle index.
 * The rotation cursor icon at 0° CSS rotation is designed for the TR (top-right) corner.
 *
 * Handle indices (from engine contract):
 *   0 = BL (Bottom-Left)
 *   1 = BR (Bottom-Right)
 *   2 = TR (Top-Right) → base 0°
 *   3 = TL (Top-Left)
 *
 * Each corner is 90° apart, going counter-clockwise from TR.
 */
const ROTATION_HANDLE_CURSOR_ANGLES: Record<number, number> = {
  0: 180,  // BL - opposite to TR
  1: 90,   // BR - 90° clockwise from TR
  2: 0,    // TR - base orientation
  3: 270,  // TL - 90° counter-clockwise from TR (or -90°)
};

/**
 * Calculate rotation cursor angle based on handle index.
 *
 * Uses fixed angles per corner handle, ensuring the cursor icon
 * appears in the correct orientation for each corner position.
 *
 * @param handleIndex - Rotation handle index (0=BL, 1=BR, 2=TR, 3=TL)
 * @param entityRotationDeg - Entity rotation in degrees
 * @returns The final angle to apply to the cursor (in degrees)
 */
export function getRotationCursorAngleForHandle(
  handleIndex: number,
  entityRotationDeg: number = 0,
): number {
  const baseAngle = ROTATION_HANDLE_CURSOR_ANGLES[handleIndex] ?? 0;
  // Subtract entity rotation to make cursor rotate with the shape (Figma-like)
  return baseAngle - entityRotationDeg;
}

/**
 * Calculate rotation cursor angle from mouse position (legacy/fallback)
 *
 * @param centerScreen - Center of the selected object (screen coordinates)
 * @param mouseScreen - Current mouse position (screen coordinates)
 * @returns The final angle to apply to the cursor (in degrees)
 */
export function getRotationCursorAngle(
  centerScreen: { x: number; y: number },
  mouseScreen: { x: number; y: number },
): number {
  const vx = mouseScreen.x - centerScreen.x;
  const vy = mouseScreen.y - centerScreen.y;

  const angleRad = Math.atan2(vy, vx);
  const angleDeg = angleRad * (180 / Math.PI);

  return angleDeg + CURSOR_ANGLE_OFFSETS.rotate;
}

/**
 * Base angles for resize handles pointing TOWARD the center.
 * These represent the direction from handle to center in screen coordinates (Y-down).
 *
 * Screen coordinate convention:
 *   0° = right, 90° = down, 180° = left, -90°/270° = up
 *
 * Corner handles (diagonal toward center):
 *   BL (bottom-left): toward center is up-right → -45° (or 315°)
 *   BR (bottom-right): toward center is up-left → -135° (or 225°)
 *   TR (top-right): toward center is down-left → 135°
 *   TL (top-left): toward center is down-right → 45°
 *
 * Side handles (perpendicular to edge, toward center):
 *   N (top): toward center is down → 90°
 *   S (bottom): toward center is up → -90° (or 270°)
 *   E (right): toward center is left → 180°
 *   W (left): toward center is right → 0°
 */
const HANDLE_TO_CENTER_ANGLES: Record<number, number> = {
  // Corners (indices 0-3, from engine pick)
  0: -45,   // BL → up-right
  1: -135,  // BR → up-left
  2: 135,   // TR → down-left
  3: 45,    // TL → down-right
  // Sides using ENGINE indices (0-3, from SIDE_HANDLE_TO_ENGINE_INDEX: S=0, E=1, N=2, W=3)
  // These are offset by 100 to avoid collision with corner indices
  // Use helper function to map engine side index → angle
};

/**
 * Engine side handle index to angle mapping.
 * Engine uses: S=0, E=1, N=2, W=3
 */
const ENGINE_SIDE_TO_CENTER_ANGLES: Record<number, number> = {
  0: -90,   // S → up
  1: 180,   // E → left
  2: 90,    // N → down
  3: 0,     // W → right
};

/**
 * Frontend side handle index to angle mapping.
 * Frontend uses: N=4, E=5, S=6, W=7 (from SIDE_HANDLE_INDICES)
 */
const FRONTEND_SIDE_TO_CENTER_ANGLES: Record<number, number> = {
  4: 90,    // N → down
  5: 180,   // E → left
  6: -90,   // S → up
  7: 0,     // W → right
};

/**
 * Calculate resize cursor angle for a given handle.
 *
 * The cursor orientation is derived from the geometric relationship between
 * the handle position and the selection center. For each handle, there is a
 * fixed direction "toward center" that determines the cursor orientation.
 *
 * Entity rotation is applied to rotate the cursor along with the shape,
 * achieving Figma-like behavior where the cursor rotates with the object.
 *
 * @param handleIndex - Handle index. Can be:
 *   - 0-3 for corners (BL, BR, TR, TL)
 *   - 4-7 for sides using frontend indices (N=4, E=5, S=6, W=7)
 * @param entityRotationDeg - Entity rotation in degrees (from engine, CCW positive in Y-up)
 * @param isEngineSideIndex - If true and handleIndex is 0-3, treat as engine side index (S=0, E=1, N=2, W=3)
 * @returns The final angle to apply to the cursor CSS transform (in degrees)
 */
export function getResizeCursorAngleForHandle(
  handleIndex: number,
  entityRotationDeg: number = 0,
  isEngineSideIndex: boolean = false,
): number {
  let baseAngle: number = 0;

  if (isEngineSideIndex && handleIndex >= 0 && handleIndex <= 3) {
    // Engine side index: S=0, E=1, N=2, W=3
    baseAngle = ENGINE_SIDE_TO_CENTER_ANGLES[handleIndex] ?? 0;
  } else if (handleIndex >= 4 && handleIndex <= 7) {
    // Frontend side index: N=4, E=5, S=6, W=7
    baseAngle = FRONTEND_SIDE_TO_CENTER_ANGLES[handleIndex] ?? 0;
  } else if (handleIndex >= 0 && handleIndex <= 3) {
    // Corner index: BL=0, BR=1, TR=2, TL=3
    baseAngle = HANDLE_TO_CENTER_ANGLES[handleIndex] ?? 0;
  } else {
    baseAngle = 0;
  }

  // Apply SVG offset to align the diagonal cursor asset with the direction
  // cursor-resize.svg has arrows at 135° (NW-SE diagonal)
  // Offset of -135° normalizes this to 0° when we want horizontal
  // Additional 90° rotation to correct cursor orientation
  const cursorAngle = baseAngle + CURSOR_ANGLE_OFFSETS.resize;

  // Apply entity rotation (engine uses CCW in Y-up, CSS uses CW in Y-down)
  // The Y-flip means we need to negate the rotation for screen space
  // But CSS transform rotate is CW-positive, so we add the negated value
  return cursorAngle - entityRotationDeg;
}

/**
 * Normalize angle to -180..180 range
 */
export function normalizeAngle(angle: number): number {
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}
