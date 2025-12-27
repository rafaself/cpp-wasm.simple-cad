import { Layer, Point, Shape, SnapOptions } from '@/types';
import { SNAP_THRESHOLD } from '@/config/constants';
import { getDistance } from '@/utils/geometry';
import { getCenter, getEndpoints, getGridSnap, getMidpoints } from '@/features/editor/snapEngine/detectors';

export type SnapQuery = { point: Point };

export type SnapBatchOptions = {
  snapOptions: SnapOptions;
  gridSize: number;
  layers: Layer[];
  threshold?: number;
};

export function snapBatch(queries: SnapQuery[], shapes: Shape[], opts: SnapBatchOptions): (Point | null)[] {
  const { snapOptions, gridSize, layers } = opts;
  const threshold = opts.threshold ?? SNAP_THRESHOLD;
  if (!snapOptions.enabled) return queries.map(() => null);

  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const candidates: Point[] = [];

  const shouldCheckEndpoints = snapOptions.endpoint || snapOptions.nearest;
  const shouldCheckMidpoints = snapOptions.midpoint || snapOptions.nearest;
  const shouldCheckCenter = snapOptions.center || snapOptions.nearest;

  for (const shape of shapes) {
    const layer = layerMap.get(shape.layerId);
    if (!layer || !layer.visible) continue;

    if (shouldCheckEndpoints) candidates.push(...getEndpoints(shape));
    if (shouldCheckMidpoints) candidates.push(...getMidpoints(shape));
    if (shouldCheckCenter) {
      const c = getCenter(shape);
      if (c) candidates.push(c);
    }
  }

  const out: (Point | null)[] = new Array(queries.length);
  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    let best: Point | null = null;
    let bestDist = threshold;

    for (let i = 0; i < candidates.length; i++) {
      const d = getDistance(q.point, candidates[i]);
      if (d < bestDist) {
        bestDist = d;
        best = candidates[i];
      }
    }

    if (!best && snapOptions.grid) {
      const g = getGridSnap(q.point, gridSize);
      if (getDistance(q.point, g) < threshold) best = g;
    }

    out[qi] = best;
  }

  return out;
}
