import { Shape, ViewTransform } from '../../../../../types';
import { getShapeCenter } from '../../../../../utils/geometry';

export const drawGhostShape = (ctx: CanvasRenderingContext2D, shape: Shape, viewTransform: ViewTransform) => {
    ctx.save();
    try {
        if (shape.rotation) {
            const pivot = getShapeCenter(shape);
            ctx.translate(pivot.x, pivot.y);
            ctx.rotate(shape.rotation);
            ctx.translate(-pivot.x, -pivot.y);
        }
        ctx.strokeStyle = '#3b82f6';
        ctx.setLineDash([5, 5]);
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
        const baseWidth = shape.strokeWidth || 2;
        ctx.lineWidth = baseWidth / viewTransform.scale;
        ctx.beginPath();

        if (shape.type === 'line' || shape.type === 'measure' || shape.type === 'arrow') {
            if (shape.points && shape.points.length >= 2) {
                ctx.moveTo(shape.points[0].x, shape.points[0].y);
                ctx.lineTo(shape.points[1].x, shape.points[1].y);
                ctx.stroke();
            }
        } else if (shape.type === 'circle') {
            const cx = shape.x ?? 0;
            const cy = shape.y ?? 0;
            const r = shape.radius ?? 0;
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'rect') {
            const rx = shape.x ?? 0;
            const ry = shape.y ?? 0;
            const rw = shape.width ?? 0;
            const rh = shape.height ?? 0;
            ctx.rect(rx, ry, rw, rh);
            ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'polygon') {
            // SAFE polygon ghost rendering
            const sides = Math.max(3, shape.sides ?? 5);
            const r = shape.radius ?? 0;
            const cx = shape.x ?? 0;
            const cy = shape.y ?? 0;
            const angleStep = (Math.PI * 2) / sides;
            const startAngle = -Math.PI / 2;
            ctx.moveTo(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
            for (let i = 1; i <= sides; i++) {
                ctx.lineTo(cx + r * Math.cos(startAngle + i * angleStep), cy + r * Math.sin(startAngle + i * angleStep));
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    } finally {
        ctx.restore();
    }
};
