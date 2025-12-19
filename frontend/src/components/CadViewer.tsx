
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useDataStore } from '../stores/useDataStore';
import { useUIStore } from '../stores/useUIStore';
import { buildRenderBatch, RenderExtractResult, RenderExtractShape, RenderExtractStats } from '../next/renderExtract';

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

  const shapes = useDataStore((state) => state.shapes);
  const layers = useDataStore((state) => state.layers);
  const viewTransform = useUIStore((state) => state.viewTransform);
  const canvasSize = useUIStore((state) => state.canvasSize);
  const activeFloorId = useUIStore((state) => state.activeFloorId);
  const activeDiscipline = useUIStore((state) => state.activeDiscipline);

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

  if (status === 'loading') return <div>Loading CAD engine (WASM)...</div>;
  if (status === 'error') return <div>Error: {error}</div>;
  if (!module || !engine) return <div>Loading...</div>;

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#0b1021' }}>
      <Canvas camera={{ position: [0, 0, 20], near: 0.1, far: 1000 }}>
        <ambientLight intensity={0.8} />
        <SharedGeometry module={module} engine={engine} onBufferMeta={handleBufferMeta} />
        <axesHelper args={[5]} />
      </Canvas>
      <DebugOverlay shapeStats={shapeStats} buffers={bufferStats} />
    </div>
  );
};

export default CadViewer;
