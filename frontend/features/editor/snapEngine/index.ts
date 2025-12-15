import { Point, Shape, SnapOptions } from '../../../types';
import { getDistance } from '../../../utils/geometry';
import { getEndpoints, getMidpoints, getCenter, getGridSnap, getConnectionPoint } from './detectors';
import { getSvgSnapPoints } from './svgBackground';

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

  const shouldCheckEndpoints = snapOptions.endpoint || snapOptions.nearest;
  const shouldCheckMidpoints = snapOptions.midpoint || snapOptions.nearest;
  const shouldCheckCenter = snapOptions.center || snapOptions.nearest;

  shapes.forEach(shape => {
      if (shouldCheckEndpoints) {
          getEndpoints(shape).forEach(checkObjectPoint);
      }
      if (shouldCheckMidpoints) {
          getMidpoints(shape).forEach(checkObjectPoint);
      }
      if (shouldCheckCenter) {
          const c = getCenter(shape);
          if (c) checkObjectPoint(c);
      }
      const connPt = getConnectionPoint(shape);
      if (connPt) checkObjectPoint(connPt);

      if (shape.type === 'rect' && shape.svgRaw && shape.svgViewBox) {
          getSvgSnapPoints(shape).forEach(checkObjectPoint);
      }
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
