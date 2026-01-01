import React, { useEffect } from 'react';

import { CommandOp } from '@/engine/core/commandBuffer';
import { getEngineRuntime } from '@/engine/core/singleton';
import { usePanZoom } from '@/features/editor/hooks/interaction/usePanZoom';
import { useInteractionManager } from '@/features/editor/interactions/useInteractionManager';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cadDebugLog } from '@/utils/dev/cadDebug';
import { screenToWorld, worldToScreen } from '@/utils/viewportMath';

import ShapeOverlay from './ShapeOverlay';

const EngineInteractionLayer: React.FC = () => {
  // Store Hooks
  const viewTransform = useUIStore((s) => s.viewTransform);
  const setMousePos = useUIStore((s) => s.setMousePos);
  const setIsMouseOverCanvas = useUIStore((s) => s.setIsMouseOverCanvas);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const snapOptions = useSettingsStore((s) => s.snap);
  const gridSize = useSettingsStore((s) => s.grid.size);
  const centerIconSettings = useSettingsStore((s) => s.display.centerIcon);

  // Interaction Manager (The Brain)
  const { handlers, overlay, activeHandlerName, cursor: handlerCursor } = useInteractionManager();

  // PanZoom Hook (Can coexist or be merged, currently keeping simple)
  const { isPanning, isPanningRef, beginPan, updatePan, endPan, handleWheel } = usePanZoom();

  // Cursor Logic
  const DEFAULT_CANVAS_CURSOR = 'url(/assets/cursor-canva-default.svg) 3 3, auto';
  const cursor = isPanning ? 'grabbing' : (handlerCursor || DEFAULT_CANVAS_CURSOR);

  const logPointer = (
    label: string,
    e: React.PointerEvent<HTMLDivElement>,
    extra?: () => Record<string, unknown>,
  ) => {
    cadDebugLog('pointer', label, () => {
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
      const extraPayload = extra?.();
      if (extraPayload) {
        Object.assign(payload, extraPayload);
      }
      return payload;
    });
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
    logPointer('pointerdown', e, () => ({ handler: activeHandlerName, isPanning: isPanningRef.current }));
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
    logPointer('pointermove', e, () => ({ handler: activeHandlerName, isPanning: isPanningRef.current }));
    // Update Global Mouse Pos
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const world = screenToWorld(
      { x: e.clientX - rect.left, y: e.clientY - rect.top },
      viewTransform,
    );
    setMousePos(world);
    setIsMouseOverCanvas(true);

    if (isPanningRef.current) {
      updatePan(e);
      return;
    }
    handlers.onPointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    logPointer('pointerup', e, () => ({ handler: activeHandlerName, isPanning: isPanningRef.current }));
    if (isPanningRef.current) {
      endPan();
      return;
    }
    handlers.onPointerUp(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    logPointer('pointercancel', e, () => ({ handler: activeHandlerName, isPanning: isPanningRef.current }));
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
      style={{ position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none', cursor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => {
        logPointer('doubleclick', e as unknown as React.PointerEvent<HTMLDivElement>);
        handlers.onDoubleClick(e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={(e) => {
        logPointer('lostpointercapture', e as unknown as React.PointerEvent<HTMLDivElement>);
      }}
      onPointerEnter={() => setIsMouseOverCanvas(true)}
      onPointerLeave={() => setIsMouseOverCanvas(false)}
    >
      <ShapeOverlay />
      
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
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
            <path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
          </svg>
        </div>
      )}

      {/* Dynamic Overlay from Active Handler */}
      {overlay}
    </div>
  );
};

export default EngineInteractionLayer;
