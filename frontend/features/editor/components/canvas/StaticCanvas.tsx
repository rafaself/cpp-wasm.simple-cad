import React, { useRef, useEffect } from 'react';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { Rect } from '../../../../types';
import { renderShape, setRenderCallback } from './renderers/ShapeRenderer';
import { computeFrameData } from '../../../../utils/frame';

interface StaticCanvasProps {
    width: number;
    height: number;
}

const StaticCanvas: React.FC<StaticCanvasProps> = ({ width, height }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [renderTrigger, forceUpdate] = React.useReducer(x => x + 1, 0);
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
    const activeDiscipline = useUIStore(s => s.activeDiscipline);

    // Subscribe to necessary data stores.
    const layers = useDataStore(s => s.layers);
    const spatialIndex = useDataStore(s => s.spatialIndex);
    const frame = useDataStore(s => s.frame);
    const worldScale = useDataStore(s => s.worldScale);

    // Refs for optimization
    const canvasSizeRef = useRef({ width, height });
    canvasSizeRef.current = { width, height };
    const visibleIdsRef = useRef<Set<string>>(new Set());

    // Smart subscription to shapes changes
    useEffect(() => {
        return useDataStore.subscribe((state, prevState) => {
            if (state.shapes === prevState.shapes) return;

            // Check if any visible shape changed or if visible set changed
            const vt = useUIStore.getState().viewTransform;
            const { width, height } = canvasSizeRef.current;

            // Re-calculate view rect
            const viewRect: Rect = {
                x: -vt.x / vt.scale,
                y: -vt.y / vt.scale,
                width: width / vt.scale,
                height: height / vt.scale
            };

            const candidates = state.spatialIndex.query(viewRect);
            const candidateIds = new Set(candidates.map(c => c.id));
            const lastVisible = visibleIdsRef.current;

            // Check 1: Did the set of visible IDs change? (Added, Deleted, Moved in/out)
            let changed = false;
            if (candidateIds.size !== lastVisible.size) {
                changed = true;
            } else {
                for (const id of candidateIds) {
                    if (!lastVisible.has(id)) {
                        changed = true;
                        break;
                    }
                }
            }

            // Check 2: If sets are same, did any visible shape object reference change?
            if (!changed) {
                for (const id of candidateIds) {
                    if (state.shapes[id] !== prevState.shapes[id]) {
                        changed = true;
                        break;
                    }
                }
            }

            if (changed) {
                forceUpdate();
            }
        });
    }, []);

    const render = () => {
        const shapes = useDataStore.getState().shapes;
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
        ctx.scale(viewTransform.scale, -viewTransform.scale);

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

        const frameData = computeFrameData(frame, worldScale);
        if (frameData) {
            const outer = frameData.outerRect;
            const inner = frameData.marginRect;
            ctx.save();
            ctx.lineWidth = 2 / viewTransform.scale;
            ctx.strokeStyle = '#38bdf8';
            ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
            ctx.setLineDash([]);
            ctx.fillRect(outer.x, outer.y, outer.width, outer.height);
            ctx.strokeRect(outer.x, outer.y, outer.width, outer.height);

            if (inner) {
                ctx.lineWidth = 1.5 / viewTransform.scale;
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
                ctx.setLineDash([12 / viewTransform.scale, 8 / viewTransform.scale]);
                ctx.strokeRect(inner.x, inner.y, inner.width, inner.height);
                ctx.setLineDash([]);
            }
            ctx.restore();
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

        // Update visible IDs ref for optimization check
        visibleIdsRef.current = new Set(visibleShapes.map(s => s.id));

        visibleShapes.forEach(shape => {
            const layer = layers.find(l => l.id === shape.layerId);
            if (layer && !layer.visible) return;

            try {
                renderShape(ctx, shape, viewTransform, layer, activeDiscipline);
            } catch (e) {
                console.error("Error drawing shape", shape.id, e);
            }
        });

        ctx.restore();
    };

    // Set up callback for SVG image loading
    useEffect(() => {
        setRenderCallback(forceUpdate);
        return () => setRenderCallback(() => {});
    }, [forceUpdate]);

    // Re-render when any dependency changes, INCLUDING canvas dimensions
    useEffect(() => {
        render();
    }, [renderTrigger, viewTransform, gridSize, gridColor, gridShowDots, gridShowLines, showCenterAxes, showCenterIcon, axisXColor, axisYColor, axisXDashed, axisYDashed, centerIconColor, layers, spatialIndex, editingTextId, selectedShapeIds, width, height, frame, worldScale]);

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
