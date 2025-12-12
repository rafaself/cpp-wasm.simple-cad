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
      // ALWAYS check connection points regardless of specific snap options if it's an electrical symbol?
      // Or bind it to 'endpoint' or a new 'connection' option?
      // For now, treat it as part of standard snapping if the shape has it.
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
