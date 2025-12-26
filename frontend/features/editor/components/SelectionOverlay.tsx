import React, { useMemo } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
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
import { supportsEngineResize } from '@/engine/core/capabilities';

const HANDLE_SIZE_PX = 8;
const OUTLINE_OFFSET_PX = 1;

const normalize2 = (v: { x: number; y: number }): { x: number; y: number } => {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

const inflateConvexPolygon = (points: readonly { x: number; y: number }[], delta: number): { x: number; y: number }[] => {
  if (points.length < 3 || delta === 0) return points.slice();

  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area2 += a.x * b.y - b.x * a.y;
  }
  const ccw = area2 >= 0;

  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const curr = points[i]!;
    const next = points[(i + 1) % points.length]!;

    const e0 = normalize2({ x: curr.x - prev.x, y: curr.y - prev.y });
    const e1 = normalize2({ x: next.x - curr.x, y: next.y - curr.y });

    const n0 = ccw ? { x: e0.y, y: -e0.x } : { x: -e0.y, y: e0.x };
    const n1 = ccw ? { x: e1.y, y: -e1.x } : { x: -e1.y, y: e1.x };

    const bis = normalize2({ x: n0.x + n1.x, y: n0.y + n1.y });
    const dot = Math.max(-0.999, Math.min(0.999, bis.x * n0.x + bis.y * n0.y));
    const scale = 1 / Math.max(0.25, dot);

    out.push({ x: curr.x + bis.x * delta * scale, y: curr.y + bis.y * delta * scale });
  }
  return out;
};

const offsetPolyline = (points: readonly { x: number; y: number }[], delta: number): { x: number; y: number }[] => {
  if (points.length < 2 || delta === 0) return points.slice();

  const segNormal = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const d = normalize2({ x: b.x - a.x, y: b.y - a.y });
    return { x: d.y, y: -d.x };
  };

  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i === 0) {
      const n = segNormal(points[0]!, points[1]!);
      out.push({ x: p.x + n.x * delta, y: p.y + n.y * delta });
      continue;
    }
    if (i === points.length - 1) {
      const n = segNormal(points[points.length - 2]!, points[points.length - 1]!);
      out.push({ x: p.x + n.x * delta, y: p.y + n.y * delta });
      continue;
    }
    const n0 = segNormal(points[i - 1]!, points[i]!);
    const n1 = segNormal(points[i]!, points[i + 1]!);
    const bis = normalize2({ x: n0.x + n1.x, y: n0.y + n1.y });
    out.push({ x: p.x + bis.x * delta, y: p.y + bis.y * delta });
  }
  return out;
};

const SelectionOverlay: React.FC<{ hideAnchors?: boolean }> = ({ hideAnchors = false }) => {
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const isEditingAppearance = useUIStore((s) => s.isEditingAppearance);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const enableEngineResize = useSettingsStore((s) => s.featureFlags.enableEngineResize);
  const engineCapabilitiesMask = useSettingsStore((s) => s.engineCapabilitiesMask);
  const engineResizeEnabled = enableEngineResize && supportsEngineResize(engineCapabilitiesMask);

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
    if (isEditingAppearance) return null;
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
      if (!isShapeInteractable(shape, { activeFloorId: activeFloorId ?? 'terreo' })) return;

      if (shape.type === 'line' || shape.type === 'arrow') {
        const a = shape.points?.[0];
        const b = shape.points?.[1];
        if (!a || !b) return;
        const aa = worldToScreen(a, viewTransform);
        const bb = worldToScreen(b, viewTransform);
        items.push({
          id,
          outline: { kind: 'segment', a: aa, b: bb },
          handles: hideAnchors ? [] : [aa, bb],
        });
        return;
      }

      if (shape.type === 'polyline') {
        const pts = (shape.points ?? []).map((p) => worldToScreen(p, viewTransform));
        if (pts.length < 2) return;
        items.push({
          id,
          outline: { kind: 'polyline', points: offsetPolyline(pts, OUTLINE_OFFSET_PX) },
          handles: hideAnchors ? [] : pts,
        });
        return;
      }

      if (supportsBBoxResize(shape)) {
        const r = getRectCornersWorld(shape);
        if (!r) return;

        const handles =
          engineResizeEnabled && shape.type !== 'text'
            ? getShapeHandles(shape)
                .filter((h) => h.type === 'resize')
                .map((h) => worldToScreen({ x: h.x, y: h.y }, viewTransform))
            : [];

        const outline = inflateConvexPolygon(r.corners.map((p) => worldToScreen(p, viewTransform)), OUTLINE_OFFSET_PX);
        items.push({
          id,
          outline: { kind: 'poly', points: outline },
          handles: hideAnchors ? [] : handles,
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
      items.push({ id, outline: { kind: 'rect', x: x - OUTLINE_OFFSET_PX, y: y - OUTLINE_OFFSET_PX, w: w + OUTLINE_OFFSET_PX * 2, h: h + OUTLINE_OFFSET_PX * 2 }, handles: [] });
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
            const dx = it.outline.b.x - it.outline.a.x;
            const dy = it.outline.b.y - it.outline.a.y;
            const n = normalize2({ x: dy, y: -dx });
            const ax = it.outline.a.x + n.x * OUTLINE_OFFSET_PX;
            const ay = it.outline.a.y + n.y * OUTLINE_OFFSET_PX;
            const bx = it.outline.b.x + n.x * OUTLINE_OFFSET_PX;
            const by = it.outline.b.y + n.y * OUTLINE_OFFSET_PX;
            return (
              <g key={it.id}>
                <line x1={ax} y1={ay} x2={bx} y2={by} stroke={stroke} strokeWidth={1} />
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
  }, [activeFloorId, canvasSize.height, canvasSize.width, engineResizeEnabled, hideAnchors, isEditingAppearance, layers, selectedShapeIds, shapesById, viewTransform]);

  return selectedOverlaySvg;
};

export default SelectionOverlay;
