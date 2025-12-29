import React, { useEffect } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import SelectionOverlay from './SelectionOverlay';
import { useInteractionManager } from '@/features/editor/interactions/useInteractionManager';
import { usePanZoom } from '@/features/editor/hooks/interaction/usePanZoom';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getEngineRuntime } from '@/engine/core/singleton';
import { CommandOp } from '@/engine/core/commandBuffer';

const EngineInteractionLayer: React.FC = () => {
  // Store Hooks
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const snapOptions = useSettingsStore((s) => s.snap);
  const gridSize = useSettingsStore((s) => s.grid.size);

  // Interaction Manager (The Brain)
  const { handlers, overlay, activeHandlerName } = useInteractionManager();

  // PanZoom Hook (Can coexist or be merged, currently keeping simple)
  const { isPanningRef, beginPan, updatePan, endPan, handleWheel } = usePanZoom();

  // Cursor Logic
  const cursor = isPanningRef.current ? 'grabbing' : undefined; // Or let handlers define cursor via overlays or store

  // Engine Sync Effects (View/Grid)
  useEffect(() => {
    getEngineRuntime().then(rt => {
        rt.setSnapOptions?.(snapOptions.enabled, snapOptions.grid, gridSize);
    });
  }, [snapOptions.enabled, snapOptions.grid, gridSize]);

  useEffect(() => {
    getEngineRuntime().then(rt => {
        rt.apply([{
          op: CommandOp.SetViewScale,
          view: { x: viewTransform.x, y: viewTransform.y, scale: viewTransform.scale, width: canvasSize.width, height: canvasSize.height },
        }]);
    });
  }, [viewTransform, canvasSize]);

  // Pointer Events Wrapper
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      
      if (e.button === 1 || e.button === 2 || e.altKey || activeHandlerName === 'pan') { // Or check active tool
          // Quick Pan Override
          if (e.button === 1 || e.altKey) {
             beginPan(e);
             return;
          }
      }
      
      handlers.onPointerDown(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanningRef.current) {
          updatePan(e);
          return;
      }
      handlers.onPointerMove(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanningRef.current) {
          endPan();
          return;
      }
      handlers.onPointerUp(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isPanningRef.current) {
          endPan();
          return;
      }
      // Handlers might need an onCancel
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none', cursor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => handlers.onDoubleClick(e as unknown as React.PointerEvent<HTMLDivElement>)}
      onContextMenu={(e) => e.preventDefault()}
      onPointerCancel={handlePointerCancel}
    >
      <SelectionOverlay />
      {/* Dynamic Overlay from Active Handler */}
      {overlay}
    </div>
  );
};

export default EngineInteractionLayer;
