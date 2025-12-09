import { Shape, ViewTransform } from '../../../../../types';

export const drawGhostShape = (ctx: CanvasRenderingContext2D, shape: Shape, viewTransform: ViewTransform) => {
    ctx.save();
    try {
        if (shape.rotation && shape.x !== undefined && shape.y !== undefined) {
            let pivotX = shape.x; let pivotY = shape.y;
            ctx.translate(pivotX, pivotY); ctx.rotate(shape.rotation); ctx.translate(-pivotX, -pivotY);
        }
        ctx.strokeStyle = '#3b82f6';
        ctx.setLineDash([5, 5]);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        const baseWidth = shape.strokeWidth || 2;
        ctx.lineWidth = baseWidth / viewTransform.scale;
        ctx.beginPath();

        // Simplified drawing for ghost (rect/circle/line mostly)
        if (shape.type === 'line' || shape.type === 'measure' || shape.type === 'arrow') {
        if (shape.points.length >= 2) {
            ctx.moveTo(shape.points[0].x, shape.points[0].y); ctx.lineTo(shape.points[1].x, shape.points[1].y); ctx.stroke();
        }
        } else if (shape.type === 'circle') {
        ctx.arc(shape.x!, shape.y!, shape.radius!, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        } else if (shape.type === 'rect') {
        ctx.rect(shape.x!, shape.y!, shape.width!, shape.height!); ctx.fill(); ctx.stroke();
        }
        // ... Add other types if necessary
    } finally {
        ctx.restore();
    }
};
