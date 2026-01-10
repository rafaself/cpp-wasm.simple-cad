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
   * The cursor-rotate.svg has its visual "rotation direction" pointing
   * approximately 40° off from the mathematical tangent.
   */
  rotate: 40,
  /**
   * Resize cursor offset.
   * The cursor-resize.svg points NW-SE (135°), so we subtract 135°
   * to normalize: when handle angle is 0° (East), cursor points horizontal.
   */
  resize: -135,
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
 * Calculate rotation cursor angle from mouse position
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
 * Normalize angle to -180..180 range
 */
export function normalizeAngle(angle: number): number {
  while (angle > 180) angle -= 360;
  while (angle < -180) angle += 360;
  return angle;
}
