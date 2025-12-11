import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../../../../stores/useUIStore';
import { useSettingsStore } from '../../../../../stores/useSettingsStore';
import { useDataStore } from '../../../../../stores/useDataStore';
import { Point, Shape, Rect } from '../../../../../types';
import { screenToWorld, worldToScreen, getDistance, isPointInShape, getSnapPoint, getSelectionRect, isShapeInSelection, rotatePoint, getShapeHandles, Handle, getShapeBoundingBox, constrainTo45Degrees, constrainToSquare } from '../../../../../utils/geometry';
import { getTextSize } from '../helpers';
import { TextEditState } from '../overlays/TextEditorOverlay';
import { getDefaultColorMode } from '../../../../../utils/shapeColors';

// State for Figma-like resize with flip support
interface ResizeState {
    originalBounds: Rect;
    anchorPoint: Point; // The fixed point (opposite corner or center)
    handleIndex: number;
    originalScaleX: number;
    originalScaleY: number;
}

export const useCanvasInteraction = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
    const uiStore = useUIStore();
    const snapSettings = useSettingsStore(s => s.snap);
    const gridSize = useSettingsStore(s => s.grid.size);
    const toolDefaults = useSettingsStore(s => s.toolDefaults);
    const dataStore = useDataStore();
    const { strokeColor, strokeWidth, strokeEnabled, fillColor, polygonSides } = toolDefaults;

    const [isDragging, setIsDragging] = useState(false);
    const [isMiddlePanning, setIsMiddlePanning] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
    const [isSelectionBox, setIsSelectionBox] = useState(false);
    const [snapMarker, setSnapMarker] = useState<Point | null>(null);
    const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
    const [measureStart, setMeasureStart] = useState<Point | null>(null);
    const [lineStart, setLineStart] = useState<Point | null>(null);
    const [arrowStart, setArrowStart] = useState<Point | null>(null);
    
    // Shift key state for real-time updates during drag
    const [isShiftPressed, setIsShiftPressed] = useState(false);
    // Axis lock state for constrained movement (Figma-style)
    // Once locked, stays locked until drag ends
    const [lockedAxis, setLockedAxis] = useState<'x' | 'y' | null>(null);
    // Reference to original shape positions when drag started (for axis lock calculation)
    const dragStartPositions = useRef<Map<string, { x: number; y: number; points?: Point[] }>>(new Map());
    // World position where the drag started
    const dragStartWorld = useRef<Point | null>(null);
    
    // Handle Interaction
    const [activeHandle, setActiveHandle] = useState<{ shapeId: string; handle: { x: number; y: number; cursor: string; index: number; type: string } } | null>(null);
    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const [transformationBase, setTransformationBase] = useState<Point | null>(null);

    // Arc Tool State
    const [arcPoints, setArcPoints] = useState<{ start: Point; end: Point } | null>(null);
    const [showRadiusModal, setShowRadiusModal] = useState(false);
    const [radiusModalPos, setRadiusModalPos] = useState({ x: 0, y: 0 });

    // Polygon Tool State
    const [polygonShapeId, setPolygonShapeId] = useState<string | null>(null);
    const [showPolygonModal, setShowPolygonModal] = useState(false);
    const [polygonModalPos, setPolygonModalPos] = useState({ x: 0, y: 0 });

    // Text Tool State
    const [textEditState, setTextEditState] = useState<TextEditState | null>(null);
    const setEditingTextId = uiStore.setEditingTextId;

    // Middle button double-click detection (native dblclick doesn't work for middle button)
    const lastMiddleClickTime = useRef<number>(0);
    const DOUBLE_CLICK_THRESHOLD = 300; // ms

    useEffect(() => {
        return () => setEditingTextId(null);
    }, [setEditingTextId]);

    const getMousePos = (e: React.MouseEvent): Point => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    // Reset tools on change
    useEffect(() => {
        setLineStart(null); setArrowStart(null); setMeasureStart(null); setPolylinePoints([]); setStartPoint(null);
        setIsDragging(false); setIsSelectionBox(false); setSnapMarker(null); setTransformationBase(null);
        setActiveHandle(null); setResizeState(null);
        setArcPoints(null); setShowRadiusModal(false);
        setPolygonShapeId(null); setShowPolygonModal(false);
        setLockedAxis(null); // Reset axis lock on tool change
        dragStartPositions.current.clear();
        dragStartWorld.current = null;
    }, [uiStore.activeTool]);

    // Global Shift key listener for real-time updates during drag
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Shift' && !isShiftPressed) {
                setIsShiftPressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Shift' && isShiftPressed) {
                setIsShiftPressed(false);
                // When Shift is released during drag, unlock axis for free movement
                if (isDragging && lockedAxis) {
                    setLockedAxis(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isShiftPressed, isDragging, lockedAxis]);

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); setIsDragging(false); }
            if (isDragging && uiStore.activeTool === 'pan') { setIsDragging(false); setStartPoint(null); }
            if (activeHandle) { setActiveHandle(null); setResizeState(null); setIsDragging(false); }
            // Reset axis lock when drag ends
            setLockedAxis(null);
            dragStartPositions.current.clear();
            dragStartWorld.current = null;
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isMiddlePanning, isDragging, uiStore.activeTool, activeHandle]);

    const finishPolyline = useCallback(() => {
        if (polylinePoints.length > 1) {
            dataStore.addShape({
                id: Date.now().toString(),
                layerId: dataStore.activeLayerId,
                type: 'polyline',
                strokeColor,
                strokeWidth,
                strokeEnabled,
                fillColor: 'transparent',
                colorMode: getDefaultColorMode(),
                points: [...polylinePoints]
            });
            uiStore.setSidebarTab('desenho'); setPolylinePoints([]);
        }
    }, [polylinePoints, uiStore, dataStore]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') { if (uiStore.activeTool === 'polyline') finishPolyline(); }
            if (e.key === 'Escape') {
                setLineStart(null); setArrowStart(null); setMeasureStart(null); setPolylinePoints([]);
                setIsDragging(false); setIsSelectionBox(false); setStartPoint(null); setTransformationBase(null); setActiveHandle(null);
                setArcPoints(null); setShowRadiusModal(false);
                setPolygonShapeId(null); setShowPolygonModal(false);
                if (uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') uiStore.setTool('select');
                if (uiStore.activeTool === 'select' && uiStore.selectedShapeIds.size > 0) {
                    uiStore.setSelectedShapeIds(new Set());
                }
            }
            // Arrow key movement for selected shapes
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && uiStore.selectedShapeIds.size > 0) {
                e.preventDefault();
                const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                
                uiStore.selectedShapeIds.forEach(id => {
                    const shape = dataStore.shapes[id];
                    if (!shape) return;
                    const layer = dataStore.layers.find(l => l.id === shape.layerId);
                    if (layer?.locked) return;
                    
                    const updates: Partial<Shape> = {};
                    if (shape.x !== undefined) updates.x = shape.x + dx;
                    if (shape.y !== undefined) updates.y = shape.y + dy;
                    if (shape.points) updates.points = shape.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    
                    dataStore.updateShape(id, updates, true);
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [uiStore, dataStore, finishPolyline]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (textEditState) return;

        const raw = getMousePos(e); let eff = raw; const wr = screenToWorld(raw, uiStore.viewTransform); let snapped: Point | null = null;

        if (snapSettings.enabled && !['pan', 'select'].includes(uiStore.activeTool) && !e.ctrlKey) {
            const queryRect = { x: wr.x - 50, y: wr.y - 50, width: 100, height: 100 };
            const visible = dataStore.spatialIndex.query(queryRect)
                .map(s => dataStore.shapes[s.id])
                .filter(s => { const l = dataStore.layers.find(l => l.id === s.layerId); return s && l && l.visible && !l.locked; });
            const snap = getSnapPoint(wr, visible, snapSettings, gridSize, snapSettings.tolerancePx / uiStore.viewTransform.scale);
            if (snap) { snapped = snap; eff = worldToScreen(snap, uiStore.viewTransform); }
        }

        setStartPoint(eff); setCurrentPoint(eff);

        // Middle button handling: detect double-click for zoom-to-fit
        if (e.button === 1) {
            e.preventDefault();
            const now = Date.now();
            if (now - lastMiddleClickTime.current < DOUBLE_CLICK_THRESHOLD) {
                // Double-click detected: zoom to fit
                lastMiddleClickTime.current = 0;
                dataStore.zoomToFit();
                return;
            }
            lastMiddleClickTime.current = now;
            setIsMiddlePanning(true);
            setIsDragging(true);
            return;
        }
        
        if (uiStore.activeTool === 'pan') { setIsDragging(true); return; }

        const wPos = snapped || wr;

        if (uiStore.activeTool === 'select' && uiStore.selectedShapeIds.size > 0) {
            for (const id of uiStore.selectedShapeIds) {
                const shape = dataStore.shapes[id];
                if (!shape) continue;
                const handles = getShapeHandles(shape); const handleSize = 10 / uiStore.viewTransform.scale;
                for (const h of handles) {
                    if (getDistance(h, wPos) < handleSize) { 
                        setActiveHandle({ shapeId: shape.id, handle: h }); 
                        setIsDragging(true);
                        // Capture initial state for Figma-like resize with flip support
                        if (h.type === 'resize') {
                            const bounds = getShapeBoundingBox(shape);
                            // Calculate anchor point (opposite corner based on handle index)
                            // Index: 0=TL, 1=TR, 2=BR, 3=BL
                            const anchorMap: Record<number, Point> = {
                                0: { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, // BR
                                1: { x: bounds.x, y: bounds.y + bounds.height },                // BL
                                2: { x: bounds.x, y: bounds.y },                                // TL
                                3: { x: bounds.x + bounds.width, y: bounds.y }                  // TR
                            };
                            setResizeState({
                                originalBounds: bounds,
                                anchorPoint: anchorMap[h.index] ?? { x: bounds.x, y: bounds.y },
                                handleIndex: h.index,
                                originalScaleX: shape.scaleX ?? 1,
                                originalScaleY: shape.scaleY ?? 1
                            });
                        }
                        return; 
                    }
                }
            }
        }

        if (uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') {
            if (!transformationBase) { setTransformationBase(wPos); }
            else {
                if (uiStore.activeTool === 'move') {
                    const dx = wPos.x - transformationBase.x; const dy = wPos.y - transformationBase.y;
                    const ids = Array.from(uiStore.selectedShapeIds);
                    ids.forEach(id => {
                        const s = dataStore.shapes[id];
                        if (s) {
                            const diff: Partial<Shape> = {};
                            if (s.x !== undefined) diff.x = s.x + dx;
                            if (s.y !== undefined) diff.y = s.y + dy;
                            if (s.points) diff.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                            dataStore.updateShape(id, diff, true);
                        }
                    });
                } else if (uiStore.activeTool === 'rotate') {
                    const dx = wPos.x - transformationBase.x; const dy = wPos.y - transformationBase.y; const angle = Math.atan2(dy, dx);
                    dataStore.rotateSelected(Array.from(uiStore.selectedShapeIds), transformationBase, angle);
                }
                setTransformationBase(null); uiStore.setTool('select');
            }
            return;
        }

        if (uiStore.activeTool === 'select') {
            const selectWorld = screenToWorld(raw, uiStore.viewTransform);
            const queryRect = { x: selectWorld.x - 5, y: selectWorld.y - 5, width: 10, height: 10 };
            const candidates = dataStore.spatialIndex.query(queryRect).map(c => dataStore.shapes[c.id]).filter(s => !!s);
            let hitShapeId = null;
            for (let i = candidates.length - 1; i >= 0; i--) {
                const s = candidates[i];
                const l = dataStore.layers.find(lay => lay.id === s.layerId);
                if (l && (!l.visible || l.locked)) continue;
                if (isPointInShape(selectWorld, s, uiStore.viewTransform.scale, l)) { hitShapeId = s.id; break; }
            }

            if (hitShapeId) {
                if (e.shiftKey) {
                    uiStore.setSelectedShapeIds(prev => { const n = new Set(prev); if (n.has(hitShapeId!)) n.delete(hitShapeId!); else n.add(hitShapeId!); return n; });
                } else { if (!uiStore.selectedShapeIds.has(hitShapeId)) uiStore.setSelectedShapeIds(new Set([hitShapeId])); }
                setIsDragging(true);
            } else { if (!e.shiftKey) uiStore.setSelectedShapeIds(new Set()); setIsSelectionBox(true); }
            return;
        }

        if (uiStore.activeTool === 'arc') {
            if (!arcPoints) {
                setIsDragging(true);
            }
            return;
        }

        if (uiStore.activeTool === 'polyline') { setPolylinePoints(p => [...p, wPos]); return; }
        if (uiStore.activeTool === 'line') {
            if (!lineStart) setLineStart(wPos);
            else {
                // Shift: constrain to 45° angles
                let endPoint = wPos;
                if (e.shiftKey) {
                    endPoint = constrainTo45Degrees(lineStart, wPos);
                }
                dataStore.addShape({ id: Date.now().toString(), layerId: dataStore.activeLayerId, type: 'line', strokeColor, strokeWidth, strokeEnabled, fillColor: 'transparent', colorMode: getDefaultColorMode(), points: [lineStart, endPoint] });
                uiStore.setSidebarTab('desenho'); setLineStart(null);
            }
            return;
        }
        if (uiStore.activeTool === 'arrow') {
            if (!arrowStart) setArrowStart(wPos);
            else {
                // Shift: constrain to 45° angles
                let endPoint = wPos;
                if (e.shiftKey) {
                    endPoint = constrainTo45Degrees(arrowStart, wPos);
                }
                dataStore.addShape({ id: Date.now().toString(), layerId: dataStore.activeLayerId, type: 'arrow', strokeColor, strokeWidth, strokeEnabled, fillColor: 'transparent', colorMode: getDefaultColorMode(), points: [arrowStart, endPoint], arrowHeadSize: 15 });
                uiStore.setSidebarTab('desenho'); setArrowStart(null);
            }
            return;
        }
        if (uiStore.activeTool === 'measure') {
            if (!measureStart) setMeasureStart(wPos);
            else {
                const dist = getDistance(measureStart, wPos).toFixed(2);
                dataStore.addShape({ id: Date.now().toString(), layerId: dataStore.activeLayerId, type: 'measure', strokeColor: '#ef4444', fillColor: 'transparent', colorMode: getDefaultColorMode(), points: [measureStart, wPos], label: `${dist}px` });
                setMeasureStart(null);
            }
            return;
        }

        setIsDragging(true);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const raw = getMousePos(e); const worldPos = screenToWorld(raw, uiStore.viewTransform);
        uiStore.setMousePos(worldPos);

        if (isMiddlePanning || (isDragging && uiStore.activeTool === 'pan')) {
            if (startPoint) {
                const dx = raw.x - startPoint.x; const dy = raw.y - startPoint.y;
                uiStore.setViewTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); setStartPoint(raw);
            }
            return;
        }

        let eff = raw;
        const isHandleDrag = !!activeHandle;
        const shouldSnap = snapSettings.enabled && !e.ctrlKey && (!['pan', 'select'].includes(uiStore.activeTool) || isHandleDrag);

        if (shouldSnap) {
            const queryRect = { x: worldPos.x - 50, y: worldPos.y - 50, width: 100, height: 100 };
            const visible = dataStore.spatialIndex.query(queryRect)
                .map(s => dataStore.shapes[s.id])
                .filter(s => {
                    const l = dataStore.layers.find(l => l.id === s.layerId);
                    if (activeHandle && s.id === activeHandle.shapeId) return false;
                    return s && l && l.visible && !l.locked;
                });
            const snap = getSnapPoint(worldPos, visible, snapSettings, gridSize, snapSettings.tolerancePx / uiStore.viewTransform.scale);
            if (snap) { setSnapMarker(snap); eff = worldToScreen(snap, uiStore.viewTransform); } else { setSnapMarker(null); }
        } else { setSnapMarker(null); }

        setCurrentPoint(eff);

        if (isDragging && startPoint) {
            if (activeHandle) {
                const ws = screenToWorld(eff, uiStore.viewTransform);
                const s = dataStore.shapes[activeHandle.shapeId];
                if (s) {
                    // VERTEX handles (lines, polylines) - direct point manipulation
                    if (activeHandle.handle.type === 'vertex' && s.points) {
                        const newPoints = s.points.map((p, i) => i === activeHandle.handle.index ? ws : p);
                        dataStore.updateShape(s.id, { points: newPoints }, false);
                    } 
                    // RESIZE handles - Figma-like bounding box transformation with flip support
                    else if (activeHandle.handle.type === 'resize' && resizeState) {
                        const { originalBounds, anchorPoint, originalScaleX, originalScaleY } = resizeState;
                        const idx = activeHandle.handle.index;
                        
                        // Determine anchor based on Alt key (center) or opposite corner
                        let anchor = anchorPoint;
                        if (e.altKey) {
                            // Alt: resize from center
                            anchor = {
                                x: originalBounds.x + originalBounds.width / 2,
                                y: originalBounds.y + originalBounds.height / 2
                            };
                        }
                        
                        // Calculate raw new width and height (can be negative for flip!)
                        let rawW: number, rawH: number, newX: number, newY: number;
                        
                        if (e.altKey) {
                            // Alt mode: symmetric resize from center
                            const dx = ws.x - anchor.x;
                            const dy = ws.y - anchor.y;
                            // Calculate signed distance based on handle position
                            const signX = (idx === 0 || idx === 3) ? -1 : 1;
                            const signY = (idx === 0 || idx === 1) ? -1 : 1;
                            rawW = dx * signX * 2;
                            rawH = dy * signY * 2;
                            newX = anchor.x - Math.abs(rawW) / 2;
                            newY = anchor.y - Math.abs(rawH) / 2;
                        } else {
                            // Normal mode: resize from opposite corner
                            // Calculate new bounds from anchor to mouse
                            const minX = Math.min(anchor.x, ws.x);
                            const maxX = Math.max(anchor.x, ws.x);
                            const minY = Math.min(anchor.y, ws.y);
                            const maxY = Math.max(anchor.y, ws.y);
                            
                            // Determine sign based on whether mouse crossed the anchor
                            const crossedX = (idx === 0 || idx === 3) ? (ws.x > anchor.x) : (ws.x < anchor.x);
                            const crossedY = (idx === 0 || idx === 1) ? (ws.y > anchor.y) : (ws.y < anchor.y);
                            
                            rawW = (maxX - minX) * (crossedX ? -1 : 1);
                            rawH = (maxY - minY) * (crossedY ? -1 : 1);
                            newX = minX;
                            newY = minY;
                        }
                        
                        // Calculate scale factors (can be negative!)
                        let scaleX = originalBounds.width > 0 ? rawW / originalBounds.width : 1;
                        let scaleY = originalBounds.height > 0 ? rawH / originalBounds.height : 1;
                        
                        // Shift: proportional resize
                        if (e.shiftKey) {
                            const uniformScale = Math.max(Math.abs(scaleX), Math.abs(scaleY));
                            scaleX = uniformScale * Math.sign(scaleX || 1);
                            scaleY = uniformScale * Math.sign(scaleY || 1);
                        }
                        
                        // Apply scaled dimensions
                        const finalW = Math.abs(originalBounds.width * scaleX);
                        const finalH = Math.abs(originalBounds.height * scaleY);
                        
                        // Determine new position based on anchor
                        let finalX: number, finalY: number;
                        if (e.altKey) {
                            finalX = anchor.x - finalW / 2;
                            finalY = anchor.y - finalH / 2;
                        } else {
                            // Position based on scale direction
                            finalX = scaleX >= 0 ? anchor.x - finalW : anchor.x;
                            finalY = scaleY >= 0 ? anchor.y - finalH : anchor.y;
                            // Correct for handle index
                            if (idx === 1 || idx === 2) finalX = scaleX >= 0 ? anchor.x : anchor.x - finalW;
                            if (idx === 2 || idx === 3) finalY = scaleY >= 0 ? anchor.y : anchor.y - finalH;
                        }
                        
                        // Calculate new scaleX/scaleY for flip state
                        const newScaleX = scaleX < 0 ? -originalScaleX : originalScaleX;
                        const newScaleY = scaleY < 0 ? -originalScaleY : originalScaleY;
                        
                        // Minimum size enforcement (but allow flip)
                        const minSize = 5;
                        const enforcedW = Math.max(minSize, finalW);
                        const enforcedH = Math.max(minSize, finalH);
                        
                        // Apply updates based on shape type
                        if (s.type === 'rect' || s.type === 'text') {
                            dataStore.updateShape(s.id, {
                                x: finalX,
                                y: finalY,
                                width: enforcedW,
                                height: enforcedH,
                                scaleX: newScaleX,
                                scaleY: newScaleY
                            }, false);
                        } else if (s.type === 'circle' || s.type === 'polygon') {
                            // Center-based shapes
                            const newCx = finalX + enforcedW / 2;
                            const newCy = finalY + enforcedH / 2;
                            dataStore.updateShape(s.id, {
                                x: newCx,
                                y: newCy,
                                width: enforcedW,
                                height: enforcedH,
                                scaleX: newScaleX,
                                scaleY: newScaleY
                            }, false);
                        }
                    }
                }
                return;
            }

            if (uiStore.activeTool === 'select' && !isSelectionBox && uiStore.selectedShapeIds.size > 0 && !activeHandle) {
                const currWorld = screenToWorld(eff, uiStore.viewTransform);
                
                // Initialize drag start positions if not already set
                if (!dragStartWorld.current) {
                    dragStartWorld.current = screenToWorld(startPoint, uiStore.viewTransform);
                    // Store original positions of all selected shapes
                    uiStore.selectedShapeIds.forEach(id => {
                        const s = dataStore.shapes[id];
                        if (s) {
                            dragStartPositions.current.set(id, {
                                x: s.x ?? 0,
                                y: s.y ?? 0,
                                points: s.points ? [...s.points] : undefined
                            });
                        }
                    });
                }

                // Calculate total displacement from drag start
                const totalDx = currWorld.x - dragStartWorld.current.x;
                const totalDy = currWorld.y - dragStartWorld.current.y;

                // Determine axis lock when Shift is pressed (Figma-style)
                // The axis is locked once based on dominant direction and maintained until drag ends
                let effectiveDx = totalDx;
                let effectiveDy = totalDy;

                if (e.shiftKey || isShiftPressed) {
                    // If no axis is locked yet, determine which axis to lock
                    if (lockedAxis === null && (Math.abs(totalDx) > 3 || Math.abs(totalDy) > 3)) {
                        // Lock to the axis with greater movement
                        const newAxis = Math.abs(totalDx) >= Math.abs(totalDy) ? 'x' : 'y';
                        setLockedAxis(newAxis);
                    }
                    
                    // Apply axis constraint
                    if (lockedAxis === 'x') {
                        effectiveDy = 0; // Horizontal movement only
                    } else if (lockedAxis === 'y') {
                        effectiveDx = 0; // Vertical movement only
                    }
                }

                // Apply movement from original positions
                uiStore.selectedShapeIds.forEach(id => {
                    const s = dataStore.shapes[id];
                    if (!s) return;
                    const l = dataStore.layers.find(lay => lay.id === s.layerId);
                    if (l && l.locked) return;

                    const originalPos = dragStartPositions.current.get(id);
                    if (!originalPos) return;

                    const diff: Partial<Shape> = {};
                    if (s.x !== undefined) diff.x = originalPos.x + effectiveDx;
                    if (s.y !== undefined) diff.y = originalPos.y + effectiveDy;
                    if (originalPos.points) {
                        diff.points = originalPos.points.map(p => ({ 
                            x: p.x + effectiveDx, 
                            y: p.y + effectiveDy 
                        }));
                    }

                    dataStore.updateShape(id, diff, false);
                });
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); return; }

        if (isSelectionBox && startPoint && currentPoint) {
            if (getDistance(startPoint, currentPoint) > 2) {
                const ws = screenToWorld(startPoint, uiStore.viewTransform); const we = screenToWorld(currentPoint, uiStore.viewTransform);
                const { rect, direction } = getSelectionRect(ws, we);
                const mode = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
                const nSel = e.shiftKey ? new Set(uiStore.selectedShapeIds) : new Set<string>();

                const candidates = dataStore.spatialIndex.query(rect).map(c => dataStore.shapes[c.id]).filter(s => !!s);
                candidates.forEach(s => {
                    const l = dataStore.layers.find(lay => lay.id === s.layerId);
                    if (l && (!l.visible || l.locked)) return;
                    if (isShapeInSelection(s, rect, mode)) nSel.add(s.id);
                });
                uiStore.setSelectedShapeIds(nSel);
            }
            setIsSelectionBox(false); setStartPoint(null); return;
        }

        if (!startPoint || !currentPoint) { setIsDragging(false); setActiveHandle(null); return; }

        const ws = screenToWorld(startPoint, uiStore.viewTransform); const we = screenToWorld(currentPoint, uiStore.viewTransform);
        const dist = getDistance(startPoint, currentPoint);

        if (isDragging && (uiStore.activeTool === 'select' || activeHandle)) {
            dataStore.syncQuadTree();
        }

        setIsDragging(false); setActiveHandle(null);
        // Reset axis lock state when drag ends
        setLockedAxis(null);
        dragStartPositions.current.clear();
        dragStartWorld.current = null;

        const shapeCreationTools = ['circle', 'rect', 'polygon', 'arc'];
        const isSingleClick = dist < 5;

        if (!['select', 'pan', 'polyline', 'measure', 'line', 'move', 'rotate', 'arrow'].includes(uiStore.activeTool)) {

            if (uiStore.activeTool === 'arc') {
                const pEnd = isSingleClick ? { x: ws.x + 100, y: ws.y } : we;
                setArcPoints({ start: ws, end: pEnd });
                const screenPos = worldToScreen(pEnd, uiStore.viewTransform);
                setRadiusModalPos({ x: screenPos.x, y: screenPos.y });
                setShowRadiusModal(true);
                setStartPoint(null);
                return;
            }

            if (uiStore.activeTool === 'text') {
                setTextEditState({ x: ws.x, y: ws.y, content: '' });
                setEditingTextId(null);
                setStartPoint(null);
                return;
            }

            const n: Shape = { id: Date.now().toString(), layerId: dataStore.activeLayerId, type: uiStore.activeTool, strokeColor, strokeWidth, strokeEnabled, fillColor, colorMode: getDefaultColorMode(), points: [] };

            if (isSingleClick && shapeCreationTools.includes(uiStore.activeTool)) {
                if (uiStore.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = 50; }
                else if (uiStore.activeTool === 'rect') { n.x = ws.x - 50; n.y = ws.y - 50; n.width = 100; n.height = 100; }
                else if (uiStore.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = 50; n.sides = polygonSides; }
            } else {
                // Apply Shift constraint for proportional shapes (Figma-style)
                let finalEnd = we;
                if ((e.shiftKey || isShiftPressed) && uiStore.activeTool === 'rect') {
                    finalEnd = constrainToSquare(ws, we);
                }

                if (uiStore.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); }
                else if (uiStore.activeTool === 'rect') { 
                    n.x = Math.min(ws.x, finalEnd.x); 
                    n.y = Math.min(ws.y, finalEnd.y); 
                    n.width = Math.abs(finalEnd.x - ws.x); 
                    n.height = Math.abs(finalEnd.y - ws.y); 
                }
                else if (uiStore.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); n.sides = polygonSides; }
            }

            // For polygon, show modal after creation
            if (uiStore.activeTool === 'polygon') {
                dataStore.addShape(n);
                setPolygonShapeId(n.id);
                const screenPos = worldToScreen({ x: n.x!, y: n.y! }, uiStore.viewTransform);
                setPolygonModalPos({ x: screenPos.x + 20, y: screenPos.y - 20 });
                setShowPolygonModal(true);
                uiStore.setSelectedShapeIds(new Set([n.id]));
                uiStore.setSidebarTab('desenho');
                // Don't switch tool yet - wait for modal confirmation
            } else {
                dataStore.addShape(n);
                uiStore.setSidebarTab('desenho');
                uiStore.setTool('select');
            }
        }
        setStartPoint(null);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if (uiStore.activeTool !== 'select') { finishPolyline(); return; }

        const raw = getMousePos(e);
        const worldPos = screenToWorld(raw, uiStore.viewTransform);

        const queryRect = { x: worldPos.x - 5, y: worldPos.y - 5, width: 10, height: 10 };
        const candidates = dataStore.spatialIndex.query(queryRect).map(c => dataStore.shapes[c.id]).filter(s => !!s);

        for (let i = candidates.length - 1; i >= 0; i--) {
            const s = candidates[i];
            const l = dataStore.layers.find(layer => layer.id === s.layerId);
            if (l && (!l.visible || l.locked)) continue;
            if (s.type === 'text') {
                if (isPointInShape(worldPos, s, uiStore.viewTransform.scale, l)) {
                    setTextEditState({ id: s.id, x: s.x!, y: s.y!, content: s.textContent || '', width: s.width, height: s.height });
                    setEditingTextId(s.id);
                    return;
                }
            }
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const scaleFactor = 1.1; const direction = e.deltaY > 0 ? -1 : 1;
        let newScale = uiStore.viewTransform.scale * (direction > 0 ? scaleFactor : 1/scaleFactor);
        newScale = Math.max(0.1, Math.min(newScale, 5));
        const raw = getMousePos(e); const w = screenToWorld(raw, uiStore.viewTransform);
        const newX = raw.x - w.x * newScale; const newY = raw.y - w.y * newScale;
        uiStore.setViewTransform({ scale: newScale, x: newX, y: newY });
    };

    // Handler to confirm polygon sides
    const confirmPolygonSides = (sides: number) => {
        if (polygonShapeId) {
            dataStore.updateShape(polygonShapeId, { sides }, true);
        }
        setShowPolygonModal(false);
        setPolygonShapeId(null);
        uiStore.setTool('select');
    };

    return {
        handlers: {
            onMouseDown: handleMouseDown,
            onMouseMove: handleMouseMove,
            onMouseUp: handleMouseUp,
            onDoubleClick: handleDoubleClick,
            onWheel: handleWheel,
        },
        state: {
            isDragging,
            isMiddlePanning,
            startPoint,
            currentPoint,
            isSelectionBox,
            snapMarker,
            polylinePoints,
            measureStart,
            lineStart,
            arrowStart,
            activeHandle,
            transformationBase,
            arcPoints,
            showRadiusModal,
            radiusModalPos,
            textEditState,
            showPolygonModal,
            polygonModalPos,
            polygonShapeId,
            isShiftPressed
        },
        setters: {
            setArcPoints,
            setShowRadiusModal,
            setTextEditState,
            setShowPolygonModal,
            confirmPolygonSides
        }
    };
};
