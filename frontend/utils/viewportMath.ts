import type { Point, ViewTransform } from '@/types';

export const screenToWorld = (point: Point, transform: ViewTransform): Point => ({
  x: (point.x - transform.x) / transform.scale,
  y: -(point.y - transform.y) / transform.scale,
});

export const worldToScreen = (point: Point, transform: ViewTransform): Point => ({
  x: point.x * transform.scale + transform.x,
  y: -point.y * transform.scale + transform.y,
});
