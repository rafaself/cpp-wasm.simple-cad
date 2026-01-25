/**
 * SnapIndicator - Visual feedback for active snap targets
 *
 * Shows the type and position of the current snap target during interactive
 * editing operations (vertex drag, edge drag, entity move, etc.).
 *
 * Phase 3: Snap hardening - CAD-like visual feedback
 */

import React, { useMemo } from 'react';

import { worldToScreen } from '@/engine/core/viewportMath';

import type { ViewTransform } from '@/types';

export type SnapTargetType = 'endpoint' | 'midpoint' | 'center' | 'nearest' | 'grid' | 'none';

export interface SnapIndicatorProps {
  /** Snap target position in WCS */
  positionWCS: { x: number; y: number } | null;
  /** Type of snap target */
  type: SnapTargetType;
  /** Current viewport transform */
  viewTransform: ViewTransform;
  /** Whether to show the indicator */
  visible: boolean;
}

/**
 * Visual styles for each snap type (CAD-like color coding)
 */
const SNAP_STYLES: Record<
  SnapTargetType,
  { color: string; size: number; shape: 'square' | 'circle' | 'diamond' | 'cross' }
> = {
  endpoint: { color: '#4ade80', size: 10, shape: 'square' }, // Green square
  midpoint: { color: '#60a5fa', size: 10, shape: 'diamond' }, // Blue diamond
  center: { color: '#f59e0b', size: 10, shape: 'circle' }, // Amber circle
  nearest: { color: '#a78bfa', size: 8, shape: 'cross' }, // Purple cross
  grid: { color: '#cbd5e1', size: 8, shape: 'cross' }, // Gray cross
  none: { color: 'transparent', size: 0, shape: 'circle' },
};

/**
 * Snap type labels for tooltip
 */
const SNAP_LABELS: Record<SnapTargetType, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  center: 'Center',
  nearest: 'Nearest',
  grid: 'Grid',
  none: '',
};

export const SnapIndicator: React.FC<SnapIndicatorProps> = ({
  positionWCS,
  type,
  viewTransform,
  visible,
}) => {
  const screenPos = useMemo(() => {
    if (!positionWCS || !visible || type === 'none') return null;
    return worldToScreen(positionWCS, viewTransform);
  }, [positionWCS, viewTransform, visible, type]);

  if (!screenPos) return null;

  const style = SNAP_STYLES[type];
  const label = SNAP_LABELS[type];
  const halfSize = style.size / 2;

  return (
    <g className="snap-indicator" pointerEvents="none">
      {/* Outer glow for visibility */}
      <circle
        cx={screenPos.x}
        cy={screenPos.y}
        r={style.size * 1.5}
        fill={style.color}
        opacity={0.2}
        className="animate-pulse"
      />

      {/* Snap marker based on shape */}
      {style.shape === 'square' && (
        <rect
          x={screenPos.x - halfSize}
          y={screenPos.y - halfSize}
          width={style.size}
          height={style.size}
          fill="none"
          stroke={style.color}
          strokeWidth={2}
        />
      )}

      {style.shape === 'circle' && (
        <circle
          cx={screenPos.x}
          cy={screenPos.y}
          r={halfSize}
          fill="none"
          stroke={style.color}
          strokeWidth={2}
        />
      )}

      {style.shape === 'diamond' && (
        <rect
          x={screenPos.x - halfSize}
          y={screenPos.y - halfSize}
          width={style.size}
          height={style.size}
          fill="none"
          stroke={style.color}
          strokeWidth={2}
          transform={`rotate(45, ${screenPos.x}, ${screenPos.y})`}
        />
      )}

      {style.shape === 'cross' && (
        <>
          <line
            x1={screenPos.x - halfSize}
            y1={screenPos.y}
            x2={screenPos.x + halfSize}
            y2={screenPos.y}
            stroke={style.color}
            strokeWidth={2}
          />
          <line
            x1={screenPos.x}
            y1={screenPos.y - halfSize}
            x2={screenPos.x}
            y2={screenPos.y + halfSize}
            stroke={style.color}
            strokeWidth={2}
          />
        </>
      )}

      {/* Optional: Label for clarity (can be toggled via setting) */}
      <text
        x={screenPos.x}
        y={screenPos.y - style.size - 4}
        fill={style.color}
        fontSize={10}
        fontWeight="600"
        textAnchor="middle"
        className="pointer-events-none select-none"
      >
        {label}
      </text>
    </g>
  );
};

export default SnapIndicator;
