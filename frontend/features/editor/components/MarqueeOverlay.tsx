import React, { useMemo } from 'react';
import { worldToScreen } from '@/utils/viewportMath';
import type { ViewTransform, Point } from '@/types';

export interface SelectionBoxState {
  start: Point;
  current: Point;
  direction: 'LTR' | 'RTL';
}

export interface MarqueeOverlayProps {
  selectionBox: SelectionBoxState | null;
  viewTransform: ViewTransform;
  canvasSize: { width: number; height: number };
}

/**
 * Renders the marquee selection rectangle overlay.
 * - LTR (left-to-right): Window selection, solid stroke
 * - RTL (right-to-left): Crossing selection, dashed stroke
 */
export const MarqueeOverlay: React.FC<MarqueeOverlayProps> = ({
  selectionBox,
  viewTransform,
  canvasSize,
}) => {
  const svg = useMemo(() => {
    if (!selectionBox) return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const a = worldToScreen(selectionBox.start, viewTransform);
    const b = worldToScreen(selectionBox.current, viewTransform);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);

    const stroke = '#3b82f6';
    const fill = 'rgba(59, 130, 246, 0.2)';
    // Crossing (RTL) uses dashed stroke, Window (LTR) uses solid
    const strokeDash = selectionBox.direction === 'RTL' ? '5 5' : undefined;

    return (
      <svg
        width={canvasSize.width}
        height={canvasSize.height}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25 }}
      >
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={1}
          strokeDasharray={strokeDash}
        />
      </svg>
    );
  }, [selectionBox, viewTransform, canvasSize]);

  return svg;
};

export default MarqueeOverlay;
