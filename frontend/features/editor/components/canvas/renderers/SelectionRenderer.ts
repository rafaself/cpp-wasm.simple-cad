import { Shape, ViewTransform } from '../../../../../types';
import { getShapeHandles } from '../../../../../utils/geometry';

export const drawSelectionHighlight = (ctx: CanvasRenderingContext2D, shape: Shape, viewTransform: ViewTransform) => {
    // Just the highlight border/box
    ctx.save();
    try {
        if (shape.rotation && shape.x !== undefined && shape.y !== undefined) {
            let pivotX = shape.x; let pivotY = shape.y;
            ctx.translate(pivotX, pivotY); ctx.rotate(shape.rotation); ctx.translate(-pivotX, -pivotY);
        }
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1 / viewTransform.scale;

        ctx.beginPath();
        if (shape.type === 'rect' || shape.type === 'text') {
            if (shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
                 ctx.rect(shape.x, shape.y, shape.width, shape.height);
            }
        }
        else if (shape.type === 'circle') ctx.arc(shape.x!, shape.y!, shape.radius!, 0, Math.PI*2);
        else if (shape.type === 'polygon' && shape.sides && shape.radius) {
            const sides = Math.max(3, shape.sides);
            const angleStep = (Math.PI * 2) / sides;
            const startAngle = -Math.PI / 2;
            ctx.moveTo(shape.x! + shape.radius * Math.cos(startAngle), shape.y! + shape.radius * Math.sin(startAngle));
            for (let i = 1; i <= sides; i++) ctx.lineTo(shape.x! + shape.radius * Math.cos(startAngle + i * angleStep), shape.y! + shape.radius * Math.sin(startAngle + i * angleStep));
            ctx.closePath();
        }
        else if (shape.type === 'line' && shape.points.length>=2) { ctx.moveTo(shape.points[0].x, shape.points[0].y); ctx.lineTo(shape.points[1].x, shape.points[1].y); }
        // ...
        ctx.stroke();
    } finally {
        ctx.restore();
    }
};

export const drawHandles = (ctx: CanvasRenderingContext2D, shape: Shape, viewTransform: ViewTransform) => {
    const handles = getShapeHandles(shape);
    const handleSize = 6 / viewTransform.scale;
    ctx.save();
    try {
        ctx.lineWidth = 1 / viewTransform.scale;
        // Handles are now returned in world coordinates (already rotated), so we don't apply canvas rotation here.
        handles.forEach(h => {
            ctx.beginPath(); ctx.rect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
            ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#2563eb'; ctx.stroke();
        });
    } finally {
        ctx.restore();
    }
};
