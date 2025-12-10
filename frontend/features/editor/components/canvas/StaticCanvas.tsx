import React, { useRef, useEffect } from 'react';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { Rect } from '../../../../types';
import { renderShape } from './renderers/ShapeRenderer';

interface StaticCanvasProps {
    width: number;
    height: number;
}

const StaticCanvas: React.FC<StaticCanvasProps> = ({ width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewTransform = useUIStore(s => s.viewTransform);
    const gridSize = useUIStore(s => s.gridSize);
    const gridColor = useUIStore(s => s.gridColor);
    const gridShowDots = useUIStore(s => s.gridShowDots);
    const gridShowLines = useUIStore(s => s.gridShowLines);
    const editingTextId = useUIStore(s => s.editingTextId);
    const selectedShapeIds = useUIStore(s => s.selectedShapeIds);

    // Subscribe to necessary data stores.
    const shapes = useDataStore(s => s.shapes);
    const layers = useDataStore(s => s.layers);
    const spatialIndex = useDataStore(s => s.spatialIndex);

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
        if (gridSize > 0 && (gridShowDots || gridShowLines)) {
            const startX = Math.floor(-viewTransform.x / viewTransform.scale / gridSize) * gridSize;
            const startY = Math.floor(-viewTransform.y / viewTransform.scale / gridSize) * gridSize;
            const endX = startX + (canvas.width / viewTransform.scale) + gridSize;
            const endY = startY + (canvas.height / viewTransform.scale) + gridSize;

            ctx.strokeStyle = gridColor;
            ctx.fillStyle = gridColor;

            // Draw grid lines (horizontal and vertical)
            if (gridShowLines) {
                ctx.lineWidth = 1 / viewTransform.scale;
                ctx.beginPath();
                for (let x = startX; x < endX; x += gridSize) {
                    ctx.moveTo(x, startY);
                    ctx.lineTo(x, endY);
                }
                for (let y = startY; y < endY; y += gridSize) {
                    ctx.moveTo(startX, y);
                    ctx.lineTo(endX, y);
                }
                ctx.stroke();
            }

            // Draw grid dots
            if (gridShowDots) {
                const dotSize = 2 / viewTransform.scale;
                for (let x = startX; x < endX; x += gridSize) {
                    for (let y = startY; y < endY; y += gridSize) {
                        ctx.fillRect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
                    }
                }
            }
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
            .filter(s => !!s && !(editingTextId && s.type === 'text' && s.id === editingTextId));

        visibleShapes.forEach(shape => {
            const layer = layers.find(l => l.id === shape.layerId);
            if (layer && !layer.visible) return;

            try {
                renderShape(ctx, shape, viewTransform, layer);
            } catch (e) {
                console.error("Error drawing shape", shape.id, e);
            }
        });

        ctx.restore();
    };

    // Re-render when any dependency changes, INCLUDING canvas dimensions
    useEffect(() => {
        render();
    }, [viewTransform, gridSize, gridColor, gridShowDots, gridShowLines, shapes, layers, spatialIndex, editingTextId, selectedShapeIds, width, height]);

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
