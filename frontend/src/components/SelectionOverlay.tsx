import React, { useMemo } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { useShallow } from 'zustand/react/shallow';
import { isShapeInteractable } from '@/utils/visibility';
import {
  getRectCornersWorld,
  getShapeBoundingBox,
  getShapeHandles,
  worldToScreen,
  supportsBBoxResize
} from '@/utils/geometry';
import { Shape } from '@/types';

const HANDLE_SIZE_PX = 8;

const SelectionOverlay: React.FC = () => {
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const viewTransform = useUIStore((s) => s.viewTransform);

  const layers = useDataStore((s) => s.layers);

  // OPTIMIZATION: Only subscribe to the subset of shapes that are selected.
  // This prevents the overlay from re-rendering when off-screen or unselected shapes change.
  const shapesById = useDataStore(
    useShallow((s) => {
      const result: Record<string, Shape> = {};
      selectedShapeIds.forEach((id) => {
        if (s.shapes[id]) result[id] = s.shapes[id];
      });
      return result;
    })
  );

  const selectedOverlaySvg = useMemo(() => {
    if (selectedShapeIds.size === 0) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const stroke = '#3b82f6';

    const items: Array<{
      id: string;
      outline:
        | { kind: 'poly'; points: { x: number; y: number }[] }
        | { kind: 'polyline'; points: { x: number; y: number }[] }
        | { kind: 'rect'; x: number; y: number; w: number; h: number }
        | { kind: 'segment'; a: { x: number; y: number }; b: { x: number; y: number } };
      handles: { x: number; y: number }[];
    }> = [];

    selectedShapeIds.forEach((id) => {
      const shape = shapesById[id];
      if (!shape) return;
      const layer = layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) return;
      if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo', activeDiscipline })) return;

      if (shape.type === 'line' || shape.type === 'arrow') {
        const a = shape.points?.[0];
        const b = shape.points?.[1];
        if (!a || !b) return;
        const aa = worldToScreen(a, viewTransform);
        const bb = worldToScreen(b, viewTransform);
        items.push({
          id,
          outline: { kind: 'segment', a: aa, b: bb },
          handles: [aa, bb],
        });
        return;
      }

      if (shape.type === 'polyline') {
        const pts = (shape.points ?? []).map((p) => worldToScreen(p, viewTransform));
        if (pts.length < 2) return;
        items.push({
          id,
          outline: { kind: 'polyline', points: pts },
          handles: pts,
        });
        return;
      }

      if (supportsBBoxResize(shape)) {
        const r = getRectCornersWorld(shape);
        if (!r) return;
        const handles = getShapeHandles(shape)
          .filter((h) => h.type === 'resize')
          .map((h) => worldToScreen({ x: h.x, y: h.y }, viewTransform));
        items.push({
          id,
          outline: { kind: 'poly', points: r.corners.map((p) => worldToScreen(p, viewTransform)) },
          handles,
        });
        return;
      }

      // Fallback
      const bbox = getShapeBoundingBox(shape);
      const a = worldToScreen({ x: bbox.x, y: bbox.y }, viewTransform);
      const b = worldToScreen({ x: bbox.x + bbox.width, y: bbox.y + bbox.height }, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return;
      items.push({ id, outline: { kind: 'rect', x, y, w, h }, handles: [] });
    });

    if (items.length === 0) return null;

    const hs = HANDLE_SIZE_PX;
    const hh = hs / 2;
    return (
      <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {items.map((it) => {
          if (it.outline.kind === 'poly') {
            const pts = it.outline.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
            return (
              <g key={it.id}>
                <polygon points={pts} fill="transparent" stroke={stroke} strokeWidth={1} />
                {it.handles.map((p, i) => (
                  <rect key={i} x={p.x - hh} y={p.y - hh} width={hs} height={hs} fill="#ffffff" stroke={stroke} strokeWidth={1} />
                ))}
              </g>
            );
          }
          if (it.outline.kind === 'polyline') {
            const pts = it.outline.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
            return (
              <g key={it.id}>
                <polyline points={pts} fill="transparent" stroke={stroke} strokeWidth={1} />
                {it.handles.map((p, i) => (
                  <rect key={i} x={p.x - hh} y={p.y - hh} width={hs} height={hs} fill="#ffffff" stroke={stroke} strokeWidth={1} />
                ))}
              </g>
            );
          }
          if (it.outline.kind === 'segment') {
            return (
              <g key={it.id}>
                <line x1={it.outline.a.x} y1={it.outline.a.y} x2={it.outline.b.x} y2={it.outline.b.y} stroke={stroke} strokeWidth={1} />
                {it.handles.map((p, i) => (
                  <rect key={i} x={p.x - hh} y={p.y - hh} width={hs} height={hs} fill="#ffffff" stroke={stroke} strokeWidth={1} />
                ))}
              </g>
            );
          }
          return (
            <g key={it.id}>
              <rect x={it.outline.x} y={it.outline.y} width={it.outline.w} height={it.outline.h} fill="transparent" stroke={stroke} strokeWidth={1} />
            </g>
          );
        })}
      </svg>
    );
  }, [activeDiscipline, activeFloorId, canvasSize.height, canvasSize.width, layers, selectedShapeIds, shapesById, viewTransform]);

  return selectedOverlaySvg;
};

export default SelectionOverlay;
