/**
 * ViewportSystem
 *
 * Handles viewport-related coordinate transformations and tolerance calculations.
 * This ensures all screen↔world conversions and tolerance queries go through
 * the runtime, preventing feature layer from doing geometry math.
 *
 * Engine-First Principle: All geometric calculations belong in the runtime layer,
 * not in UI handlers.
 */

import type { Point, ViewTransform } from '@/types';

export class ViewportSystem {
  private currentTransform: ViewTransform = { x: 0, y: 0, scale: 1 };

  /**
   * Update the current viewport transform.
   * Should be called whenever the viewport changes.
   */
  setViewTransform(transform: ViewTransform): void {
    this.currentTransform = transform;
  }

  /**
   * Get the current viewport transform.
   */
  getViewTransform(): ViewTransform {
    return { ...this.currentTransform };
  }

  /**
   * Convert screen coordinates to world coordinates.
   * Uses the current viewport transform.
   */
  screenToWorld(point: Point): Point {
    const transform = this.currentTransform;
    return {
      x: (point.x - transform.x) / transform.scale,
      y: -(point.y - transform.y) / transform.scale,
    };
  }

  /**
   * Convert screen coordinates to world coordinates with explicit transform.
   * Use this when you have a specific transform context.
   */
  screenToWorldWithTransform(point: Point, transform: ViewTransform): Point {
    return {
      x: (point.x - transform.x) / transform.scale,
      y: -(point.y - transform.y) / transform.scale,
    };
  }

  /**
   * Convert world coordinates to screen coordinates.
   * Uses the current viewport transform.
   */
  worldToScreen(point: Point): Point {
    const transform = this.currentTransform;
    return {
      x: point.x * transform.scale + transform.x,
      y: -point.y * transform.scale + transform.y,
    };
  }

  /**
   * Convert world coordinates to screen coordinates with explicit transform.
   * Use this when you have a specific transform context.
   */
  worldToScreenWithTransform(point: Point, transform: ViewTransform): Point {
    return {
      x: point.x * transform.scale + transform.x,
      y: -point.y * transform.scale + transform.y,
    };
  }

  /**
   * Get the picking tolerance in world coordinates.
   * This is the distance threshold for considering a click to "hit" an entity.
   *
   * @param screenTolerancePx - Tolerance in screen pixels (default: 10px)
   * @returns Tolerance in world coordinates
   */
  getPickingTolerance(screenTolerancePx: number = 10): number {
    return screenTolerancePx / (this.currentTransform.scale || 1);
  }

  /**
   * Get the picking tolerance with explicit transform.
   *
   * @param transform - Viewport transform to use
   * @param screenTolerancePx - Tolerance in screen pixels (default: 10px)
   * @returns Tolerance in world coordinates
   */
  getPickingToleranceWithTransform(
    transform: ViewTransform,
    screenTolerancePx: number = 10,
  ): number {
    return screenTolerancePx / (transform.scale || 1);
  }

  /**
   * Get the snap tolerance in world coordinates.
   * This is the distance threshold for snapping to grid or other entities.
   *
   * @param screenTolerancePx - Tolerance in screen pixels (default: 8px)
   * @returns Tolerance in world coordinates
   */
  getSnapTolerance(screenTolerancePx: number = 8): number {
    return screenTolerancePx / (this.currentTransform.scale || 1);
  }

  /**
   * Get the current viewport scale.
   */
  getScale(): number {
    return this.currentTransform.scale;
  }

  /**
   * Check if a point in world coordinates is within tolerance of a target point.
   *
   * @param point - Point to check
   * @param target - Target point
   * @param screenTolerancePx - Tolerance in screen pixels (default: 10px)
   * @returns True if within tolerance
   */
  isWithinTolerance(point: Point, target: Point, screenTolerancePx: number = 10): boolean {
    const tolerance = this.getPickingTolerance(screenTolerancePx);
    const dx = point.x - target.x;
    const dy = point.y - target.y;
    const distSq = dx * dx + dy * dy;
    return distSq <= tolerance * tolerance;
  }

  /**
   * Get the world distance corresponding to a screen distance.
   *
   * @param screenDistance - Distance in screen pixels
   * @returns Distance in world coordinates
   */
  screenToWorldDistance(screenDistance: number): number {
    return screenDistance / (this.currentTransform.scale || 1);
  }

  /**
   * Get the screen distance corresponding to a world distance.
   *
   * @param worldDistance - Distance in world coordinates
   * @returns Distance in screen pixels
   */
  worldToScreenDistance(worldDistance: number): number {
    return worldDistance * this.currentTransform.scale;
  }
}
