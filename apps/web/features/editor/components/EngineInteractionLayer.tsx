import React, { useEffect } from 'react';

import { CommandOp } from '@/engine/core/EngineRuntime';
import { getEngineRuntime, getEngineRuntimeSync } from '@/engine/core/singleton';
import { usePanZoom } from '@/features/editor/hooks/interaction/usePanZoom';
import { useInteractionManager } from '@/features/editor/interactions/useInteractionManager';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';
import { worldToScreen } from '@/engine/core/viewportMath'; // worldToScreen still used for overlay rendering

import CenterOriginIcon from './CenterOriginIcon';
import RotationTooltip from './RotationTooltip';
import ShapeOverlay from './ShapeOverlay';

const EngineInteractionLayer: React.FC = () => {
  // Store Hooks
  const viewTransform = useUIStore((s) => s.viewTransform);
  const setMousePos = useUIStore((s) => s.setMousePos);
  const setIsMouseOverCanvas = useUIStore((s) => s.setIsMouseOverCanvas);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const snapOptions = useSettingsStore((s) => s.snap);
  const orthoSettings = useSettingsStore((s) => s.ortho);
  const gridSize = useSettingsStore((s) => s.grid.size);
  const centerIconSettings = useSettingsStore((s) => s.display.centerIcon);

  // Interaction Manager (The Brain)
  const pointerRectRef = React.useRef({ left: 0, top: 0 });
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const updatePointerRect = React.useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    pointerRectRef.current.left = rect.left;
    pointerRectRef.current.top = rect.top;
  }, []);
  const { handlers, overlay, activeHandlerName, cursor: handlerCursor } =
    useInteractionManager(pointerRectRef);

  // PanZoom Hook (Can coexist or be merged, currently keeping simple)
  const { isPanning, isPanningRef, beginPan, updatePan, endPan, handleWheel } = usePanZoom();

  // Mouse Pos Throttling
  const mousePosRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mousePosDirtyRef = React.useRef(false);
  const screenPointRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = React.useRef<number | null>(null);

  const flushMousePos = React.useCallback(() => {
    if (mousePosDirtyRef.current) {
      setMousePos({ x: mousePosRef.current.x, y: mousePosRef.current.y });
      mousePosDirtyRef.current = false;
    }
    rafRef.current = null;
  }, [setMousePos]);

  useEffect(() => {
    updatePointerRect();
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [updatePointerRect]);

  useEffect(() => {
    updatePointerRect();
  }, [canvasSize.width, canvasSize.height, updatePointerRect]);

  useEffect(() => {
    const handleResize = () => updatePointerRect();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [updatePointerRect]);

  // Cursor Logic
  const DEFAULT_CANVAS_CURSOR = 'url(/assets/cursor-canva-default.svg) 3 3, auto';
  const cursor = isPanning ? 'grabbing' : handlerCursor || DEFAULT_CANVAS_CURSOR;

  const logPointer = (
    label: string,
    e: React.PointerEvent<HTMLDivElement>,
    extra?: Record<string, unknown>,
  ) => {
    const payload: Record<string, unknown> = {
      type: e.type,
      pointerId: e.pointerId,
      button: e.button,
      buttons: e.buttons,
      clientX: e.clientX,
      clientY: e.clientY,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
    };
    if (extra) {
      Object.assign(payload, extra);
    }
    cadDebugLog('pointer', label, payload);
  };

  // Engine Sync Effects (View/Grid)
  useEffect(() => {
    getEngineRuntime().then((rt) => {
      rt.setSnapOptions?.(
        snapOptions.enabled,
        snapOptions.grid,
        gridSize,
        snapOptions.tolerancePx,
        snapOptions.endpoint,
        snapOptions.midpoint,
        snapOptions.center,
        snapOptions.nearest,
      );
    });
  }, [
    snapOptions.enabled,
    snapOptions.grid,
    snapOptions.tolerancePx,
    snapOptions.endpoint,
    snapOptions.midpoint,
    snapOptions.center,
    snapOptions.nearest,
    gridSize,
  ]);

  useEffect(() => {
    getEngineRuntime().then((rt) => {
      rt.setOrthoOptions?.(orthoSettings.persistentEnabled, orthoSettings.shiftOverrideEnabled);
    });
  }, [orthoSettings.persistentEnabled, orthoSettings.shiftOverrideEnabled]);

  useEffect(() => {
    getEngineRuntime().then((rt) => {
      rt.viewport.setViewTransform(viewTransform);
      rt.apply([
        {
          op: CommandOp.SetViewScale,
          view: {
            x: viewTransform.x,
            y: viewTransform.y,
            scale: viewTransform.scale,
            width: canvasSize.width,
            height: canvasSize.height,
          },
        },
      ]);
    });
  }, [viewTransform, canvasSize]);

  // Pointer Events Wrapper
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    updatePointerRect();
    if (isCadDebugEnabled('pointer')) {
      logPointer('pointerdown', e, {
        handler: activeHandlerName,
        isPanning: isPanningRef.current,
      });
    }
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    cadDebugLog('pointer', 'setPointerCapture', () => ({ pointerId: e.pointerId }));

    if (e.button === 1 || e.button === 2 || e.altKey || activeHandlerName === 'pan') {
      // Or check active tool
      // Quick Pan Override or Explicit Pan Tool
      if (e.button === 1 || e.altKey || (activeHandlerName === 'pan' && e.button === 0)) {
        beginPan(e);
        return;
      }
    }

    handlers.onPointerDown(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCadDebugEnabled('pointer')) {
      logPointer('pointermove', e, {
        handler: activeHandlerName,
        isPanning: isPanningRef.current,
      });
    }
    // Update Global Mouse Pos (Throttled)
    const runtime = getEngineRuntimeSync();
    if (!runtime) return;
    const rect = pointerRectRef.current;
    screenPointRef.current.x = e.clientX - rect.left;
    screenPointRef.current.y = e.clientY - rect.top;
    runtime.viewport.screenToWorldWithTransformInto(
      screenPointRef.current,
      viewTransform,
      mousePosRef.current,
    );
    mousePosDirtyRef.current = true;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushMousePos);
    }

    if (isPanningRef.current) {
      updatePan(e);
      return;
    }
    handlers.onPointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCadDebugEnabled('pointer')) {
      logPointer('pointerup', e, {
        handler: activeHandlerName,
        isPanning: isPanningRef.current,
      });
    }
    if (isPanningRef.current) {
      endPan();
      return;
    }
    handlers.onPointerUp(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isCadDebugEnabled('pointer')) {
      logPointer('pointercancel', e, {
        handler: activeHandlerName,
        isPanning: isPanningRef.current,
      });
    }
    if (isPanningRef.current) {
      endPan();
      return;
    }
    handlers.onCancel?.();
  };

  // Center Icon Calculation
  const centerScreen = worldToScreen({ x: 0, y: 0 }, viewTransform);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 'var(--z-canvas-hud)',
        touchAction: 'none',
        cursor,
      }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        if (isCadDebugEnabled('pointer')) {
          logPointer('doubleclick', e as unknown as React.PointerEvent<HTMLDivElement>);
        }
        handlers.onDoubleClick(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={(e) => {
        if (isCadDebugEnabled('pointer')) {
          logPointer('lostpointercapture', e as unknown as React.PointerEvent<HTMLDivElement>);
        }
      }}
      onPointerEnter={() => {
        updatePointerRect();
        setIsMouseOverCanvas(true);
      }}
      onPointerLeave={() => setIsMouseOverCanvas(false)}
    >
      <ShapeOverlay />
      <RotationTooltip />

      {/* Center Icon */}
      {centerIconSettings.show && (
        <div
          style={{
            position: 'absolute',
            left: centerScreen.x,
            top: centerScreen.y,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            color: centerIconSettings.color,
          }}
        >
          <CenterOriginIcon />
        </div>
      )}

      {/* Dynamic Overlay from Active Handler */}
      {overlay}
    </div>
  );
};

export default EngineInteractionLayer;
