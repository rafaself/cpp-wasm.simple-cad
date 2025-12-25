import React, { useMemo } from 'react';
import type { ViewTransform, Point } from '@/types';
import { worldToScreen } from '@/utils/geometry';
import type { DrawingState } from '../hooks/interaction/useShapeDrawing'; // Ensure this path is correct

interface DraftOverlayProps {
  draft: DrawingState;
  viewTransform: ViewTransform;
  canvasSize: { width: number; height: number };
  strokeColor?: string;
  strokeWidth?: number;
}

export const DraftOverlay: React.FC<DraftOverlayProps> = ({ 
  draft, 
  viewTransform, 
  canvasSize,
  strokeColor: propStroke,
  strokeWidth: propWidth
}) => {
  const stroke = propStroke || '#22c55e';
  const strokeWidth = Math.max(1, propWidth ?? 2);

  const svgContent = useMemo(() => {
    if (draft.kind === 'none') return null;
    
    // Helper to get screen line
    const sl = (start: Point, end: Point) => {
       const a = worldToScreen(start, viewTransform);
       const b = worldToScreen(end, viewTransform);
       return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    };
    
    // Helper to get screen rect
    const sr = (start: Point, end: Point) => {
        const a = worldToScreen(start, viewTransform);
        const b = worldToScreen(end, viewTransform);
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(a.x - b.x);
        const h = Math.abs(a.y - b.y);
        return { x, y, width: w, height: h };
    };

    if (draft.kind === 'line' || draft.kind === 'arrow') {
      const { x1, y1, x2, y2 } = sl(draft.start, draft.current);
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />;
    }

    if (draft.kind === 'conduit') {
       const { x1, y1, x2, y2 } = sl(draft.start, draft.current);
       return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} strokeDasharray="4 4" />;
    }

    if (draft.kind === 'rect') {
      const { x, y, width, height } = sr(draft.start, draft.current);
      return <rect x={x} y={y} width={width} height={height} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />;
    }

    if (draft.kind === 'text') {
      const { x, y, width, height } = sr(draft.start, draft.current);
      return <rect x={x} y={y} width={width} height={height} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="6 4" opacity={0.9} />;
    }

    if (draft.kind === 'ellipse') {
      const { x, y, width, height } = sr(draft.start, draft.current);
      const cx = x + width / 2;
      const cy = y + height / 2;
      const rx = width / 2;
      const ry = height / 2;
      return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />;
    }
    
    if (draft.kind === 'polygon') {
       // Polygon draft is currently just a rect bounding box in original code logic?
       // Wait, original logic: 
       /* if (draft.kind === 'polygon') { ... rect ... } */ // No, it wasn't implemented separately in original snippet I saw, but usually polygons are drawn as regular polygons.
       // The original snippet had ellipse logic repeated at line 799-800 but cut off.
       // Let's assume standard behavior: simplified to ellipse or rect or bounding circle for now. 
       // If polygonSidesModal is implemented, it creates a regular polygon.
       // For draft visualization, let's draw a circle indicating the radius/bounds.
       const { x, y, width, height } = sr(draft.start, draft.current);
       const cx = x + width / 2;
       const cy = y + height / 2;
       const r = Math.min(width, height) / 2;
       return <circle cx={cx} cy={cy} r={r} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.5} />;
    }

    if (draft.kind === 'polyline') {
       if (draft.points.length === 0) return null;
       const screenPoints = draft.points.map(p => worldToScreen(p, viewTransform));
       if (draft.current) screenPoints.push(worldToScreen(draft.current, viewTransform));
       
       const pointsStr = screenPoints.map(p => `${p.x},${p.y}`).join(' ');
       return <polyline points={pointsStr} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />;
    }

    return null;
  }, [draft, viewTransform, stroke, strokeWidth]);

  if (draft.kind === 'none' || !svgContent) return null;

  return (
    <svg 
      width={canvasSize.width} 
      height={canvasSize.height} 
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}
    >
      {svgContent}
    </svg>
  );
};
