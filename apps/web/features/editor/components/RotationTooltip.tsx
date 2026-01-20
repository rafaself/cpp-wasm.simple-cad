/**
 * RotationTooltip - Displays rotation angle during rotation transform
 *
 * Shows a tooltip near the cursor with the current rotation angle in degrees.
 * Only visible during active rotation operations.
 */
import React, { useEffect, useMemo, useState } from 'react';

import { TransformMode } from '@/engine/core/interactionSession';
import { getEngineRuntime } from '@/engine/core/singleton';
import { useUIStore } from '@/stores/useUIStore';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';

const RotationTooltip: React.FC = () => {
  const [runtime, setRuntime] = useState<EngineRuntime | null>(null);
  const overlayTick = useUIStore((s) => s.overlayTick);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);

  useEffect(() => {
    let disposed = false;
    void getEngineRuntime().then((rt) => {
      if (!disposed) setRuntime(rt);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const tooltipContent = useMemo(() => {
    if (!runtime) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const transformState = runtime.getTransformState();

    // Only show tooltip during active rotation
    if (!transformState.active || transformState.mode !== TransformMode.Rotate) {
      return null;
    }

    // Get the current rotation angle of the selected entity
    const selectionIds = runtime.getSelectionIds();
    if (selectionIds.length === 0) return null;

    const entityId = selectionIds[0]!;
    const entityTransform = runtime.getEntityTransform(entityId);
    if (!entityTransform.valid) return null;

    const angle = entityTransform.rotationDeg;
    const formattedAngle = `${angle.toFixed(2)}°`;

    // Position tooltip near the pivot point (converted to screen space)
    const pivotScreenX = transformState.pivotX * viewTransform.scale + viewTransform.x;
    const pivotScreenY = -(transformState.pivotY * viewTransform.scale) + viewTransform.y;

    // Offset tooltip slightly above and to the right of pivot
    const tooltipX = pivotScreenX + 20;
    const tooltipY = pivotScreenY - 30;

    return (
      <div
        style={{
          position: 'absolute',
          left: tooltipX,
          top: tooltipY,
          pointerEvents: 'none',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          }}
        >
          {formattedAngle}
        </div>
      </div>
    );
  }, [runtime, overlayTick, viewTransform, canvasSize]);

  return tooltipContent;
};

export default RotationTooltip;
