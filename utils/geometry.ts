import { Point, Shape, ViewTransform, SnapOptions, Rect } from '../types/index';

export const getDistance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
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

export const getSnapPoint = (
  point: Point, 
  shapes: Shape[], 
  snapOptions: SnapOptions,
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

  shapes.forEach(shape => {
    if (shape.points && shape.points.length > 0) {
      if (snapOptions.endpoint) {
        if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'measure' || shape.type === 'arc') {
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

  return closestPoint;
};

// Hit Test
export const isPointInShape = (point: Point, shape: Shape): boolean => {
  const threshold = 5;

  switch (shape.type) {
    case 'circle':
      if (shape.x === undefined || shape.y === undefined || shape.radius === undefined) return false;
      const dist = getDistance(point, { x: shape.x, y: shape.y });
      return Math.abs(dist - shape.radius) <= threshold;

    case 'rect':
      if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return false;
      const inX = point.x >= shape.x - threshold && point.x <= shape.x + shape.width + threshold;
      const inY = point.y >= shape.y - threshold && point.y <= shape.y + shape.height + threshold;
      if (!inX || !inY) return false;
      
      const nearLeft = Math.abs(point.x - shape.x) < threshold;
      const nearRight = Math.abs(point.x - (shape.x + shape.width)) < threshold;
      const nearTop = Math.abs(point.y - shape.y) < threshold;
      const nearBottom = Math.abs(point.y - (shape.y + shape.height)) < threshold;
      
      return nearLeft || nearRight || nearTop || nearBottom;

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

    case 'polygon': 
      if (shape.x === undefined || shape.y === undefined || shape.radius === undefined) return false;
      return Math.abs(getDistance(point, { x: shape.x, y: shape.y }) - shape.radius) <= threshold;

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

    default:
      return false;
  }
};

// --- Selection Helpers ---

const isPointInRect = (p: Point, r: Rect) => {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
};

// Helper: Line-Line intersection (simplified for rect edges)
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
  // Left-To-Right if end.x > start.x
  const direction = end.x >= start.x ? 'LTR' : 'RTL';
  return { rect: { x, y, width, height }, direction };
};

export const isShapeInSelection = (shape: Shape, rect: Rect, mode: 'WINDOW' | 'CROSSING'): boolean => {
  const pts = shape.points || [];
  
  // Logic varies by shape type
  if (shape.type === 'line' || shape.type === 'measure' || shape.type === 'polyline') {
     if (mode === 'WINDOW') {
        return pts.every(p => isPointInRect(p, rect));
     } else {
        if (pts.some(p => isPointInRect(p, rect))) return true;
        for (let i = 0; i < pts.length - 1; i++) {
           if (isLineIntersectingRect(pts[i], pts[i+1], rect)) return true;
        }
        return false;
     }
  }

  if (shape.type === 'rect' && shape.width && shape.height && shape.x !== undefined && shape.y !== undefined) {
     const p1 = { x: shape.x, y: shape.y };
     const p2 = { x: shape.x + shape.width, y: shape.y };
     const p3 = { x: shape.x + shape.width, y: shape.y + shape.height };
     const p4 = { x: shape.x, y: shape.y + shape.height };
     const corners = [p1, p2, p3, p4];

     if (mode === 'WINDOW') {
        return corners.every(p => isPointInRect(p, rect));
     } else {
        if (corners.some(p => isPointInRect(p, rect))) return true;
        if (isPointInRect({x: rect.x, y: rect.y}, {x: shape.x, y: shape.y, width: shape.width, height: shape.height})) return true;
        const shapeEdges = [
           [p1, p2], [p2, p3], [p3, p4], [p4, p1]
        ];
        return shapeEdges.some(se => 
           rectEdges(rect).some(re => lineIntersectsLine(se[0], se[1], re[0], re[1]))
        );
     }
  }

  if ((shape.type === 'circle' || shape.type === 'polygon') && shape.x !== undefined && shape.y !== undefined && shape.radius !== undefined) {
      const minX = shape.x - shape.radius;
      const maxX = shape.x + shape.radius;
      const minY = shape.y - shape.radius;
      const maxY = shape.y + shape.radius;
      
      const bboxCorners = [
        {x: minX, y: minY}, {x: maxX, y: minY}, {x: maxX, y: maxY}, {x: minX, y: maxY}
      ];

      if (mode === 'WINDOW') {
         return bboxCorners.every(p => isPointInRect(p, rect));
      } else {
         if (isPointInRect({x: shape.x, y: shape.y}, rect)) return true;
         if (bboxCorners.some(p => isPointInRect(p, rect))) return true;
         if (isPointInShape({x: rect.x, y: rect.y}, shape)) return true;
         
         const disjoint = (minX > rect.x + rect.width) || (maxX < rect.x) || (minY > rect.y + rect.height) || (maxY < rect.y);
         return !disjoint;
      }
  }

  return false;
};

// --- Bounding Box Helpers ---

export const getShapeBounds = (shape: Shape): Rect | null => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const addPoint = (p: Point) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    };

    if ((shape.type === 'line' || shape.type === 'polyline' || shape.type === 'measure' || shape.type === 'arc') && shape.points) {
        shape.points.forEach(addPoint);
    } 
    else if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
        addPoint({ x: shape.x, y: shape.y });
        addPoint({ x: shape.x + shape.width, y: shape.y + shape.height });
    }
    else if ((shape.type === 'circle' || shape.type === 'polygon') && shape.x !== undefined && shape.y !== undefined && shape.radius !== undefined) {
        addPoint({ x: shape.x - shape.radius, y: shape.y - shape.radius });
        addPoint({ x: shape.x + shape.radius, y: shape.y + shape.radius });
    } else {
        return null;
    }

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
