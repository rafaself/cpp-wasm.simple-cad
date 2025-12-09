import { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../../../../stores/useUIStore';
import { useDataStore } from '../../../../../stores/useDataStore';
import { Point, Shape } from '../../../../../types';
import { screenToWorld, worldToScreen, getDistance, isPointInShape, getSnapPoint, getSelectionRect, isShapeInSelection, rotatePoint, getShapeHandles, Handle } from '../../../../../utils/geometry';
import { getTextSize } from '../helpers';
import { TextEditState } from '../overlays/TextEditorOverlay';
import { getDefaultColorMode } from '../../../../../utils/shapeColors';

export const useCanvasInteraction = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
    const uiStore = useUIStore();
    const dataStore = useDataStore();

    const [isDragging, setIsDragging] = useState(false);
    const [isMiddlePanning, setIsMiddlePanning] = useState(false);
    const [startPoint, setStartPoint] = useState<Point | null>(null);
    const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
    const [isSelectionBox, setIsSelectionBox] = useState(false);
    const [snapMarker, setSnapMarker] = useState<Point | null>(null);
    const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
    const [measureStart, setMeasureStart] = useState<Point | null>(null);
    const [lineStart, setLineStart] = useState<Point | null>(null);
    const [activeHandle, setActiveHandle] = useState<{ shapeId: string, handle: Handle } | null>(null);
    const [transformationBase, setTransformationBase] = useState<Point | null>(null);

    // Arc Tool State
    const [arcPoints, setArcPoints] = useState<{ start: Point; end: Point } | null>(null);
    const [showRadiusModal, setShowRadiusModal] = useState(false);
    const [radiusModalPos, setRadiusModalPos] = useState({ x: 0, y: 0 });

    // Text Tool State
    const [textEditState, setTextEditState] = useState<TextEditState | null>(null);
    const setEditingTextId = uiStore.setEditingTextId;

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
        setLineStart(null); setMeasureStart(null); setPolylinePoints([]); setStartPoint(null);
        setIsDragging(false); setIsSelectionBox(false); setSnapMarker(null); setTransformationBase(null);
        setActiveHandle(null);
        setArcPoints(null); setShowRadiusModal(false);
    }, [uiStore.activeTool]);

    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); setIsDragging(false); }
            if (isDragging && uiStore.activeTool === 'pan') { setIsDragging(false); setStartPoint(null); }
            if (activeHandle) { setActiveHandle(null); setIsDragging(false); }
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
                strokeColor: uiStore.strokeColor,
                strokeWidth: uiStore.strokeWidth,
                strokeEnabled: uiStore.strokeEnabled,
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
                setLineStart(null); setMeasureStart(null); setPolylinePoints([]);
                setIsDragging(false); setIsSelectionBox(false); setStartPoint(null); setTransformationBase(null); setActiveHandle(null);
                setArcPoints(null); setShowRadiusModal(false);
                if (uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') uiStore.setTool('select');
                if (uiStore.activeTool === 'select' && uiStore.selectedShapeIds.size > 0) {
                    uiStore.setSelectedShapeIds(new Set());
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [uiStore, finishPolyline]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (textEditState) return;

        const raw = getMousePos(e); let eff = raw; const wr = screenToWorld(raw, uiStore.viewTransform); let snapped: Point | null = null;

        if (uiStore.snapOptions.enabled && !['pan', 'select'].includes(uiStore.activeTool) && !e.ctrlKey) {
            const queryRect = { x: wr.x - 50, y: wr.y - 50, width: 100, height: 100 };
            const visible = dataStore.spatialIndex.query(queryRect)
                .map(s => dataStore.shapes[s.id])
                .filter(s => { const l = dataStore.layers.find(l => l.id === s.layerId); return s && l && l.visible && !l.locked; });
            const snap = getSnapPoint(wr, visible, uiStore.snapOptions, uiStore.gridSize, 20 / uiStore.viewTransform.scale);
            if (snap) { snapped = snap; eff = worldToScreen(snap, uiStore.viewTransform); }
        }

        setStartPoint(eff); setCurrentPoint(eff);

        if (e.button === 1 || uiStore.activeTool === 'pan') { if (e.button === 1) e.preventDefault(); setIsMiddlePanning(e.button === 1); setIsDragging(true); return; }

        const wPos = snapped || wr;

        if (uiStore.activeTool === 'select' && uiStore.selectedShapeIds.size > 0) {
            for (const id of uiStore.selectedShapeIds) {
                const shape = dataStore.shapes[id];
                if (!shape) continue;
                const handles = getShapeHandles(shape); const handleSize = 10 / uiStore.viewTransform.scale;
                for (const h of handles) {
                    if (getDistance(h, wPos) < handleSize) { setActiveHandle({ shapeId: shape.id, handle: h }); setIsDragging(true); return; }
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
                dataStore.addShape({ id: Date.now().toString(), layerId: dataStore.activeLayerId, type: 'line', strokeColor: uiStore.strokeColor, strokeWidth: uiStore.strokeWidth, strokeEnabled: uiStore.strokeEnabled, fillColor: 'transparent', colorMode: getDefaultColorMode(), points: [lineStart, wPos] });
                uiStore.setSidebarTab('desenho'); setLineStart(null);
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
        const shouldSnap = uiStore.snapOptions.enabled && !e.ctrlKey && (!['pan', 'select'].includes(uiStore.activeTool) || isHandleDrag);

        if (shouldSnap) {
            const queryRect = { x: worldPos.x - 50, y: worldPos.y - 50, width: 100, height: 100 };
            const visible = dataStore.spatialIndex.query(queryRect)
                .map(s => dataStore.shapes[s.id])
                .filter(s => {
                    const l = dataStore.layers.find(l => l.id === s.layerId);
                    if (activeHandle && s.id === activeHandle.shapeId) return false;
                    return s && l && l.visible && !l.locked;
                });
            const snap = getSnapPoint(worldPos, visible, uiStore.snapOptions, uiStore.gridSize, 20 / uiStore.viewTransform.scale);
            if (snap) { setSnapMarker(snap); eff = worldToScreen(snap, uiStore.viewTransform); } else { setSnapMarker(null); }
        } else { setSnapMarker(null); }

        setCurrentPoint(eff);

        if (isDragging && startPoint) {
            if (activeHandle) {
                const ws = screenToWorld(eff, uiStore.viewTransform);
                const s = dataStore.shapes[activeHandle.shapeId];
                if (s) {
                    if (activeHandle.handle.type === 'vertex' && s.points) {
                        const newPoints = s.points.map((p, i) => i === activeHandle.handle.index ? ws : p);
                        dataStore.updateShape(s.id, { points: newPoints }, false);
                    } else if (activeHandle.handle.type === 'resize' && (s.type === 'rect' || s.type === 'text')) {
                        if (s.x !== undefined && s.y !== undefined) {
                            const idx = activeHandle.handle.index;
                            const size = s.type === 'rect'
                                ? { width: s.width ?? 0, height: s.height ?? 0 }
                                : getTextSize(s);
                            const oldX = s.x; const oldY = s.y; const oldR = oldX + size.width; const oldB = oldY + size.height;
                            let newX = oldX, newY = oldY, newW = size.width, newH = size.height;
                            if (idx === 0) { newX = ws.x; newY = ws.y; newW = oldR - newX; newH = oldB - newY; }
                            else if (idx === 1) { newY = ws.y; newW = ws.x - oldX; newH = oldB - newY; }
                            else if (idx === 2) { newW = ws.x - oldX; newH = ws.y - oldY; }
                            else if (idx === 3) { newX = ws.x; newW = oldR - newX; newH = ws.y - oldY; }
                            const minSize = 5;
                            if (newW < 0) { newX += newW; newW = Math.abs(newW); }
                            if (newH < 0) { newY += newH; newH = Math.abs(newH); }
                            newW = Math.max(minSize, newW);
                            newH = Math.max(minSize, newH);

                            dataStore.updateShape(s.id, { x: newX, y: newY, width: newW, height: newH }, false);
                        }
                    }
                }
                return;
            }

            if (uiStore.activeTool === 'select' && !isSelectionBox && uiStore.selectedShapeIds.size > 0 && !activeHandle) {
                const prevWorld = screenToWorld(startPoint, uiStore.viewTransform);
                const currWorld = screenToWorld(eff, uiStore.viewTransform);
                const dx = currWorld.x - prevWorld.x; const dy = currWorld.y - prevWorld.y;

                if (dx !== 0 || dy !== 0) {
                    uiStore.selectedShapeIds.forEach(id => {
                        const s = dataStore.shapes[id];
                        if (!s) return;
                        const l = dataStore.layers.find(lay => lay.id === s.layerId);
                        if (l && l.locked) return;

                        const diff: Partial<Shape> = {};
                        if (s.x !== undefined) diff.x = s.x + dx;
                        if (s.y !== undefined) diff.y = s.y + dy;
                        if (s.points) diff.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));

                        dataStore.updateShape(id, diff, false);
                    });
                    setStartPoint(eff);
                }
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

        const shapeCreationTools = ['circle', 'rect', 'polygon', 'arc', 'arrow'];
        const isSingleClick = dist < 5;

        if (!['select', 'pan', 'polyline', 'measure', 'line', 'move', 'rotate'].includes(uiStore.activeTool)) {

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

            const n: Shape = { id: Date.now().toString(), layerId: dataStore.activeLayerId, type: uiStore.activeTool, strokeColor: uiStore.strokeColor, strokeWidth: uiStore.strokeWidth, strokeEnabled: uiStore.strokeEnabled, fillColor: uiStore.fillColor, colorMode: getDefaultColorMode(), points: [] };

            if (isSingleClick && shapeCreationTools.includes(uiStore.activeTool)) {
                if (uiStore.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = 50; }
                else if (uiStore.activeTool === 'rect') { n.x = ws.x - 50; n.y = ws.y - 50; n.width = 100; n.height = 100; }
                else if (uiStore.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = 50; n.sides = uiStore.polygonSides; }
                else if (uiStore.activeTool === 'arrow') { n.points = [ws, { x: ws.x + 100, y: ws.y }]; n.arrowHeadSize = 15; }
            } else {
                if (uiStore.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); }
                else if (uiStore.activeTool === 'rect') { n.x = Math.min(ws.x, we.x); n.y = Math.min(ws.y, we.y); n.width = Math.abs(we.x - ws.x); n.height = Math.abs(we.y - ws.y); }
                else if (uiStore.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); n.sides = uiStore.polygonSides; }
                else if (uiStore.activeTool === 'arrow') { n.points = [ws, we]; n.arrowHeadSize = 15; }
            }

            dataStore.addShape(n);
            uiStore.setSidebarTab('desenho');
            uiStore.setTool('select');
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
            activeHandle,
            transformationBase,
            arcPoints,
            showRadiusModal,
            radiusModalPos,
            textEditState
        },
        setters: {
            setArcPoints,
            setShowRadiusModal,
            setTextEditState
        }
    };
};
