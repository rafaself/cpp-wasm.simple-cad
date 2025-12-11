import { Point, Shape, SnapOptions } from '../../../types';
import { getDistance } from '../../../utils/geometry';
import { getEndpoints, getMidpoints, getCenter, getGridSnap, getConnectionPoint } from './detectors';

export const getSnapPoint = (
  point: Point,
  shapes: Shape[],
  snapOptions: SnapOptions,
  gridSize: number,
  threshold: number = 10
): Point | null => {
  if (!snapOptions.enabled) return null;

  let closestPoint: Point | null = null;
  let minDistance = threshold;

  const checkPoint = (p: Point) => {
    const d = getDistance(point, p);
    if (d < minDistance) {
      minDistance = d;
      closestPoint = p;
    }
  };

  // 1. Grid Snap (Lower priority check, but we can do it first and override if object snap is found,
  // or do it last if object snap not found. The existing logic did object snap first, then grid if no object snap.
  // Actually, existing logic checked grid inside loop? No, it checked grid at start, then objects, then grid fallback.
  // Wait, the existing code had:
  // if (snapOptions.grid) { check grid... update closestPoint }
  // then shapes.forEach... update closestPoint if closer
  // then if (!closestPoint && snapOptions.grid) { return grid snap }

  // This means object snap takes precedence if it's closer than the initial grid snap.

  if (snapOptions.grid) {
     const gPoint = getGridSnap(point, gridSize);
     const d = getDistance(point, gPoint);
     if (d < threshold) {
         closestPoint = gPoint;
         minDistance = threshold;
     }
  }

  // 2. Object Snaps
  shapes.forEach(shape => {
      if (snapOptions.endpoint) {
          getEndpoints(shape).forEach(checkPoint);
      }
      if (snapOptions.midpoint) {
          getMidpoints(shape).forEach(checkPoint);
      }
      if (snapOptions.center) {
          const c = getCenter(shape);
          if (c) checkPoint(c);
      }
  });

  // 3. Fallback Grid Snap
  // If we didn't find any object snap (or initial grid snap was overwritten/not found),
  // and we haven't found anything yet, try grid again if enabled.
  // But wait, if closestPoint is set from step 1, we keep it.
  // If closestPoint was updated by step 2, we keep it.

  // The original logic had a specific fallback return at the end:
  // if (!closestPoint && snapOptions.grid) { ... return grid }

  // My logic above sets closestPoint in step 1. If step 2 finds something closer, it updates it.
  // So I don't need a fallback step if I did step 1 correctly.

  // However, the original code had:
  // if (snapOptions.grid) { ... set closestPoint ... }
  // ... loop shapes ... checkPoint updates closestPoint
  // if (!closestPoint && snapOptions.grid) { ... return grid }

  // This implies if grid snap was found in step 1, it might be overwritten by object snap.
  // If NOT found in step 1 (maybe threshold?), and NO object snap, it tries grid again?
  // No, the logic `getGridSnap` returns the nearest grid point regardless of distance?
  // No, it calcs gx, gy. Then checks distance.

  // Let's stick to the logic:
  // Find candidates.
  // Grid candidate.
  // Object candidates.
  // Pick closest.

  // But usually object snap takes precedence over grid even if grid is slightly closer?
  // "The snapping system implements 'Snap to Grid' as a lower-priority mechanism, active only when 'Snap to Object' (vertex/midpoint) candidates are not found."
  // This is a memory item. I should respect it.

  // So:
  // 1. Check Object Snaps.
  // 2. If no object snap found, Check Grid Snap.

  let bestObjectSnap: Point | null = null;
  let minObjectDist = threshold;

  const checkObjectPoint = (p: Point) => {
      const d = getDistance(point, p);
      if (d < minObjectDist) {
          minObjectDist = d;
          bestObjectSnap = p;
      }
  };

  shapes.forEach(shape => {
      if (snapOptions.endpoint) {
          getEndpoints(shape).forEach(checkObjectPoint);
      }
      if (snapOptions.midpoint) {
          getMidpoints(shape).forEach(checkObjectPoint);
      }
      if (snapOptions.center) {
          const c = getCenter(shape);
          if (c) checkObjectPoint(c);
      }
      // Connection points for electrical symbols (high priority snap)
      const connPt = getConnectionPoint(shape);
      if (connPt) checkObjectPoint(connPt);
  });

  if (bestObjectSnap) return bestObjectSnap;

  if (snapOptions.grid) {
      const gPoint = getGridSnap(point, gridSize);
      if (getDistance(point, gPoint) < threshold) {
          return gPoint;
      }
  }

  return null;
};
