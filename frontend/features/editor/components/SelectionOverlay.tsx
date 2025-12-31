import React, { useEffect, useMemo, useState, useRef } from 'react';

import { supportsEngineResize } from '@/engine/core/capabilities';
import { decodeOverlayBuffer } from '@/engine/core/overlayDecoder';
import { OverlayKind } from '@/engine/core/protocol';
import { getEngineRuntime } from '@/engine/core/singleton';
import { useEngineSelectionCount } from '@/engine/core/useEngineSelection';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { worldToScreen } from '@/utils/viewportMath';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';

const HANDLE_SIZE_PX = 8;

const SelectionOverlay: React.FC<{ hideAnchors?: boolean }> = ({ hideAnchors = false }) => {
  const selectionCount = useEngineSelectionCount();
  const isEditingAppearance = useUIStore((s) => s.isEditingAppearance);
  const engineInteractionActive = useUIStore((s) => s.engineInteractionActive);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const enableEngineResize = useSettingsStore((s) => s.featureFlags.enableEngineResize);
  const engineCapabilitiesMask = useSettingsStore((s) => s.engineCapabilitiesMask);
  const engineResizeEnabled = enableEngineResize && supportsEngineResize(engineCapabilitiesMask);

  const [runtime, setRuntime] = useState<EngineRuntime | null>(null);
  // Tick counter that increments during interaction to force overlay recalculation
  const [interactionTick, setInteractionTick] = useState(0);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    void getEngineRuntime().then((rt) => {
      if (!disposed) setRuntime(rt);
    });
    return () => {
      disposed = true;
    };
  }, []);

  // RAF loop to update overlay during interaction (drag/move)
  useEffect(() => {
    if (!runtime) return;

    const tick = () => {
      if (runtime.isInteractionActive()) {
        setInteractionTick((t) => (t + 1) >>> 0);
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [runtime]);

  const selectedOverlaySvg = useMemo(() => {
    if (!runtime) return null;
    if (isEditingAppearance || engineInteractionActive) return null;
    if (selectionCount === 0) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const outlineMeta = runtime.getSelectionOutlineMeta();
    const handleMeta = runtime.getSelectionHandleMeta();
    const outline = decodeOverlayBuffer(runtime.module.HEAPU8, outlineMeta);
    const handles = decodeOverlayBuffer(runtime.module.HEAPU8, handleMeta);

    if (outline.primitives.length === 0 && handles.primitives.length === 0) return null;


    const hs = HANDLE_SIZE_PX;
    const hh = hs / 2;

    const renderPoints = (prim: { count: number; offset: number }) => {
      const pts: { x: number; y: number }[] = [];
      const start = prim.offset;
      for (let i = 0; i < prim.count; i++) {
        const idx = start + i * 2;
        const x = outline.data[idx] ?? 0;
        const y = outline.data[idx + 1] ?? 0;
        pts.push(worldToScreen({ x, y }, viewTransform));
      }
      return pts;
    };

    const renderHandlePoints = (prim: { count: number; offset: number }) => {
      const pts: { x: number; y: number }[] = [];
      const start = prim.offset;
      for (let i = 0; i < prim.count; i++) {
        const idx = start + i * 2;
        const x = handles.data[idx] ?? 0;
        const y = handles.data[idx + 1] ?? 0;
        pts.push(worldToScreen({ x, y }, viewTransform));
      }
      return pts;
    };

    return (
      <svg
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {outline.primitives.map((prim, idx) => {
          if (prim.count < 2) return null;
          const pts = renderPoints(prim);
          const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

          if (prim.kind === OverlayKind.Segment) {
            const a = pts[0];
            const b = pts[1];
            if (!a || !b) return null;
            return (
              <line
                key={`seg-${idx}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className="stroke-primary"
                strokeWidth={1}
              />
            );
          }

          if (prim.kind === OverlayKind.Polyline) {
            return (
              <polyline
                key={`poly-${idx}`}
                points={pointsAttr}
                fill="transparent"
                className="stroke-primary"
                strokeWidth={1}
              />
            );
          }

          return (
            <polygon
              key={`poly-${idx}`}
              points={pointsAttr}
              fill="transparent"
              className="stroke-primary"
              strokeWidth={1}
            />
          );
        })}

        {!hideAnchors &&
          (engineResizeEnabled || handles.primitives.length > 0) &&
          handles.primitives.map((prim, idx) => {
            if (prim.count < 1) return null;
            const pts = renderHandlePoints(prim);
            return (
              <g key={`handles-${idx}`}>
                {pts.map((p, i) => (
                  <rect
                    key={i}
                    x={p.x - hh}
                    y={p.y - hh}
                    width={hs}
                    height={hs}
                    className="fill-white stroke-primary"
                    strokeWidth={1}
                  />
                ))}
              </g>
            );
          })}
      </svg>
    );
  }, [
    canvasSize.height,
    canvasSize.width,
    engineInteractionActive,
    engineResizeEnabled,
    hideAnchors,
    interactionTick, // Forces recalculation during drag
    isEditingAppearance,
    runtime,
    selectionCount,
    viewTransform,
  ]);

  return selectedOverlaySvg;
};

export default SelectionOverlay;
