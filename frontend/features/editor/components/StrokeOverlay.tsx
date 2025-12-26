import React, { useMemo } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { useShallow } from 'zustand/react/shallow';
import type { Layer, Shape } from '@/types';
import { isShapeInteractable } from '@/utils/visibility';
import { getEffectiveStrokeColor, isStrokeEffectivelyEnabled } from '@/utils/shapeColors';
import { getPolygonVertices, getRectCornersWorld, worldToScreen } from '@/utils/geometry';

const ELLIPSE_SEGMENTS = 72;

type StrokeItem =
  | { kind: 'polygon'; id: string; pointsAttr: string; color: string; alpha: number; width: number }
  | { kind: 'ellipse'; id: string; cx: number; cy: number; rx: number; ry: number; rot: number; color: string; alpha: number; width: number };

const getStrokePx = (shape: Shape): number => {
  const w = shape.strokeWidth ?? 1;
  if (!Number.isFinite(w)) return 1;
  return Math.max(0, Math.min(200, w));
};

const getAlpha01 = (shape: Shape): number => {
  const a = shape.strokeOpacity ?? 100;
  if (!Number.isFinite(a)) return 1;
  return Math.max(0, Math.min(1, a / 100));
};

export const StrokeOverlay: React.FC = () => {
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const viewTransform = useUIStore((s) => s.viewTransform);

  const layers = useDataStore((s) => s.layers);
  const shapesById = useDataStore((s) => s.shapes);

  const layerById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);

  const items = useMemo((): StrokeItem[] => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return [];

    const out: StrokeItem[] = [];
    for (const id of Object.keys(shapesById)) {
      const shape = shapesById[id]!;
      if (!shape) continue;
      if (shape.floorId && activeFloorId && shape.floorId !== activeFloorId) continue;

      const layer = layerById.get(shape.layerId) as Layer | undefined;
      if (layer && (!layer.visible || layer.locked)) continue;
      if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo' })) continue;

      if (shape.type !== 'rect' && shape.type !== 'circle' && shape.type !== 'polygon') continue;
      if (shape.type === 'rect' && (shape.svgSymbolId || shape.svgRaw)) continue;

      const strokeEnabled = isStrokeEffectivelyEnabled(shape, layer);
      const strokeColor = getEffectiveStrokeColor(shape, layer);
      if (!strokeEnabled || strokeColor === 'transparent') continue;

      const alpha = getAlpha01(shape);
      if (alpha <= 0) continue;
      // Scale thickness with zoom since this overlay renders in screen-space coordinates.
      // Allow subpixel widths so zooming out doesn't make the inside stroke visually "fill" small shapes.
      const width = getStrokePx(shape) * (viewTransform.scale || 1);

      if (shape.type === 'rect') {
        const corners = getRectCornersWorld(shape)?.corners;
        if (!corners || corners.length !== 4) continue;
        const pts = corners.map((p) => worldToScreen(p, viewTransform));
        const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
        out.push({ kind: 'polygon', id: shape.id, pointsAttr, color: strokeColor, alpha, width });
        continue;
      }

      if (shape.type === 'polygon') {
        const verts = getPolygonVertices(shape);
        if (verts.length < 3) continue;
        const pts = verts.map((p) => worldToScreen(p, viewTransform));
        const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
        out.push({ kind: 'polygon', id: shape.id, pointsAttr, color: strokeColor, alpha, width });
        continue;
      }

      if (shape.type === 'circle') {
        if (shape.x === undefined || shape.y === undefined) continue;
        const w = shape.width ?? (shape.radius ?? 50) * 2;
        const h = shape.height ?? (shape.radius ?? 50) * 2;
        const rxW = w / 2;
        const ryW = h / 2;
        const rot = shape.rotation ?? 0;
        const cx = shape.x;
        const cy = shape.y;

        const ptsWorld = Array.from({ length: ELLIPSE_SEGMENTS }, (_, i) => {
          const t = (i / ELLIPSE_SEGMENTS) * Math.PI * 2;
          const lx = Math.cos(t) * rxW * (shape.scaleX ?? 1);
          const ly = Math.sin(t) * ryW * (shape.scaleY ?? 1);
          if (!rot) return { x: cx + lx, y: cy + ly };
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          return { x: cx + lx * c - ly * s, y: cy + lx * s + ly * c };
        });

        const pts = ptsWorld.map((p) => worldToScreen(p, viewTransform));
        const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
        out.push({ kind: 'polygon', id: shape.id, pointsAttr, color: strokeColor, alpha, width });
      }
    }

    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }, [activeFloorId, canvasSize.height, canvasSize.width, layerById, shapesById, viewTransform]);

  if (items.length === 0) return null;

  return (
    <svg
      width={canvasSize.width}
      height={canvasSize.height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      <defs>
        {items.map((it) => {
          if (it.kind === 'polygon') {
            return (
              <clipPath key={`clip-${it.id}`} id={`stroke-clip-${it.id}`}>
                <polygon points={it.pointsAttr} />
              </clipPath>
            );
          }
          return null;
        })}
      </defs>

      {items.map((it) => {
        if (it.kind === 'polygon') {
          // Draw a centered stroke at 2x width and clip to the shape, leaving an inside-only stroke of width `it.width`.
          const w = it.width * 2;
          return (
            <polygon
              key={it.id}
              points={it.pointsAttr}
              fill="none"
              stroke={it.color}
              strokeOpacity={it.alpha}
              strokeWidth={w}
              strokeLinejoin="miter"
              strokeMiterlimit={2}
              strokeLinecap="butt"
              clipPath={`url(#stroke-clip-${it.id})`}
            />
          );
        }
        return null;
      })}
    </svg>
  );
};

export default StrokeOverlay;
