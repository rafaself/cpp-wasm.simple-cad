import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

type CadEngineInstance = {
  addWall: (x: number, y: number, w: number, h: number) => void;
  getVertexCount: () => number;
  getVertexDataPtr: () => number;
};

type WasmModule = {
  CadEngine: new () => CadEngineInstance;
  HEAPF32: Float32Array;
};

type EngineFactory = (opts?: unknown) => Promise<WasmModule>;

const MeshFromSharedVertices: React.FC<{ module: WasmModule; engine: CadEngineInstance }> = ({ module, engine }) => {
  const [view, setView] = useState<Float32Array | null>(null);

  useEffect(() => {
    // Populate geometry once for the POC.
    engine.addWall(0, 0, 10, 2);

    const ptrBytes = engine.getVertexDataPtr();
    const vertexCount = engine.getVertexCount();

    // HEAPF32 is indexed in 4-byte floats, while C++ pointers are byte offsets.
    const start = (ptrBytes / 4) | 0;
    const floatCount = vertexCount * 3;
    const end = start + floatCount;

    const verticesView = module.HEAPF32.subarray(start, end);
    setView(verticesView);
  }, [engine, module]);

  const geometry = useMemo(() => {
    if (!view) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(view, 3));
    g.computeVertexNormals();
    return g;
  }, [view]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial color="#22c55e" wireframe />
    </mesh>
  );
};

const CadViewer: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [module, setModule] = useState<WasmModule | null>(null);
  const [engine, setEngine] = useState<CadEngineInstance | null>(null);

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

  if (status === 'loading') return <div>Loading CAD engine (WASM)...</div>;
  if (status === 'error') return <div>Error: {error}</div>;
  if (!module || !engine) return <div>Loading...</div>;

  return (
    <div style={{ width: '100%', height: 360 }}>
      <Canvas camera={{ position: [0, 0, 20], near: 0.1, far: 1000 }}>
        <ambientLight intensity={0.8} />
        <MeshFromSharedVertices module={module} engine={engine} />
        <axesHelper args={[5]} />
      </Canvas>
    </div>
  );
};

export default CadViewer;

