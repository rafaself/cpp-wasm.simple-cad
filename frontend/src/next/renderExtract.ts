
import { Layer, Point, Shape, ViewTransform } from '../types';

export const SUPPORTED_TYPES = ['rect', 'line', 'polyline'] as const;
export type SupportedType = (typeof SUPPORTED_TYPES)[number];

export type RenderExtractShape =
  | { id: string; type: 'rect'; x: number; y: number; width: number; height: number; rotation?: number }
  | { id: string; type: 'line'; points: [Point, Point] }
  | { id: string; type: 'polyline'; points: Point[] };

export interface RenderExtractStats {
  totalShapes: number;
  supported: number;
  skipped: number;
  byType: Record<string, number>;
}

const DEFAULT_VIEWPORT_PADDING = 64; // generous margin to avoid over-culling

export interface RenderExtractOptions {
  activeFloorId?: string;
  activeDiscipline?: 'architecture' | 'electrical';
}

export interface RenderExtractResult {
  batch: RenderExtractShape[];
  stats: RenderExtractStats;
}

export function buildRenderBatch(
  shapes: Shape[],
  layers: Layer[],
  view: ViewTransform,
  canvas: { width: number; height: number },
  opts: RenderExtractOptions = {},
): RenderExtractResult {
  const layerMap = new Map(layers.map((l) => [l.id, l]));
  const byType: Record<string, number> = {};

  const batch: RenderExtractShape[] = [];
  let supported = 0;

  for (const shape of shapes) {
    byType[shape.type] = (byType[shape.type] ?? 0) + 1;

    if (opts.activeFloorId && shape.floorId && shape.floorId !== opts.activeFloorId) continue;
    if (opts.activeDiscipline && shape.discipline && shape.discipline !== opts.activeDiscipline) continue;

    const layer = layerMap.get(shape.layerId);
    if (!layer || !layer.visible) continue;

    if (!isSupported(shape.type)) continue;

    const bounds = shapeBounds(shape);
    if (!bounds) continue;

    if (!intersectsViewport(bounds, view, canvas, DEFAULT_VIEWPORT_PADDING)) continue;

    const simplified = simplifyShape(shape);
    if (simplified) {
      batch.push(simplified);
      supported += 1;
    }
  }

  return {
    batch,
    stats: {
      totalShapes: shapes.length,
      supported,
      skipped: shapes.length - supported,
      byType,
    },
  };
}

function isSupported(type: string): type is SupportedType {
  return (SUPPORTED_TYPES as readonly string[]).includes(type);
}

function shapeBounds(shape: Shape): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (shape.type === 'rect' && shape.width !== undefined && shape.height !== undefined && shape.x !== undefined && shape.y !== undefined) {
    const minX = shape.x;
    const minY = shape.y;
    const maxX = shape.x + shape.width;
    const maxY = shape.y + shape.height;
    return { minX, minY, maxX, maxY };
  }

  const pts = shape.points ?? [];
  if (pts.length === 0) return null;
  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function intersectsViewport(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  view: ViewTransform,
  canvas: { width: number; height: number },
  padding: number,
): boolean {
  const scale = view?.scale || 1;
  const vx = view?.x || 0;
  const vy = view?.y || 0;
  const vw = (canvas?.width || 0) / scale;
  const vh = (canvas?.height || 0) / scale;

  if (vw <= 0 || vh <= 0) return true; // no canvas size info, do not cull

  const minX = vx - padding / scale;
  const maxX = vx + vw + padding / scale;
  const minY = vy - padding / scale;
  const maxY = vy + vh + padding / scale;

  return !(bounds.maxX < minX || bounds.minX > maxX || bounds.maxY < minY || bounds.minY > maxY);
}

function simplifyShape(shape: Shape): RenderExtractShape | null {
  switch (shape.type) {
    case 'rect': {
      if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return null;
      return { id: shape.id, type: 'rect', x: shape.x, y: shape.y, width: shape.width, height: shape.height, rotation: shape.rotation };
    }
    case 'line': {
      if (!shape.points || shape.points.length < 2) return null;
      return { id: shape.id, type: 'line', points: [shape.points[0], shape.points[1]] };
    }
    case 'polyline': {
      if (!shape.points || shape.points.length < 2) return null;
      return { id: shape.id, type: 'polyline', points: shape.points };
    }
    default:
      return null;
  }
}
