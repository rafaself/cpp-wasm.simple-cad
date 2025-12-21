
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { getShapeBounds, screenToWorld } from '@/utils/geometry';
import { HIT_TOLERANCE } from '@/config/constants';
import { calculateZoomTransform } from '@/utils/zoomHelper';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { Shape } from '@/types';
import TextSdfLayer from './TextSdfLayer';
import SymbolAtlasLayer from './SymbolAtlasLayer';
import { decodeWorldSnapshot, migrateWorldSnapshotToLatest, type WorldSnapshot } from '../next/worldSnapshot';
import { buildSnapIndex, querySnapIndex } from '../next/snapIndex';
import { getEngineRuntime } from '@/engine/runtime/singleton';
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
type BufferUpdateCounters = { attributeUpdates: number; rebinds: number };
type BufferUpdateStats = {
  triangles: BufferUpdateCounters;
  lines: BufferUpdateCounters;
};

type MeshProps = {
  module: WasmModule;
  engine: CadEngineInstance;
  onBufferMeta: (meta: BufferMetaPair, stats: BufferUpdateStats) => void;
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
      depthTest: false,
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
  const lastMeshMetaRef = useRef<BufferMeta | null>(null);
  const lastLineMetaRef = useRef<BufferMeta | null>(null);
  const lastSentMetaRef = useRef<BufferMetaPair | null>(null);
  const updateStatsRef = useRef<BufferUpdateStats>({
    triangles: { attributeUpdates: 0, rebinds: 0 },
    lines: { attributeUpdates: 0, rebinds: 0 },
  });

  const bindInterleavedAttribute = (
    geometry: THREE.BufferGeometry,
    meta: BufferMeta,
    floatsPerVertex: number,
  ) => {
    const previousMeta = lastMeshMetaRef.current;
    const heapChanged = module.HEAPF32.buffer !== lastHeapRef.current;
    const generationChanged = meta.generation !== previousMeta?.generation;
    const pointerChanged = meta.ptr !== previousMeta?.ptr;
    const floatCountChanged = meta.floatCount !== previousMeta?.floatCount;
    const vertexCountChanged = meta.vertexCount !== previousMeta?.vertexCount;
    const needsRebind = heapChanged || pointerChanged || floatCountChanged || !previousMeta;
    const needsAttributeUpdate = needsRebind || generationChanged;
    const drawRangeChanged = needsAttributeUpdate || vertexCountChanged;

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
      updateStatsRef.current.triangles.rebinds += 1;
    }

    if (drawRangeChanged) {
      geometry.setDrawRange(0, meta.vertexCount);
    }

    const positionAttr = geometry.attributes.position as THREE.InterleavedBufferAttribute;
    if (needsAttributeUpdate && positionAttr?.data) {
      positionAttr.data.needsUpdate = true;
      updateStatsRef.current.triangles.attributeUpdates += 1;
    }

    lastMeshMetaRef.current = { ...meta };

    return {
      generationChanged,
      pointerChanged,
      floatCountChanged,
      vertexCountChanged,
      needsRebind,
      needsAttributeUpdate,
    };
  };

  useFrame(() => {
    const meshMeta = engine.getPositionBufferMeta();
    const lineMeta = engine.getLineBufferMeta();

    let meshChange;

    if (meshMeta.floatCount > 0) {
      meshChange = bindInterleavedAttribute(meshGeometry, meshMeta, 7);
    } else {
      meshGeometry.setDrawRange(0, 0);
      const previousMeta = lastMeshMetaRef.current;
      meshChange = {
        generationChanged: meshMeta.generation !== previousMeta?.generation,
        pointerChanged: meshMeta.ptr !== previousMeta?.ptr,
        floatCountChanged: meshMeta.floatCount !== previousMeta?.floatCount,
        vertexCountChanged: meshMeta.vertexCount !== previousMeta?.vertexCount,
        needsRebind: false,
        needsAttributeUpdate: false,
      };
      lastMeshMetaRef.current = { ...meshMeta };
    }

    const previousLineMeta = lastLineMetaRef.current;
    const lineChange = {
      generationChanged: lineMeta.generation !== previousLineMeta?.generation,
      pointerChanged: lineMeta.ptr !== previousLineMeta?.ptr,
      floatCountChanged: lineMeta.floatCount !== previousLineMeta?.floatCount,
      vertexCountChanged: lineMeta.vertexCount !== previousLineMeta?.vertexCount,
    };
    lastLineMetaRef.current = { ...lineMeta };

    if (
      lineChange.generationChanged ||
      lineChange.pointerChanged ||
      lineChange.floatCountChanged ||
      lineChange.vertexCountChanged
    ) {
      updateStatsRef.current.lines.attributeUpdates += 1;
    }

    const hasDelta = (current: BufferMeta, previous: BufferMeta | null | undefined) => {
      if (!previous) return true;
      return (
        current.generation !== previous.generation ||
        current.ptr !== previous.ptr ||
        current.floatCount !== previous.floatCount ||
        current.vertexCount !== previous.vertexCount
      );
    };

    const lastSent = lastSentMetaRef.current;
    const metaChangedSinceLastSend =
      hasDelta(meshMeta, lastSent?.triangles) ||
      hasDelta(lineMeta, lastSent?.lines) ||
      meshChange.vertexCountChanged ||
      lineChange.vertexCountChanged;

    if (meshChange.needsRebind || metaChangedSinceLastSend) {
      lastSentMetaRef.current = { triangles: meshMeta, lines: lineMeta };
      onBufferMeta(
        { triangles: meshMeta, lines: lineMeta },
        {
          triangles: { ...updateStatsRef.current.triangles },
          lines: { ...updateStatsRef.current.lines },
        },
      );
    }
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
  bufferUpdates: BufferUpdateStats;
}> = ({ engineStats, buffers, bufferUpdates }) => {
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
      <div>
        updates: tri upd {bufferUpdates.triangles.attributeUpdates} rb {bufferUpdates.triangles.rebinds} | line upd {bufferUpdates.lines.attributeUpdates} rb {bufferUpdates.lines.rebinds}
      </div>
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
  const [bufferUpdateStats, setBufferUpdateStats] = useState<BufferUpdateStats>({
    triangles: { attributeUpdates: 0, rebinds: 0 },
    lines: { attributeUpdates: 0, rebinds: 0 },
  });
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

  const handleBufferMeta = useCallback((meta: BufferMetaPair, stats: BufferUpdateStats) => {
    setBufferStats(meta);
    setBufferUpdateStats(stats);
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
        <DebugOverlay engineStats={engineStats} buffers={bufferStats} bufferUpdates={bufferUpdateStats} />
      ) : null}
    </div>
  );
};

export default CadViewer;
