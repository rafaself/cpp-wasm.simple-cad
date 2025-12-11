import { Point, Shape } from '../../../types';
import { getDistance } from '../../../utils/geometry';

export const getEndpoints = (shape: Shape): Point[] => {
    if (shape.points && shape.points.length > 0) {
        if (shape.type === 'line' || shape.type === 'polyline' || shape.type === 'measure' || shape.type === 'arc' || shape.type === 'arrow') {
            const pts = [shape.points[0], shape.points[shape.points.length - 1]];
            if (shape.type === 'polyline') {
                return shape.points;
            }
            return pts;
        }
    }
    if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
        return [
            { x: shape.x, y: shape.y },
            { x: shape.x + shape.width, y: shape.y },
            { x: shape.x + shape.width, y: shape.y + shape.height },
            { x: shape.x, y: shape.y + shape.height }
        ];
    }
    if (shape.type === 'circle' && shape.x !== undefined && shape.y !== undefined && shape.radius !== undefined) {
         return [
             { x: shape.x + shape.radius, y: shape.y },
             { x: shape.x - shape.radius, y: shape.y },
             { x: shape.x, y: shape.y + shape.radius },
             { x: shape.x, y: shape.y - shape.radius }
         ];
    }
    return [];
};

export const getMidpoints = (shape: Shape): Point[] => {
    const mids: Point[] = [];
    if (shape.points && shape.points.length > 0) {
        for (let i = 0; i < shape.points.length - 1; i++) {
            mids.push({
                x: (shape.points[i].x + shape.points[i+1].x) / 2,
                y: (shape.points[i].y + shape.points[i+1].y) / 2
            });
        }
    }
    if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
        mids.push({ x: shape.x + shape.width/2, y: shape.y });
        mids.push({ x: shape.x + shape.width, y: shape.y + shape.height/2 });
        mids.push({ x: shape.x + shape.width/2, y: shape.y + shape.height });
        mids.push({ x: shape.x, y: shape.y + shape.height/2 });
    }
    return mids;
};

export const getCenter = (shape: Shape): Point | null => {
    if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
        return { x: shape.x + shape.width/2, y: shape.y + shape.height/2 };
    }
    if ((shape.type === 'circle' || shape.type === 'polygon') && shape.x !== undefined && shape.y !== undefined) {
        return { x: shape.x, y: shape.y };
    }
    return null;
};

export const getGridSnap = (point: Point, gridSize: number): Point => {
    const gx = Math.round(point.x / gridSize) * gridSize;
    const gy = Math.round(point.y / gridSize) * gridSize;
    return { x: gx, y: gy };
};
