
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import { buildRenderBatch, RenderExtractResult, RenderExtractShape, RenderExtractStats } from '../next/renderExtract';
import { screenToWorld } from '../utils/geometry';
import { HIT_TOLERANCE } from '../config/constants';
import { calculateZoomTransform } from '../utils/zoomHelper';
import { Shape } from '../types';
import { useSettingsStore } from '../stores/useSettingsStore';
import { snapBatch } from '../next/snapBatch';

// Mirrors the C++ BufferMeta exposed via Embind
export type BufferMeta = {
  generation: number;
  vertexCount: number;
  capacity: number;
  floatCount: number;
  ptr: number; // byte offset in WASM linear memory
};

type CadEngineInstance = {
  addWall: (x: number, y: number, w: number, h: number) => void; // legacy POC
  clear: () => void;
  loadShapes: (shapes: RenderExtractShape[]) => void;
  getPositionBufferMeta: () => BufferMeta; // triangles
  getLineBufferMeta: () => BufferMeta;      // line segments
};

type WasmModule = {
  CadEngine: new () => CadEngineInstance;
  HEAPF32: Float32Array;
};

type EngineFactory = (opts?: unknown) => Promise<WasmModule>;

type BufferMetaPair = { triangles: BufferMeta | null; lines: BufferMeta | null };

type MeshProps = {
  module: WasmModule;
  engine: CadEngineInstance;
  onBufferMeta: (meta: BufferMetaPair) => void;
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

const pickShapeAt = (worldPoint: { x: number; y: number }, batch: RenderExtractShape[], tolerance: number): string | null => {
  let best: PickingTarget | null = null;
  for (const shape of batch) {
    if (shape.type === 'rect') {
      const inside = worldPoint.x >= shape.x && worldPoint.x <= shape.x + shape.width && worldPoint.y >= shape.y && worldPoint.y <= shape.y + shape.height;
      if (inside) {
        const dist = 0;
        if (!best || dist < best.distance) {
          best = { shapeId: shape.id, distance: dist };
        }
      }
    } else if (shape.type === 'line') {
      const [p0, p1] = shape.points;
      const d = pointSegmentDistance(worldPoint, p0, p1);
      if (d <= tolerance && (!best || d < best.distance)) {
        best = { shapeId: shape.id, distance: d };
      }
    } else if (shape.type === 'polyline') {
      const pts = shape.points;
      for (let i = 0; i + 1 < pts.length; i++) {
        const d = pointSegmentDistance(worldPoint, pts[i], pts[i + 1]);
        if (d <= tolerance && (!best || d < best.distance)) {
          best = { shapeId: shape.id, distance: d };
        }
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

const SelectionOverlay: React.FC<{ selectedIds: Set<string>; shapes: Record<string, Shape> }> = ({ selectedIds, shapes }) => {
  const lines = useMemo(() => {
    const entries: { id: string; points: THREE.Vector3[] }[] = [];
    selectedIds.forEach((id) => {
      const shape = shapes[id];
      if (!shape) return;
      if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
        const x0 = shape.x;
        const y0 = shape.y;
        const x1 = x0 + shape.width;
        const y1 = y0 + shape.height;
        entries.push({
          id,
          points: [
            new THREE.Vector3(x0, y0, 0),
            new THREE.Vector3(x1, y0, 0),
            new THREE.Vector3(x1, y1, 0),
            new THREE.Vector3(x0, y1, 0),
            new THREE.Vector3(x0, y0, 0),
          ],
        });
      } else if ((shape.type === 'line' || shape.type === 'polyline') && Array.isArray(shape.points) && shape.points.length >= 2) {
        const pts = shape.points.map((p: any) => new THREE.Vector3(p.x, p.y, 0));
        entries.push({ id, points: pts });
      }
    });
    return entries;
  }, [selectedIds, shapes]);

  return (
    <>
      {lines.map(({ id, points }) => (
        <line key={id} geometry={new THREE.BufferGeometry().setFromPoints(points)}>
          <lineBasicMaterial color="#fbbf24" linewidth={2} />
        </line>
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
  const lineGeometry = useMemo(() => new THREE.BufferGeometry(), []);

  const meshAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const lineAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const lastHeapRef = useRef<ArrayBuffer | null>(null);
  const lastMeshGenRef = useRef<number>(-1);
  const lastLineGenRef = useRef<number>(-1);
  const sentMeshGenRef = useRef<number>(-1);
  const sentLineGenRef = useRef<number>(-1);

  const bindAttribute = (
    geometry: THREE.BufferGeometry,
    attrRef: React.MutableRefObject<THREE.BufferAttribute | null>,
    meta: BufferMeta,
    force: boolean,
  ) => {
    const heapChanged = module.HEAPF32.buffer !== lastHeapRef.current;
    const needsRebind = force || heapChanged || attrRef.current === null || meta.ptr !== (attrRef.current as any)?.__ptr;

    if (needsRebind) {
      const start = meta.ptr >>> 2; // bytes -> float32 index
      const end = start + meta.floatCount;
      const view = module.HEAPF32.subarray(start, end);

      const attr = new THREE.BufferAttribute(view, 3);
      (attr as any).__ptr = meta.ptr; // track pointer for cheap equality
      attr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', attr);
      attrRef.current = attr;
      lastHeapRef.current = module.HEAPF32.buffer;
    }

    geometry.setDrawRange(0, meta.vertexCount);
  };

  useFrame(() => {
    const meshMeta = engine.getPositionBufferMeta();
    const lineMeta = engine.getLineBufferMeta();

    const meshGenChanged = meshMeta.generation !== lastMeshGenRef.current;
    const lineGenChanged = lineMeta.generation !== lastLineGenRef.current;
    const forceRebind = module.HEAPF32.buffer !== lastHeapRef.current;

    if (meshMeta.floatCount > 0) {
      bindAttribute(meshGeometry, meshAttrRef, meshMeta, forceRebind);
      if (meshGenChanged && meshAttrRef.current) {
        meshAttrRef.current.needsUpdate = true;
      }
    } else {
      meshGeometry.setDrawRange(0, 0);
    }

    if (lineMeta.floatCount > 0) {
      bindAttribute(lineGeometry, lineAttrRef, lineMeta, forceRebind);
      if (lineGenChanged && lineAttrRef.current) {
        lineAttrRef.current.needsUpdate = true;
      }
    } else {
      lineGeometry.setDrawRange(0, 0);
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
      <mesh geometry={meshGeometry}>
        <meshBasicMaterial color="#22c55e" wireframe />
      </mesh>
      <lineSegments geometry={lineGeometry}>
        <lineBasicMaterial color="#93c5fd" linewidth={1} />
      </lineSegments>
    </>
  );
};

const DebugOverlay: React.FC<{ shapeStats: RenderExtractStats | null; buffers: BufferMetaPair }> = ({ shapeStats, buffers }) => {
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
      {shapeStats ? (
        <>
          <div>shapes: {shapeStats.supported} / {shapeStats.totalShapes} (supported/total)</div>
          <div>skipped: {shapeStats.skipped}</div>
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

const CadViewer: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [module, setModule] = useState<WasmModule | null>(null);
  const [engine, setEngine] = useState<CadEngineInstance | null>(null);
  const [shapeStats, setShapeStats] = useState<RenderExtractStats | null>(null);
  const [bufferStats, setBufferStats] = useState<BufferMetaPair>({ triangles: null, lines: null });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformStart = useRef<{ x: number; y: number; scale: number } | null>(null);
  const [snapPoint, setSnapPoint] = useState<{ x: number; y: number } | null>(null);

  const shapes = useDataStore((state) => state.shapes);
  const layers = useDataStore((state) => state.layers);
  const viewTransform = useUIStore((state) => state.viewTransform);
  const canvasSize = useUIStore((state) => state.canvasSize);
  const activeFloorId = useUIStore((state) => state.activeFloorId);
  const activeDiscipline = useUIStore((state) => state.activeDiscipline);
  const setViewTransform = useUIStore((state) => state.setViewTransform);
  const selectedShapeIds = useUIStore((state) => state.selectedShapeIds);
  const setSelectedShapeIds = useUIStore((state) => state.setSelectedShapeIds);
  const snapOptions = useSettingsStore((state) => state.snap);
  const gridSize = useSettingsStore((state) => state.grid.size);

  const renderExtract: RenderExtractResult = useMemo(() => {
    return buildRenderBatch(
      Object.values(shapes),
      layers,
      viewTransform,
      canvasSize,
      { activeFloorId: activeFloorId || undefined, activeDiscipline },
    );
  }, [shapes, layers, viewTransform, canvasSize, activeFloorId, activeDiscipline]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const factory = (await import('/wasm/engine.js')).default as EngineFactory;
        const wasm = await factory();
        if (cancelled) return;
        const instance = new wasm.CadEngine();
        setModule(wasm);
        setEngine(instance);
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
    engine.loadShapes(renderExtract.batch as RenderExtractShape[]);
    setShapeStats(renderExtract.stats);
  }, [engine, renderExtract]);

  const handleBufferMeta = useCallback((meta: BufferMetaPair) => {
    setBufferStats(meta);
  }, []);

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

      // Snapping preview (only when not panning)
      const worldPt = toWorldPoint(evt, viewTransform);
      const snap = snapBatch([{ point: worldPt }], Object.values(shapes), {
        snapOptions,
        gridSize,
        layers,
        threshold: HIT_TOLERANCE / (viewTransform.scale || 1),
      })[0];
      setSnapPoint(snap);
    },
    [isPanning, setViewTransform, viewTransform, shapes, snapOptions, gridSize, layers],
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
      const hitId = pickShapeAt(worldPt, renderExtract.batch, tolerance);
      if (hitId) {
        setSelectedShapeIds(new Set([hitId]));
      } else {
        setSelectedShapeIds(new Set());
      }
    },
    [isPanning, renderExtract.batch, setSelectedShapeIds, viewTransform],
  );

  if (status === 'loading') return <div>Loading CAD engine (WASM)...</div>;
  if (status === 'error') return <div>Error: {error}</div>;
  if (!module || !engine) return <div>Loading...</div>;

  return (
    <div
      style={{ width: '100%', height: '100vh', position: 'relative', background: '#0b1021', overflow: 'hidden' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <Canvas orthographic camera={{ position: [0, 0, 50], near: -1000, far: 1000, zoom: viewTransform.scale }}>
        <CameraParitySync viewTransform={viewTransform} />
        <ambientLight intensity={0.8} />
        <SharedGeometry module={module} engine={engine} onBufferMeta={handleBufferMeta} />
        <axesHelper args={[5]} />
        <SelectionOverlay selectedIds={selectedShapeIds} shapes={shapes} />
        {snapPoint ? (
          <mesh position={[snapPoint.x, snapPoint.y, 0]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="#f472b6" />
          </mesh>
        ) : null}
      </Canvas>
      <DebugOverlay shapeStats={shapeStats} buffers={bufferStats} />
    </div>
  );
};

export default CadViewer;
