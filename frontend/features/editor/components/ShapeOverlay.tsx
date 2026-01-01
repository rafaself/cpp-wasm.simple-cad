/**
 * ShapeOverlay - Unified overlay component for selection and draft shapes.
 *
 * This component renders:
 * 1. Selection overlays (bounding boxes and handles for selected entities)
 * 2. Draft overlays (bounding box, handles, and dimension labels during shape creation)
 *
 * All data comes from the C++ engine via OverlayBufferMeta (selection) and
 * DraftDimensions (draft), following the engine-first architecture.
 */
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
import type { DraftDimensions } from '@/engine/core/wasm-types';

const HANDLE_SIZE_PX = 8;

const ShapeOverlay: React.FC = () => {
  const selectionCount = useEngineSelectionCount();
  const isEditingAppearance = useUIStore((s) => s.isEditingAppearance);
  const engineInteractionActive = useUIStore((s) => s.engineInteractionActive);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const enableEngineResize = useSettingsStore((s) => s.featureFlags.enableEngineResize);
  const engineCapabilitiesMask = useSettingsStore((s) => s.engineCapabilitiesMask);
  const engineResizeEnabled = enableEngineResize && supportsEngineResize(engineCapabilitiesMask);

  const [runtime, setRuntime] = useState<EngineRuntime | null>(null);
  const [interactionTick, setInteractionTick] = useState(0);
  const rafIdRef = useRef<number | null>(null);
  const [draftDimensions, setDraftDimensions] = useState<DraftDimensions | null>(null);

  useEffect(() => {
    let disposed = false;
    void getEngineRuntime().then((rt) => {
      if (!disposed) setRuntime(rt);
    });
    return () => {
      disposed = true;
    };
  }, []);

  // RAF loop to update overlay during interaction and draft
  useEffect(() => {
    if (!runtime) return;

    const tick = () => {
      // Check for active interaction or draft
      const dims = runtime.draft.getDraftDimensions();
      setDraftDimensions(dims);

      if (runtime.isInteractionActive() || dims) {
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

  const overlayContent = useMemo(() => {
    if (!runtime) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const hs = HANDLE_SIZE_PX;
    const hh = hs / 2;

    // Helper to transform world points to screen
    const renderPoints = (
      prim: { count: number; offset: number },
      data: Float32Array,
    ): { x: number; y: number }[] => {
      const pts: { x: number; y: number }[] = [];
      const start = prim.offset;
      for (let i = 0; i < prim.count; i++) {
        const idx = start + i * 2;
        const x = data[idx] ?? 0;
        const y = data[idx + 1] ?? 0;
        pts.push(worldToScreen({ x, y }, viewTransform));
      }
      return pts;
    };

    // Selection overlay (only when not in draft mode and not editing appearance)
    let selectionElements: React.ReactNode[] = [];
    if (!isEditingAppearance && !engineInteractionActive && selectionCount > 0 && !draftDimensions) {
      const outlineMeta = runtime.getSelectionOutlineMeta();
      const handleMeta = runtime.getSelectionHandleMeta();
      const outline = decodeOverlayBuffer(runtime.module.HEAPU8, outlineMeta);
      const handles = decodeOverlayBuffer(runtime.module.HEAPU8, handleMeta);

      // Render selection outlines
      outline.primitives.forEach((prim, idx) => {
        if (prim.count < 2) return;
        const pts = renderPoints(prim, outline.data);
        const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

        if (prim.kind === OverlayKind.Segment) {
          const a = pts[0];
          const b = pts[1];
          if (!a || !b) return;
          selectionElements.push(
            <line
              key={`sel-seg-${idx}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="stroke-primary"
              strokeWidth={1}
            />,
          );
        } else if (prim.kind === OverlayKind.Polyline) {
          selectionElements.push(
            <polyline
              key={`sel-poly-${idx}`}
              points={pointsAttr}
              fill="transparent"
              className="stroke-primary"
              strokeWidth={1}
            />,
          );
        } else {
          selectionElements.push(
            <polygon
              key={`sel-pgon-${idx}`}
              points={pointsAttr}
              fill="transparent"
              className="stroke-primary"
              strokeWidth={1}
            />,
          );
        }
      });

      // Render selection handles
      if (engineResizeEnabled || handles.primitives.length > 0) {
        handles.primitives.forEach((prim, idx) => {
          if (prim.count < 1) return;
          const pts = renderPoints(prim, handles.data);
          pts.forEach((p, i) => {
            selectionElements.push(
              <rect
                key={`sel-handle-${idx}-${i}`}
                x={p.x - hh}
                y={p.y - hh}
                width={hs}
                height={hs}
                className="fill-white stroke-primary"
                strokeWidth={1}
              />,
            );
          });
        });
      }
    }

    // Draft overlay
    let draftElements: React.ReactNode[] = [];
    if (draftDimensions && draftDimensions.active) {
      const { minX, minY, maxX, maxY, width, height, centerY } = draftDimensions;

      // Transform to screen coordinates
      const topLeft = worldToScreen({ x: minX, y: minY }, viewTransform);
      const bottomRight = worldToScreen({ x: maxX, y: maxY }, viewTransform);
      const screenWidth = bottomRight.x - topLeft.x;
      const screenHeight = bottomRight.y - topLeft.y;

      // Bounding box
      draftElements.push(
        <rect
          key="draft-bbox"
          x={topLeft.x}
          y={topLeft.y}
          width={screenWidth}
          height={screenHeight}
          fill="transparent"
          stroke="#0d99ff"
          strokeWidth={1}
          strokeDasharray="4 2"
        />,
      );

      // Corner handles
      const corners = [
        { x: topLeft.x, y: topLeft.y }, // TL
        { x: bottomRight.x, y: topLeft.y }, // TR
        { x: bottomRight.x, y: bottomRight.y }, // BR
        { x: topLeft.x, y: bottomRight.y }, // BL
      ];

      corners.forEach((corner, i) => {
        draftElements.push(
          <rect
            key={`draft-handle-${i}`}
            x={corner.x - hh}
            y={corner.y - hh}
            width={hs}
            height={hs}
            fill="white"
            stroke="#0d99ff"
            strokeWidth={1}
          />,
        );
      });

      // Dimension label (width × height)
      const labelCenter = worldToScreen({ x: (minX + maxX) / 2, y: maxY }, viewTransform);
      const dimText = `${Math.round(width)} × ${Math.round(height)}`;

      draftElements.push(
        <g key="draft-dim-label">
          <rect
            x={labelCenter.x - 40}
            y={labelCenter.y + 8}
            width={80}
            height={20}
            rx={4}
            fill="#0d99ff"
            fillOpacity={0.9}
          />
          <text
            x={labelCenter.x}
            y={labelCenter.y + 22}
            textAnchor="middle"
            fontSize={11}
            fontFamily="Inter, system-ui, sans-serif"
            fill="white"
          >
            {dimText}
          </text>
        </g>,
      );
    }

    if (selectionElements.length === 0 && draftElements.length === 0) {
      return null;
    }

    return (
      <svg
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {selectionElements}
        {draftElements}
      </svg>
    );
  }, [
    canvasSize.height,
    canvasSize.width,
    draftDimensions,
    engineInteractionActive,
    engineResizeEnabled,
    interactionTick,
    isEditingAppearance,
    runtime,
    selectionCount,
    viewTransform,
  ]);

  return overlayContent;
};

export default ShapeOverlay;
