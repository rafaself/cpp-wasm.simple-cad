import { useRef, useState, useEffect } from 'react';
import type { Shape, ViewTransform, Point } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { getDefaultColorMode } from '@/utils/shapeColors';
import { generateId } from '@/utils/uuid';
import { CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX } from '@/config/constants';
import { getConnectionPoint } from '@/features/editor/snapEngine/detectors';
import { resolveConnectionNodePosition } from '@/utils/connections';
import { getDistance, getShapeBoundingBox } from '@/utils/geometry';
import { clampTiny } from '../../utils/interactionHelpers';

export type DrawingState =
  | { kind: 'none' }
  | { kind: 'line'; start: Point; current: Point }
  | { kind: 'rect'; start: Point; current: Point }
  | { kind: 'ellipse'; start: Point; current: Point }
  | { kind: 'polygon'; start: Point; current: Point }
  | { kind: 'polyline'; points: Point[]; current: Point | null }
  | { kind: 'arrow'; start: Point; current: Point }
  | { kind: 'conduit'; start: Point; current: Point }
  | { kind: 'text'; start: Point; current: Point };

type ConduitStart = { nodeId: string; point: Point };

const normalizeRect = (a: Point, b: Point) => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

export function useShapeDrawing(params: {
    activeTool: string;
    onFinalizeDraw?: (id: string) => void;
    activeFloorId: string | null;
    activeDiscipline: 'architecture' | 'electrical';
    runtime: any;
}) {
    const { activeTool, onFinalizeDraw, activeFloorId, activeDiscipline, runtime } = params;

    const [drawingState, setDrawingState] = useState<DrawingState>({ kind: 'none' });
    const drawingRef = useRef<DrawingState>({ kind: 'none' });
    const [conduitStart, setConduitStart] = useState<ConduitStart | null>(null);
    const [polygonSidesModal, setPolygonSidesModal] = useState<{ center: Point } | null>(null);
    const [polygonSidesValue, setPolygonSidesValue] = useState<number>(3);

    const toolDefaults = useSettingsStore((s) => s.toolDefaults);
    const viewTransform = useUIStore((s) => s.viewTransform);

    // Keep ref in sync
    useEffect(() => {
        drawingRef.current = drawingState;
    }, [drawingState]);

    // Reset when tool changes
    useEffect(() => {
        setDrawingState({ kind: 'none' });
        drawingRef.current = { kind: 'none' };
        setConduitStart(null);
    }, [activeTool]);

    const addShape = useDataStore((s) => s.addShape);

    const tryFindAnchoredNode = (world: Point): { nodeId: string; point: Point } | null => {
        const data = useDataStore.getState();
        const scale = Math.max(viewTransform.scale || 1, 0.01);
        const tolerance = CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX / scale;

        if (runtime && typeof runtime.engine.snapElectrical === 'function') {
            try {
                const r = runtime.engine.snapElectrical(world.x, world.y, tolerance);
                if (r.kind === 1 && r.id !== 0) {
                    const nodeStringId = runtime.getIdMaps().idHashToString.get(r.id);
                    if (nodeStringId && data.connectionNodes[nodeStringId]) {
                        return { nodeId: nodeStringId, point: { x: r.x, y: r.y } };
                    }
                }
                if (r.kind === 2 && r.id !== 0) {
                    const symbolStringId = runtime.getIdMaps().idHashToString.get(r.id);
                    if (symbolStringId) {
                        const nodeId = data.getOrCreateAnchoredConnectionNode(symbolStringId);
                        return { nodeId, point: { x: r.x, y: r.y } };
                    }
                }
            } catch {
                // Ignore
            }
        }
        
        // Fallback spatial query
        const queryRect = { x: world.x - tolerance, y: world.y - tolerance, width: tolerance * 2, height: tolerance * 2 };
        const candidates = data.spatialIndex.query(queryRect).map((c) => data.shapes[c.id]).filter(Boolean) as Shape[];

        for (const shape of candidates) {
            const layer = data.layers.find((l) => l.id === shape.layerId);
            if (layer && (!layer.visible || layer.locked)) continue;

            const connPt = getConnectionPoint(shape);
            if (!connPt) continue;

            if (getDistance(connPt, world) <= tolerance) {
                 const nodeId = data.getOrCreateAnchoredConnectionNode(shape.id);
                 return { nodeId, point: connPt };
            }
        }
        return null;
    };

    const commitLine = (start: Point, end: Point) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (Math.hypot(dx, dy) < 1e-3) return;

        const id = generateId();
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const s: Shape = {
            id,
            layerId,
            type: 'line',
            points: [{ x: clampTiny(start.x), y: clampTiny(start.y) }, { x: clampTiny(end.x), y: clampTiny(end.y) }],
            strokeColor: toolDefaults.strokeColor ?? '#FFFFFF',
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled: toolDefaults.strokeEnabled !== false,
            fillColor: 'transparent',
            fillEnabled: false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };
        addShape(s);
        onFinalizeDraw?.(id);
    };

    const commitRect = (start: Point, end: Point) => {
        const r = normalizeRect(start, end);
        if (r.w < 1e-3 || r.h < 1e-3) return;
        const id = generateId();
        const data = useDataStore.getState();
        const s: Shape = {
            id,
            layerId: data.activeLayerId,
            type: 'rect',
            points: [],
            x: clampTiny(r.x),
            y: clampTiny(r.y),
            width: clampTiny(r.w),
            height: clampTiny(r.h),
            strokeColor: toolDefaults.strokeColor ?? '#FFFFFF',
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled: toolDefaults.strokeEnabled !== false,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: toolDefaults.fillEnabled !== false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId,
            discipline: activeDiscipline,
        };
        addShape(s);
        onFinalizeDraw?.(id);
    };

    const commitEllipse = (start: Point, end: Point) => {
        const r = normalizeRect(start, end);
        if (r.w < 1e-3 || r.h < 1e-3) return;
        const id = generateId();
        const data = useDataStore.getState();
        const s: Shape = {
            id,
            layerId: data.activeLayerId,
            type: 'circle',
            points: [],
            x: clampTiny(r.x + r.w / 2),
            y: clampTiny(r.y + r.h / 2),
            width: clampTiny(r.w),
            height: clampTiny(r.h),
            strokeColor: toolDefaults.strokeColor ?? '#FFFFFF',
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled: toolDefaults.strokeEnabled !== false,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: toolDefaults.fillEnabled !== false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId,
            discipline: activeDiscipline,
        };
        addShape(s);
        onFinalizeDraw?.(id);
    };

    const commitPolygon = (start: Point, end: Point, sidesOverride?: number) => {
        const r = normalizeRect(start, end);
        if (r.w < 1e-3 || r.h < 1e-3) return;
        const id = generateId();
        const data = useDataStore.getState();
        const clampedSides = Math.max(3, Math.min(24, Math.floor(sidesOverride ?? toolDefaults.polygonSides ?? 3)));
        const rotation = clampedSides === 3 ? Math.PI : 0;
        const s: Shape = {
            id,
            layerId: data.activeLayerId,
            type: 'polygon',
            points: [],
            x: clampTiny(r.x + r.w / 2),
            y: clampTiny(r.y + r.h / 2),
            width: clampTiny(r.w),
            height: clampTiny(r.h),
            sides: clampedSides,
            rotation,
            strokeColor: toolDefaults.strokeColor ?? '#FFFFFF',
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled: toolDefaults.strokeEnabled !== false,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: toolDefaults.fillEnabled !== false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId,
            discipline: activeDiscipline,
        };
        addShape(s);
        onFinalizeDraw?.(id);
    };

    const commitPolyline = (points: Point[]) => {
        if (points.length < 2) return;
        const id = generateId();
        const data = useDataStore.getState();
        const s: Shape = {
            id,
            layerId: data.activeLayerId,
            type: 'polyline',
            points: points.map(p => ({ x: clampTiny(p.x), y: clampTiny(p.y) })),
            strokeColor: toolDefaults.strokeColor ?? '#FFFFFF',
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled: toolDefaults.strokeEnabled !== false,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId,
            discipline: activeDiscipline,
        };
        addShape(s);
        onFinalizeDraw?.(id);
    };
    
    const commitArrow = (start: Point, end: Point) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (Math.hypot(dx, dy) < 1e-3) return;
        const id = generateId();
        const data = useDataStore.getState();
        const strokeWidth = toolDefaults.strokeWidth ?? 2;
        const s: Shape = {
            id,
            layerId: data.activeLayerId,
            type: 'arrow',
            points: [{ x: clampTiny(start.x), y: clampTiny(start.y) }, { x: clampTiny(end.x), y: clampTiny(end.y) }],
            arrowHeadSize: Math.round(Math.max(16, strokeWidth * 10) * 1.1),
            strokeColor: toolDefaults.strokeColor ?? '#FFFFFF',
            strokeWidth,
            strokeEnabled: toolDefaults.strokeEnabled !== false,
            fillColor: 'transparent',
            fillEnabled: false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };
        addShape(s);
        onFinalizeDraw?.(id);
    };

    const commitConduitSegmentTo = (end: Point) => {
        const start = conduitStart;
        if (!start) return;

        const data = useDataStore.getState();
        const endHit = tryFindAnchoredNode(end);
        const endNodeId = endHit ? endHit.nodeId : data.createFreeConnectionNode(end);

        if (endNodeId === start.nodeId) {
            setConduitStart(null);
            setDrawingState({ kind: 'none' });
            return;
        }

        const layer = data.layers.find((l) => l.id === 'eletrodutos') ?? data.layers.find((l) => l.id === data.activeLayerId) ?? data.layers[0];
        const layerId = layer?.id ?? data.activeLayerId;
        const strokeColor = layer?.strokeColor ?? toolDefaults.strokeColor;

        const conduitId = data.addConduitBetweenNodes({ fromNodeId: start.nodeId, toNodeId: endNodeId, layerId, strokeColor });
        onFinalizeDraw?.(conduitId);
        setConduitStart(null);
        setDrawingState({ kind: 'none' });
    };

    const handlePointerDown = (snapped: Point, button: number) => {
        if (button !== 0) return;

        if (activeTool === 'line') {
            setDrawingState({ kind: 'line', start: snapped, current: snapped });
        } else if (activeTool === 'rect') {
            setDrawingState({ kind: 'rect', start: snapped, current: snapped });
        } else if (activeTool === 'circle') {
            setDrawingState({ kind: 'ellipse', start: snapped, current: snapped });
        } else if (activeTool === 'polygon') {
            setDrawingState({ kind: 'polygon', start: snapped, current: snapped });
        } else if (activeTool === 'polyline') {
            setDrawingState((prev) => {
                const points = prev.kind === 'polyline' ? prev.points : [];
                return { kind: 'polyline', points: [...points, snapped], current: snapped };
            });
        } else if (activeTool === 'arrow') {
            setDrawingState({ kind: 'arrow', start: snapped, current: snapped });
        } else if (activeTool === 'eletroduto') {
            if (!conduitStart) {
                const startHit = tryFindAnchoredNode(snapped);
                const startNodeId = startHit ? startHit.nodeId : useDataStore.getState().createFreeConnectionNode(snapped);
                const startPoint = startHit ? startHit.point : snapped;
                setConduitStart({ nodeId: startNodeId, point: startPoint });
                setDrawingState({ kind: 'conduit', start: startPoint, current: startPoint });
            } else {
                commitConduitSegmentTo(snapped);
            }
        } else if (activeTool === 'text') {
             setDrawingState({ kind: 'text', start: snapped, current: snapped });
        }
    };

    const handlePointerMove = (snapped: Point, shiftKey: boolean) => {
        setDrawingState((prev) => {
            if (prev.kind === 'none') return prev;
            if (prev.kind === 'line' || prev.kind === 'arrow' || prev.kind === 'polyline' || prev.kind === 'conduit' || prev.kind === 'text') {
                return { ...prev, current: snapped };
            }
            if (prev.kind === 'rect' || prev.kind === 'ellipse' || prev.kind === 'polygon') {
                 if (!shiftKey) return { ...prev, current: snapped };
                 const dx = snapped.x - prev.start.x;
                 const dy = snapped.y - prev.start.y;
                 const size = Math.max(Math.abs(dx), Math.abs(dy));
                 const sx = dx === 0 ? 1 : Math.sign(dx);
                 const sy = dy === 0 ? 1 : Math.sign(dy);
                 return { ...prev, current: { x: prev.start.x + sx * size, y: prev.start.y + sy * size } };
            }
            return prev;
        });
    };

    const handlePointerUp = (snapped: Point, clickNoDrag: boolean) => {
        const prev = drawingRef.current;
        
        if (activeTool === 'line' && prev.kind === 'line') {
             setDrawingState({ kind: 'none' });
             commitLine(prev.start, prev.current);
        } else if (activeTool === 'rect' && prev.kind === 'rect') {
             setDrawingState({ kind: 'none' });
             if (clickNoDrag) {
                 const half = 50;
                 commitRect({ x: prev.start.x - half, y: prev.start.y - half }, { x: prev.start.x + half, y: prev.start.y + half });
             } else {
                 commitRect(prev.start, prev.current);
             }
        } else if (activeTool === 'circle' && prev.kind === 'ellipse') {
             setDrawingState({ kind: 'none' });
             if (clickNoDrag) {
                 commitEllipse({ x: prev.start.x - 50, y: prev.start.y - 50 }, { x: prev.start.x + 50, y: prev.start.y + 50 });
             } else {
                 commitEllipse(prev.start, prev.current);
             }
        } else if (activeTool === 'polygon' && prev.kind === 'polygon') {
             setDrawingState({ kind: 'none' });
             if (clickNoDrag) {
                 setPolygonSidesValue(toolDefaults.polygonSides ?? 3);
                 setPolygonSidesModal({ center: prev.start });
             } else {
                 commitPolygon(prev.start, prev.current);
             }
        } else if (activeTool === 'arrow' && prev.kind === 'arrow') {
             setDrawingState({ kind: 'none' });
             commitArrow(prev.start, prev.current);
        } else if (activeTool === 'text' && prev.kind === 'text') {
             setDrawingState({ kind: 'none' });
             // Text tool creation logic is handled by the consumer, checking for drag distance
        }
    };
    
    const cancelDraw = () => {
        setDrawingState({ kind: 'none' });
        setConduitStart(null);
    };
    
    const commitPolylineExternal = (points: Point[]) => commitPolyline(points);
    const commitDefaultPolygonAt = (center: Point, sides: number) => {
         // Create default polygon around center
         const half = 50;
         // Actually the commitLogic uses a rect helper, but here we can just pass rect logic
         // Re-use commitPolygon logic but with overrides
         const r = { x: center.x - half, y: center.y - half, w: 100, h: 100 };
         // ... simplified
         const id = generateId();
         const data = useDataStore.getState();
         const clampedSides = Math.max(3, Math.min(24, Math.floor(sides)));
         const rotation = clampedSides === 3 ? Math.PI : 0;
         const s: Shape = {
            id,
            layerId: data.activeLayerId,
            type: 'polygon',
            points: [],
            x: clampTiny(center.x),
            y: clampTiny(center.y),
            width: 100,
            height: 100,
            sides: clampedSides,
            rotation,
            strokeColor: toolDefaults.strokeColor ?? '#FFFFFF',
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled: toolDefaults.strokeEnabled !== false,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: toolDefaults.fillEnabled !== false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId,
            discipline: activeDiscipline,
        };
        addShape(s);
        onFinalizeDraw?.(id);
    };

    return {
        drawingState,
        setDrawingState,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        cancelDraw,
        commitPolyline: commitPolylineExternal,
        commitDefaultPolygonAt,
        polygonSidesModal,
        setPolygonSidesModal,
        polygonSidesValue,
        setPolygonSidesValue
    };
}
