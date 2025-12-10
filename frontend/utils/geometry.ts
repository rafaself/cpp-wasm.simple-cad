import { Layer, Point, Shape, ViewTransform, SnapOptions, Rect } from '../types/index';
import { getEffectiveFillColor } from './shapeColors';

// ... (Keeping imports and helper functions like getDistance, rotatePoint, screenToWorld, worldToScreen same)

export const getDistance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const rotatePoint = (point: Point, center: Point, angle: number): Point => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos),
  };
};

export const screenToWorld = (point: Point, transform: ViewTransform): Point => {
  return {
    x: (point.x - transform.x) / transform.scale,
    y: (point.y - transform.y) / transform.scale,
  };
};

export const worldToScreen = (point: Point, transform: ViewTransform): Point => {
  return {
    x: point.x * transform.scale + transform.x,
    y: point.y * transform.scale + transform.y,
  };
};

export const TEXT_PADDING = 4;

export const getWrappedLines = (text: string, maxWidth: number, fontSize: number): string[] => {
  if (!text) return [''];
  if (!maxWidth || !isFinite(maxWidth) || maxWidth <= 0) return text.split('\n');

  const charWidth = fontSize * 0.6;
  const spaceWidth = charWidth;
  const segments = text.split('\n');
  const lines: string[] = [];

  segments.forEach(segment => {
    const words = segment.split(' ');
    let current = '';
    words.forEach(word => {
      const wordWidth = word.length * charWidth;
      if (current.length === 0) {
        current = word;
      } else {
        const lineWidth = current.length * charWidth + spaceWidth + wordWidth;
        if (lineWidth <= maxWidth) {
          current = `${current} ${word}`;
        } else {
          lines.push(current);
          current = word;
        }
      }
    });
    lines.push(current);
  });

  return lines;
};

const getTextDimensions = (shape: Shape) => {
  const fontSize = shape.fontSize || 16;
  const lineHeight = shape.lineHeight || fontSize * 1.2;
  const rawText = shape.textContent || '';
  const baseWidth = shape.width ? Math.max(shape.width - TEXT_PADDING * 2, 1) : undefined;

  const wrapped = baseWidth
    ? getWrappedLines(rawText, baseWidth, fontSize)
    : rawText.split('\n');

  const estimatedWidth = baseWidth ?? Math.max(
    fontSize * 0.6,
    ...wrapped.map(line => (line.length || 1) * fontSize * 0.6)
  );
  const estimatedHeight = Math.max(lineHeight, wrapped.length * lineHeight);

  const totalWidth = (shape.width ?? (estimatedWidth + TEXT_PADDING * 2));
  const totalHeight = Math.max(shape.height ?? 0, estimatedHeight + TEXT_PADDING * 2);

  return { width: totalWidth, height: totalHeight, lines: wrapped };
};

export const getSnapPoint = (
  point: Point, 
  shapes: Shape[], 
  snapOptions: SnapOptions,
  gridSize: number,
  threshold: number = 10
): Point | null => {
  if (!snapOptions.enabled) return null;

  let closestPoint: Point | null = null;
  let minDistance = threshold;

  const checkPoint = (p: Point) => {
    const d = getDistance(point, p);
    if (d < minDistance) {
      minDistance = d;
      closestPoint = p;
    }
  };

  if (snapOptions.grid) {
     const gx = Math.round(point.x / gridSize) * gridSize;
     const gy = Math.round(point.y / gridSize) * gridSize;
     if (getDistance(point, {x: gx, y: gy}) < threshold) {
         closestPoint = {x: gx, y: gy};
         minDistance = threshold;
     }
  }

  shapes.forEach(shape => {
    if (shape.points && shape.points.length > 0) {
      if (snapOptions.endpoint) {
        if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'measure' || shape.type === 'arc' || shape.type === 'arrow') {
           checkPoint(shape.points[0]);
           checkPoint(shape.points[shape.points.length - 1]);
           if (shape.type === 'polyline') {
              shape.points.forEach(p => checkPoint(p));
           }
        }
      }
      
      if (snapOptions.midpoint) {
        for (let i = 0; i < shape.points.length - 1; i++) {
          checkPoint({
            x: (shape.points[i].x + shape.points[i+1].x) / 2,
            y: (shape.points[i].y + shape.points[i+1].y) / 2
          });
        }
      }
    }

    if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
       const p1 = { x: shape.x, y: shape.y };
       const p2 = { x: shape.x + shape.width, y: shape.y };
       const p3 = { x: shape.x + shape.width, y: shape.y + shape.height };
       const p4 = { x: shape.x, y: shape.y + shape.height };
       
       if (snapOptions.endpoint) {
         [p1, p2, p3, p4].forEach(checkPoint);
       }
       
       if (snapOptions.midpoint) {
         checkPoint({ x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 });
         checkPoint({ x: (p2.x + p3.x)/2, y: (p2.y + p3.y)/2 });
         checkPoint({ x: (p3.x + p4.x)/2, y: (p3.y + p4.y)/2 });
         checkPoint({ x: (p4.x + p1.x)/2, y: (p4.y + p1.y)/2 });
       }

       if (snapOptions.center) {
          checkPoint({ x: shape.x + shape.width/2, y: shape.y + shape.height/2 });
       }
    }

    if ((shape.type === 'circle' || shape.type === 'polygon') && shape.x !== undefined && shape.y !== undefined && shape.radius !== undefined) {
       if (snapOptions.center) {
          checkPoint({ x: shape.x, y: shape.y });
       }
       
       if (shape.type === 'circle' && (snapOptions.endpoint || snapOptions.midpoint)) {
         checkPoint({ x: shape.x + shape.radius, y: shape.y });
         checkPoint({ x: shape.x - shape.radius, y: shape.y });
         checkPoint({ x: shape.x, y: shape.y + shape.radius });
         checkPoint({ x: shape.x, y: shape.y - shape.radius });
       }
    }
  });

  if (!closestPoint && snapOptions.grid) {
     const gx = Math.round(point.x / gridSize) * gridSize;
     const gy = Math.round(point.y / gridSize) * gridSize;
     if (getDistance(point, {x: gx, y: gy}) < threshold) {
         return { x: gx, y: gy };
     }
  }

  return closestPoint;
};


export const isPointInShape = (point: Point, shape: Shape, scale: number = 1, layer?: Layer): boolean => {
  const hitToleranceScreen = 10; 
  const threshold = hitToleranceScreen / scale; 
  let checkPoint = point;
    if (shape.rotation && shape.x !== undefined && shape.y !== undefined && (shape.type === 'rect')) {
      checkPoint = rotatePoint(point, { x: shape.x, y: shape.y }, -shape.rotation);
  }
  const effectiveFill = getEffectiveFillColor(shape, layer);

  switch (shape.type) {
    case 'circle':
      if (shape.x === undefined || shape.y === undefined || shape.radius === undefined) return false;
      const dist = getDistance(point, { x: shape.x, y: shape.y });
      if (effectiveFill !== 'transparent') return dist <= shape.radius + threshold;
      return Math.abs(dist - shape.radius) <= threshold;

    case 'rect':
      if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return false;
      const inX = checkPoint.x >= shape.x - threshold && checkPoint.x <= shape.x + shape.width + threshold;
      const inY = checkPoint.y >= shape.y - threshold && checkPoint.y <= shape.y + shape.height + threshold;
      if (!inX || !inY) return false;
      if (effectiveFill !== 'transparent') return true; 
      const nearLeft = Math.abs(checkPoint.x - shape.x) < threshold;
      const nearRight = Math.abs(checkPoint.x - (shape.x + shape.width)) < threshold;
      const nearTop = Math.abs(checkPoint.y - shape.y) < threshold;
      const nearBottom = Math.abs(checkPoint.y - (shape.y + shape.height)) < threshold;
      return nearLeft || nearRight || nearTop || nearBottom;

    case 'text': {
      if (shape.x === undefined || shape.y === undefined) return false;
      const { width, height } = getTextDimensions(shape);
      const inXText = checkPoint.x >= shape.x - threshold && checkPoint.x <= shape.x + width + threshold;
      const inYText = checkPoint.y >= shape.y - threshold && checkPoint.y <= shape.y + height + threshold;
      if (!inXText || !inYText) return false;
      return true;
    }

    case 'line':
    case 'measure':
      if (shape.points.length < 2) return false;
      const p1 = shape.points[0];
      const p2 = shape.points[1];
      const lenSq = Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2);
      if (lenSq === 0) return getDistance(point, p1) < threshold;
      let t = ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y)) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projection = {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
      };
      return getDistance(point, projection) < threshold;

    case 'arrow':
      if (shape.points.length < 2) return false;
      const a1 = shape.points[0];
      const a2 = shape.points[1];
      const arrowLenSq = Math.pow(a2.x - a1.x, 2) + Math.pow(a2.y - a1.y, 2);
      if (arrowLenSq === 0) return getDistance(point, a1) < threshold;
      let at = ((point.x - a1.x) * (a2.x - a1.x) + (point.y - a1.y) * (a2.y - a1.y)) / arrowLenSq;
      at = Math.max(0, Math.min(1, at));
      const arrowProj = { x: a1.x + at * (a2.x - a1.x), y: a1.y + at * (a2.y - a1.y) };
      return getDistance(point, arrowProj) < threshold;

    case 'polygon': 
      if (shape.x === undefined || shape.y === undefined || shape.radius === undefined) return false;
      const pDist = getDistance(point, { x: shape.x, y: shape.y });
      if (effectiveFill !== 'transparent') return pDist <= shape.radius + threshold;
      return Math.abs(pDist - shape.radius) <= threshold;

    case 'polyline':
      for (let i = 0; i < shape.points.length - 1; i++) {
        const s1 = shape.points[i];
        const s2 = shape.points[i+1];
        const lSq = Math.pow(s2.x - s1.x, 2) + Math.pow(s2.y - s1.y, 2);
        let u = ((point.x - s1.x) * (s2.x - s1.x) + (point.y - s1.y) * (s2.y - s1.y)) / lSq;
        u = Math.max(0, Math.min(1, u));
        const proj = { x: s1.x + u * (s2.x - s1.x), y: s1.y + u * (s2.y - s1.y) };
        if (getDistance(point, proj) < threshold) return true;
      }
      return false;

    case 'arc':
        if(shape.points.length < 2) return false;
        const pt1 = shape.points[0];
        const pt2 = shape.points[1];
        const d = getDistance(pt1, pt2);
        let r = shape.radius || d; 
        if (r < d / 2) r = d / 2;
        const h = Math.sqrt(Math.max(0, r*r - (d/2)*(d/2)));
        const dx = pt2.x - pt1.x;
        const dy = pt2.y - pt1.y;
        const midX = (pt1.x + pt2.x) / 2;
        const midY = (pt1.y + pt2.y) / 2;
        const chordDist = Math.sqrt(dx*dx + dy*dy);
        const udx = -dy / chordDist;
        const udy = dx / chordDist;
        const cx = midX + udx * h;
        const cy = midY + udy * h;
        const distToCenter = getDistance(point, {x: cx, y: cy});

        if (Math.abs(distToCenter - r) <= threshold) {
            const startAngle = Math.atan2(pt1.y - cy, pt1.x - cx);
            const endAngle = Math.atan2(pt2.y - cy, pt2.x - cx);
            const pointAngle = Math.atan2(point.y - cy, point.x - cx);

            const normalize = (a: number) => (a % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const totalSweep = normalize(endAngle - startAngle);
            const pointSweep = normalize(pointAngle - startAngle);

            return pointSweep <= totalSweep || Math.abs(totalSweep - 2 * Math.PI) < 1e-5;
        }
        return false;

    default: return false;
  }
};

const isPointInRect = (p: Point, r: Rect) => {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
};

const lineIntersectsLine = (p1: Point, p2: Point, p3: Point, p4: Point) => {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (det === 0) return false;
  const lambda = ((p4.y - p3.y) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.y - p1.y)) / det;
  const gamma = ((p1.y - p2.y) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.y - p1.y)) / det;
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
};

const rectEdges = (r: Rect) => [
  [{x: r.x, y: r.y}, {x: r.x + r.width, y: r.y}],
  [{x: r.x + r.width, y: r.y}, {x: r.x + r.width, y: r.y + r.height}],
  [{x: r.x + r.width, y: r.y + r.height}, {x: r.x, y: r.y + r.height}],
  [{x: r.x, y: r.y + r.height}, {x: r.x, y: r.y}]
];

const isLineIntersectingRect = (p1: Point, p2: Point, r: Rect) => {
  if (isPointInRect(p1, r) || isPointInRect(p2, r)) return true;
  const edges = rectEdges(r);
  return edges.some(edge => lineIntersectsLine(p1, p2, edge[0], edge[1]));
};

export const getSelectionRect = (start: Point, end: Point): { rect: Rect, direction: 'LTR' | 'RTL' } => {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const direction = end.x >= start.x ? 'LTR' : 'RTL';
  return { rect: { x, y, width, height }, direction };
};

export const isShapeInSelection = (shape: Shape, rect: Rect, mode: 'WINDOW' | 'CROSSING'): boolean => {
  const bounds = getShapeBounds(shape);
  if (!bounds) return false;
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const shapeRight = bounds.x + bounds.width;
  const shapeBottom = bounds.y + bounds.height;

  if (shapeRight < rect.x || bounds.x > rectRight || shapeBottom < rect.y || bounds.y > rectBottom) return false;

  const isFullyInside = bounds.x >= rect.x && shapeRight <= rectRight && bounds.y >= rect.y && shapeBottom <= rectBottom;
  if (isFullyInside) return true;
  if (mode === 'WINDOW') return isFullyInside;

  const pts = shape.points || [];
  if (shape.type === 'line' || shape.type === 'measure' || shape.type === 'polyline' || shape.type === 'arrow') {
      if (pts.some(p => isPointInRect(p, rect))) return true;
      for (let i = 0; i < pts.length - 1; i++) {
          if (isLineIntersectingRect(pts[i], pts[i+1], rect)) return true;
      }
      return false;
  }
  if (shape.type === 'rect' && shape.width && shape.height && shape.x !== undefined && shape.y !== undefined) return true;

  if ((shape.type === 'circle' || shape.type === 'polygon') && shape.x !== undefined && shape.y !== undefined && shape.radius !== undefined) {
     if (isPointInRect({x: shape.x, y: shape.y}, rect)) return true;
     const closestX = Math.max(rect.x, Math.min(shape.x, rect.x + rect.width));
     const closestY = Math.max(rect.y, Math.min(shape.y, rect.y + rect.height));
     const dist = getDistance({x: shape.x, y: shape.y}, {x: closestX, y: closestY});
     return dist <= shape.radius;
  }
  return true;
};

export const getShapeBounds = (shape: Shape): Rect | null => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const addPoint = (p: Point) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    };

    if ((shape.type === 'line' || shape.type === 'polyline' || shape.type === 'measure' || shape.type === 'arc' || shape.type === 'arrow') && shape.points) {
        shape.points.forEach(addPoint);
    } 
    else if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
        addPoint({ x: shape.x, y: shape.y });
        addPoint({ x: shape.x + shape.width, y: shape.y + shape.height });
    }
    else if (shape.type === 'text' && shape.x !== undefined && shape.y !== undefined) {
        const { width, height } = getTextDimensions(shape);
        addPoint({ x: shape.x, y: shape.y });
        addPoint({ x: shape.x + width, y: shape.y + height });
    }
    else if ((shape.type === 'circle' || shape.type === 'polygon') && shape.x !== undefined && shape.y !== undefined && shape.radius !== undefined) {
        addPoint({ x: shape.x - shape.radius, y: shape.y - shape.radius });
        addPoint({ x: shape.x + shape.radius, y: shape.y + shape.radius });
    } 
    else { return null; }

    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const getCombinedBounds = (shapes: Shape[]): Rect | null => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;
    shapes.forEach(s => {
        const b = getShapeBounds(s);
        if (b) {
            found = true;
            if (b.x < minX) minX = b.x;
            if (b.y < minY) minY = b.y;
            if (b.x + b.width > maxX) maxX = b.x + b.width;
            if (b.y + b.height > maxY) maxY = b.y + b.height;
        }
    });
    if (!found) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/**
 * Get the bounding box of a shape for transformation purposes.
 * Returns { x, y, width, height } where x,y is the top-left corner.
 */
export const getShapeBoundingBox = (shape: Shape): Rect => {
    if (shape.type === 'rect' || shape.type === 'text') {
        return {
            x: shape.x ?? 0,
            y: shape.y ?? 0,
            width: shape.width ?? 0,
            height: shape.height ?? 0
        };
    }
    if (shape.type === 'circle' || shape.type === 'polygon') {
        const cx = shape.x ?? 0;
        const cy = shape.y ?? 0;
        const w = shape.width ?? (shape.radius ?? 50) * 2;
        const h = shape.height ?? (shape.radius ?? 50) * 2;
        return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
    }
    // Lines/polylines: return bounds of points
    if (shape.points && shape.points.length > 0) {
        const xs = shape.points.map(p => p.x);
        const ys = shape.points.map(p => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return {
            x: minX,
            y: minY,
            width: Math.max(...xs) - minX || 1,
            height: Math.max(...ys) - minY || 1
        };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
};

export interface Handle { x: number; y: number; cursor: string; index: number; type: 'vertex' | 'resize'; }

export const getShapeHandles = (shape: Shape): Handle[] => {
    const handles: Handle[] = [];
    if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'arrow') {
        if (shape.points && Array.isArray(shape.points)) {
            shape.points.forEach((p, i) => {
                handles.push({ x: p.x, y: p.y, cursor: 'move', index: i, type: 'vertex' });
            });
        }
    }
    else if (shape.type === 'circle' && shape.x !== undefined && shape.y !== undefined) {
        // Use width/height if available, otherwise fall back to radius*2
        const r = shape.radius ?? 50;
        const w = shape.width ?? r * 2;
        const h = shape.height ?? r * 2;
        const x = shape.x;
        const y = shape.y;
        // Handles at bounding box corners (center-based)
        const p1 = { x: x - w/2, y: y - h/2 };
        const p2 = { x: x + w/2, y: y - h/2 };
        const p3 = { x: x + w/2, y: y + h/2 };
        const p4 = { x: x - w/2, y: y + h/2 };

        handles.push({ x: p1.x, y: p1.y, cursor: 'nwse-resize', index: 0, type: 'resize' });
        handles.push({ x: p2.x, y: p2.y, cursor: 'nesw-resize', index: 1, type: 'resize' });
        handles.push({ x: p3.x, y: p3.y, cursor: 'nwse-resize', index: 2, type: 'resize' });
        handles.push({ x: p4.x, y: p4.y, cursor: 'nesw-resize', index: 3, type: 'resize' });
    }
    else if ((shape.type === 'rect') && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined && !isNaN(shape.width) && !isNaN(shape.height)) {
        const p1 = { x: shape.x, y: shape.y };
        const p2 = { x: shape.x + shape.width, y: shape.y };
        const p3 = { x: shape.x + shape.width, y: shape.y + shape.height };
        const p4 = { x: shape.x, y: shape.y + shape.height };

        const basePoints = [p1, p2, p3, p4];
        let finalPoints = basePoints;

        if (shape.rotation) {
            const pivot = { x: shape.x, y: shape.y };
            finalPoints = basePoints.map(p => rotatePoint(p, pivot, shape.rotation!));
        }

        handles.push({ x: finalPoints[0].x, y: finalPoints[0].y, cursor: 'nwse-resize', index: 0, type: 'resize' });
        handles.push({ x: finalPoints[1].x, y: finalPoints[1].y, cursor: 'nesw-resize', index: 1, type: 'resize' });
        handles.push({ x: finalPoints[2].x, y: finalPoints[2].y, cursor: 'nwse-resize', index: 2, type: 'resize' });
        handles.push({ x: finalPoints[3].x, y: finalPoints[3].y, cursor: 'nesw-resize', index: 3, type: 'resize' });
    }
    else if (shape.type === 'polygon' && shape.x !== undefined && shape.y !== undefined) {
         // Use width/height if available, otherwise fall back to radius*2
         const r = shape.radius ?? 50;
         const w = shape.width ?? r * 2;
         const h = shape.height ?? r * 2;
         const x = shape.x;
         const y = shape.y;
         // Handles at bounding box corners (center-based)
         const p1 = { x: x - w/2, y: y - h/2 };
         const p2 = { x: x + w/2, y: y - h/2 };
         const p3 = { x: x + w/2, y: y + h/2 };
         const p4 = { x: x - w/2, y: y + h/2 };

         handles.push({ x: p1.x, y: p1.y, cursor: 'nwse-resize', index: 0, type: 'resize' });
         handles.push({ x: p2.x, y: p2.y, cursor: 'nesw-resize', index: 1, type: 'resize' });
         handles.push({ x: p3.x, y: p3.y, cursor: 'nwse-resize', index: 2, type: 'resize' });
         handles.push({ x: p4.x, y: p4.y, cursor: 'nesw-resize', index: 3, type: 'resize' });
    }
    else if (shape.type === 'text' && shape.x !== undefined && shape.y !== undefined) {
        const { width, height } = getTextDimensions(shape);
        const p1 = { x: shape.x, y: shape.y };
        const p2 = { x: shape.x + width, y: shape.y };
        const p3 = { x: shape.x + width, y: shape.y + height };
        const p4 = { x: shape.x, y: shape.y + height };

        handles.push({ x: p1.x, y: p1.y, cursor: 'nwse-resize', index: 0, type: 'resize' });
        handles.push({ x: p2.x, y: p2.y, cursor: 'nesw-resize', index: 1, type: 'resize' });
        handles.push({ x: p3.x, y: p3.y, cursor: 'nwse-resize', index: 2, type: 'resize' });
        handles.push({ x: p4.x, y: p4.y, cursor: 'nesw-resize', index: 3, type: 'resize' });
    }
    return handles;
};
