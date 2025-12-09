import { Shape, ViewTransform } from '../../../../../types';
import { getDistance, getWrappedLines, TEXT_PADDING } from '../../../../../utils/geometry';

export const renderShape = (
    ctx: CanvasRenderingContext2D,
    shape: Shape,
    viewTransform: ViewTransform
) => {
    // Safety checks for rendering
    if (shape.x === undefined || shape.y === undefined || isNaN(shape.x) || isNaN(shape.y)) return;

    ctx.save();
    try {
        if (shape.rotation) {
            let pivotX = shape.x;
            let pivotY = shape.y;
            ctx.translate(pivotX, pivotY);
            ctx.rotate(shape.rotation);
            ctx.translate(-pivotX, -pivotY);
        }

        const effectiveStroke = (shape.strokeEnabled === false) ? 'transparent' : shape.strokeColor;
        ctx.strokeStyle = effectiveStroke;
        ctx.fillStyle = (shape.fillColor && shape.fillColor !== 'transparent') ? shape.fillColor : 'transparent';
        ctx.setLineDash([]);

        const baseWidth = shape.strokeWidth || 2;
        ctx.lineWidth = baseWidth / viewTransform.scale;
        ctx.beginPath();

        if (shape.type === 'line' || shape.type === 'measure') {
            if (shape.points.length >= 2) {
                ctx.moveTo(shape.points[0].x, shape.points[0].y);
                ctx.lineTo(shape.points[1].x, shape.points[1].y);
                ctx.stroke();
                if (shape.type === 'measure' && shape.label) {
                    const midX = (shape.points[0].x + shape.points[1].x) / 2;
                    const midY = (shape.points[0].y + shape.points[1].y) / 2;
                    ctx.save();
                    try {
                        ctx.font = `bold ${14 / viewTransform.scale}px sans-serif`;
                        ctx.fillStyle = '#fff';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.translate(midX, midY);
                        const tm = ctx.measureText(shape.label);
                        ctx.fillStyle = 'rgba(0,0,0,0.7)';
                        ctx.fillRect(-tm.width / 2 - 4, -18 / viewTransform.scale, tm.width + 8, 20 / viewTransform.scale);
                        ctx.fillStyle = '#fff';
                        ctx.fillText(shape.label, 0, -2 / viewTransform.scale);
                    } finally {
                        ctx.restore();
                    }
                }
            }
        } else if (shape.type === 'arrow') {
            if (shape.points.length >= 2) {
                const p1 = shape.points[0];
                const p2 = shape.points[1];
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
                const headSize = shape.arrowHeadSize || 15;
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                ctx.beginPath();
                ctx.moveTo(p2.x, p2.y);
                ctx.lineTo(p2.x - headSize * Math.cos(angle - Math.PI / 6), p2.y - headSize * Math.sin(angle - Math.PI / 6));
                ctx.moveTo(p2.x, p2.y);
                ctx.lineTo(p2.x - headSize * Math.cos(angle + Math.PI / 6), p2.y - headSize * Math.sin(angle + Math.PI / 6));
                ctx.stroke();
            }
        } else if (shape.type === 'circle') {
            ctx.arc(shape.x!, shape.y!, shape.radius!, 0, Math.PI * 2);
            if (shape.fillColor !== 'transparent') ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'rect') {
            ctx.rect(shape.x!, shape.y!, shape.width!, shape.height!);
            if (shape.fillColor !== 'transparent') ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'polyline') {
            if (shape.points.length > 0) {
                ctx.moveTo(shape.points[0].x, shape.points[0].y);
                for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
                ctx.stroke();
            }
        } else if (shape.type === 'polygon') {
            const angleStep = (Math.PI * 2) / shape.sides!;
            const startAngle = -Math.PI / 2;
            ctx.moveTo(shape.x! + shape.radius! * Math.cos(startAngle), shape.y! + shape.radius! * Math.sin(startAngle));
            for (let i = 1; i <= shape.sides!; i++) ctx.lineTo(shape.x! + shape.radius! * Math.cos(startAngle + i * angleStep), shape.y! + shape.radius! * Math.sin(startAngle + i * angleStep));
            ctx.closePath();
            if (shape.fillColor !== 'transparent') ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'arc') {
            if (shape.points.length >= 2) {
                const p1 = shape.points[0];
                const p2 = shape.points[1];
                const d = getDistance(p1, p2);
                let r = shape.radius || d;
                if (r < d / 2) r = d / 2;
                const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const midX = (p1.x + p2.x) / 2;
                const midY = (p1.y + p2.y) / 2;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const udx = -dy / dist;
                const udy = dx / dist;
                const cx = midX + udx * h;
                const cy = midY + udy * h;
                const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
                const endAngle = Math.atan2(p2.y - cy, p2.x - cx);
                ctx.beginPath();
                ctx.arc(cx, cy, r, startAngle, endAngle, false);
                ctx.stroke();
            }
        } else if (shape.type === 'text' && shape.textContent) {
            const fontSize = shape.fontSize || 16;
            const fontWeight = shape.bold ? 'bold ' : '';
            const fontStyle = shape.italic ? 'italic ' : '';
            ctx.font = `${fontStyle}${fontWeight}${fontSize}px ${shape.fontFamily || 'Inter'}`;
            ctx.textAlign = 'left';
            // force left-to-right rendering
            // @ts-ignore experimental but supported on modern browsers
            ctx.direction = 'ltr';
            ctx.textBaseline = 'top';

            const textColor = shape.strokeColor;
            const bgColor = shape.fillColor && shape.fillColor !== 'transparent' ? shape.fillColor : null;

            const pad = TEXT_PADDING;
            const containerWidth = (shape.width ?? ctx.measureText(shape.textContent).width) - pad * 2;
            const availableWidth = Math.max(containerWidth, fontSize * 0.6);
            const lineHeight = fontSize * 1.2;
            const wrappedLines = getWrappedLines(shape.textContent, availableWidth, fontSize);

            wrappedLines.forEach((line, index) => {
                const lineWidth = ctx.measureText(line).width;
                let xPos = shape.x! + pad;
                if (shape.align === 'center') xPos += (availableWidth - lineWidth) / 2;
                else if (shape.align === 'right') xPos += (availableWidth - lineWidth);

                const yPos = shape.y! + pad + index * lineHeight;
                if (bgColor) {
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(xPos - 1, yPos, lineWidth + 2, lineHeight);
                }

                ctx.fillStyle = textColor;
                ctx.fillText(line, xPos, yPos);

                if (shape.underline) {
                    const underlineY = yPos + lineHeight * 0.85;
                    ctx.fillRect(xPos, underlineY, lineWidth, Math.max(1 / viewTransform.scale, 1));
                }
                if (shape.strike) {
                    const strikeY = yPos + lineHeight * 0.45;
                    ctx.fillRect(xPos, strikeY, lineWidth, Math.max(1 / viewTransform.scale, 1));
                }
            });
        }
    } finally {
        ctx.restore();
    }
};
