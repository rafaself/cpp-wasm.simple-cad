import { Shape } from '../../../../types';

export const cleanupShapes = (shapes: Shape[]): Shape[] => {
  return shapes.filter((s) => {
    // 1. Check for valid coordinates
    if (s.x !== undefined && (isNaN(s.x) || !isFinite(s.x))) return false;
    if (s.y !== undefined && (isNaN(s.y) || !isFinite(s.y))) return false;

    // 2. Check Line/Polyline validity
    if (s.type === 'line' || s.type === 'polyline') {
      if (!s.points || s.points.length < 2) return false;

      // Filter out zero-length segments or degenerate lines
      // For line, check distance
      if (s.type === 'line') {
        const dx = s.points[1].x - s.points[0].x;
        const dy = s.points[1].y - s.points[0].y;
        if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return false;
      }
      return true;
    }

    // 3. Check Circle/Arc validity
    if (s.type === 'circle' || s.type === 'arc') {
      return (s.radius || 0) > 0.0001;
    }

    // 4. Check Text validity
    if (s.type === 'text') {
      return s.textContent && s.textContent.trim().length > 0;
    }

    return true;
  });
};
