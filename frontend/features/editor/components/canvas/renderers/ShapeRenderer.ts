import { Layer, Shape, ViewTransform } from '../../../../../types';
import { getDistance, getWrappedLines, TEXT_PADDING } from '../../../../../utils/geometry';
import { getEffectiveFillColor, getEffectiveStrokeColor, isStrokeEffectivelyEnabled, isFillEffectivelyEnabled } from '../../../../../utils/shapeColors';

export const renderShape = (
    ctx: CanvasRenderingContext2D,
    shape: Shape,
    viewTransform: ViewTransform,
    layer?: Layer
) => {
    // Safety checks for rendering - skip shapes without valid position
    // But allow polygon/circle which use x,y as center
    if (shape.type !== 'line' && shape.type !== 'polyline' && shape.type !== 'arrow' && shape.type !== 'measure' && shape.type !== 'arc') {
        if (shape.x === undefined || shape.y === undefined || isNaN(shape.x) || isNaN(shape.y)) return;
    }

    ctx.save();
    try {
        if (shape.rotation && shape.x !== undefined && shape.y !== undefined) {
            let pivotX = shape.x;
            let pivotY = shape.y;
            ctx.translate(pivotX, pivotY);
            ctx.rotate(shape.rotation);
            ctx.translate(-pivotX, -pivotY);
        }

        const strokeColor = getEffectiveStrokeColor(shape, layer);
        const fillColor = getEffectiveFillColor(shape, layer);
        
        // Use the new effective enabled functions that consider layer inheritance
        const strokeEnabled = isStrokeEffectivelyEnabled(shape, layer);
        const fillEnabled = isFillEffectivelyEnabled(shape, layer);
        
        const effectiveStroke = (!strokeEnabled || strokeColor === 'transparent') ? 'transparent' : strokeColor;
        ctx.strokeStyle = effectiveStroke;
        const effectiveFill = (fillEnabled && fillColor && fillColor !== 'transparent') ? fillColor : 'transparent';
        ctx.fillStyle = effectiveFill;
        ctx.setLineDash([]);

        const baseWidth = shape.strokeWidth || 2;
        ctx.lineWidth = baseWidth / viewTransform.scale;
        ctx.beginPath();

        if (shape.type === 'line' || shape.type === 'measure') {
            if (shape.points && shape.points.length >= 2) {
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
            if (shape.points && shape.points.length >= 2) {
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
            const cx = shape.x ?? 0;
            const cy = shape.y ?? 0;
            const r = shape.radius ?? 50;
            // Support width/height for ellipse-like behavior
            const rx = (shape.width ?? r * 2) / 2;
            const ry = (shape.height ?? r * 2) / 2;
            const flipX = shape.scaleX ?? 1;
            const flipY = shape.scaleY ?? 1;
            
            // Apply flip if needed
            if (flipX !== 1 || flipY !== 1) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.scale(flipX, flipY);
                ctx.translate(-cx, -cy);
            }
            
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            if (effectiveFill !== 'transparent') ctx.fill();
            ctx.stroke();
            
            if (flipX !== 1 || flipY !== 1) {
                ctx.restore();
            }
        } else if (shape.type === 'rect') {
            const rx = shape.x ?? 0;
            const ry = shape.y ?? 0;
            const rw = shape.width ?? 0;
            const rh = shape.height ?? 0;
            const flipX = shape.scaleX ?? 1;
            const flipY = shape.scaleY ?? 1;
            
            // Apply flip transformation if needed
            if (flipX !== 1 || flipY !== 1) {
                ctx.save();
                const centerX = rx + rw / 2;
                const centerY = ry + rh / 2;
                ctx.translate(centerX, centerY);
                ctx.scale(flipX, flipY);
                ctx.translate(-centerX, -centerY);
            }
            
            ctx.rect(rx, ry, rw, rh);
            if (effectiveFill !== 'transparent') ctx.fill();
            ctx.stroke();
            
            if (flipX !== 1 || flipY !== 1) {
                ctx.restore();
            }
        } else if (shape.type === 'polyline') {
            if (shape.points && shape.points.length > 0) {
                ctx.moveTo(shape.points[0].x, shape.points[0].y);
                for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
                ctx.stroke();
            }
        } else if (shape.type === 'polygon') {
            // Polygon rendering with width/height scale support
            const sides = Math.max(3, shape.sides ?? 5);
            const r = shape.radius ?? 50;
            const cx = shape.x ?? 0;
            const cy = shape.y ?? 0;
            
            // Calculate scale factors for width/height
            const baseSize = r * 2;
            const scaleX = ((shape.width ?? baseSize) / baseSize) * (shape.scaleX ?? 1);
            const scaleY = ((shape.height ?? baseSize) / baseSize) * (shape.scaleY ?? 1);
            
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scaleX, scaleY);
            
            const angleStep = (Math.PI * 2) / sides;
            const startAngle = -Math.PI / 2;
            ctx.moveTo(r * Math.cos(startAngle), r * Math.sin(startAngle));
            for (let i = 1; i <= sides; i++) {
                ctx.lineTo(r * Math.cos(startAngle + i * angleStep), r * Math.sin(startAngle + i * angleStep));
            }
            ctx.closePath();
            
            ctx.restore();
            if (effectiveFill !== 'transparent') ctx.fill();
            ctx.stroke();
        } else if (shape.type === 'arc') {
            if (shape.points && shape.points.length >= 2) {
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
                if (dist === 0) return; // Prevent division by zero
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

            const textColor = strokeColor;
            const bgColor = fillColor && fillColor !== 'transparent' ? fillColor : null;

            const pad = TEXT_PADDING;
            const containerWidth = (shape.width ?? ctx.measureText(shape.textContent).width) - pad * 2;
            const availableWidth = Math.max(containerWidth, fontSize * 0.6);
            const lineHeight = fontSize * 1.2;
            const wrappedLines = getWrappedLines(shape.textContent, availableWidth, fontSize);

            const sx = shape.x ?? 0;
            const sy = shape.y ?? 0;

            wrappedLines.forEach((line, index) => {
                const lineWidth = ctx.measureText(line).width;
                let xPos = sx + pad;
                if (shape.align === 'center') xPos += (availableWidth - lineWidth) / 2;
                else if (shape.align === 'right') xPos += (availableWidth - lineWidth);

                const yPos = sy + pad + index * lineHeight;
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
