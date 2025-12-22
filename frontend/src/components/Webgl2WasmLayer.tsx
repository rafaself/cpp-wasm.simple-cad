import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { BufferMeta } from '@/engine/runtime/EngineRuntime';
import { getEngineRuntime } from '@/engine/runtime/singleton';
import { useUIStore } from '@/stores/useUIStore';

import { Webgl2TessellatedRenderer } from '@/engine/renderers/webgl2/webgl2TessellatedRenderer';

const darkClear = { r: 0x0b / 255, g: 0x10 / 255, b: 0x21 / 255, a: 1 };

const Webgl2WasmLayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Webgl2TessellatedRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const viewTransformRef = useRef(viewTransform);
  const canvasSizeRef = useRef(canvasSize);

  const [runtime, setRuntime] = useState<Awaited<ReturnType<typeof getEngineRuntime>> | null>(null);

  const clearColor = useMemo(() => darkClear, []);

  useEffect(() => {
    viewTransformRef.current = viewTransform;
  }, [viewTransform]);

  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!runtime) return;

    if (!rendererRef.current) {
      try {
        rendererRef.current = new Webgl2TessellatedRenderer(canvas, { aaScale: 2 });
      } catch (e) {
        console.error(e);
        rendererRef.current = null;
      }
    }

    const renderer = rendererRef.current;
    if (!renderer) return;

    const tick = () => {
      if (!runtimeRefOk(runtime)) return;

      // If the WASM build supports engine-native text, rebuild its quad buffer
      // before pulling buffer metadata for this frame.
      runtime.engine.rebuildTextQuadBuffer?.();

      const meta = runtime.engine.getPositionBufferMeta();

      const textQuadMeta = runtime.engine.getTextQuadBufferMeta?.();
      const textAtlasMeta = runtime.engine.getAtlasTextureMeta?.();

      renderer.render({
        module: runtime.module,
        positionMeta: meta as BufferMeta,
        viewTransform: viewTransformRef.current,
        canvasSizeCss: canvasSizeRef.current,
        clearColor,
        textQuadMeta: textQuadMeta && textAtlasMeta?.width ? textQuadMeta : undefined,
        textAtlasMeta: textQuadMeta && textAtlasMeta?.width ? textAtlasMeta : undefined,
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
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
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

const runtimeRefOk = (runtime: Awaited<ReturnType<typeof getEngineRuntime>>): boolean => {
  return !!runtime?.engine && !!runtime?.module;
};

export default Webgl2WasmLayer;
