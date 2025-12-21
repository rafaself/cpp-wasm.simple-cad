import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { BufferMeta } from '@/engine/runtime/EngineRuntime';
import { getEngineRuntime } from '@/engine/runtime/singleton';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { TessellatedRenderer } from '@/engine/renderers/tessellatedRenderer';
import { resolveTessellatedBackend, type TessellatedBackend } from '@/engine/renderers/tessellatedBackend';
import { isWebgpuSupported } from '@/engine/renderers/webgpu/webgpuSupport';
import { createTessellatedRenderer } from '@/engine/renderers/createTessellatedRenderer';

const darkClear = { r: 0x0b / 255, g: 0x10 / 255, b: 0x21 / 255, a: 1 };

const TessellatedWasmLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const renderMode = useSettingsStore((s) => s.featureFlags.renderMode);

  const viewTransformRef = useRef(viewTransform);
  const canvasSizeRef = useRef(canvasSize);
  const rendererRef = useRef<TessellatedRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  const [runtime, setRuntime] = useState<Awaited<ReturnType<typeof getEngineRuntime>> | null>(null);
  const [backend, setBackend] = useState<TessellatedBackend>('webgl2');
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  const clearColor = useMemo(() => darkClear, []);

  useEffect(() => {
    viewTransformRef.current = viewTransform;
  }, [viewTransform]);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  useEffect(() => {
    // Resolve backend synchronously (capability check only). If WebGPU init fails,
    // we fall back to WebGL2 when creating the renderer.
    const supportsWebgpu = isWebgpuSupported();
    const target = resolveTessellatedBackend(renderMode, supportsWebgpu);
    setBackend(target);
  }, [renderMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getEngineRuntime();
      if (cancelled) return;
      setRuntime(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    rendererRef.current = null;
    renderer?.dispose();
  }, [backend]);

  useEffect(() => {
    if (!canvasEl) return;
    if (!runtime) return;

    let disposed = false;

    (async () => {
      try {
        const desired = backend;
        const renderer =
          desired === 'webgpu'
            ? await createTessellatedRenderer(canvasEl, 'webgpu', { aaScale: 2 })
            : await createTessellatedRenderer(canvasEl, 'webgl2', { aaScale: 2 });
        if (disposed) {
          renderer.dispose();
          return;
        }
        rendererRef.current = renderer;
      } catch (e) {
        console.warn('[tessellated] WebGPU init failed, falling back to WebGL2', e);
        if (disposed) return;
        setBackend('webgl2');
      }
    })();

    return () => {
      disposed = true;
    };
  }, [backend, canvasEl, runtime]);

  useEffect(() => {
    if (!runtime) return;

    const tick = () => {
      const renderer = rendererRef.current;
      if (!renderer) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const meta = runtime.engine.getPositionBufferMeta();
      renderer.render({
        module: runtime.module,
        positionMeta: meta as BufferMeta,
        viewTransform: viewTransformRef.current,
        canvasSizeCss: canvasSizeRef.current,
        clearColor,
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [clearColor, runtime]);

  useEffect(() => {
    return () => {
      const renderer = rendererRef.current;
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, []);

  return (
    <canvas
      key={backend}
      ref={setCanvasEl}
      data-render-backend={backend}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        background: 'rgb(11,16,33)',
        pointerEvents: 'none',
      }}
    />
  );
};

export default TessellatedWasmLayer;

