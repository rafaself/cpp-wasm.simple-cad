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
import React, { useEffect, useMemo, useState } from 'react';

import { supportsEngineResize } from '@/engine/core/capabilities';
import { decodeOverlayBuffer } from '@/engine/core/overlayDecoder';
import { OverlayKind } from '@/engine/core/protocol';
import { getEngineRuntime } from '@/engine/core/singleton';
import { useEngineSelectionCount, useEngineSelectionIds } from '@/engine/core/useEngineSelection';
import { EntityKind } from '@/engine/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';
import { worldToScreen } from '@/utils/viewportMath';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';

const HANDLE_SIZE_PX = 8;

const ShapeOverlay: React.FC = () => {
  const selectionCount = useEngineSelectionCount();
  const selectionIds = useEngineSelectionIds();
  const isEditingAppearance = useUIStore((s) => s.isEditingAppearance);
  const isTextEditing = useUIStore((s) => s.engineTextEditState.active);
  const overlayTick = useUIStore((s) => s.overlayTick);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const enableEngineResize = useSettingsStore((s) => s.featureFlags.enableEngineResize);
  const engineCapabilitiesMask = useSettingsStore((s) => s.engineCapabilitiesMask);
  const engineResizeEnabled = enableEngineResize && supportsEngineResize(engineCapabilitiesMask);

  const [runtime, setRuntime] = useState<EngineRuntime | null>(null);

  useEffect(() => {
    let disposed = false;
    void getEngineRuntime().then((rt) => {
      if (!disposed) setRuntime(rt);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!runtime) return;
    if (!isCadDebugEnabled('overlay')) return;
    if (isEditingAppearance || isTextEditing) return;
    if (selectionCount === 0) return;

    const entityId = selectionIds[0];
    const entityKind = typeof entityId === 'number' ? runtime.getEntityKind(entityId) : null;
    const kindLabel =
      entityKind !== null && EntityKind[entityKind]
        ? EntityKind[entityKind]
        : entityKind !== null
          ? `Unknown(${entityKind})`
          : 'None';
    const isVertexOnly =
      entityKind === EntityKind.Line ||
      entityKind === EntityKind.Arrow ||
      entityKind === EntityKind.Polyline;
    const orientedMeta = runtime.getOrientedHandleMeta();
    const handleMeta = runtime.getSelectionHandleMeta();
    const handles = decodeOverlayBuffer(runtime.module.HEAPU8, handleMeta);
    const handleSample = Array.from(handles.data.slice(0, 8));

    let renderPath = 'none';
    if (selectionCount > 1) {
      renderPath = 'selectionBounds-multiselect';
    } else if (selectionCount === 1) {
      if (isVertexOnly) {
        renderPath = 'vertex-only';
      } else if (orientedMeta.valid) {
        renderPath = 'oriented-verbatim';
      } else {
        renderPath = 'legacy-aabb';
      }
    }

    const cornersWorld = orientedMeta.valid
      ? [
          { x: orientedMeta.blX, y: orientedMeta.blY },
          { x: orientedMeta.brX, y: orientedMeta.brY },
          { x: orientedMeta.trX, y: orientedMeta.trY },
          { x: orientedMeta.tlX, y: orientedMeta.tlY },
        ]
      : null;
    const cornersScreen = cornersWorld
      ? cornersWorld.map((p) => worldToScreen(p, viewTransform))
      : null;
    const rotateHandleWorld = orientedMeta.valid
      ? { x: orientedMeta.rotateHandleX, y: orientedMeta.rotateHandleY }
      : null;
    const rotateHandleScreen = rotateHandleWorld
      ? worldToScreen(rotateHandleWorld, viewTransform)
      : null;

    cadDebugLog(
      'overlay',
      `selection overlay renderPath=${renderPath} kind=${kindLabel}`,
      () => ({
        selectionCount,
        selectionIds,
        entityId,
        kind: kindLabel,
        renderPath,
        applyRotation: false,
        isVertexOnly,
        orientedMeta: {
          valid: orientedMeta.valid,
          hasResizeHandles: orientedMeta.hasResizeHandles,
          hasRotateHandle: orientedMeta.hasRotateHandle,
          bl: { x: orientedMeta.blX, y: orientedMeta.blY },
          br: { x: orientedMeta.brX, y: orientedMeta.brY },
          tr: { x: orientedMeta.trX, y: orientedMeta.trY },
          tl: { x: orientedMeta.tlX, y: orientedMeta.tlY },
          rotateHandle: { x: orientedMeta.rotateHandleX, y: orientedMeta.rotateHandleY },
          center: { x: orientedMeta.centerX, y: orientedMeta.centerY },
          rotationRad: orientedMeta.rotationRad,
        },
        cornersWorld,
        cornersScreen,
        rotateHandleWorld,
        rotateHandleScreen,
        selectionHandleMeta: {
          primitiveCount: handleMeta.primitiveCount,
          floatCount: handleMeta.floatCount,
          firstFloats: handleSample,
        },
        handleFiltering: {
          resizeHandlesRendered: orientedMeta.valid && orientedMeta.hasResizeHandles && !isVertexOnly,
          rotateHandleRendered: orientedMeta.valid && orientedMeta.hasRotateHandle && !isVertexOnly,
        },
      }),
    );
  }, [
    runtime,
    selectionCount,
    selectionIds,
    overlayTick,
    isEditingAppearance,
    isTextEditing,
    viewTransform,
  ]);

  const overlayContent = useMemo(() => {
    if (!runtime) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const draftDimensions = runtime.draft.getDraftDimensions();
    const interactionActive = runtime.isInteractionActive();

    // Early exit: nothing to render
    if (selectionCount === 0 && !draftDimensions && !interactionActive) {
      return null;
    }

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

    // Snap guides overlay
    const snapElements: React.ReactNode[] = [];
    if (interactionActive) {
      const snapMeta = runtime.getSnapOverlayMeta();
      const snap = decodeOverlayBuffer(runtime.module.HEAPU8, snapMeta);

      snap.primitives.forEach((prim, idx) => {
        if (prim.count < 2) return;
        const pts = renderPoints(prim, snap.data);
        if (prim.kind === OverlayKind.Segment) {
          const a = pts[0];
          const b = pts[1];
          if (!a || !b) return;
          snapElements.push(
            <line
              key={`snap-seg-${idx}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#ff5d5d"
              strokeWidth={1}
            />,
          );
        } else if (prim.kind === OverlayKind.Polyline) {
          const pointsAttr = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
          snapElements.push(
            <polyline
              key={`snap-poly-${idx}`}
              points={pointsAttr}
              fill="transparent"
              stroke="#ff5d5d"
              strokeWidth={1}
            />,
          );
        }
      });
    }

    // Selection overlay (only when not in draft mode, not editing appearance, and not editing text)
    const selectionElements: React.ReactNode[] = [];
    if (!isEditingAppearance && !isTextEditing && selectionCount > 0 && !draftDimensions) {
      if (selectionCount > 1) {
        const bounds = runtime.getSelectionBounds();
        if (bounds.valid) {
          const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY }, viewTransform);
          const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY }, viewTransform);
          const minX = Math.min(p1.x, p2.x);
          const minY = Math.min(p1.y, p2.y);
          const maxX = Math.max(p1.x, p2.x);
          const maxY = Math.max(p1.y, p2.y);

          selectionElements.push(
            <rect
              key="sel-group-bbox"
              x={minX}
              y={minY}
              width={maxX - minX}
              height={maxY - minY}
              fill="transparent"
              className="stroke-primary"
              strokeWidth={1}
            />,
          );

          const corners = [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ];

          corners.forEach((p, i) => {
            selectionElements.push(
              <rect
                key={`sel-group-handle-${i}`}
                x={p.x - hh}
                y={p.y - hh}
                width={hs}
                height={hs}
                className="fill-white stroke-primary"
                strokeWidth={1}
              />,
            );
          });
        }
      } else {
        // Single selection: prefer oriented handles for corner-capable shapes
        const entityId = selectionIds[0];
        const entityKind = runtime.getEntityKind(entityId);
        const isVertexOnly =
          entityKind === EntityKind.Line ||
          entityKind === EntityKind.Arrow ||
          entityKind === EntityKind.Polyline;
        const orientedMeta = runtime.getOrientedHandleMeta();

        if (orientedMeta.valid && !isVertexOnly) {
          // Use oriented handles (pre-rotated by engine)
          const corners = [
            worldToScreen({ x: orientedMeta.blX, y: orientedMeta.blY }, viewTransform),
            worldToScreen({ x: orientedMeta.brX, y: orientedMeta.brY }, viewTransform),
            worldToScreen({ x: orientedMeta.trX, y: orientedMeta.trY }, viewTransform),
            worldToScreen({ x: orientedMeta.tlX, y: orientedMeta.tlY }, viewTransform),
          ];

          const outlinePoints = corners.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
          selectionElements.push(
            <polygon
              key="sel-oriented-outline"
              points={outlinePoints}
              fill="transparent"
              className="stroke-primary"
              strokeWidth={1}
            />,
          );

          if (orientedMeta.hasResizeHandles) {
            corners.forEach((p, i) => {
              selectionElements.push(
                <rect
                  key={`sel-oriented-handle-${i}`}
                  x={p.x - hh}
                  y={p.y - hh}
                  width={hs}
                  height={hs}
                  className="fill-white stroke-primary"
                  strokeWidth={1}
                />,
              );
            });
          }

          if (orientedMeta.hasRotateHandle) {
            const rotate = worldToScreen(
              { x: orientedMeta.rotateHandleX, y: orientedMeta.rotateHandleY },
              viewTransform,
            );
            selectionElements.push(
              <circle
                key="sel-oriented-rotate"
                cx={rotate.x}
                cy={rotate.y}
                r={hs}
                className="fill-white stroke-primary"
                strokeWidth={1}
              />,
            );
          }
        } else if (isVertexOnly) {
          // Fallback to vertex-only legacy system (lines, arrows, polylines)
          const outlineMeta = runtime.getSelectionOutlineMeta();
          const handleMeta = runtime.getSelectionHandleMeta();
          const outline = decodeOverlayBuffer(runtime.module.HEAPU8, outlineMeta);
          const handles = decodeOverlayBuffer(runtime.module.HEAPU8, handleMeta);

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
        } else {
          // Corner-capable but oriented meta is invalid: log and render safe AABB without rotation
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(
              '[ShapeOverlay] Oriented handle meta invalid for corner-capable entity; rendering AABB fallback.',
            );
          }
          const bounds = runtime.getSelectionBounds();
          if (bounds.valid) {
            const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY }, viewTransform);
            const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY }, viewTransform);
            const minX = Math.min(p1.x, p2.x);
            const minY = Math.min(p1.y, p2.y);
            const maxX = Math.max(p1.x, p2.x);
            const maxY = Math.max(p1.y, p2.y);

            selectionElements.push(
              <rect
                key="sel-fallback-bbox"
                x={minX}
                y={minY}
                width={maxX - minX}
                height={maxY - minY}
                fill="transparent"
                className="stroke-primary"
                strokeWidth={1}
              />,
            );

            const corners = [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY },
            ];

            corners.forEach((p, i) => {
              selectionElements.push(
                <rect
                  key={`sel-fallback-handle-${i}`}
                  x={p.x - hh}
                  y={p.y - hh}
                  width={hs}
                  height={hs}
                  className="fill-white stroke-primary"
                  strokeWidth={1}
                />,
              );
            });
          }
        }
      }
    }

    const debugElements: React.ReactNode[] = [];
    if (isCadDebugEnabled('overlay') && selectionCount === 1 && selectionIds.length === 1 && runtime) {
      const entityId = selectionIds[0];
      const handleMeta = runtime.getSelectionHandleMeta();
      const handles = decodeOverlayBuffer(runtime.module.HEAPU8, handleMeta);
      const handlePts = handles.primitives.flatMap((prim) => renderPoints(prim, handles.data));
      const hitRadiusPx = 10;
      const orientedMeta = runtime.getOrientedHandleMeta();

      handlePts.forEach((p, i) => {
        debugElements.push(
          <circle
            key={`dbg-handle-${i}`}
            cx={p.x}
            cy={p.y}
            r={2}
            fill="#ff9f1c"
          />,
        );
        debugElements.push(
          <circle
            key={`dbg-handle-hit-${i}`}
            cx={p.x}
            cy={p.y}
            r={hitRadiusPx}
            fill="transparent"
            stroke="#ff9f1c"
            strokeWidth={1}
            strokeDasharray="2 2"
          />,
        );
      });

      if (orientedMeta.valid) {
        const orientedCorners = [
          worldToScreen({ x: orientedMeta.blX, y: orientedMeta.blY }, viewTransform),
          worldToScreen({ x: orientedMeta.brX, y: orientedMeta.brY }, viewTransform),
          worldToScreen({ x: orientedMeta.trX, y: orientedMeta.trY }, viewTransform),
          worldToScreen({ x: orientedMeta.tlX, y: orientedMeta.tlY }, viewTransform),
        ];
        orientedCorners.forEach((p, i) => {
          debugElements.push(
            <circle
              key={`dbg-oriented-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="#6c5ce7"
            />,
          );
        });

        if (orientedMeta.hasRotateHandle) {
          const rotate = worldToScreen(
            { x: orientedMeta.rotateHandleX, y: orientedMeta.rotateHandleY },
            viewTransform,
          );
          debugElements.push(
            <circle
              key="dbg-oriented-rotate"
              cx={rotate.x}
              cy={rotate.y}
              r={3}
              fill="#2ec4b6"
            />,
          );
        }
      }

      const kind = runtime.getEntityKind(entityId);
      if (kind === EntityKind.Circle) {
        const transform = runtime.getEntityTransform(entityId);
        if (transform.valid) {
          const centerScreen = worldToScreen(
            { x: transform.posX, y: transform.posY },
            viewTransform,
          );
          const rxScreen = Math.abs(transform.width * 0.5 * viewTransform.scale);
          const ryScreen = Math.abs(transform.height * 0.5 * viewTransform.scale);
          debugElements.push(
            <ellipse
              key="dbg-ellipse"
              cx={centerScreen.x}
              cy={centerScreen.y}
              rx={rxScreen}
              ry={ryScreen}
              fill="transparent"
              stroke="#2ec4b6"
              strokeWidth={1}
              strokeDasharray="4 2"
              transform={`rotate(${-transform.rotationDeg}, ${centerScreen.x}, ${centerScreen.y})`}
            />,
          );
          debugElements.push(
            <circle
              key="dbg-ellipse-center"
              cx={centerScreen.x}
              cy={centerScreen.y}
              r={3}
              fill="#2ec4b6"
            />,
          );
        }
      }
    }

    // Draft overlay
    const draftElements: React.ReactNode[] = [];
    if (draftDimensions && draftDimensions.active) {
      const isLineDraft = draftDimensions.kind === EntityKind.Line;
      const isPolylineDraft = draftDimensions.kind === EntityKind.Polyline;
      const { minX, minY, maxX, maxY, width, height } = draftDimensions;

      if (!isLineDraft && !isPolylineDraft) {
        // Transform world bounds to screen rect robustly
        // We process both corners to define the screen-space bounding box
        const p1 = worldToScreen({ x: minX, y: minY }, viewTransform);
        const p2 = worldToScreen({ x: maxX, y: maxY }, viewTransform);

        const screenMinX = Math.min(p1.x, p2.x);
        const screenMinY = Math.min(p1.y, p2.y);
        const screenMaxX = Math.max(p1.x, p2.x);
        const screenMaxY = Math.max(p1.y, p2.y);

        const screenW = screenMaxX - screenMinX;
        const screenH = screenMaxY - screenMinY;

        // Bounding box
        draftElements.push(
          <rect
            key="draft-bbox"
            x={screenMinX}
            y={screenMinY}
            width={screenW}
            height={screenH}
            fill="transparent"
            stroke="#0d99ff"
            strokeWidth={1}
          />,
        );

        // Corner handles
        const corners = [
          { x: screenMinX, y: screenMinY }, // TL
          { x: screenMaxX, y: screenMinY }, // TR
          { x: screenMaxX, y: screenMaxY }, // BR
          { x: screenMinX, y: screenMaxY }, // BL
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
        // Positioned below the shape (at screenMaxY)
        // Only show if dimensions are non-zero (avoids 0x0 flickering on click-create)
        const rw = Math.round(width);
        const rh = Math.round(height);

        if (rw > 0 || rh > 0) {
          const labelX = screenMinX + screenW / 2;
          const labelY = screenMaxY + 8; // Start offset below shape

          const dimText = `${rw} × ${rh}`;
          // Assuming approx text width, centering the background rect
          const textWidth = dimText.length * 7 + 16;

          draftElements.push(
            <g key="draft-dim-label">
              <rect
                x={labelX - textWidth / 2}
                y={labelY}
                width={textWidth}
                height={20}
                rx={4}
                fill="#0d99ff"
                fillOpacity={0.9}
              />
              <text
                x={labelX}
                y={labelY + 14}
                textAnchor="middle"
                fontSize={11}
                fontFamily="Inter, system-ui, sans-serif"
                fill="white"
                fontWeight={500}
              >
                {dimText}
              </text>
            </g>,
          );
        }
      }
    }

    if (
      selectionElements.length === 0 &&
      draftElements.length === 0 &&
      snapElements.length === 0 &&
      debugElements.length === 0
    ) {
      return null;
    }

    return (
      <svg
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {snapElements}
        {selectionElements}
        {draftElements}
        {debugElements}
      </svg>
    );
  }, [
    canvasSize.height,
    canvasSize.width,
    engineResizeEnabled,
    overlayTick,
    isEditingAppearance,
    isTextEditing,
    runtime,
    selectionCount,
    selectionIds,
    viewTransform,
  ]);

  return overlayContent;
};

export default ShapeOverlay;
