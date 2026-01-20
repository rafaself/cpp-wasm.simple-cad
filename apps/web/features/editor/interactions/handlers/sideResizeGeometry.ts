/**
 * Side-handle resize geometry calculations with flip support
 *
 * This module provides pure functions for calculating geometry during side-handle
 * resize operations, including support for flipping when crossing the opposite edge.
 *
 * Mathematical Approach:
 * - Uses anchor-based calculation (similar to corner flip in engine)
 * - Anchor point is fixed on the opposite edge
 * - Drag point moves with the handle
 * - New dimensions calculated using min/max of anchor and drag
 * - Scale determined by comparing drag direction to anchor
 */

export type ResizeAxis = 'horizontal' | 'vertical';

export type SideResizeInput = {
  /** Starting dimension (width or height) */
  startDimension: number;
  /** Delta in local space (localDx or localDy) */
  localDelta: number;
  /** Is resize symmetric (Alt key) */
  isSymmetric: boolean;
  /** Is handle on positive side (E or S) vs negative side (W or N) */
  isPositiveSide: boolean;
  /** Minimum allowed dimension */
  minSize: number;
};

export type SideResizeOutput = {
  /** New dimension (always positive) */
  newDimension: number;
  /** Scale factor: 1 for normal, -1 for flipped */
  scale: number;
  /** Center shift in local space (0 for symmetric resize) */
  centerShift: number;
};

/**
 * Calculate side-handle resize with flip support
 *
 * This function handles both symmetric (Alt key) and asymmetric resize,
 * automatically detecting when the handle crosses the opposite edge and
 * applying appropriate flip transformation.
 *
 * Coordinate System:
 * - Local space: shape center at origin (0, 0)
 * - Positive axis: right (X) or down (Y)
 * - Handle positions: ±dimension/2
 *
 * @param input - Resize input parameters
 * @returns Calculated geometry including dimension, scale, and center shift
 */
export function calculateSideResize(input: SideResizeInput): SideResizeOutput {
  const { startDimension, localDelta, isSymmetric, isPositiveSide, minSize } = input;

  if (isSymmetric) {
    // Symmetric resize: anchor at center, both sides move
    // Example: drag E handle right → both E and W edges move outward

    const halfDim = startDimension / 2;

    // Drag point: original edge position + delta
    // For positive side (E/S): halfDim + delta
    // For negative side (W/N): -(halfDim + delta) = -halfDim - delta
    const dragPoint = isPositiveSide ? halfDim + localDelta : -(halfDim + localDelta);

    // New dimension is 2 * distance from center
    const halfWidth = Math.abs(dragPoint);
    const newDimension = Math.max(minSize, halfWidth * 2);

    // Scale: positive if drag is on positive side of center, negative otherwise
    const scale = dragPoint >= 0 ? 1 : -1;

    // Center doesn't move in symmetric mode
    const centerShift = 0;

    return { newDimension, scale, centerShift };
  } else {
    // Asymmetric resize: anchor on opposite edge
    // Example: drag E handle → W edge stays fixed

    const halfDim = startDimension / 2;

    // Anchor: fixed point on opposite edge
    // For positive side (E/S): anchor is negative edge (-halfDim)
    // For negative side (W/N): anchor is positive edge (+halfDim)
    const anchor = isPositiveSide ? -halfDim : halfDim;

    // Drag point: original edge position + delta
    const drag = isPositiveSide ? halfDim + localDelta : -halfDim + localDelta;

    // Use min/max to handle crossing (flip)
    // This automatically gives us the bounding box regardless of drag direction
    const minEdge = Math.min(anchor, drag);
    const maxEdge = Math.max(anchor, drag);

    // New dimension from bounding box
    const newDimension = Math.max(minSize, maxEdge - minEdge);

    // Scale: Determine if we have flipped relative to the original orientation
    // We are "normal" (scale 1) if the drag point is on the correct side of the anchor:
    // - Positive handle (E/S): Drag should be > Anchor (to the right/bottom)
    // - Negative handle (W/N): Drag should be < Anchor (to the left/top)
    // If we cross the anchor, we are flipped (scale -1).
    const isNormalOrientation = isPositiveSide ? drag >= anchor : drag <= anchor;
    const scale = isNormalOrientation ? 1 : -1;

    // New center position in local space
    // Center is midpoint of bounding box
    const newCenter = (minEdge + maxEdge) / 2;

    // Center shift from original center (which was at 0 in local space)
    const centerShift = newCenter;

    return { newDimension, scale, centerShift };
  }
}

/**
 * Transform a local space shift to world coordinates
 *
 * Applies rotation transformation to convert a shift from local shape space
 * to world coordinates.
 *
 * @param shiftLocal - Shift vector in local space [x, y]
 * @param rotationRad - Shape rotation in radians
 * @returns Shift vector in world space [x, y]
 */
export function localToWorldShift(
  shiftLocal: { x: number; y: number },
  rotationRad: number,
): { x: number; y: number } {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);

  return {
    x: shiftLocal.x * cos - shiftLocal.y * sin,
    y: shiftLocal.x * sin + shiftLocal.y * cos,
  };
}
