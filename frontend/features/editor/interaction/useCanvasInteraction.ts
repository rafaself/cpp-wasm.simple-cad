import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useEditorLogic } from '../hooks/useEditorLogic';
import { ElectricalElement, Point, Shape, Rect, Patch, ToolType } from '../../../types';
import { screenToWorld, worldToScreen, getDistance, isPointInShape, getSelectionRect, isShapeInSelection, rotatePoint, getShapeHandles, Handle, getShapeBoundingBox, constrainTo45Degrees, constrainToSquare, getShapeCenter, getShapeBounds } from '../../../utils/geometry';
import { calculateZoomTransform } from '../../../utils/zoomHelper';
import { getSnapPoint } from '../snapEngine';
import { getConnectionPoint } from '../snapEngine/detectors';
import { getTextSize } from '../components/canvas/helpers';
import { TextEditState } from '../components/canvas/overlays/TextEditorOverlay';
import { getDefaultColorMode } from '../../../utils/shapeColors';
import { useLibraryStore } from '../../../stores/useLibraryStore';
import { computeFrameData } from '../../../utils/frame';
import { getDefaultMetadataForSymbol, getElectricalLayerConfig } from '../../library/electricalProperties';
import { isConduitShape, isConduitTool } from '../utils/tools';
import { resolveConnectionNodePosition } from '../../../utils/connections';
import { isShapeInteractable, isShapeSnappable } from '../../../utils/visibility';
import { generateId } from '../../../utils/uuid';
import { CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX, HANDLE_HIT_RADIUS, ROTATE_ZONE_OFFSET } from '../../../config/constants';

// State for Figma-like resize with flip support
interface ResizeState {
    originalBounds: Rect;
    anchorPoint: Point; // The fixed point (opposite corner or center)
    handleIndex: number;
    originalScaleX: number;
    originalScaleY: number;
    orientation: { x: -1 | 0 | 1; y: -1 | 0 | 1 };
}

const getHandleOrientation = (index: number): { x: -1 | 0 | 1; y: -1 | 0 | 1 } => {
    switch (index) {
        case 0: return { x: -1, y: -1 }; // TL
        case 1: return { x: 1, y: -1 };  // TR
        case 2: return { x: 1, y: 1 };   // BR
        case 3: return { x: -1, y: 1 };  // BL
        default: return { x: 0, y: 0 };
    }
};

const getEdgeAnchor = (bounds: Rect, orientation: { x: -1 | 0 | 1; y: -1 | 0 | 1 }): Point => {
    if (orientation.x === -1 && orientation.y === -1) return { x: bounds.x + bounds.width, y: bounds.y + bounds.height }; // BR
    if (orientation.x === 1 && orientation.y === -1) return { x: bounds.x, y: bounds.y + bounds.height }; // BL
    if (orientation.x === 1 && orientation.y === 1) return { x: bounds.x, y: bounds.y }; // TL
    if (orientation.x === -1 && orientation.y === 1) return { x: bounds.x + bounds.width, y: bounds.y }; // TR
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
};

type DataState = ReturnType<typeof useDataStore.getState>;

const findAnchoredConnectionNode = (
    data: DataState,
    point: Point,
    scale: number,
    options?: { ignoreShapeId?: string }
): { nodeId: string; point: Point } | undefined => {
    const normalizedScale = Math.max(scale, 0.01);
    const tolerance = CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX / normalizedScale;
    const queryRect = { x: point.x - tolerance, y: point.y - tolerance, width: tolerance * 2, height: tolerance * 2 };
    const candidates = data.spatialIndex.query(queryRect).map(c => data.shapes[c.id]);

    for (const cand of candidates) {
        if (!cand) continue;
        if (options?.ignoreShapeId && cand.id === options.ignoreShapeId) continue;
        const layer = data.layers.find(l => l.id === cand.layerId);
        if (!layer || !layer.visible || layer.locked) continue;
        const connPt = getConnectionPoint(cand);
        if (!connPt) continue;

        const nearConnection = getDistance(connPt, point) <= tolerance;
        const bbox = getShapeBoundingBox(cand);
        const insideBBox = bbox
            ? (point.x >= bbox.x - tolerance &&
               point.x <= bbox.x + bbox.width + tolerance &&
               point.y >= bbox.y - tolerance &&
               point.y <= bbox.y + bbox.height + tolerance)
            : false;

        if (nearConnection || insideBBox) {
            const nodeId = data.getOrCreateAnchoredConnectionNode(cand.id);
            return { nodeId, point: connPt };
        }
    }

    for (const node of Object.values(data.connectionNodes)) {
        const pos = resolveConnectionNodePosition(node, data.shapes);
        if (!pos) continue;
        if (getDistance(pos, point) <= tolerance) {
            return { nodeId: node.id, point: pos };
        }
    }

    return undefined;
};

const isConduitAnchoredToNode = (shape: Shape | undefined, nodes: DataState['connectionNodes']): boolean => {
    if (!shape || !isConduitShape(shape)) return false;
    const nodeForId = (id?: string) => (id ? nodes[id] : undefined);
    const startNode = nodeForId(shape.fromNodeId);
    if (startNode?.kind === 'anchored') return true;
    const endNode = nodeForId(shape.toNodeId);
    return endNode?.kind === 'anchored' ? true : false;
};

const pointInPolygon = (point: Point, polygon: Point[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};


// ... imports

export const useCanvasInteraction = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
    // Selectors for reactive updates
    const activeTool = useUIStore(s => s.activeTool);
    const setEditingTextId = useUIStore(s => s.setEditingTextId);
    const activeDiscipline = useUIStore(s => s.activeDiscipline); // Added for discipline locking logic
    
    // Non-reactive access to settings (we can also use getState() in handlers if these don't need to trigger re-renders of the hook)
    // But keeping them as hooks for now is fine if they are stable. 
    // Actually, toolDefaults changes when user changes settings. 
    // But logic mostly uses them in handlers.
    // Let's keep them as is for now or optimize later.
    const snapSettings = useSettingsStore(s => s.snap);
    const gridSize = useSettingsStore(s => s.grid.size);
    const toolDefaults = useSettingsStore(s => s.toolDefaults);
    const { strokeColor, strokeWidth, strokeEnabled, fillColor, polygonSides } = toolDefaults;

    const { zoomToFit } = useEditorLogic();

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
    const [conduitStart, setConduitStart] = useState<{ point: Point; nodeId: string } | null>(null);
    const [hoverCursor, setHoverCursor] = useState<string | null>(null);
    
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
    const rotationState = useRef<{ center: Point; startAngle: number; snapshot: Map<string, Shape> } | null>(null);
    const lastPlacedComponentCenter = useRef<Point | null>(null);
    const lastComponentAxis = useRef<'x' | 'y' | null>(null);
    const shiftAxisLock = useRef<'x' | 'y' | null>(null);

    const computeAxisFromDelta = (delta: Point): 'x' | 'y' | null => {
        const dx = Math.abs(delta.x);
        const dy = Math.abs(delta.y);
        if (dx === 0 && dy === 0) return null;
        return dx >= dy ? 'x' : 'y';
    };

    const applyPreviousElementAxisLock = (point: Point, shiftHeld: boolean): Point => {
        const lastCenter = lastPlacedComponentCenter.current;
        if (!shiftHeld || !lastCenter) return point;

        const delta = { x: point.x - lastCenter.x, y: point.y - lastCenter.y };
        const axisCandidate = computeAxisFromDelta(delta) ?? lastComponentAxis.current;
        if (!axisCandidate) return point;

        shiftAxisLock.current = axisCandidate;

        if (axisCandidate === 'x') return { x: point.x, y: lastCenter.y };
        return { x: lastCenter.x, y: point.y };
    };

    // Arc Tool State
    const [arcPoints, setArcPoints] = useState<{ start: Point; end: Point } | null>(null);
    const [showRadiusModal, setShowRadiusModal] = useState(false);
    const [radiusModalPos, setRadiusModalPos] = useState({ x: 0, y: 0 });

    // Polygon Tool State
    const [polygonShapeId, setPolygonShapeId] = useState<string | null>(null);
    const [showPolygonModal, setShowPolygonModal] = useState(false);
    const [polygonModalPos, setPolygonModalPos] = useState({ x: 0, y: 0 });

    // Calibration Tool State
    const [calibrationPoints, setCalibrationPoints] = useState<{ start: Point; end: Point } | null>(null);
    const [showCalibrationModal, setShowCalibrationModal] = useState(false);

    // Text Tool State
    const [textEditState, setTextEditState] = useState<TextEditState | null>(null);


    const getConduitStartNodeId = (s?: Shape | null) => s?.fromNodeId;
    const getConduitEndNodeId = (s?: Shape | null) => s?.toNodeId;

    // Middle button double-click detection (native dblclick doesn't work for middle button)
    const lastMiddleClickTime = useRef<number>(0);
    const DOUBLE_CLICK_THRESHOLD = 300; // ms

    useEffect(() => {
        return () => setEditingTextId(null);
    }, [setEditingTextId]);

    const getSelectedBoundingCenter = (): Point | null => {
        const currentUIStore = useUIStore.getState();
        const currentDataStore = useDataStore.getState();
        const selected = Array.from(currentUIStore.selectedShapeIds).map(id => currentDataStore.shapes[id]).filter(Boolean) as Shape[];
        if (selected.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selected.forEach(s => {
            const b = getShapeBounds(s);
            if (!b) return;
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        });
        if (minX === Infinity) return null;
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    };

    const getOrientedCorners = (shape: Shape): Point[] => {
        const bounds = getShapeBoundingBox(shape);
        const corners = [
            { x: bounds.x, y: bounds.y },
            { x: bounds.x + bounds.width, y: bounds.y },
            { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
            { x: bounds.x, y: bounds.y + bounds.height }
        ];
        const center = getShapeCenter(shape);
        return shape.rotation ? corners.map(c => rotatePoint(c, center, shape.rotation!)) : corners;
    };

    const applyRotationFromSnapshot = (angle: number) => {
        const state = rotationState.current;
        if (!state) return;
        const currentDataStore = useDataStore.getState();
        const { center, snapshot } = state;
        snapshot.forEach((original, id) => {
            const s0 = original;
            const supportsCenteredRotation = (s0.type === 'rect' || s0.type === 'text' || s0.type === 'circle' || s0.type === 'polygon');
            const diff: Partial<Shape> = {};

            if (s0.points) diff.points = s0.points.map(p => rotatePoint(p, center, angle));

            if (supportsCenteredRotation) {
                const bounds = getShapeBoundingBox(s0);
                const originalCenter = getShapeCenter(s0);
                const newCenter = rotatePoint(originalCenter, center, angle);
                if (s0.type === 'circle' || s0.type === 'polygon') {
                    diff.x = newCenter.x; diff.y = newCenter.y;
                } else {
                    diff.x = newCenter.x - bounds.width / 2;
                    diff.y = newCenter.y - bounds.height / 2;
                }
                diff.rotation = (s0.rotation || 0) + angle;
            } else if (s0.x !== undefined && s0.y !== undefined) {
                const np = rotatePoint({ x: s0.x, y: s0.y }, center, angle);
                diff.x = np.x; diff.y = np.y;
            }

            currentDataStore.updateShape(id, diff, false);
        });
    };

    const commitRotationHistory = () => {
        const state = rotationState.current;
        if (!state) return;
        const currentDataStore = useDataStore.getState();
        const patches: Patch[] = [];
        state.snapshot.forEach((prevShape, id) => {
            const curr = currentDataStore.shapes[id];
            if (!curr) return;
            const diff: Partial<Shape> = {};
            if (prevShape.x !== curr.x) diff.x = curr.x;
            if (prevShape.y !== curr.y) diff.y = curr.y;
            if ((prevShape.rotation || 0) !== (curr.rotation || 0)) diff.rotation = curr.rotation;
            if (prevShape.points || curr.points) diff.points = curr.points;
            if (Object.keys(diff).length === 0) return;
            patches.push({ type: 'UPDATE', id, diff, prev: prevShape });
        });
        if (patches.length > 0) currentDataStore.saveToHistory(patches);
    };

    type InteractionHit = { mode: 'resize' | 'rotate' | null; cursor: string | null; handle: Handle | null; shapeId: string | null };
    const defaultInteraction: InteractionHit = { mode: null, cursor: null, handle: null, shapeId: null };

    const detectInteractionAtPoint = (worldPos: Point, viewScale: number): InteractionHit => {
        const currentUIStore = useUIStore.getState();
        const currentDataStore = useDataStore.getState();
        const { activeFloorId, activeDiscipline } = currentUIStore;

        const selection = Array.from(currentUIStore.selectedShapeIds)
            .map(id => currentDataStore.shapes[id])
            .filter(s => s && isShapeInteractable(s, { activeFloorId, activeDiscipline })) as Shape[];

        if (selection.length === 0) return defaultInteraction;

        const handleHit = HANDLE_HIT_RADIUS / viewScale;
        const rotateBand = ROTATE_ZONE_OFFSET / viewScale;

        // Handles (corners only)
        for (const shape of selection) {
            const handles = getShapeHandles(shape);
            for (const h of handles) {
                if (getDistance(h, worldPos) <= handleHit) {
                    return { mode: 'resize', cursor: h.cursor, handle: h, shapeId: shape.id };
                }
            }
        }

        // Rotate zone: just outside corners
        for (const shape of selection) {
            const corners = getOrientedCorners(shape);
            const inside = pointInPolygon(worldPos, corners);
            if (inside) continue;
            const nearestCorner = corners.reduce((acc, c, idx) => {
                const d = getDistance(worldPos, c);
                if (d < acc.dist) return { dist: d, index: idx };
                return acc;
            }, { dist: Infinity, index: -1 });
            if (nearestCorner.dist > handleHit && nearestCorner.dist <= rotateBand) {
                return { mode: 'rotate', cursor: 'rotate', handle: null, shapeId: shape.id };
            }
        }

        return defaultInteraction;
    };

    const getMousePos = (e: React.MouseEvent): Point => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    // Reset tools on change
    useEffect(() => {
        setLineStart(null); setArrowStart(null); setMeasureStart(null); setPolylinePoints([]); setStartPoint(null);
        setConduitStart(null);
        setIsDragging(false); setIsSelectionBox(false); setSnapMarker(null); setTransformationBase(null);
        setActiveHandle(null); setResizeState(null);
        setArcPoints(null); setShowRadiusModal(false);
        setPolygonShapeId(null); setShowPolygonModal(false);
        setLockedAxis(null); // Reset axis lock on tool change
        dragStartPositions.current.clear();
        dragStartWorld.current = null;
        rotationState.current = null;
        setHoverCursor(null);
    }, [activeTool]);

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
                shiftAxisLock.current = null;
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
            if (isDragging && useUIStore.getState().activeTool === 'pan') { setIsDragging(false); setStartPoint(null); }
            if (activeHandle) { setActiveHandle(null); setResizeState(null); setIsDragging(false); }
            if (rotationState.current) { rotationState.current = null; setIsDragging(false); }
            // Reset axis lock when drag ends
            setLockedAxis(null);
            dragStartPositions.current.clear();
            dragStartWorld.current = null;
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [isMiddlePanning, isDragging, activeHandle]);

    const finishPolyline = useCallback(() => {
        if (polylinePoints.length > 1) {
            const currentDataStore = useDataStore.getState();
            const currentUIStore = useUIStore.getState();
            currentDataStore.addShape({
                id: generateId(),
                layerId: currentDataStore.activeLayerId,
                type: 'polyline',
                strokeColor,
                strokeWidth,
                strokeEnabled,
                fillColor: 'transparent',
                colorMode: getDefaultColorMode(),
                points: [...polylinePoints],
                floorId: currentUIStore.activeFloorId,
                discipline: currentUIStore.activeDiscipline
            });
            currentUIStore.setSidebarTab('desenho');
            setPolylinePoints([]);
        }
    }, [polylinePoints, strokeColor, strokeWidth, strokeEnabled]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const currentUIStore = useUIStore.getState();
            const currentDataStore = useDataStore.getState();
            const currentLibraryStore = useLibraryStore.getState();

            if (e.key === 'Enter') { if (currentUIStore.activeTool === 'polyline') finishPolyline(); }
            if (e.key === 'Escape') {
                setLineStart(null); setArrowStart(null); setMeasureStart(null); setPolylinePoints([]);
                setIsDragging(false); setIsSelectionBox(false); setStartPoint(null); setTransformationBase(null); setActiveHandle(null);
                setArcPoints(null); setShowRadiusModal(false);
                setPolygonShapeId(null); setShowPolygonModal(false);
                if (currentUIStore.activeTool !== 'select') currentUIStore.setTool('select');
                if (currentUIStore.activeTool === 'select' && currentUIStore.selectedShapeIds.size > 0) {
                    currentUIStore.setSelectedShapeIds(new Set());
                }
            }
            if (currentUIStore.activeTool === 'electrical-symbol') {
                if (e.key.toLowerCase() === 'r') {
                    e.preventDefault();
                    currentUIStore.rotateElectricalPreview(Math.PI / 2);
                }
                if (e.key.toLowerCase() === 'f') {
                    e.preventDefault();
                    currentUIStore.flipElectricalPreview('x');
                }
                if (e.key.toLowerCase() === 'f' && e.shiftKey) {
                    e.preventDefault();
                    currentUIStore.flipElectricalPreview('y');
                }
            }
            // Arrow key movement for selected shapes
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && currentUIStore.selectedShapeIds.size > 0) {
                e.preventDefault();
                const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                
                currentUIStore.selectedShapeIds.forEach(id => {
                    const shape = currentDataStore.shapes[id];
                    if (!shape) return;
                    const layer = currentDataStore.layers.find(l => l.id === shape.layerId);
                    if (layer?.locked) return;
                    if (isConduitAnchoredToNode(shape, currentDataStore.connectionNodes)) return;
                    
                    const updates: Partial<Shape> = {};
                    if (shape.x !== undefined) updates.x = shape.x + dx;
                    if (shape.y !== undefined) updates.y = shape.y + dy;
                    if (shape.points) updates.points = shape.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    
                    currentDataStore.updateShape(id, updates, true);
                });
            }
            // Home key: reset connection point to default for selected electrical symbol
            if (e.key === 'Home' && currentUIStore.selectedShapeIds.size === 1) {
                const selectedId = Array.from(currentUIStore.selectedShapeIds)[0];
                const selectedShape = currentDataStore.shapes[selectedId];
                if (selectedShape?.svgRaw && selectedShape.svgSymbolId) {
                    e.preventDefault();
                    const librarySymbol = currentLibraryStore.electricalSymbols[selectedShape.svgSymbolId];
                    if (librarySymbol?.defaultConnectionPoint) {
                        currentDataStore.updateShape(selectedId, {
                            connectionPoint: { ...librarySymbol.defaultConnectionPoint }
                        }, true);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [finishPolyline]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (textEditState) return;

        const ui = useUIStore.getState();
        const data = useDataStore.getState();
        const library = useLibraryStore.getState();

        const raw = getMousePos(e); const wr = screenToWorld(raw, ui.viewTransform); let snapped: Point | null = null;

        if (snapSettings.enabled && !['pan', 'select'].includes(ui.activeTool) && !e.ctrlKey) {
            const queryRect = { x: wr.x - 50, y: wr.y - 50, width: 100, height: 100 };
            const visible = data.spatialIndex.query(queryRect)
                .map(s => data.shapes[s.id])
                .filter(s => { 
                    if (!s) return false;
                    // Discipline Filter for Snapping
                    const shapeDiscipline = s.discipline || 'electrical';
                    if (ui.activeDiscipline === 'architecture' && shapeDiscipline !== 'architecture') return false;

                    const l = data.layers.find(l => l.id === s.layerId); 
                    return l && l.visible && !l.locked; 
                });
            const frameData = computeFrameData(data.frame, data.worldScale);
            const snap = getSnapPoint(
              wr,
              frameData ? [...visible, ...frameData.shapes] : visible,
              snapSettings,
              gridSize,
              snapSettings.tolerancePx / ui.viewTransform.scale
            );
            if (snap) { snapped = snap; }
        }

        const baseWorld = snapped || wr;
        const axisLockedWorld = ui.activeTool === 'electrical-symbol'
            ? applyPreviousElementAxisLock(baseWorld, e.shiftKey)
            : baseWorld;
        const axisLockedScreen = worldToScreen(axisLockedWorld, ui.viewTransform);
        setStartPoint(axisLockedScreen);
        setCurrentPoint(axisLockedScreen);

        // Middle button handling: detect double-click for zoom-to-fit
        if (e.button === 1) {
            e.preventDefault();
            const now = Date.now();
            if (now - lastMiddleClickTime.current < DOUBLE_CLICK_THRESHOLD) {
                // Double-click detected: zoom to fit
                lastMiddleClickTime.current = 0;
                zoomToFit();
                return;
            }
            lastMiddleClickTime.current = now;
            setIsMiddlePanning(true);
            setIsDragging(true);
            return;
        }
        
        if (ui.activeTool === 'pan') { setIsDragging(true); return; }

        const wPos = axisLockedWorld;

        if (ui.activeTool === 'select' && ui.selectedShapeIds.size > 0) {
            for (const id of ui.selectedShapeIds) {
                const shape = data.shapes[id];
                if (!shape) continue;

                if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId, activeDiscipline: ui.activeDiscipline })) continue;

                const handles = getShapeHandles(shape); const handleSize = 10 / ui.viewTransform.scale;
                for (const h of handles) {
                    if (getDistance(h, wPos) < handleSize) { 
                        setActiveHandle({ shapeId: shape.id, handle: h }); 
                        setIsDragging(true);
                        // Capture initial state for Figma-like resize with flip support
                        if (h.type === 'resize') {
                            const bounds = getShapeBoundingBox(shape);
                            const orientation = getHandleOrientation(h.index);
                            setResizeState({
                                originalBounds: bounds,
                                anchorPoint: getEdgeAnchor(bounds, orientation),
                                handleIndex: h.index,
                                originalScaleX: shape.scaleX ?? 1,
                                originalScaleY: shape.scaleY ?? 1,
                                orientation
                            });
                        }
                        return; 
                    }
                }
            }

        }

        const interaction = detectInteractionAtPoint(wPos, ui.viewTransform.scale);
        if (interaction.mode === 'rotate') {
            const center = getSelectedBoundingCenter();
            if (center) {
                const startAngle = Math.atan2(wPos.y - center.y, wPos.x - center.x);
                const snapshot = new Map<string, Shape>();
                ui.selectedShapeIds.forEach(id => {
                    const s = data.shapes[id];
                    if (s) snapshot.set(id, { ...s, points: s.points ? s.points.map(p => ({ ...p })) : undefined });
                });
                rotationState.current = { center, startAngle, snapshot };
                setIsDragging(true);
                return;
            }
        } else if (interaction.mode === 'resize' && interaction.handle && !activeHandle) {
            const h = interaction.handle;
            setActiveHandle({ shapeId: interaction.shapeId!, handle: h });
            setIsDragging(true);
            const bounds = getShapeBoundingBox(data.shapes[interaction.shapeId!]);
            const orientation = getHandleOrientation(h.index);
            setResizeState({
                originalBounds: bounds,
                anchorPoint: getEdgeAnchor(bounds, orientation),
                handleIndex: h.index,
                originalScaleX: data.shapes[interaction.shapeId!].scaleX ?? 1,
                originalScaleY: data.shapes[interaction.shapeId!].scaleY ?? 1,
                orientation
            });
            return;
        }

        if (ui.activeTool === 'move' || ui.activeTool === 'rotate') {
            if (!transformationBase) { setTransformationBase(wPos); }
            else {
                if (ui.activeTool === 'move') {
                    const dx = wPos.x - transformationBase.x; const dy = wPos.y - transformationBase.y;
                    const ids = Array.from(ui.selectedShapeIds);
                    ids.forEach(id => {
                        const s = data.shapes[id];
                        if (!s) return;
                        if (isConduitAnchoredToNode(s, data.connectionNodes)) return;
                        const diff: Partial<Shape> = {};
                        if (s.x !== undefined) diff.x = s.x + dx;
                        if (s.y !== undefined) diff.y = s.y + dy;
                        if (s.points) diff.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                        data.updateShape(id, diff, true);
                    });
                } else if (ui.activeTool === 'rotate') {
                    const dx = wPos.x - transformationBase.x; const dy = wPos.y - transformationBase.y; const angle = Math.atan2(dy, dx);
                    data.rotateSelected(Array.from(ui.selectedShapeIds), transformationBase, angle);
                }
                setTransformationBase(null); ui.setTool('select');
            }
            return;
        }

        if (ui.activeTool === 'select') {
            const selectWorld = screenToWorld(raw, ui.viewTransform);
            const queryRect = { x: selectWorld.x - 5, y: selectWorld.y - 5, width: 10, height: 10 };
            const candidates = data.spatialIndex.query(queryRect).map(c => data.shapes[c.id]).filter(s => !!s);
            let hitShapeId = null;
            for (let i = candidates.length - 1; i >= 0; i--) {
                const s = candidates[i];
                const shapeDisc = s.discipline || 'electrical';
                const shapeFloor = s.floorId || 'terreo';

                // Floor Logic
                if (shapeFloor !== ui.activeFloorId) continue;
                
                // Discipline Logic: Strict Isolation
                // Only select shapes belonging to the active discipline.
                // Referenced shapes are visible but NOT selectable.
                if (shapeDisc !== ui.activeDiscipline) continue;

                const l = data.layers.find(lay => lay.id === s.layerId);
                if (l && (!l.visible || l.locked)) continue;
                if (isPointInShape(selectWorld, s, ui.viewTransform.scale, l)) { hitShapeId = s.id; break; }
            }

            if (hitShapeId) {
                if (e.shiftKey) {
                    ui.setSelectedShapeIds(prev => { const n = new Set(prev); if (n.has(hitShapeId!)) n.delete(hitShapeId!); else n.add(hitShapeId!); return n; });
                } else { if (!ui.selectedShapeIds.has(hitShapeId)) ui.setSelectedShapeIds(new Set([hitShapeId])); }
                setIsDragging(true);
            } else { if (!e.shiftKey) ui.setSelectedShapeIds(new Set()); setIsSelectionBox(true); }
            return;
        }

        if (ui.activeTool === 'arc') {
            if (!arcPoints) {
                setIsDragging(true);
            }
            return;
        }

        if (ui.activeTool === 'polyline') { setPolylinePoints(p => [...p, wPos]); return; }
        if (ui.activeTool === 'line') {
            if (!lineStart) setLineStart(wPos);
            else {
                // Shift: constrain to 45° angles
                let endPoint = wPos;
                if (e.shiftKey) {
                    endPoint = constrainTo45Degrees(lineStart, wPos);
                }
                data.addShape({ id: generateId(), layerId: data.activeLayerId, type: 'line', strokeColor, strokeWidth, strokeEnabled, fillColor: 'transparent', colorMode: getDefaultColorMode(), points: [lineStart, endPoint], floorId: ui.activeFloorId, discipline: ui.activeDiscipline });
                ui.setSidebarTab('desenho'); setLineStart(null);
            }
            return;
        }
        if (ui.activeTool === 'arrow') {
            if (!arrowStart) setArrowStart(wPos);
            else {
                // Shift: constrain to 45° angles
                let endPoint = wPos;
                if (e.shiftKey) {
                    endPoint = constrainTo45Degrees(arrowStart, wPos);
                }
                data.addShape({ id: generateId(), layerId: data.activeLayerId, type: 'arrow', strokeColor, strokeWidth, strokeEnabled, fillColor: 'transparent', colorMode: getDefaultColorMode(), points: [arrowStart, endPoint], arrowHeadSize: 15, floorId: ui.activeFloorId, discipline: ui.activeDiscipline });
                ui.setSidebarTab('desenho'); setArrowStart(null);
            }
            return;
        }
        if (ui.activeTool === 'measure') {
            if (!measureStart) setMeasureStart(wPos);
            else {
                const dist = getDistance(measureStart, wPos).toFixed(1);
                data.addShape({ id: generateId(), layerId: data.activeLayerId, type: 'measure', strokeColor: '#ef4444', fillColor: 'transparent', colorMode: getDefaultColorMode(), points: [measureStart, wPos], label: `${dist} cm`, floorId: ui.activeFloorId, discipline: ui.activeDiscipline });
                setMeasureStart(null);
            }
            return;
        }

        const conduitToolActive = isConduitTool(ui.activeTool as ToolType);
        if (conduitToolActive) {
            if (!conduitStart) {
                // First click: start from a node/symbol, or create a free node at the click position.
                const startHit = findAnchoredConnectionNode(data, wPos, ui.viewTransform.scale);
                if (!startHit) {
                    const nodeId = data.createFreeConnectionNode(wPos);
                    setConduitStart({ point: wPos, nodeId });
                    return;
                }

                setConduitStart({ point: startHit.point, nodeId: startHit.nodeId });
            } else {
                // Second click: End the conduit
                const startNodeId = conduitStart.nodeId;
                const endHit = findAnchoredConnectionNode(data, wPos, ui.viewTransform.scale);
                const endNodeId = endHit?.nodeId ?? data.createFreeConnectionNode(wPos);
                if (!startNodeId || !endNodeId || startNodeId === endNodeId) {
                    setConduitStart(null);
                    return;
                }

                // Prevent duplicates
                const existing = Object.values(data.shapes).find(s => {
                    if (!isConduitShape(s)) return false;
                    const sStart = getConduitStartNodeId(s);
                    const sEnd = getConduitEndNodeId(s);
                    return (sStart === startNodeId && sEnd === endNodeId) || (sStart === endNodeId && sEnd === startNodeId);
                });
                if (existing) {
                    setConduitStart(null);
                    return; // Block duplicate
                }

                // Ensure native layer
                const layer = data.layers.find(l => l.id === 'eletrodutos') || data.layers[0];
                const targetLayerId = layer?.id ?? data.layers[0]?.id ?? 'eletrodutos';
                data.addConduitBetweenNodes({
                    fromNodeId: startNodeId,
                    toNodeId: endNodeId,
                    layerId: targetLayerId,
                    strokeColor: layer?.strokeColor ?? '#8b5cf6',
                });
                
                setConduitStart(null);
            }
            return;
        }

        if (ui.activeTool === 'calibrate') {
            if (!startPoint) {
                setStartPoint(axisLockedScreen); 
            } else {
                const startWorld = screenToWorld(startPoint, ui.viewTransform);
                setCalibrationPoints({ start: startWorld, end: axisLockedWorld });
                setShowCalibrationModal(true);
                setStartPoint(null);
            }
            return;
        }

        setIsDragging(true);
    }, [textEditState, snapSettings, gridSize, strokeColor, strokeWidth, strokeEnabled, fillColor, polygonSides, zoomToFit, activeHandle, conduitStart, arcPoints, lineStart, arrowStart, measureStart, transformationBase]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const ui = useUIStore.getState();
        const data = useDataStore.getState();

        const raw = getMousePos(e);
        const worldPos = screenToWorld(raw, ui.viewTransform);
        const shiftHeld = e.shiftKey || isShiftPressed;
        const axisLockedWorldPos = ui.activeTool === 'electrical-symbol'
            ? applyPreviousElementAxisLock(worldPos, shiftHeld)
            : worldPos;
        ui.setMousePos(axisLockedWorldPos);

        if (isMiddlePanning || (isDragging && ui.activeTool === 'pan')) {
            if (startPoint) {
                const dx = raw.x - startPoint.x; const dy = raw.y - startPoint.y;
                ui.setViewTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); setStartPoint(raw);
            }
            return;
        }

        let eff = worldToScreen(axisLockedWorldPos, ui.viewTransform);
        const isHandleDrag = !!activeHandle;
        const shouldSnap = snapSettings.enabled && !e.ctrlKey && (!['pan', 'select'].includes(ui.activeTool) || isHandleDrag);
        const conduitToolActive = isConduitTool(ui.activeTool as ToolType);

        if (conduitToolActive) {
            const anchorHit = findAnchoredConnectionNode(data, axisLockedWorldPos, ui.viewTransform.scale);
            if (anchorHit) {
                setSnapMarker(anchorHit.point);
                eff = worldToScreen(anchorHit.point, ui.viewTransform);
            } else {
                setSnapMarker(null);
            }
        } else if (shouldSnap) {
            const queryRect = { x: axisLockedWorldPos.x - 50, y: axisLockedWorldPos.y - 50, width: 100, height: 100 };
            const visible = data.spatialIndex.query(queryRect)
                .map(s => data.shapes[s.id])
                .filter(s => {
                    if (!s) return false;
                    
                    if (!isShapeSnappable(s, { activeFloorId: ui.activeFloorId, activeDiscipline: ui.activeDiscipline })) return false;

                    const l = data.layers.find(l => l.id === s.layerId);
                    if (activeHandle && s.id === activeHandle.shapeId) return false;
                    return l && l.visible && !l.locked;
                });
            const frameData = computeFrameData(data.frame, data.worldScale);
            const snap = getSnapPoint(
              axisLockedWorldPos,
              frameData ? [...visible, ...frameData.shapes] : visible,
              snapSettings,
              gridSize,
              snapSettings.tolerancePx / ui.viewTransform.scale
            );
            if (snap) { setSnapMarker(snap); eff = worldToScreen(snap, ui.viewTransform); } else { setSnapMarker(null); }
        } else {
            setSnapMarker(null);
        }

        setCurrentPoint(eff);

        if (rotationState.current && isDragging) {
            const center = rotationState.current.center;
            let angle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
            let diff = angle - rotationState.current.startAngle;
            if (e.shiftKey || isShiftPressed) diff = Math.round(diff / (Math.PI / 4)) * (Math.PI / 4);
            applyRotationFromSnapshot(diff);
            setHoverCursor('rotate');
            return;
        }

        if (isDragging && startPoint) {
            if (activeHandle) {
                const wsWorld = screenToWorld(eff, ui.viewTransform);
                const s = data.shapes[activeHandle.shapeId];
                if (s) {
                        const rotation = s.rotation || 0;
                        const pivot = getShapeCenter(s);
                        const ws = rotation ? rotatePoint(wsWorld, pivot, -rotation) : wsWorld;

                        // Conduit Control Point Handle
                        if (activeHandle.handle.type === 'bezier-control' && isConduitShape(s)) {
                            data.updateShape(s.id, { controlPoint: ws }, false);
                        }
                        // VERTEX handles (lines, polylines, conduits) - direct point manipulation
                        else if (activeHandle.handle.type === 'vertex' && s.points) {
                            const newPoints = s.points.map((p, i) => i === activeHandle.handle.index ? ws : p);
                            const rotatedPoints = rotation ? newPoints.map(p => rotatePoint(p, pivot, rotation)) : newPoints;
                            data.updateShape(s.id, { points: rotatedPoints }, false);
                            
                            // If moving conduit endpoint, check for snap to re-link
                            if (isConduitShape(s)) {
                                // Find potential snap target for re-linking (anchored nodes only)
                                const foundHit = findAnchoredConnectionNode(data, worldPos, ui.viewTransform.scale, { ignoreShapeId: s.id });
                                const foundNodeId = foundHit?.nodeId;
                                const update: Partial<Shape> = {};
                                if (foundNodeId && activeHandle.handle.index === 0) update.fromNodeId = foundNodeId;
                                if (foundNodeId && activeHandle.handle.index === 1) update.toNodeId = foundNodeId;

                                if (foundNodeId) {
                                    const node = useDataStore.getState().connectionNodes[foundNodeId];
                                    const anchorShapeId = node?.kind === 'anchored' ? node.anchorShapeId : undefined;
                                    if (activeHandle.handle.index === 0) {
                                        update.fromConnectionId = anchorShapeId;
                                        update.connectedStartId = anchorShapeId;
                                    }
                                    if (activeHandle.handle.index === 1) {
                                        update.toConnectionId = anchorShapeId;
                                        update.connectedEndId = anchorShapeId;
                                    }
                                }
                                
                                if (Object.keys(update).length > 0) {
                                     data.updateShape(s.id, update, false);
                                }
                            }

                        } 
                        // RESIZE handles - Figma-like bounding box transformation with flip support
                    else if (activeHandle.handle.type === 'resize' && resizeState) {
                        const { originalBounds, originalScaleX, originalScaleY, orientation } = resizeState;
                        const anchor = e.altKey
                            ? { x: originalBounds.x + originalBounds.width / 2, y: originalBounds.y + originalBounds.height / 2 }
                            : getEdgeAnchor(originalBounds, orientation);

                        const minSize = 5;
                        
                        // 1. Calculate Signs (Flip detection)
                        const rawDx = ws.x - anchor.x;
                        const rawDy = ws.y - anchor.y;
                        
                        // If orientation is 0, sign is 1 (no flip on that axis)
                        const signX = orientation.x === 0 ? 1 : (Math.sign(rawDx * orientation.x) || 1);
                        const signY = orientation.y === 0 ? 1 : (Math.sign(rawDy * orientation.y) || 1);

                        let finalW = originalBounds.width;
                        let finalH = originalBounds.height;

                        // 2. Calculate Dimensions
                        if (orientation.x !== 0) {
                            const dist = Math.abs(rawDx);
                            finalW = Math.max(minSize, e.altKey ? dist * 2 : dist);
                        }
                        if (orientation.y !== 0) {
                            const dist = Math.abs(rawDy);
                            finalH = Math.max(minSize, e.altKey ? dist * 2 : dist);
                        }

                        // 3. Proportional resize with Shift (Figma-style)
                        if (e.shiftKey && (orientation.x !== 0 || orientation.y !== 0)) {
                            const scaleX = orientation.x !== 0 ? finalW / Math.max(minSize, originalBounds.width) : 0;
                            const scaleY = orientation.y !== 0 ? finalH / Math.max(minSize, originalBounds.height) : 0;
                            const uniformScale = Math.max(scaleX, scaleY) || 1;
                            
                            if (orientation.x !== 0) finalW = Math.max(minSize, originalBounds.width * uniformScale);
                            if (orientation.y !== 0) finalH = Math.max(minSize, originalBounds.height * uniformScale);
                        }

                        // 4. Calculate Position
                        let finalX = originalBounds.x;
                        let finalY = originalBounds.y;

                        if (orientation.x !== 0) {
                            if (e.altKey) {
                                finalX = anchor.x - finalW / 2;
                            } else {
                                // If effective direction is positive, anchor is Top/Left -> X = anchor.x
                                // If effective direction is negative, anchor is Bottom/Right -> X = anchor.x - finalW
                                const effectiveDir = orientation.x * signX;
                                finalX = effectiveDir > 0 ? anchor.x : anchor.x - finalW;
                            }
                        }

                        if (orientation.y !== 0) {
                            if (e.altKey) {
                                finalY = anchor.y - finalH / 2;
                            } else {
                                const effectiveDir = orientation.y * signY;
                                finalY = effectiveDir > 0 ? anchor.y : anchor.y - finalH;
                            }
                        }

                        const newScaleX = signX < 0 ? -originalScaleX : originalScaleX;
                        const newScaleY = signY < 0 ? -originalScaleY : originalScaleY;

                        if (s.type === 'rect' || s.type === 'text') {
                            data.updateShape(s.id, {
                                x: finalX,
                                y: finalY,
                                width: finalW,
                                height: finalH,
                                scaleX: newScaleX,
                                scaleY: newScaleY
                            }, false);
                        } else if (s.type === 'circle' || s.type === 'polygon') {
                            const newCx = finalX + finalW / 2;
                            const newCy = finalY + finalH / 2;
                            data.updateShape(s.id, {
                                x: newCx,
                                y: newCy,
                                width: finalW,
                                height: finalH,
                                scaleX: newScaleX,
                                scaleY: newScaleY
                            }, false);
                        }
                    }
                }
                return;
            }

            if (ui.activeTool === 'select' && !isSelectionBox && ui.selectedShapeIds.size > 0 && !activeHandle) {
                const currWorld = screenToWorld(eff, ui.viewTransform);
                
                // Initialize drag start positions if not already set
                if (!dragStartWorld.current) {
                    dragStartWorld.current = screenToWorld(startPoint, ui.viewTransform);
                    // Store original positions of all selected shapes
                    ui.selectedShapeIds.forEach(id => {
                        const s = data.shapes[id];
                        if (!s) return;
                        if (isConduitAnchoredToNode(s, data.connectionNodes)) {
                            dragStartPositions.current.delete(id);
                            return;
                        }
                        dragStartPositions.current.set(id, {
                            x: s.x ?? 0,
                            y: s.y ?? 0,
                            points: s.points ? [...s.points] : undefined
                        });
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
                ui.selectedShapeIds.forEach(id => {
                    const s = data.shapes[id];
                    if (!s) return;
                    const l = data.layers.find(lay => lay.id === s.layerId);
                    if (l && l.locked) return;
                    if (isConduitAnchoredToNode(s, data.connectionNodes)) return;

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

                    data.updateShape(id, diff, false);
                });
            }
        }

        // Hover feedback for resize/rotate zones (Figma-like)
        if (!isDragging && ui.activeTool === 'select' && ui.selectedShapeIds.size > 0) {
            const inter = detectInteractionAtPoint(worldPos, ui.viewTransform.scale);
            setHoverCursor(inter.cursor);
        } else {
            setHoverCursor(null);
        }
    }, [isMiddlePanning, isDragging, startPoint, activeHandle, snapSettings, gridSize, isShiftPressed, lockedAxis, resizeState, isSelectionBox, rotationState, setHoverCursor, setCurrentPoint, setSnapMarker, dragStartWorld, dragStartPositions, setLockedAxis, setStartPoint, setIsMiddlePanning, applyRotationFromSnapshot, commitRotationHistory, setIsDragging]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        const ui = useUIStore.getState();
        const data = useDataStore.getState();
        const library = useLibraryStore.getState();

        if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); return; }

        const raw = getMousePos(e);
        const worldPos = screenToWorld(raw, ui.viewTransform);

        const conduitToolActive = isConduitTool(ui.activeTool as ToolType);
        if (conduitToolActive) {
            // Conduit creation is handled on mouse down; avoid falling through to generic tool logic
            setIsDragging(false);
            setActiveHandle(null);
            setStartPoint(null);
            setCurrentPoint(null);
            setIsSelectionBox(false);
            setLockedAxis(null);
            dragStartPositions.current.clear();
            dragStartWorld.current = null;
            return;
        }

        if (rotationState.current) {
            const center = rotationState.current.center;
            let angle = Math.atan2(worldPos.y - center.y, worldPos.x - center.x);
            let diff = angle - rotationState.current.startAngle;
            if (e.shiftKey || isShiftPressed) diff = Math.round(diff / (Math.PI / 4)) * (Math.PI / 4);
            applyRotationFromSnapshot(diff);
            commitRotationHistory();
            // Removed redundant syncQuadTree(). updateShape/commitRotationHistory already handles spatial index.
            rotationState.current = null;
            setIsDragging(false);
            setHoverCursor(null);
            return;
        }

        if (isSelectionBox && startPoint && currentPoint) {
            if (getDistance(startPoint, currentPoint) > 2) {
                const ws = screenToWorld(startPoint, ui.viewTransform); const we = screenToWorld(currentPoint, ui.viewTransform);
                const { rect, direction } = getSelectionRect(ws, we);
                const mode = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
                const nSel = e.shiftKey ? new Set(ui.selectedShapeIds) : new Set<string>();

                const candidates = data.spatialIndex.query(rect).map(c => data.shapes[c.id]).filter(s => !!s);
                candidates.forEach(s => {
                    const l = data.layers.find(lay => lay.id === s.layerId);
                    if (l && (!l.visible || l.locked)) return;
                    
                    // Strict Isolation: Do not select referenced shapes from other disciplines
                    const shapeDisc = s.discipline || 'electrical';
                    if (shapeDisc !== ui.activeDiscipline) return;

                    if (isShapeInSelection(s, rect, mode)) nSel.add(s.id);
                });
                ui.setSelectedShapeIds(nSel);
            }
            setIsSelectionBox(false); setStartPoint(null); return;
        }

        if (!startPoint || !currentPoint) { setIsDragging(false); setActiveHandle(null); return; }

        const ws = screenToWorld(startPoint, ui.viewTransform); const we = screenToWorld(currentPoint, ui.viewTransform);
        const dist = getDistance(startPoint, currentPoint);

        if (isDragging && (ui.activeTool === 'select' || activeHandle)) {
            // Removed redundant syncQuadTree(). updateShape already handles spatial index.
        }

        setIsDragging(false); setActiveHandle(null);
        // Reset axis lock state when drag ends
        setLockedAxis(null);
        dragStartPositions.current.clear();
        dragStartWorld.current = null;

        if (ui.activeTool === 'electrical-symbol') {
            const symbolId = ui.activeElectricalSymbolId;
            const librarySymbol = symbolId ? library.electricalSymbols[symbolId] : null;
            if (librarySymbol) {
                const layerConfig = getElectricalLayerConfig(librarySymbol.id, librarySymbol.category);
                const targetLayerId = data.ensureLayer(layerConfig.name, {
                    strokeColor: layerConfig.strokeColor,
                    fillColor: layerConfig.fillColor ?? '#ffffff',
                    fillEnabled: layerConfig.fillEnabled ?? false,
                    strokeEnabled: true,
                    isNative: true,
                });
                const width = librarySymbol.viewBox.width * librarySymbol.scale;
                const height = librarySymbol.viewBox.height * librarySymbol.scale;
                const shapeId = generateId();
                const n: Shape = {
                    id: shapeId,
                    layerId: targetLayerId,
                    type: 'rect',
                    x: ws.x - width / 2,
                    y: ws.y - height / 2,
                    width,
                    height,
                    strokeColor: layerConfig.strokeColor,
                    strokeWidth,
                    strokeEnabled: false,
                    fillColor: 'transparent',
                    colorMode: getDefaultColorMode(),
                    points: [],
                    rotation: ui.electricalRotation,
                    scaleX: ui.electricalFlipX,
                    scaleY: ui.electricalFlipY,
                    svgSymbolId: librarySymbol.id,
                    svgRaw: librarySymbol.canvasSvg,
                    svgViewBox: librarySymbol.viewBox,
                    symbolScale: librarySymbol.scale,
                    connectionPoint: librarySymbol.defaultConnectionPoint,
                    floorId: ui.activeFloorId,
                    discipline: ui.activeDiscipline
                };

                const metadata = getDefaultMetadataForSymbol(librarySymbol.id);
                const electricalElement: ElectricalElement = {
                    id: `el-${shapeId}`,
                    shapeId,
                    category: librarySymbol.category,
                    name: librarySymbol.id,
                    metadata,
                };

                const prevCenter = lastPlacedComponentCenter.current;
                const newCenter = { x: n.x + n.width / 2, y: n.y + n.height / 2 };
                if (prevCenter) {
                    lastComponentAxis.current = computeAxisFromDelta({ x: newCenter.x - prevCenter.x, y: newCenter.y - prevCenter.y });
                }
                lastPlacedComponentCenter.current = newCenter;
                shiftAxisLock.current = null;
                data.addShape(n, electricalElement);
                ui.setSelectedShapeIds(new Set([shapeId]));
                ui.setSidebarTab('desenho');
            }
            setStartPoint(null);
            setHoverCursor(null);
            return;
        }

        const shapeCreationTools = ['circle', 'rect', 'polygon', 'arc'];
        const isSingleClick = dist < 5;

        if (!['select', 'pan', 'polyline', 'measure', 'line', 'move', 'rotate', 'arrow'].includes(ui.activeTool)) {

            if (ui.activeTool === 'arc') {
                const pEnd = isSingleClick ? { x: ws.x + 100, y: ws.y } : we;
                setArcPoints({ start: ws, end: pEnd });
                const screenPos = worldToScreen(pEnd, ui.viewTransform);
                setRadiusModalPos({ x: screenPos.x, y: screenPos.y });
                setShowRadiusModal(true);
                setStartPoint(null);
                return;
            }

            if (ui.activeTool === 'text') {
                setTextEditState({ x: ws.x, y: ws.y, content: '' });
                const setEditingTextId = useUIStore.getState().setEditingTextId;
                setEditingTextId(null);
                setStartPoint(null);
                return;
            }

            const n: Shape = { 
                id: generateId(),
                layerId: data.activeLayerId, 
                type: ui.activeTool, 
                strokeColor, 
                strokeWidth, 
                strokeEnabled, 
                fillColor, 
                colorMode: getDefaultColorMode(), 
                points: [],
                floorId: ui.activeFloorId,
                discipline: ui.activeDiscipline
            };

            if (isSingleClick && shapeCreationTools.includes(ui.activeTool)) {
                if (ui.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = 50; }
                else if (ui.activeTool === 'rect') { n.x = ws.x - 50; n.y = ws.y - 50; n.width = 100; n.height = 100; }
                else if (ui.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = 50; n.sides = polygonSides; }
            } else {
                // Apply Shift constraint for proportional shapes (Figma-style)
                let finalEnd = we;
                if ((e.shiftKey || isShiftPressed) && ui.activeTool === 'rect') {
                    finalEnd = constrainToSquare(ws, we);
                }

                if (ui.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); }
                else if (ui.activeTool === 'rect') { 
                    n.x = Math.min(ws.x, finalEnd.x); 
                    n.y = Math.min(ws.y, finalEnd.y); 
                    n.width = Math.abs(finalEnd.x - ws.x); 
                    n.height = Math.abs(finalEnd.y - ws.y); 
                }
                else if (ui.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); n.sides = polygonSides; }
            }

            // For polygon, show modal after creation
            if (ui.activeTool === 'polygon') {
                data.addShape(n);
                setPolygonShapeId(n.id);
                const screenPos = worldToScreen({ x: n.x!, y: n.y! }, ui.viewTransform);
                setPolygonModalPos({ x: screenPos.x + 20, y: screenPos.y - 20 });
                setShowPolygonModal(true);
                ui.setSelectedShapeIds(new Set([n.id]));
                ui.setSidebarTab('desenho');
                // Don't switch tool yet - wait for modal confirmation
            } else {
                data.addShape(n);
                ui.setSidebarTab('desenho');
            }
        }
        setStartPoint(null);
        setHoverCursor(null);
    }, [isMiddlePanning, isSelectionBox, startPoint, currentPoint, isDragging, activeHandle, isShiftPressed, rotationState, strokeColor, strokeWidth, strokeEnabled, fillColor, polygonSides, setStartPoint, setCurrentPoint, setIsDragging, setActiveHandle, setIsSelectionBox, setLockedAxis, commitRotationHistory, setHoverCursor, setArcPoints, setShowRadiusModal, setRadiusModalPos, setTextEditState, setPolygonShapeId, setPolygonModalPos, setShowPolygonModal, applyRotationFromSnapshot]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        const ui = useUIStore.getState();
        const data = useDataStore.getState();

        if (ui.activeTool !== 'select') { finishPolyline(); return; }

        const raw = getMousePos(e);
        const worldPos = screenToWorld(raw, ui.viewTransform);

        const queryRect = { x: worldPos.x - 5, y: worldPos.y - 5, width: 10, height: 10 };
        const candidates = data.spatialIndex.query(queryRect).map(c => data.shapes[c.id]).filter(s => !!s);

        for (let i = candidates.length - 1; i >= 0; i--) {
            const s = candidates[i];
            const l = data.layers.find(layer => layer.id === s.layerId);
            if (l && (!l.visible || l.locked)) continue;
            if (s.type === 'text') {
                if (isPointInShape(worldPos, s, ui.viewTransform.scale, l)) {
                    setTextEditState({ id: s.id, x: s.x!, y: s.y!, content: s.textContent || '', width: s.width, height: s.height });
                    const setEditingTextId = useUIStore.getState().setEditingTextId;
                    setEditingTextId(s.id);
                    return;
                }
            }
        }
    }, [finishPolyline, setTextEditState]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        const ui = useUIStore.getState();
        e.preventDefault();

        const raw = getMousePos(e);
        const newTransform = calculateZoomTransform(
            ui.viewTransform,
            raw,
            e.deltaY,
            screenToWorld
        );

        ui.setViewTransform(newTransform);
    }, []);

    // Handler to confirm calibration
    const confirmCalibration = useCallback((realDistanceCm: number) => {
        if (calibrationPoints) {
            const currentDistPx = getDistance(calibrationPoints.start, calibrationPoints.end);
            if (currentDistPx > 0) {
                // We assume 1 unit = 1 pixel initially.
                // We want to scale the PLAN so that currentDistPx becomes realDistanceCm (or proportional).
                // Actually, in this system, 1 unit = 1 pixel.
                // If the user says "This 100px line is actually 500cm", then 1 pixel = 5cm.
                // But we want to KEEP the world scale (e.g. 1 unit = 1cm).
                // So we need to scale the IMAGE so that the 100px line becomes 500 units long.
                // Scale Factor = Target / Current = 500 / 100 = 5.
                
                // Target is realDistanceCm (assuming we want 1 unit = 1cm in our world).
                const scaleFactor = realDistanceCm / currentDistPx;
                
                const currentUIStore = useUIStore.getState();
                const currentDataStore = useDataStore.getState();
                
                // Find the selected plan (architecture discipline)
                const selectedId = currentUIStore.selectedShapeIds.values().next().value;
                if (selectedId) {
                    const shape = currentDataStore.shapes[selectedId];
                    // Only scale if it's a plan/image/rect and architecture
                    if (shape && shape.type === 'rect' && shape.discipline === 'architecture') {
                        const newWidth = (shape.width ?? 0) * scaleFactor;
                        const newHeight = (shape.height ?? 0) * scaleFactor;
                        
                        // We also need to adjust position so the scale happens around the first calibration point?
                        // Or just center? Usually center or top-left.
                        // Let's just scale dimensions for now, user can move it.
                        currentDataStore.updateShape(selectedId, { width: newWidth, height: newHeight });
                        
                        // Reset
                        setCalibrationPoints(null);
                        setShowCalibrationModal(false);
                        currentUIStore.setTool('select');
                        return;
                    }
                }
            }
        }
        setCalibrationPoints(null);
        setShowCalibrationModal(false);
    }, [calibrationPoints]);

    // Handler to confirm polygon sides
    const confirmPolygonSides = useCallback((sides: number) => {
        if (polygonShapeId) {
            useDataStore.getState().updateShape(polygonShapeId, { sides }, true);
        }
        setShowPolygonModal(false);
        setPolygonShapeId(null);
    }, [polygonShapeId]);

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
            isShiftPressed,
            hoverCursor,
            // Calibration
            calibrationPoints,
            showCalibrationModal
        },
        setters: {
            setArcPoints,
            setShowRadiusModal,
            setTextEditState,
            setShowPolygonModal,
            confirmPolygonSides,
            // Calibration
            setShowCalibrationModal,
            confirmCalibration
        }
    };
};
