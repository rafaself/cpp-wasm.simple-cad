import React, { useRef, useEffect } from 'react';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { Rect } from '../../../../types';
import { renderShape } from './renderers/ShapeRenderer';

interface StaticCanvasProps {
    width: number;
    height: number;
}

const StaticCanvas: React.FC<StaticCanvasProps> = ({ width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const viewTransform = useUIStore(s => s.viewTransform);
    const gridSize = useSettingsStore(s => s.grid.size);
    const gridColor = useSettingsStore(s => s.grid.color);
    const gridShowDots = useSettingsStore(s => s.grid.showDots);
    const gridShowLines = useSettingsStore(s => s.grid.showLines);
    const showCenterAxes = useSettingsStore(s => s.display.centerAxes.show);
    const showCenterIcon = useSettingsStore(s => s.display.centerIcon.show);
    const axisXColor = useSettingsStore(s => s.display.centerAxes.xColor);
    const axisYColor = useSettingsStore(s => s.display.centerAxes.yColor);
    const axisXDashed = useSettingsStore(s => s.display.centerAxes.xDashed);
    const axisYDashed = useSettingsStore(s => s.display.centerAxes.yDashed);
    const centerIconColor = useSettingsStore(s => s.display.centerIcon.color);
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

        // Draw Center Axes (origin at 0,0)
        if (showCenterAxes) {
            const axisExtent = 50000; // Very long axes
            ctx.lineWidth = 0.5 / viewTransform.scale;
            
            // X-Axis (horizontal)
            ctx.strokeStyle = axisXColor;
            if (axisXDashed) {
                ctx.setLineDash([10 / viewTransform.scale, 6 / viewTransform.scale]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.moveTo(-axisExtent, 0);
            ctx.lineTo(axisExtent, 0);
            ctx.stroke();
            
            // Y-Axis (vertical)
            ctx.strokeStyle = axisYColor;
            if (axisYDashed) {
                ctx.setLineDash([10 / viewTransform.scale, 6 / viewTransform.scale]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.moveTo(0, -axisExtent);
            ctx.lineTo(0, axisExtent);
            ctx.stroke();
            
            ctx.setLineDash([]);
        }

        // Draw Center Icon (crosshair at 0,0)
        if (showCenterIcon) {
            const iconSize = 8 / viewTransform.scale;
            const lineWidth = 1 / viewTransform.scale;
            ctx.strokeStyle = centerIconColor;
            ctx.lineWidth = lineWidth;
            ctx.setLineDash([]);
            
            // Draw crosshair
            ctx.beginPath();
            ctx.moveTo(-iconSize, 0);
            ctx.lineTo(iconSize, 0);
            ctx.moveTo(0, -iconSize);
            ctx.lineTo(0, iconSize);
            ctx.stroke();
            
            // Draw small circle at center
            ctx.beginPath();
            ctx.arc(0, 0, iconSize / 3, 0, Math.PI * 2);
            ctx.stroke();
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
    }, [viewTransform, gridSize, gridColor, gridShowDots, gridShowLines, showCenterAxes, showCenterIcon, axisXColor, axisYColor, axisXDashed, axisYDashed, centerIconColor, shapes, layers, spatialIndex, editingTextId, selectedShapeIds, width, height]);

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
