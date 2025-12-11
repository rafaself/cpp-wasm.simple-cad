import { Shape, ViewTransform } from '../../../../../types';
import { getShapeCenter } from '../../../../../utils/geometry';

const ghostSvgCache: Record<string, HTMLImageElement> = {};

const getGhostImage = (svg: string) => {
    if (ghostSvgCache[svg]) return ghostSvgCache[svg];
    const img = new Image();
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    ghostSvgCache[svg] = img;
    return img;
};

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
            const flipX = shape.scaleX ?? 1;
            const flipY = shape.scaleY ?? 1;
            if (flipX !== 1 || flipY !== 1) {
                ctx.save();
                const cx = rx + rw / 2;
                const cy = ry + rh / 2;
                ctx.translate(cx, cy);
                ctx.scale(flipX, flipY);
                ctx.translate(-cx, -cy);
            }
            // Only draw rect border/fill if it's NOT an SVG symbol shape
            if (!shape.svgRaw) {
                ctx.rect(rx, ry, rw, rh);
                ctx.fill();
                ctx.stroke();
            }
            if (shape.svgRaw && shape.svgViewBox) {
                const img = getGhostImage(shape.svgRaw);
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.drawImage(img, rx, ry, rw, rh);
                ctx.restore();
            }
            if (flipX !== 1 || flipY !== 1) {
                ctx.restore();
            }
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
