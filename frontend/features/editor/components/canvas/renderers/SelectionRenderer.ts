import { Shape, ViewTransform } from '../../../../../types';
import { getShapeBoundingBox, getShapeCenter, getShapeHandles } from '../../../../../utils/geometry';

export const drawSelectionHighlight = (ctx: CanvasRenderingContext2D, shape: Shape, viewTransform: ViewTransform) => {
    // Just the highlight border/box
    ctx.save();
    try {
        const { x: cx, y: cy } = getShapeCenter(shape);

        if (shape.rotation) {
            ctx.translate(cx, cy);
            ctx.rotate(-shape.rotation); // Negate for CCW visual rotation on Y-down canvas
            ctx.translate(-cx, -cy);
        }
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1 / viewTransform.scale;

        ctx.beginPath();
        if (shape.type === 'rect' || shape.type === 'text') {
            const bounds = getShapeBoundingBox(shape);
            ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
        } else if (shape.type === 'circle') {
            const r = shape.radius ?? 50;
            const rx = (shape.width ?? r * 2) / 2;
            const ry = (shape.height ?? r * 2) / 2;
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        } else if (shape.type === 'polygon') {
            const sides = Math.max(3, shape.sides ?? 5);
            const r = shape.radius ?? 50;
            const baseSize = r * 2;
            const scaleX = (shape.width ?? baseSize) / baseSize;
            const scaleY = (shape.height ?? baseSize) / baseSize;
            
            const angleStep = (Math.PI * 2) / sides;
            const startAngle = -Math.PI / 2;
            ctx.moveTo(cx + r * scaleX * Math.cos(startAngle), cy + r * scaleY * Math.sin(startAngle));
            for (let i = 1; i <= sides; i++) {
                ctx.lineTo(cx + r * scaleX * Math.cos(startAngle + i * angleStep), cy + r * scaleY * Math.sin(startAngle + i * angleStep));
            }
            ctx.closePath();
        }
        else if (shape.type === 'line' && shape.points && shape.points.length >= 2) { 
            ctx.moveTo(shape.points[0].x, shape.points[0].y); 
            ctx.lineTo(shape.points[1].x, shape.points[1].y); 
        }
        else if (shape.type === 'arrow' && shape.points && shape.points.length >= 2) {
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            ctx.lineTo(shape.points[1].x, shape.points[1].y);
        }
        else if (shape.type === 'polyline' && shape.points && shape.points.length > 0) {
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            for (let i = 1; i < shape.points.length; i++) {
                ctx.lineTo(shape.points[i].x, shape.points[i].y);
            }
        }
        else if (shape.type === 'arc' && shape.points && shape.points.length >= 2) {
            // Draw a line between arc endpoints for selection
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            ctx.lineTo(shape.points[1].x, shape.points[1].y);
        }
        else if ((shape.type === 'conduit' || shape.type === 'eletroduto') && shape.points && shape.points.length >= 2) {
            const [start, end] = shape.points;
            const cp = shape.controlPoint ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            ctx.moveTo(start.x, start.y);
            ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
        }
        ctx.stroke();

        // Draw connection point for electrical symbols
        if (shape.svgRaw && shape.connectionPoint) {
            const bounds = getShapeBoundingBox(shape);
            const absX = bounds.x + shape.connectionPoint.x * bounds.width;
            const absY = bounds.y + shape.connectionPoint.y * bounds.height;
            
            ctx.beginPath();
            ctx.fillStyle = '#3b82f6';
            ctx.arc(absX, absY, 4 / viewTransform.scale, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw white border for visibility
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5 / viewTransform.scale;
            ctx.stroke();
        }
    } finally {
        ctx.restore();
    }
};

export const drawHandles = (ctx: CanvasRenderingContext2D, shape: Shape, viewTransform: ViewTransform) => {
    try {
        const handles = getShapeHandles(shape);
        const handleSize = 6 / viewTransform.scale;
        ctx.save();
        try {
            ctx.lineWidth = 1 / viewTransform.scale;
            
            // Draw bounding box lines connecting the corner handles (like Figma)
            // Filter to get only resize handles (corners)
            const cornerHandles = handles.filter(h => h.type === 'resize' && h.index < 4);
            if (cornerHandles.length === 4) {
                // Order: 0=TL, 1=TR, 2=BR, 3=BL
                ctx.beginPath();
                ctx.strokeStyle = '#2563eb';
                ctx.setLineDash([]);
                // Draw rectangle from handles
                ctx.moveTo(cornerHandles[0].x, cornerHandles[0].y); // TL
                ctx.lineTo(cornerHandles[1].x, cornerHandles[1].y); // TR
                ctx.lineTo(cornerHandles[2].x, cornerHandles[2].y); // BR
                ctx.lineTo(cornerHandles[3].x, cornerHandles[3].y); // BL
                ctx.closePath();
                ctx.stroke();
            }

            // Handles are now returned in world coordinates (already rotated), so we don't apply canvas rotation here.
            handles.forEach(h => {
                ctx.beginPath(); 
                ctx.rect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
                ctx.fillStyle = '#ffffff'; 
                ctx.fill(); 
                ctx.strokeStyle = '#2563eb'; 
                ctx.stroke();
            });
        } finally {
            ctx.restore();
        }
    } catch (e) {
        console.error("Error in drawHandles:", e);
    }
};
