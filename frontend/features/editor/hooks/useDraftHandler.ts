import { useRef, useState, useEffect } from 'react';
import type { Shape, ViewTransform } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useDataStore } from '@/stores/useDataStore';
import { getDefaultColorMode } from '@/utils/shapeColors';
import { shapeToEngineCommand } from '@/engine/core/useEngineStoreSync';
import { registerEngineId } from '@/engine/core/IdRegistry';
import { ensureLayerEngineId, getLayerEngineId } from '@/engine/core/LayerRegistry';
import { EngineLayerFlags, LayerPropMask } from '@/engine/core/protocol';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';

export type Draft =
  | { kind: 'none' }
  | { kind: 'line'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'rect'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'ellipse'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'polygon'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'polyline'; points: { x: number; y: number }[]; current: { x: number; y: number } | null }
  | { kind: 'arrow'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'text'; start: { x: number; y: number }; current: { x: number; y: number } };

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

export function useDraftHandler(params: {
    activeTool: any;
    viewTransform: ViewTransform;
    snapSettings: any;
    onAddShape: (shape: Shape) => void;
    onFinalizeDraw: (id: string) => void;
    activeFloorId: string | null;
    activeDiscipline: 'architecture';
    runtime: EngineRuntime | null;
}) {
    const { activeTool, onAddShape, onFinalizeDraw, activeFloorId, activeDiscipline } = params;
    const runtime = params.runtime;

    const [draft, setDraft] = useState<Draft>({ kind: 'none' });
    const draftRef = useRef<Draft>({ kind: 'none' });
    const [polygonSidesModal, setPolygonSidesModal] = useState<{ center: { x: number; y: number } } | null>(null);
    const [polygonSidesValue, setPolygonSidesValue] = useState<number>(3);

    const toolDefaults = useSettingsStore((s) => s.toolDefaults);

    const ensureEngineLayer = (layerId: string) => {
        if (!runtime) return null;
        const data = useDataStore.getState();
        const layer = data.layers.find((l) => l.id === layerId) ?? null;
        const engineLayerId = getLayerEngineId(layerId) ?? ensureLayerEngineId(layerId);
        if (runtime.engine.setLayerProps) {
            const flags =
                (layer?.visible ? EngineLayerFlags.Visible : 0) |
                (layer?.locked ? EngineLayerFlags.Locked : 0);
            runtime.engine.setLayerProps(
                engineLayerId,
                LayerPropMask.Name | LayerPropMask.Visible | LayerPropMask.Locked,
                flags,
                layer?.name ?? 'Layer'
            );
        }
        return engineLayerId;
    };

    const applyShapeToEngine = (shape: Shape, engineId: number) => {
        if (!runtime) return false;
        const data = useDataStore.getState();
        const layer = data.layers.find((l) => l.id === shape.layerId) ?? null;
        const cmd = shapeToEngineCommand(shape, layer, () => engineId);
        if (!cmd) return false;
        runtime.apply([cmd]);
        const engineLayerId = ensureEngineLayer(shape.layerId);
        if (engineLayerId !== null && runtime.engine.setEntityLayer) {
            runtime.engine.setEntityLayer(engineId, engineLayerId);
        }
        return true;
    };

    // Reset transient drawing state when switching tools
    useEffect(() => {
        setDraft({ kind: 'none' });
        draftRef.current = { kind: 'none' };
    }, [activeTool]);

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    const commitLine = (start: { x: number; y: number }, end: { x: number; y: number }) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (Math.hypot(dx, dy) < 1e-3) return;
        if (!runtime) return;

        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;

        const s: Shape = {
            id,
            layerId,
            type: 'line',
            points: [
                { x: clampTiny(start.x), y: clampTiny(start.y) },
                { x: clampTiny(end.x), y: clampTiny(end.y) },
            ],
            strokeColor,
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const commitRect = (start: { x: number; y: number }, end: { x: number; y: number }) => {
        const r = normalizeRect(start, end);
        if (r.w < 1e-3 || r.h < 1e-3) return;
        if (!runtime) return;

        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;
        const fillEnabled = toolDefaults.fillEnabled !== false;

        const s: Shape = {
            id,
            layerId,
            type: 'rect',
            points: [],
            x: clampTiny(r.x),
            y: clampTiny(r.y),
            width: clampTiny(r.w),
            height: clampTiny(r.h),
            strokeColor,
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled,
            fillColor,
            fillEnabled,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const commitDefaultRectAt = (center: { x: number; y: number }) => {
        const half = 50;
        commitRect({ x: center.x - half, y: center.y - half }, { x: center.x + half, y: center.y + half });
    };

    const commitEllipse = (start: { x: number; y: number }, end: { x: number; y: number }) => {
        const r = normalizeRect(start, end);
        if (r.w < 1e-3 || r.h < 1e-3) return;
        if (!runtime) return;

        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;
        const fillEnabled = toolDefaults.fillEnabled !== false;

        const s: Shape = {
            id,
            layerId,
            type: 'circle',
            points: [],
            x: clampTiny(r.x + r.w / 2),
            y: clampTiny(r.y + r.h / 2),
            width: clampTiny(r.w),
            height: clampTiny(r.h),
            strokeColor,
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled,
            fillColor,
            fillEnabled,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const commitDefaultEllipseAt = (center: { x: number; y: number }) => {
        if (!runtime) return;
        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;
        const fillEnabled = toolDefaults.fillEnabled !== false;

        const s: Shape = {
            id,
            layerId,
            type: 'circle',
            points: [],
            x: clampTiny(center.x),
            y: clampTiny(center.y),
            width: 100,
            height: 100,
            strokeColor,
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled,
            fillColor,
            fillEnabled,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const commitPolygon = (start: { x: number; y: number }, end: { x: number; y: number }) => {
        const r = normalizeRect(start, end);
        if (r.w < 1e-3 || r.h < 1e-3) return;
        if (!runtime) return;

        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;
        const fillEnabled = toolDefaults.fillEnabled !== false;
        const clampedSides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
        const rotation = clampedSides === 3 ? Math.PI : 0;

        const s: Shape = {
            id,
            layerId,
            type: 'polygon',
            points: [],
            x: clampTiny(r.x + r.w / 2),
            y: clampTiny(r.y + r.h / 2),
            width: clampTiny(r.w),
            height: clampTiny(r.h),
            sides: clampedSides,
            rotation,
            strokeColor,
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled,
            fillColor,
            fillEnabled,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const commitDefaultPolygonAt = (center: { x: number; y: number }, sides: number) => {
        if (!runtime) return;
        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const fillColor = toolDefaults.fillColor ?? '#D9D9D9';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;
        const fillEnabled = toolDefaults.fillEnabled !== false;
        const clampedSides = Math.max(3, Math.min(24, Math.floor(sides)));
        const rotation = clampedSides === 3 ? Math.PI : 0;

        const s: Shape = {
            id,
            layerId,
            type: 'polygon',
            points: [],
            x: clampTiny(center.x),
            y: clampTiny(center.y),
            width: 100,
            height: 100,
            sides: clampedSides,
            rotation,
            strokeColor,
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled,
            fillColor,
            fillEnabled,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const commitPolyline = (points: { x: number; y: number }[]) => {
        if (points.length < 2) return;
        if (!runtime) return;

        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;
        const s: Shape = {
            id,
            layerId,
            type: 'polyline',
            points: points.map((p) => ({ x: clampTiny(p.x), y: clampTiny(p.y) })),
            strokeColor,
            strokeWidth: toolDefaults.strokeWidth,
            strokeEnabled,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const commitArrow = (start: { x: number; y: number }, end: { x: number; y: number }) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        if (Math.hypot(dx, dy) < 1e-3) return;
        if (!runtime) return;

        const engineId = runtime.allocateEntityId();
        const id = `entity-${engineId}`;
        registerEngineId(engineId, id);
        const data = useDataStore.getState();
        const layerId = data.activeLayerId;
        const strokeColor = toolDefaults.strokeColor ?? '#FFFFFF';
        const strokeEnabled = toolDefaults.strokeEnabled !== false;
        const strokeWidth = toolDefaults.strokeWidth ?? 2;

        const s: Shape = {
            id,
            layerId,
            type: 'arrow',
            points: [
                { x: clampTiny(start.x), y: clampTiny(start.y) },
                { x: clampTiny(end.x), y: clampTiny(end.y) },
            ],
            arrowHeadSize: Math.round(Math.max(16, strokeWidth * 10) * 1.1),
            strokeColor,
            strokeWidth,
            strokeEnabled,
            fillColor: toolDefaults.fillColor ?? '#D9D9D9',
            fillEnabled: false,
            colorMode: getDefaultColorMode(),
            floorId: activeFloorId ?? undefined,
            discipline: activeDiscipline,
        };

        if (!applyShapeToEngine(s, engineId)) return;
        onAddShape(s);
        onFinalizeDraw(id);
    };

    const handlePointerDown = (snapped: { x: number; y: number }, button: number, altKey: boolean) => {
        if (button !== 0) return;

        // Logic for tools
        if (activeTool === 'line') {
            setDraft({ kind: 'line', start: snapped, current: snapped });
            return;
        }

        if (activeTool === 'rect') {
            setDraft({ kind: 'rect', start: snapped, current: snapped });
            return;
        }

        if (activeTool === 'circle') {
            setDraft({ kind: 'ellipse', start: snapped, current: snapped });
            return;
        }

        if (activeTool === 'polygon') {
            setDraft({ kind: 'polygon', start: snapped, current: snapped });
            return;
        }

        if (activeTool === 'polyline') {
            setDraft((prev) => {
                if (prev.kind !== 'polyline') return { kind: 'polyline', points: [snapped], current: snapped };
                return { kind: 'polyline', points: [...prev.points, snapped], current: snapped };
            });
            return;
        }

        if (activeTool === 'arrow') {
            setDraft({ kind: 'arrow', start: snapped, current: snapped });
            return;
        }
    };

    const handlePointerMove = (snapped: { x: number; y: number }, shiftKey: boolean) => {
        setDraft((prev) => {
            if (prev.kind === 'line') return { ...prev, current: snapped };
            if (prev.kind === 'arrow') return { ...prev, current: snapped };
            if (prev.kind === 'rect' || prev.kind === 'ellipse' || prev.kind === 'polygon') {
                if (!shiftKey) return { ...prev, current: snapped };
                const dx = snapped.x - prev.start.x;
                const dy = snapped.y - prev.start.y;
                const size = Math.max(Math.abs(dx), Math.abs(dy));
                const sx = dx === 0 ? 1 : Math.sign(dx);
                const sy = dy === 0 ? 1 : Math.sign(dy);
                return { ...prev, current: { x: prev.start.x + sx * size, y: prev.start.y + sy * size } };
            }
            if (prev.kind === 'polyline') return { ...prev, current: snapped };
            return prev;
        });
    };

    const handlePointerUp = (snapped: { x: number; y: number }, clickNoDrag: boolean) => {
        if (activeTool === 'line') {
            const prev = draftRef.current;
            setDraft({ kind: 'none' });
            if (prev.kind === 'line') commitLine(prev.start, prev.current);
            return;
        }

        if (activeTool === 'rect') {
            const prev = draftRef.current;
            setDraft({ kind: 'none' });
            if (prev.kind === 'rect') {
                if (clickNoDrag) commitDefaultRectAt(prev.start);
                else commitRect(prev.start, prev.current);
            }
            return;
        }

        if (activeTool === 'circle') {
            const prev = draftRef.current;
            setDraft({ kind: 'none' });
            if (prev.kind === 'ellipse') {
                if (clickNoDrag) commitDefaultEllipseAt(prev.start);
                else commitEllipse(prev.start, prev.current);
            }
            return;
        }

        if (activeTool === 'polygon') {
            const prev = draftRef.current;
            setDraft({ kind: 'none' });
            if (prev.kind === 'polygon') {
                if (clickNoDrag) {
                    const clampedSides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
                    setPolygonSidesValue(clampedSides);
                    setPolygonSidesModal({ center: prev.start });
                } else {
                    commitPolygon(prev.start, prev.current);
                }
            }
            return;
        }

        if (activeTool === 'arrow') {
            const prev = draftRef.current;
            setDraft({ kind: 'none' });
            if (prev.kind === 'arrow') commitArrow(prev.start, prev.current);
            return;
        }
    };

    return {
        draft,
        setDraft,
        handlePointerDown,
        handlePointerMove,
        handlePointerUp,
        commitPolyline,
        commitDefaultPolygonAt,
        polygonSidesModal,
        setPolygonSidesModal,
        polygonSidesValue,
        setPolygonSidesValue
    };
}
