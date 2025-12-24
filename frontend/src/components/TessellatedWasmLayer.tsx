import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { BufferMeta } from '@/engine/runtime/EngineRuntime';
import { getEngineRuntime } from '@/engine/runtime/singleton';
import { useUIStore } from '@/stores/useUIStore';
import type { TessellatedRenderer } from '@/engine/renderers/tessellatedRenderer';
import { createTessellatedRenderer } from '@/engine/renderers/createTessellatedRenderer';

const darkClear = { r: 0x0b / 255, g: 0x10 / 255, b: 0x21 / 255, a: 1 };

const TessellatedWasmLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);

  const viewTransformRef = useRef(viewTransform);
  const canvasSizeRef = useRef(canvasSize);
  const rendererRef = useRef<TessellatedRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  const [runtime, setRuntime] = useState<Awaited<ReturnType<typeof getEngineRuntime>> | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

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
    if (!canvasEl) return;
    if (!runtime) return;

    let disposed = false;

    (async () => {
      try {
        // Create WebGL2 renderer directly
        const renderer = await createTessellatedRenderer(canvasEl, { aaScale: 2 });
        if (disposed) {
          renderer.dispose();
          return;
        }
        rendererRef.current = renderer;
      } catch (e) {
        console.error('[tessellated] Renderer init failed', e);
      }
    })();

    return () => {
      disposed = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [canvasEl, runtime]);

  useEffect(() => {
    if (!runtime) return;

    const tick = () => {
      const renderer = rendererRef.current;
      if (!renderer) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const meta = runtime.engine.getPositionBufferMeta();

      // Engine-native text: rebuild quad buffer (if supported) and feed meta to renderer.
      runtime.engine.rebuildTextQuadBuffer?.();
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

  return (
    <canvas
      ref={setCanvasEl}
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
