/**
 * Angle normalization and manipulation utilities for rotation transforms.
 * Follows Figma convention: angles are normalized to -180..180 range.
 */

/**
 * Normalize angle to -180..180 degree range (Figma convention)
 * @param deg - Angle in degrees (can be any value)
 * @returns Normalized angle in -180..180 range
 *
 * Examples:
 * - normalizeAngle(0) => 0
 * - normalizeAngle(270) => -90
 * - normalizeAngle(-270) => 90
 * - normalizeAngle(360) => 0
 */
export function normalizeAngle(deg: number): number {
  // Wrap to (-180, 180] range (excluding -180, including 180)
  let normalized = deg % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  // Handle -0 case
  return normalized === 0 ? 0 : normalized;
}

/**
 * Snap angle to nearest increment
 * @param angleDeg - Angle in degrees
 * @param snapIncrement - Snap increment in degrees (default: 15)
 * @returns Snapped angle
 *
 * Examples:
 * - snapAngle(7, 15) => 0
 * - snapAngle(8, 15) => 15
 * - snapAngle(37, 15) => 30
 */
export function snapAngle(angleDeg: number, snapIncrement: number = 15): number {
  const snapped = Math.round(angleDeg / snapIncrement) * snapIncrement;
  // Handle -0 case
  return snapped === 0 ? 0 : snapped;
}

/**
 * Calculate angle from pivot to point (in degrees)
 * @param pivotX - Pivot X coordinate
 * @param pivotY - Pivot Y coordinate
 * @param pointX - Point X coordinate
 * @param pointY - Point Y coordinate
 * @returns Angle in degrees (-180..180)
 */
export function angleFromPivot(
  pivotX: number,
  pivotY: number,
  pointX: number,
  pointY: number,
): number {
  const dx = pointX - pivotX;
  const dy = pointY - pivotY;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Calculate delta angle, handling wrap-around at -180/180 boundary
 * @param currentAngle - Current angle in degrees
 * @param startAngle - Start angle in degrees
 * @returns Delta angle in degrees (-180..180)
 */
export function calculateDeltaAngle(currentAngle: number, startAngle: number): number {
  let delta = currentAngle - startAngle;
  // Handle wrap-around (when crossing -180/180 boundary)
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/**
 * Rotate a point around a pivot by the given angle
 * @param px - Point X coordinate
 * @param py - Point Y coordinate
 * @param pivotX - Pivot X coordinate
 * @param pivotY - Pivot Y coordinate
 * @param angleDeg - Rotation angle in degrees
 * @returns Rotated point {x, y}
 */
export function rotatePointAroundPivot(
  px: number,
  py: number,
  pivotX: number,
  pivotY: number,
  angleDeg: number,
): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const dx = px - pivotX;
  const dy = py - pivotY;

  return {
    x: pivotX + dx * cos - dy * sin,
    y: pivotY + dx * sin + dy * cos,
  };
}
