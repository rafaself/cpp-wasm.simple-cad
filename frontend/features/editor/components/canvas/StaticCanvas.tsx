import React, { useRef, useEffect } from 'react';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { Shape, Rect } from '../../../../types';
import { getDistance, getWrappedLines } from '../../../../utils/geometry';

interface StaticCanvasProps {
    width: number;
    height: number;
}

const StaticCanvas: React.FC<StaticCanvasProps> = ({ width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewTransform = useUIStore(s => s.viewTransform);
    const gridSize = useUIStore(s => s.gridSize);
    const gridColor = useUIStore(s => s.gridColor);

    // Subscribe to necessary data stores.
    const shapes = useDataStore(s => s.shapes);
    const layers = useDataStore(s => s.layers);
    const spatialIndex = useDataStore(s => s.spatialIndex);

    // Helpers to draw shapes (moved from original EditorCanvas)
    const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
        const layer = layers.find(l => l.id === shape.layerId);
        if (layer && !layer.visible) return;

        // Safety checks for rendering
        if (shape.x === undefined || shape.y === undefined || isNaN(shape.x) || isNaN(shape.y)) return;

        ctx.save();
        try {
            // ... Logic inside drawShape ...
            // We need to capture the logic inside drawShape from line 32 to 168.
            // Since I cannot match a large block easily with replace_file_content without copying it all, 
            // I will use replace_file_content on the START and END of the function.
            
            if (shape.rotation) {
                let pivotX = shape.x; let pivotY = shape.y;
                ctx.translate(pivotX, pivotY); ctx.rotate(shape.rotation); ctx.translate(-pivotX, -pivotY);
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
                ctx.moveTo(shape.points[0].x, shape.points[0].y); ctx.lineTo(shape.points[1].x, shape.points[1].y); ctx.stroke();
                if (shape.type === 'measure' && shape.label) {
                  const midX = (shape.points[0].x + shape.points[1].x) / 2;
                  const midY = (shape.points[0].y + shape.points[1].y) / 2;
                  ctx.save();
                  try {
                      ctx.font = `bold ${14 / viewTransform.scale}px sans-serif`;
                      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                      ctx.translate(midX, midY);
                      const tm = ctx.measureText(shape.label);
                      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(-tm.width/2 - 4, -18 / viewTransform.scale, tm.width + 8, 20 / viewTransform.scale);
                      ctx.fillStyle = '#fff'; ctx.fillText(shape.label, 0, -2 / viewTransform.scale);
                  } finally {
                      ctx.restore();
                  }
                }
              }
            } else if (shape.type === 'arrow') {
              if (shape.points.length >= 2) {
                const p1 = shape.points[0]; const p2 = shape.points[1];
                ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
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
               ctx.arc(shape.x!, shape.y!, shape.radius!, 0, Math.PI * 2); if (shape.fillColor !== 'transparent') ctx.fill(); ctx.stroke();
            } else if (shape.type === 'rect') {
               ctx.rect(shape.x!, shape.y!, shape.width!, shape.height!); if (shape.fillColor !== 'transparent') ctx.fill(); ctx.stroke();
            } else if (shape.type === 'polyline') {
               if (shape.points.length > 0) {
                 ctx.moveTo(shape.points[0].x, shape.points[0].y); for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y); ctx.stroke();
               }
            } else if (shape.type === 'polygon') {
                const angleStep = (Math.PI * 2) / shape.sides!; const startAngle = -Math.PI / 2;
                ctx.moveTo(shape.x! + shape.radius! * Math.cos(startAngle), shape.y! + shape.radius! * Math.sin(startAngle));
                for (let i = 1; i <= shape.sides!; i++) ctx.lineTo(shape.x! + shape.radius! * Math.cos(startAngle + i * angleStep), shape.y! + shape.radius! * Math.sin(startAngle + i * angleStep));
                ctx.closePath(); if (shape.fillColor !== 'transparent') ctx.fill(); ctx.stroke();
            } else if (shape.type === 'arc') {
                if (shape.points.length >= 2) {
                  const p1 = shape.points[0]; const p2 = shape.points[1]; const d = getDistance(p1, p2);
                  let r = shape.radius || d; if (r < d / 2) r = d / 2;
                  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
                  const dx = p2.x - p1.x; const dy = p2.y - p1.y; const midX = (p1.x + p2.x) / 2; const midY = (p1.y + p2.y) / 2;
                  const dist = Math.sqrt(dx*dx + dy*dy); const udx = -dy / dist; const udy = dx / dist;
                  const cx = midX + udx * h; const cy = midY + udy * h;
                  const startAngle = Math.atan2(p1.y - cy, p1.x - cx); const endAngle = Math.atan2(p2.y - cy, p2.x - cx);
                  ctx.beginPath(); ctx.arc(cx, cy, r, startAngle, endAngle, false); ctx.stroke();
               }
            } else if (shape.type === 'text') {
               if (shape.text) {
                   ctx.font = `${shape.fontItalic ? 'italic' : 'normal'} ${shape.fontBold ? 'bold' : 'normal'} ${shape.fontSize || 20}px "${shape.fontFamily || 'sans-serif'}"`;
                   ctx.textBaseline = 'top';
    
                   // Use stored width if available (Fixed Width from drag or previous commit), otherwise treat as auto but wrapped?
                   // The Shape should have a width stored.
                   let lines: string[] = [];
    
                   // If we have a shape.width, we respect it for wrapping only if it was intended as a limit.
                   // However, in our new CanvasManager, we calculate strict width/height on commit.
                   // So we can just trust the newlines in shape.text mostly?
                   // But if the user resized the text box using handles (if we implement that), we need to re-wrap.
                   // For now, let's rely on explicit newlines in `shape.text` which `CanvasManager` produces unless we add wrapping logic there.
                   // Actually `CanvasManager` wraps using `getWrappedLines` if `boxWidth` was set.
                   // So `shape.text` should already contain the correct newlines if it was auto-wrapped on commit.
                   // BUT, if we resize the box later, we want reflow?
                   // Simplest MVP: Trust `shape.text` newlines.
    
                   lines = shape.text.split('\n');
    
                   const lineHeight = (shape.fontSize || 20) * 1.2;
    
                   // Draw Background if set
                   // We use shape.width and shape.height which should be accurate from the store
                   if (shape.fillColor && shape.fillColor !== 'transparent') {
                       ctx.fillStyle = shape.fillColor;
                       // Use shape.width/height if valid, otherwise measure
                       let bgW = shape.width;
                       let bgH = shape.height;
    
                       if (!bgW || !bgH) {
                           // Fallback measure
                           let maxW = 0;
                           lines.forEach(l => {
                               const w = ctx.measureText(l).width;
                               if(w > maxW) maxW = w;
                           });
                           bgW = maxW;
                           bgH = lines.length * lineHeight;
                       }
    
                       ctx.fillRect(shape.x!, shape.y!, bgW, bgH);
                   }
    
                   // Draw Text
                   ctx.fillStyle = shape.strokeColor; // Text Color
                   lines.forEach((line, index) => {
                       ctx.fillText(line, shape.x!, shape.y! + (index * lineHeight));
    
                       const ly = shape.y! + (index * lineHeight);
                       const w = ctx.measureText(line).width;
    
                       if (shape.fontUnderline) {
                          ctx.beginPath();
                          ctx.lineWidth = Math.max(1, (shape.fontSize || 20) / 15);
                          ctx.moveTo(shape.x!, ly + (shape.fontSize || 20));
                          ctx.lineTo(shape.x! + w, ly + (shape.fontSize || 20));
                          ctx.stroke();
                       }
                       if (shape.fontStrike) {
                          ctx.beginPath();
                          ctx.lineWidth = Math.max(1, (shape.fontSize || 20) / 15);
                          ctx.moveTo(shape.x!, ly + (shape.fontSize || 20) / 2);
                          ctx.lineTo(shape.x! + w, ly + (shape.fontSize || 20) / 2);
                          ctx.stroke();
                       }
                   });
               }
            }
        } finally {
            ctx.restore();
        }
        ctx.restore();
    };

    const render = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Safety check for viewTransform
        if (isNaN(viewTransform.x) || isNaN(viewTransform.y) || isNaN(viewTransform.scale) || viewTransform.scale === 0) {
            console.error("Invalid ViewTransform", viewTransform);
            return;
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(viewTransform.x, viewTransform.y);
        ctx.scale(viewTransform.scale, viewTransform.scale);

        // Draw Grid
        const startX = Math.floor(-viewTransform.x / viewTransform.scale / gridSize) * gridSize;
        const startY = Math.floor(-viewTransform.y / viewTransform.scale / gridSize) * gridSize;
        const endX = startX + (canvas.width / viewTransform.scale) + gridSize;
        const endY = startY + (canvas.height / viewTransform.scale) + gridSize;

        ctx.fillStyle = gridColor;
        // Check for infinite loops
        if (gridSize > 0) {
             for(let x = startX; x < endX; x += gridSize) { for(let y = startY; y < endY; y += gridSize) ctx.fillRect(x, y, 2 / viewTransform.scale, 2 / viewTransform.scale); }
        }

        // Query Visible Shapes
        const viewRect: Rect = {
            x: -viewTransform.x / viewTransform.scale,
            y: -viewTransform.y / viewTransform.scale,
            width: canvas.width / viewTransform.scale,
            height: canvas.height / viewTransform.scale
        };

        const visibleCandidates = spatialIndex.query(viewRect);

        // Use IDs to fetch fresh shape from store
        const visibleShapes = visibleCandidates
            .map(candidate => shapes[candidate.id])
            .filter(s => !!s);

        visibleShapes.forEach(shape => {
            try {
                drawShape(ctx, shape);
            } catch (e) {
                console.error("Error drawing shape", shape.id, e);
                // Try to restore context if possible, though drawShape should handle its own safety now?
                // Actually, we should modify drawShape to be safe internally. 
                // But as a fallback, we can forcefully reset transform here if we suspect corruption?
                // No, better to make drawShape safe.
            }
        });

        ctx.restore();
    };

    useEffect(() => {
        render();
    }, [viewTransform, gridSize, gridColor, shapes, layers, spatialIndex]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute top-0 left-0 pointer-events-none"
        />
    );
};

export default StaticCanvas;
