
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { screenToWorld, getShapeBounds } from '@/utils/geometry';
import { HIT_TOLERANCE } from '@/config/constants';
import { calculateZoomTransform } from '@/utils/zoomHelper';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { Shape } from '@/types';
import TextSdfLayer from './TextSdfLayer';
import SymbolAtlasLayer from './SymbolAtlasLayer';
import { decodeWorldSnapshot, migrateWorldSnapshotToLatest, type WorldSnapshot } from '../next/worldSnapshot';
import { buildSnapIndex, querySnapIndex } from '../next/snapIndex';
import { getEngineRuntime } from '@/engine/runtime/singleton';
import { getEffectiveFillColor, getEffectiveStrokeColor, isFillEffectivelyEnabled, isStrokeEffectivelyEnabled } from '@/utils/shapeColors';
import type { Layer } from '@/types';

// Mirrors the C++ BufferMeta exposed via Embind
export type BufferMeta = {
  generation: number;
  vertexCount: number;
  capacity: number;
  floatCount: number;
  ptr: number; // byte offset in WASM linear memory
};

type CadEngineInstance = {
  clear: () => void;
  allocBytes: (byteCount: number) => number;
  freeBytes: (ptr: number) => void;
  applyCommandBuffer: (ptr: number, byteCount: number) => void;

  getPositionBufferMeta: () => BufferMeta; // triangles
  getLineBufferMeta: () => BufferMeta;      // line segments
  getSnapshotBufferMeta: () => { generation: number; byteCount: number; ptr: number };
  getStats: () => {
    generation: number;
    rectCount: number;
    lineCount: number;
    polylineCount: number;
    symbolCount?: number;
    nodeCount?: number;
    conduitCount?: number;
    pointCount: number;
    triangleVertexCount: number;
    lineVertexCount: number;
    lastLoadMs: number;
    lastRebuildMs: number;
    lastApplyMs?: number;
  };
};

type WasmModule = {
  CadEngine: new () => CadEngineInstance;
  HEAPF32: Float32Array;
  HEAPU8: Uint8Array;
};

type BufferMetaPair = { triangles: BufferMeta | null; lines: BufferMeta | null };

type MeshProps = {
  module: WasmModule;
  engine: CadEngineInstance;
  onBufferMeta: (meta: BufferMetaPair) => void;
};

type SnapshotCapableEngine = CadEngineInstance & Required<
  Pick<CadEngineInstance, 'allocBytes' | 'freeBytes' | 'getSnapshotBufferMeta' | 'getStats'>
>;

const isSnapshotCapableEngine = (engine: CadEngineInstance): engine is SnapshotCapableEngine => {
  return (
    typeof engine.allocBytes === 'function' &&
    typeof engine.freeBytes === 'function' &&
    typeof engine.getSnapshotBufferMeta === 'function' &&
    typeof engine.getStats === 'function'
  );
};

type PickingTarget = {
  shapeId: string;
  distance: number;
};

const pointSegmentDistance = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const projX = a.x + t * vx;
  const projY = a.y + t * vy;
  return Math.hypot(p.x - projX, p.y - projY);
};

const pickShapeAt = (
  worldPoint: { x: number; y: number },
  snapshot: WorldSnapshot,
  idHashToString: Map<number, string>,
  tolerance: number,
): string | null => {
  let best: PickingTarget | null = null;
  for (const r of snapshot.rects) {
    const inside = worldPoint.x >= r.x && worldPoint.x <= r.x + r.w && worldPoint.y >= r.y && worldPoint.y <= r.y + r.h;
      if (inside) {
        const dist = 0;
        if (!best || dist < best.distance) {
          best = { shapeId: idHashToString.get(r.id) ?? String(r.id), distance: dist };
        }
      }
  }
  for (const l of snapshot.lines) {
    const d = pointSegmentDistance(worldPoint, { x: l.x0, y: l.y0 }, { x: l.x1, y: l.y1 });
    if (d <= tolerance && (!best || d < best.distance)) {
      best = { shapeId: idHashToString.get(l.id) ?? String(l.id), distance: d };
    }
  }
  for (const pl of snapshot.polylines) {
    if (pl.count < 2) continue;
    const start = pl.offset;
    const end = pl.offset + pl.count;
    if (end > snapshot.points.length) continue;
    for (let i = start; i + 1 < end; i++) {
      const p0 = snapshot.points[i];
      const p1 = snapshot.points[i + 1];
      const d = pointSegmentDistance(worldPoint, p0, p1);
      if (d <= tolerance && (!best || d < best.distance)) {
        best = { shapeId: idHashToString.get(pl.id) ?? String(pl.id), distance: d };
      }
    }
  }
  return best?.shapeId ?? null;
};

const toWorldPoint = (evt: React.PointerEvent<HTMLDivElement>, viewTransform: ReturnType<typeof useUIStore.getState>['viewTransform']): { x: number; y: number } => {
  const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
  const screen: { x: number; y: number } = {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  };
  return screenToWorld(screen, viewTransform);
};

const SelectionOverlay: React.FC<{ selectedIds: Set<string> }> = ({ selectedIds }) => {
  const material = useMemo(() => new THREE.LineBasicMaterial({ color: 0x18A0FB }), []);
  const shapesById = useDataStore((s) => s.shapes);

  const lines = useMemo(() => {
    const out: { id: string; obj: THREE.Line }[] = [];
    selectedIds.forEach((id) => {
      const shape = shapesById[id];
      if (!shape) return;

      const buildRectOutline = (s: Shape) => {
        const b = getShapeBounds(s);
        if (!b) return new THREE.BufferGeometry();

        const x0 = b.x;
        const y0 = b.y;
        const x1 = b.x + b.width;
        const y1 = b.y + b.height;
        const pts = [
          new THREE.Vector3(x0, y0, 0),
          new THREE.Vector3(x1, y0, 0),
          new THREE.Vector3(x1, y1, 0),
          new THREE.Vector3(x0, y1, 0),
          new THREE.Vector3(x0, y0, 0),
        ];
        return new THREE.BufferGeometry().setFromPoints(pts);
      };

      if (shape.type === 'rect' || shape.type === 'text' || shape.type === 'circle' || shape.type === 'polygon' || shape.type === 'arc') {
        out.push({ id, obj: new THREE.Line(buildRectOutline(shape), material) });
        return;
      }

      if (shape.type === 'line' || shape.type === 'arrow') {
        const p0 = shape.points?.[0];
        const p1 = shape.points?.[1];
        if (!p0 || !p1) return;
        const geom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p0.x, p0.y, 0), new THREE.Vector3(p1.x, p1.y, 0)]);
        out.push({ id, obj: new THREE.Line(geom, material) });
        return;
      }

      if (shape.type === 'polyline' || shape.type === 'eletroduto') {
        const pts = (shape.points ?? []).map((p) => new THREE.Vector3(p.x, p.y, 0));
        if (pts.length < 2) return;
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        out.push({ id, obj: new THREE.Line(geom, material) });
      }
    });
    return out;
  }, [material, selectedIds, shapesById]);

  return (
    <>
      {lines.map(({ id, obj }) => (
        <primitive key={id} object={obj} />
      ))}
    </>
  );
};

const OverlayShapesLayer: React.FC = () => {
  const shapesById = useDataStore((s) => s.shapes);
  const layers = useDataStore((s) => s.layers);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);

  const layerById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);

  const items = useMemo(() => {
    const out: Array<
      | { kind: 'ellipse'; id: string; cx: number; cy: number; rx: number; ry: number; rot: number; fill?: { color: string; opacity: number }; stroke?: { color: string; opacity: number } }
      | { kind: 'polygon'; id: string; cx: number; cy: number; rx: number; ry: number; rot: number; sides: number; sx: number; sy: number; fill?: { color: string; opacity: number }; stroke?: { color: string; opacity: number } }
      | { kind: 'arrow'; id: string; a: { x: number; y: number }; b: { x: number; y: number }; head: number; stroke: { color: string; opacity: number } }
    > = [];

    for (const id of Object.keys(shapesById)) {
      const shape = shapesById[id]!;
      if (!shape) continue;
      if (shape.floorId && activeFloorId && shape.floorId !== activeFloorId) continue;
      if (shape.discipline && activeDiscipline && shape.discipline !== activeDiscipline) continue;

      const layer = layerById.get(shape.layerId) as Layer | undefined;
      if (layer && !layer.visible) continue;

      if (shape.type === 'circle') {
        if (shape.x === undefined || shape.y === undefined) continue;
        const w = shape.width ?? (shape.radius ?? 50) * 2;
        const h = shape.height ?? (shape.radius ?? 50) * 2;
        const rx = w / 2;
        const ry = h / 2;
        const rot = shape.rotation ?? 0;

        const fillEnabled = isFillEffectivelyEnabled(shape, layer);
        const strokeEnabled = isStrokeEffectivelyEnabled(shape, layer);

        out.push({
          kind: 'ellipse',
          id: shape.id,
          cx: shape.x,
          cy: shape.y,
          rx,
          ry,
          rot,
          fill: fillEnabled
            ? { color: getEffectiveFillColor(shape, layer), opacity: (shape.fillOpacity ?? 100) / 100 }
            : undefined,
          stroke: strokeEnabled
            ? { color: getEffectiveStrokeColor(shape, layer), opacity: (shape.strokeOpacity ?? 100) / 100 }
            : undefined,
        });
        continue;
      }

      if (shape.type === 'polygon') {
        if (shape.x === undefined || shape.y === undefined) continue;
        const w = shape.width ?? (shape.radius ?? 50) * 2;
        const h = shape.height ?? (shape.radius ?? 50) * 2;
        const rx = w / 2;
        const ry = h / 2;
        const rot = shape.rotation ?? 0;
        const sides = Math.max(3, Math.floor(shape.sides ?? 6));
        const sx = shape.scaleX ?? 1;
        const sy = shape.scaleY ?? 1;

        const fillEnabled = isFillEffectivelyEnabled(shape, layer);
        const strokeEnabled = isStrokeEffectivelyEnabled(shape, layer);

        out.push({
          kind: 'polygon',
          id: shape.id,
          cx: shape.x,
          cy: shape.y,
          rx,
          ry,
          rot,
          sides,
          sx,
          sy,
          fill: fillEnabled
            ? { color: getEffectiveFillColor(shape, layer), opacity: (shape.fillOpacity ?? 100) / 100 }
            : undefined,
          stroke: strokeEnabled
            ? { color: getEffectiveStrokeColor(shape, layer), opacity: (shape.strokeOpacity ?? 100) / 100 }
            : undefined,
        });
        continue;
      }

      if (shape.type === 'arrow') {
        const p0 = shape.points?.[0];
        const p1 = shape.points?.[1];
        if (!p0 || !p1) continue;
        const strokeEnabled = isStrokeEffectivelyEnabled(shape, layer);
        if (!strokeEnabled) continue;
        out.push({
          kind: 'arrow',
          id: shape.id,
          a: p0,
          b: p1,
          head: Math.max(2, shape.arrowHeadSize ?? 10),
          stroke: { color: getEffectiveStrokeColor(shape, layer), opacity: (shape.strokeOpacity ?? 100) / 100 },
        });
      }
    }

    return out;
  }, [activeDiscipline, activeFloorId, layerById, shapesById]);

  return (
    <>
      {items.map((it) => {
        if (it.kind === 'ellipse') {
          const segments = 64;
          const pts = Array.from({ length: segments + 1 }, (_, i) => {
            const t = (i / segments) * Math.PI * 2;
            const x = it.cx + Math.cos(t) * it.rx;
            const y = it.cy + Math.sin(t) * it.ry;
            const rotated = it.rot ? new THREE.Vector3(x, y, 0).sub(new THREE.Vector3(it.cx, it.cy, 0)).applyAxisAngle(new THREE.Vector3(0, 0, 1), it.rot).add(new THREE.Vector3(it.cx, it.cy, 0)) : new THREE.Vector3(x, y, 0);
            return rotated;
          });

          const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);

          const fillGeom = (() => {
            if (!it.fill || it.fill.opacity <= 0) return null;
            const center = new THREE.Vector3(it.cx, it.cy, 0);
            const positions: number[] = [];
            for (let i = 0; i < segments; i++) {
              const a = pts[i]!;
              const b = pts[i + 1]!;
              positions.push(center.x, center.y, 0, a.x, a.y, 0, b.x, b.y, 0);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            return g;
          })();

          return (
            <group key={it.id}>
              {fillGeom && it.fill ? (
                <mesh geometry={fillGeom}>
                  <meshBasicMaterial color={it.fill.color} transparent opacity={it.fill.opacity} depthWrite={false} />
                </mesh>
              ) : null}
            </group>
          );
        }

        if (it.kind === 'polygon') {
          const pts = Array.from({ length: it.sides + 1 }, (_, i) => {
            const t = (i / it.sides) * Math.PI * 2 - Math.PI / 2;
            const dx0 = Math.cos(t) * it.rx * it.sx;
            const dy0 = Math.sin(t) * it.ry * it.sy;
            if (!it.rot) return new THREE.Vector3(it.cx + dx0, it.cy + dy0, 0);
            const c = Math.cos(it.rot);
            const s = Math.sin(it.rot);
            return new THREE.Vector3(it.cx + dx0 * c - dy0 * s, it.cy + dx0 * s + dy0 * c, 0);
          });

          const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);

          const fillGeom = (() => {
            if (!it.fill || it.fill.opacity <= 0) return null;
            const center = new THREE.Vector3(it.cx, it.cy, 0);
            const positions: number[] = [];
            for (let i = 0; i < it.sides; i++) {
              const a = pts[i]!;
              const b = pts[i + 1]!;
              positions.push(center.x, center.y, 0, a.x, a.y, 0, b.x, b.y, 0);
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            return g;
          })();

          return (
            <group key={it.id}>
              {fillGeom && it.fill ? (
                <mesh geometry={fillGeom}>
                  <meshBasicMaterial color={it.fill.color} transparent opacity={it.fill.opacity} depthWrite={false} />
                </mesh>
              ) : null}
            </group>
          );
        }

        const ax = it.a.x;
        const ay = it.a.y;
        const bx = it.b.x;
        const by = it.b.y;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) return null;

        const dirX = dx / len;
        const dirY = dy / len;
        const headLen = Math.min(it.head, len * 0.45);
        const headW = headLen * 0.6;
        const baseX = bx - dirX * headLen;
        const baseY = by - dirY * headLen;
        const perpX = -dirY;
        const perpY = dirX;

        const leftX = baseX + perpX * (headW / 2);
        const leftY = baseY + perpY * (headW / 2);
        const rightX = baseX - perpX * (headW / 2);
        const rightY = baseY - perpY * (headW / 2);

        const shaftGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, ay, 0), new THREE.Vector3(baseX, baseY, 0)]);
        const headGeom = new THREE.BufferGeometry();
        headGeom.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([bx, by, 0, leftX, leftY, 0, rightX, rightY, 0], 3),
        );

        return (
          <group key={it.id}>
            <mesh geometry={headGeom} renderOrder={30}>
              <meshBasicMaterial color={it.stroke.color} transparent opacity={it.stroke.opacity} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

type StrokeGroupKey = string;
type StrokeGroup = {
  key: StrokeGroupKey;
  color: string;
  opacity: number;
  widthPx: number;
  positions: Float32Array;
};

const StrokeSegments: React.FC<{ group: StrokeGroup }> = ({ group }) => {
  const geom = useMemo(() => new LineSegmentsGeometry(), []);
  const mat = useMemo(
    () =>
      new LineMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );
  const line = useMemo(() => new LineSegments2(geom, mat), [geom, mat]);
  const { size } = useThree();

  useEffect(() => {
    line.renderOrder = 25;
    line.frustumCulled = false;
  }, [line]);

  useEffect(() => {
    geom.setPositions(group.positions);
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
  }, [geom, group.positions]);

  useEffect(() => {
    mat.color.set(group.color);
    mat.opacity = group.opacity;
    mat.linewidth = group.widthPx;
    mat.resolution.set(size.width, size.height);
    mat.needsUpdate = true;
  }, [group.color, group.opacity, group.widthPx, mat, size.height, size.width]);

  useEffect(() => {
    return () => {
      line.geometry.dispose();
      (line.material as LineMaterial).dispose();
    };
  }, [line]);

  return <primitive object={line} />;
};

const StrokeSegmentsLayer: React.FC = () => {
  const shapesById = useDataStore((s) => s.shapes);
  const layers = useDataStore((s) => s.layers);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);

  const layerById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);

  const groups = useMemo((): StrokeGroup[] => {
    const buckets = new Map<StrokeGroupKey, { color: string; opacity: number; widthPx: number; floats: number[] }>();

    const addSegment = (key: StrokeGroupKey, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const bucket = buckets.get(key);
      if (!bucket) return;
      bucket.floats.push(a.x, a.y, 0, b.x, b.y, 0);
    };

    const ensureBucket = (color: string, opacity: number, widthPx: number) => {
      const o = Math.max(0, Math.min(1, opacity));
      const w = Math.max(1, Math.min(100, Math.round(widthPx)));
      const key = `${color}|${o.toFixed(3)}|${w}`;
      if (!buckets.has(key)) buckets.set(key, { color, opacity: o, widthPx: w, floats: [] });
      return key;
    };

    const ellipseSegments = 64;

    for (const id of Object.keys(shapesById)) {
      const shape = shapesById[id]!;
      if (!shape) continue;
      if (shape.floorId && activeFloorId && shape.floorId !== activeFloorId) continue;
      if (shape.discipline && activeDiscipline && shape.discipline !== activeDiscipline) continue;

      if (shape.type === 'rect' && (shape.svgSymbolId || shape.svgRaw)) continue;
      if (shape.type === 'text') continue;
      // Closed-shape strokes are handled by screen-space StrokeOverlay (inside-only).
      if (shape.type === 'rect' || shape.type === 'circle' || shape.type === 'polygon') continue;

      const layer = layerById.get(shape.layerId) as Layer | undefined;
      if (layer && !layer.visible) continue;

      const strokeEnabled = isStrokeEffectivelyEnabled(shape, layer);
      if (!strokeEnabled) continue;

      const color = getEffectiveStrokeColor(shape, layer);
      const opacity = Math.max(0, Math.min(100, shape.strokeOpacity ?? 100)) / 100;
      const widthPx = shape.strokeWidth ?? 1;
      const key = ensureBucket(color, opacity, widthPx);

      if (shape.type === 'line' || shape.type === 'arrow') {
        const p0 = shape.points?.[0];
        const p1 = shape.points?.[1];
        if (!p0 || !p1) continue;
        addSegment(key, p0, p1);
        continue;
      }

      if (shape.type === 'polyline' || shape.type === 'eletroduto') {
        const pts = shape.points ?? [];
        if (pts.length < 2) continue;
        for (let i = 0; i + 1 < pts.length; i++) addSegment(key, pts[i]!, pts[i + 1]!);
        continue;
      }

      if (shape.type === 'circle') {
        if (shape.x === undefined || shape.y === undefined) continue;
        const w = shape.width ?? (shape.radius ?? 50) * 2;
        const h = shape.height ?? (shape.radius ?? 50) * 2;
        const rx = w / 2;
        const ry = h / 2;
        const rot = shape.rotation ?? 0;
        const c = rot ? Math.cos(rot) : 1;
        const s = rot ? Math.sin(rot) : 0;
        const cx = shape.x;
        const cy = shape.y;

        const prev = { x: cx + rx * c, y: cy + rx * s };
        let prevP = prev;
        for (let i = 1; i <= ellipseSegments; i++) {
          const t = (i / ellipseSegments) * Math.PI * 2;
          const lx = Math.cos(t) * rx;
          const ly = Math.sin(t) * ry;
          const px = rot ? cx + lx * c - ly * s : cx + lx;
          const py = rot ? cy + lx * s + ly * c : cy + ly;
          const nextP = { x: px, y: py };
          addSegment(key, prevP, nextP);
          prevP = nextP;
        }
        continue;
      }

      if (shape.type === 'polygon') {
        if (shape.x === undefined || shape.y === undefined) continue;
        const w = shape.width ?? (shape.radius ?? 50) * 2;
        const h = shape.height ?? (shape.radius ?? 50) * 2;
        const rx = w / 2;
        const ry = h / 2;
        const rot = shape.rotation ?? 0;
        const sides = Math.max(3, Math.floor(shape.sides ?? 6));
        const cx = shape.x;
        const cy = shape.y;
        const sx = shape.scaleX ?? 1;
        const sy = shape.scaleY ?? 1;

        const pts = Array.from({ length: sides }, (_, i) => {
          const t = (i / sides) * Math.PI * 2 - Math.PI / 2;
          const dx0 = Math.cos(t) * rx * sx;
          const dy0 = Math.sin(t) * ry * sy;
          if (!rot) return { x: cx + dx0, y: cy + dy0 };
          const c = Math.cos(rot);
          const s = Math.sin(rot);
          return { x: cx + dx0 * c - dy0 * s, y: cy + dx0 * s + dy0 * c };
        });

        for (let i = 0; i < pts.length; i++) {
          const a = pts[i]!;
          const b = pts[(i + 1) % pts.length]!;
          addSegment(key, a, b);
        }
      }
    }

    const out: StrokeGroup[] = [];
    for (const [key, bucket] of buckets) {
      if (bucket.floats.length === 0) continue;
      out.push({
        key,
        color: bucket.color,
        opacity: bucket.opacity,
        widthPx: bucket.widthPx,
        positions: new Float32Array(bucket.floats),
      });
    }
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }, [activeDiscipline, activeFloorId, layerById, shapesById]);

  return (
    <>
      {groups.map((g) => (
        <StrokeSegments key={`${g.key}:${g.positions.length}`} group={g} />
      ))}
    </>
  );
};

const CameraParitySync: React.FC<{ viewTransform: ReturnType<typeof useUIStore.getState>['viewTransform'] }> = ({ viewTransform }) => {
  const { camera, size } = useThree();
  useEffect(() => {
    const ortho = camera as THREE.OrthographicCamera;
    const { width, height } = size;
    ortho.left = -width / 2;
    ortho.right = width / 2;
    ortho.top = height / 2;
    ortho.bottom = -height / 2;
    ortho.zoom = viewTransform.scale || 1;
    ortho.position.x = (width / 2 - viewTransform.x) / (viewTransform.scale || 1);
    ortho.position.y = -(height / 2 - viewTransform.y) / (viewTransform.scale || 1);
    ortho.position.z = 50;
    ortho.updateProjectionMatrix();
  }, [camera, size, viewTransform]);
  return null;
};

const SharedGeometry: React.FC<MeshProps> = ({ module, engine, onBufferMeta }) => {
  const meshGeometry = useMemo(() => new THREE.BufferGeometry(), []);

  const sharedVertexColorMaterial = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute vec4 color;
        varying vec4 vColor;
        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          gl_FragColor = vColor;
        }
      `,
    });
    mat.side = THREE.DoubleSide;
    return mat;
  }, []);

  // Removed attrRefs as they are no longer the source of truth for updates.

  const lastHeapRef = useRef<ArrayBuffer | null>(null);
  const lastMeshGenRef = useRef<number>(-1);
  const lastLineGenRef = useRef<number>(-1);
  const sentMeshGenRef = useRef<number>(-1);
  const sentLineGenRef = useRef<number>(-1);

  const bindInterleavedAttribute = (
    geometry: THREE.BufferGeometry,
    meta: BufferMeta,
    force: boolean,
    floatsPerVertex: number,
  ) => {
    const heapChanged = module.HEAPF32.buffer !== lastHeapRef.current;
    const currentPosition = geometry.attributes.position as THREE.InterleavedBufferAttribute;
    const needsRebind = force || heapChanged || !currentPosition || meta.ptr !== (currentPosition.data as any)?.__ptr;

    if (needsRebind) {
      const start = meta.ptr >>> 2;
      const end = start + meta.floatCount;
      const view = module.HEAPF32.subarray(start, end);

      const interleavedBuffer = new THREE.InterleavedBuffer(view, floatsPerVertex);
      interleavedBuffer.setUsage(THREE.DynamicDrawUsage);
      (interleavedBuffer as any).__ptr = meta.ptr; // track pointer for cheap equality

      geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0));
      
      if (floatsPerVertex === 7) {
        geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(interleavedBuffer, 4, 3));
      } else if (floatsPerVertex === 6) {
        geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 3));
      } else {
        geometry.deleteAttribute('color');
      }

      lastHeapRef.current = module.HEAPF32.buffer as ArrayBuffer;
    }
    
    geometry.setDrawRange(0, meta.vertexCount);

    const positionAttr = geometry.attributes.position as THREE.InterleavedBufferAttribute;
    if (positionAttr) {
        positionAttr.data.needsUpdate = true;
    }
  };

  useFrame(() => {
    const meshMeta = engine.getPositionBufferMeta();
    const lineMeta = engine.getLineBufferMeta();

    const meshGenChanged = meshMeta.generation !== lastMeshGenRef.current;
    const lineGenChanged = lineMeta.generation !== lastLineGenRef.current;
    const forceRebind = module.HEAPF32.buffer !== lastHeapRef.current;

    if (meshMeta.floatCount > 0) {
      bindInterleavedAttribute(meshGeometry, meshMeta, forceRebind || meshGenChanged, 7);
    } else {
      meshGeometry.setDrawRange(0, 0);
    }

    if ((meshGenChanged || lineGenChanged) && (meshMeta.generation !== sentMeshGenRef.current || lineMeta.generation !== sentLineGenRef.current)) {
      onBufferMeta({ triangles: meshMeta, lines: lineMeta });
      sentMeshGenRef.current = meshMeta.generation;
      sentLineGenRef.current = lineMeta.generation;
    }

    lastMeshGenRef.current = meshMeta.generation;
    lastLineGenRef.current = lineMeta.generation;
  });

  return (
    <>
      <mesh geometry={meshGeometry} material={sharedVertexColorMaterial} frustumCulled={false} />
    </>
  );
};

const DebugOverlay: React.FC<{
  engineStats: ReturnType<CadEngineInstance['getStats']> | null;
  buffers: BufferMetaPair;
}> = ({ engineStats, buffers }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        padding: '6px 10px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.65)',
        color: '#e2e8f0',
        fontSize: 12,
        fontFamily: 'monospace',
        pointerEvents: 'none',
        lineHeight: 1.4,
      }}
    >
      {engineStats ? (
        <>
          <div>world: rect {engineStats.rectCount} line {engineStats.lineCount} poly {engineStats.polylineCount}</div>
          <div>buffers: triVtx {engineStats.triangleVertexCount} lineVtx {engineStats.lineVertexCount}</div>
          <div>
            timings: load {engineStats.lastLoadMs.toFixed(2)}ms rebuild {engineStats.lastRebuildMs.toFixed(2)}ms
            {engineStats.lastApplyMs !== undefined ? ` apply ${engineStats.lastApplyMs.toFixed(2)}ms` : ''}
          </div>
        </>
      ) : null}
      {buffers.triangles ? (
        <div>triangles: vtx {buffers.triangles.vertexCount} gen {buffers.triangles.generation}</div>
      ) : null}
      {buffers.lines ? (
        <div>lines: vtx {buffers.lines.vertexCount} gen {buffers.lines.generation}</div>
      ) : null}
    </div>
  );
};

type CadViewerProps = {
  embedded?: boolean;
};

const CadViewer: React.FC<CadViewerProps> = ({ embedded = false }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [module, setModule] = useState<WasmModule | null>(null);
  const [engine, setEngine] = useState<CadEngineInstance | null>(null);
  const [worldSnapshot, setWorldSnapshot] = useState<WorldSnapshot | null>(null);
  const [idHashToString, setIdHashToString] = useState<Map<number, string>>(() => new Map());
  const [idStringToHash, setIdStringToHash] = useState<Map<string, number>>(() => new Map());
  const [engineStats, setEngineStats] = useState<ReturnType<CadEngineInstance['getStats']> | null>(null);
  const [bufferStats, setBufferStats] = useState<BufferMetaPair>({ triangles: null, lines: null });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformStart = useRef<{ x: number; y: number; scale: number } | null>(null);
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);

  const viewTransform = useUIStore((state) => state.viewTransform);
  const canvasSize = useUIStore((state) => state.canvasSize);
  const setViewTransform = useUIStore((state) => state.setViewTransform);
  const selectedShapeIds = useUIStore((state) => state.selectedShapeIds);
  const setSelectedShapeIds = useUIStore((state) => state.setSelectedShapeIds);
  const isEditingAppearance = useUIStore((state) => state.isEditingAppearance);
  const snapOptions = useSettingsStore((state) => state.snap);
  const gridSize = useSettingsStore((state) => state.grid.size);

  const supportsSnapshot = !!engine && isSnapshotCapableEngine(engine);

  const snapIndex = useMemo(() => {
    if (!supportsSnapshot || !worldSnapshot) return null;
    // Cell size is in world units; tuned for low overhead for 10k+.
    return buildSnapIndex(worldSnapshot, 64);
  }, [supportsSnapshot, worldSnapshot]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const runtime = await getEngineRuntime();
        if (cancelled) return;
        setModule(runtime.module as unknown as WasmModule);
        setEngine(runtime.engine as unknown as CadEngineInstance);
        setIdHashToString(runtime.getIdMaps().idHashToString);
        setIdStringToHash(runtime.getIdMaps().idStringToHash);
        setStatus('ready');
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError((e as Error)?.message ?? 'Failed to load WASM module');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    if (!module) return;
    if (supportsSnapshot) return;

    setError('WASM engine is missing required snapshot APIs (rebuild WASM artifacts).');
    setStatus('error');
  }, [engine, module, supportsSnapshot]);

  useEffect(() => {
    if (!engine) return;
    if (!module) return;
    if (!supportsSnapshot) return;
    if (!engineStats) return;

    try {
      const meta = engine.getSnapshotBufferMeta();
      if (meta.byteCount <= 0) {
        setWorldSnapshot({ version: 2, rects: [], lines: [], polylines: [], points: [] });
        return;
      }
      const view = module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount);
      const decoded = decodeWorldSnapshot(new Uint8Array(view));
      setWorldSnapshot(migrateWorldSnapshotToLatest(decoded));
    } catch (e) {
      console.error(e);
      setError((e as Error)?.message ?? 'Failed to decode WASM snapshot bytes');
      setStatus('error');
    }
  }, [engine, engineStats, module, supportsSnapshot]);

  const handleBufferMeta = useCallback((meta: BufferMetaPair) => {
    setBufferStats(meta);
    if (engine) setEngineStats(engine.getStats());
  }, [engine]);

  const handleWheel = useCallback(
    (evt: React.WheelEvent<HTMLDivElement>) => {
      evt.preventDefault();
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const mouse = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
      setViewTransform((prev) => calculateZoomTransform(prev, mouse, evt.deltaY, screenToWorld));
    },
    [setViewTransform],
  );

  const handlePointerDown = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      if (evt.button === 1 || evt.button === 2 || evt.altKey) {
        setIsPanning(true);
        panStart.current = { x: evt.clientX, y: evt.clientY };
        transformStart.current = { ...viewTransform };
      }
    },
    [viewTransform],
  );

  const handlePointerMove = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning && transformStart.current) {
        const dx = evt.clientX - panStart.current.x;
        const dy = evt.clientY - panStart.current.y;
        setViewTransform({
          x: transformStart.current.x + dx,
          y: transformStart.current.y + dy,
          scale: transformStart.current.scale,
        });
        return;
      }

      // Snapping preview (grid-only during Phase 6 flip; object snapping will move to WASM).
      const worldPt = toWorldPoint(evt, viewTransform);
      const threshold = HIT_TOLERANCE / (viewTransform.scale || 1);
      if (!snapOptions.enabled) {
        setSnapPoint(null);
        return;
      }

      // 1) Object snapping (from current snapshot), then 2) grid snapping.
      if (supportsSnapshot && snapIndex && (snapOptions.endpoint || snapOptions.midpoint || snapOptions.center || snapOptions.nearest)) {
        const hit = querySnapIndex(snapIndex, worldPt, threshold);
        if (hit) {
          setSnapPoint(hit);
          return;
        }
      }

      if (snapOptions.grid) {
        const gx = Math.round(worldPt.x / gridSize) * gridSize;
        const gy = Math.round(worldPt.y / gridSize) * gridSize;
        const dx = worldPt.x - gx;
        const dy = worldPt.y - gy;
        const d = Math.hypot(dx, dy);
        setSnapPoint(d <= threshold ? { x: gx, y: gy } : null);
        return;
      }

      setSnapPoint(null);
    },
    [gridSize, isPanning, setViewTransform, snapIndex, snapOptions.center, snapOptions.enabled, snapOptions.endpoint, snapOptions.grid, snapOptions.midpoint, snapOptions.nearest, supportsSnapshot, viewTransform],
  );

  const handlePointerUp = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      if (isPanning) {
        setIsPanning(false);
        return;
      }
      if (evt.button !== 0) return;
      const worldPt = toWorldPoint(evt, viewTransform);
      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hitId = supportsSnapshot && worldSnapshot ? pickShapeAt(worldPt, worldSnapshot, idHashToString, tolerance) : null;
      if (hitId) {
        setSelectedShapeIds(new Set([hitId]));
      } else {
        setSelectedShapeIds(new Set());
      }
    },
    [idHashToString, isPanning, setSelectedShapeIds, supportsSnapshot, viewTransform, worldSnapshot],
  );

  if (status === 'loading') return <div>Loading CAD engine (WASM)...</div>;
  if (status === 'error') return <div>Error: {error}</div>;
  if (!module || !engine) return <div>Loading...</div>;

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative', background: '#0b1021', overflow: 'hidden' }}
      onWheel={embedded ? undefined : handleWheel}
      onPointerDown={embedded ? undefined : handlePointerDown}
      onPointerMove={embedded ? undefined : handlePointerMove}
      onPointerUp={embedded ? undefined : handlePointerUp}
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 50], near: -1000, far: 1000, zoom: viewTransform.scale }}
        style={embedded ? { pointerEvents: 'none' } : undefined}
      >
        <CameraParitySync viewTransform={viewTransform} />
        <ambientLight intensity={0.8} />
        <SharedGeometry module={module} engine={engine} onBufferMeta={handleBufferMeta} />
        <StrokeSegmentsLayer />
        <OverlayShapesLayer />
        <SymbolAtlasLayer />
        <TextSdfLayer />
        <axesHelper args={[5]} />
        {!isEditingAppearance ? <SelectionOverlay selectedIds={selectedShapeIds} /> : null}
        {!embedded && snapPoint ? (
          <mesh position={[snapPoint.x, snapPoint.y, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="#f472b6" />
          </mesh>
        ) : null}
      </Canvas>
      {!embedded ? (
        <DebugOverlay engineStats={engineStats} buffers={bufferStats} />
      ) : null}
    </div>
  );
};

export default CadViewer;
