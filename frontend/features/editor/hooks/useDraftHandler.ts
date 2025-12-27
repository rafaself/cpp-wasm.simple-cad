import { useRef, useState, useEffect } from 'react';
import type { ViewTransform } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { CommandOp, type EngineCommand } from '@/engine/core/commandBuffer';
import { hexToRgb } from '@/utils/color';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { EntityId } from '@/engine/core/protocol';

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

const colorToRgb01 = (hex: string): { r: number; g: number; b: number } => {
  const rgb = hexToRgb(hex) ?? { r: 255, g: 255, b: 255 };
  return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
};

const buildStroke = (hex: string, enabled: boolean, width?: number) => {
  const stroke = colorToRgb01(hex);
  const strokeEnabled = enabled ? 1 : 0;
  const strokeWidthPx = Math.max(1, Math.min(100, Math.round(width ?? 1)));
  return { stroke, strokeEnabled, strokeWidthPx };
};

const buildFill = (hex: string, enabled: boolean) => {
  const fill = colorToRgb01(hex);
  const fillA = enabled ? 1.0 : 0.0;
  return { fill, fillA };
};

export function useDraftHandler(params: {
  activeTool: any;
  viewTransform: ViewTransform;
  snapSettings: any;
  onFinalizeDraw: (entityId: EntityId) => void;
  activeLayerId: number | null;
  runtime: EngineRuntime | null;
}) {
  const { activeTool, onFinalizeDraw, activeLayerId, runtime } = params;

  const [draft, setDraft] = useState<Draft>({ kind: 'none' });
  const draftRef = useRef<Draft>({ kind: 'none' });
  const [polygonSidesModal, setPolygonSidesModal] = useState<{ center: { x: number; y: number } } | null>(null);
  const [polygonSidesValue, setPolygonSidesValue] = useState<number>(3);

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);

  const applyCommand = (engineId: EntityId, command: EngineCommand) => {
    if (!runtime) return false;
    runtime.apply([command]);
    if (activeLayerId !== null && runtime.engine.setEntityLayer) {
      runtime.engine.setEntityLayer(engineId, activeLayerId);
    }
    onFinalizeDraw(engineId);
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
    const { stroke, strokeEnabled, strokeWidthPx } = buildStroke(
      toolDefaults.strokeColor ?? '#FFFFFF',
      toolDefaults.strokeEnabled !== false,
      toolDefaults.strokeWidth,
    );

    const command: EngineCommand = {
      op: CommandOp.UpsertLine,
      id: engineId,
      line: {
        x0: clampTiny(start.x),
        y0: clampTiny(start.y),
        x1: clampTiny(end.x),
        y1: clampTiny(end.y),
        r: stroke.r,
        g: stroke.g,
        b: stroke.b,
        a: 1.0,
        enabled: strokeEnabled,
        strokeWidthPx,
      },
    };

    applyCommand(engineId, command);
  };

  const commitRect = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const r = normalizeRect(start, end);
    if (r.w < 1e-3 || r.h < 1e-3) return;
    if (!runtime) return;

    const engineId = runtime.allocateEntityId();
    const { stroke, strokeEnabled, strokeWidthPx } = buildStroke(
      toolDefaults.strokeColor ?? '#FFFFFF',
      toolDefaults.strokeEnabled !== false,
      toolDefaults.strokeWidth,
    );
    const { fill, fillA } = buildFill(
      toolDefaults.fillColor ?? '#D9D9D9',
      toolDefaults.fillEnabled !== false,
    );

    const command: EngineCommand = {
      op: CommandOp.UpsertRect,
      id: engineId,
      rect: {
        x: clampTiny(r.x),
        y: clampTiny(r.y),
        w: clampTiny(r.w),
        h: clampTiny(r.h),
        fillR: fill.r,
        fillG: fill.g,
        fillB: fill.b,
        fillA,
        strokeR: stroke.r,
        strokeG: stroke.g,
        strokeB: stroke.b,
        strokeA: 1.0,
        strokeEnabled,
        strokeWidthPx,
      },
    };

    applyCommand(engineId, command);
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
    const { stroke, strokeEnabled, strokeWidthPx } = buildStroke(
      toolDefaults.strokeColor ?? '#FFFFFF',
      toolDefaults.strokeEnabled !== false,
      toolDefaults.strokeWidth,
    );
    const { fill, fillA } = buildFill(
      toolDefaults.fillColor ?? '#D9D9D9',
      toolDefaults.fillEnabled !== false,
    );

    const command: EngineCommand = {
      op: CommandOp.UpsertCircle,
      id: engineId,
      circle: {
        cx: clampTiny(r.x + r.w / 2),
        cy: clampTiny(r.y + r.h / 2),
        rx: clampTiny(r.w / 2),
        ry: clampTiny(r.h / 2),
        rot: 0,
        sx: 1,
        sy: 1,
        fillR: fill.r,
        fillG: fill.g,
        fillB: fill.b,
        fillA,
        strokeR: stroke.r,
        strokeG: stroke.g,
        strokeB: stroke.b,
        strokeA: 1.0,
        strokeEnabled,
        strokeWidthPx,
      },
    };

    applyCommand(engineId, command);
  };

  const commitDefaultEllipseAt = (center: { x: number; y: number }) => {
    const half = 50;
    commitEllipse({ x: center.x - half, y: center.y - half }, { x: center.x + half, y: center.y + half });
  };

  const commitPolygon = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const r = normalizeRect(start, end);
    if (r.w < 1e-3 || r.h < 1e-3) return;
    if (!runtime) return;

    const engineId = runtime.allocateEntityId();
    const { stroke, strokeEnabled, strokeWidthPx } = buildStroke(
      toolDefaults.strokeColor ?? '#FFFFFF',
      toolDefaults.strokeEnabled !== false,
      toolDefaults.strokeWidth,
    );
    const { fill, fillA } = buildFill(
      toolDefaults.fillColor ?? '#D9D9D9',
      toolDefaults.fillEnabled !== false,
    );
    const clampedSides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
    const rotation = clampedSides === 3 ? Math.PI : 0;

    const command: EngineCommand = {
      op: CommandOp.UpsertPolygon,
      id: engineId,
      polygon: {
        cx: clampTiny(r.x + r.w / 2),
        cy: clampTiny(r.y + r.h / 2),
        rx: clampTiny(r.w / 2),
        ry: clampTiny(r.h / 2),
        rot: rotation,
        sx: 1,
        sy: 1,
        sides: clampedSides,
        fillR: fill.r,
        fillG: fill.g,
        fillB: fill.b,
        fillA,
        strokeR: stroke.r,
        strokeG: stroke.g,
        strokeB: stroke.b,
        strokeA: 1.0,
        strokeEnabled,
        strokeWidthPx,
      },
    };

    applyCommand(engineId, command);
  };

  const commitDefaultPolygonAt = (center: { x: number; y: number }, sides: number) => {
    if (!runtime) return;
    const half = 50;
    const start = { x: center.x - half, y: center.y - half };
    const end = { x: center.x + half, y: center.y + half };
    const r = normalizeRect(start, end);
    if (r.w < 1e-3 || r.h < 1e-3) return;

    const engineId = runtime.allocateEntityId();
    const { stroke, strokeEnabled, strokeWidthPx } = buildStroke(
      toolDefaults.strokeColor ?? '#FFFFFF',
      toolDefaults.strokeEnabled !== false,
      toolDefaults.strokeWidth,
    );
    const { fill, fillA } = buildFill(
      toolDefaults.fillColor ?? '#D9D9D9',
      toolDefaults.fillEnabled !== false,
    );
    const clampedSides = Math.max(3, Math.min(24, Math.floor(sides)));
    const rotation = clampedSides === 3 ? Math.PI : 0;

    const command: EngineCommand = {
      op: CommandOp.UpsertPolygon,
      id: engineId,
      polygon: {
        cx: clampTiny(r.x + r.w / 2),
        cy: clampTiny(r.y + r.h / 2),
        rx: clampTiny(r.w / 2),
        ry: clampTiny(r.h / 2),
        rot: rotation,
        sx: 1,
        sy: 1,
        sides: clampedSides,
        fillR: fill.r,
        fillG: fill.g,
        fillB: fill.b,
        fillA,
        strokeR: stroke.r,
        strokeG: stroke.g,
        strokeB: stroke.b,
        strokeA: 1.0,
        strokeEnabled,
        strokeWidthPx,
      },
    };

    applyCommand(engineId, command);
  };

  const commitPolyline = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return;
    if (!runtime) return;

    const engineId = runtime.allocateEntityId();
    const { stroke, strokeEnabled, strokeWidthPx } = buildStroke(
      toolDefaults.strokeColor ?? '#FFFFFF',
      toolDefaults.strokeEnabled !== false,
      toolDefaults.strokeWidth,
    );

    const command: EngineCommand = {
      op: CommandOp.UpsertPolyline,
      id: engineId,
      polyline: {
        points: points.map((p) => ({ x: clampTiny(p.x), y: clampTiny(p.y) })),
        r: stroke.r,
        g: stroke.g,
        b: stroke.b,
        a: 1.0,
        enabled: strokeEnabled,
        strokeWidthPx,
      },
    };

    applyCommand(engineId, command);
  };

  const commitArrow = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.hypot(dx, dy) < 1e-3) return;
    if (!runtime) return;

    const engineId = runtime.allocateEntityId();
    const { stroke, strokeEnabled, strokeWidthPx } = buildStroke(
      toolDefaults.strokeColor ?? '#FFFFFF',
      toolDefaults.strokeEnabled !== false,
      toolDefaults.strokeWidth ?? 2,
    );
    const head = Math.round(Math.max(16, strokeWidthPx * 10) * 1.1);

    const command: EngineCommand = {
      op: CommandOp.UpsertArrow,
      id: engineId,
      arrow: {
        ax: clampTiny(start.x),
        ay: clampTiny(start.y),
        bx: clampTiny(end.x),
        by: clampTiny(end.y),
        head,
        strokeR: stroke.r,
        strokeG: stroke.g,
        strokeB: stroke.b,
        strokeA: 1.0,
        strokeEnabled,
        strokeWidthPx,
      },
    };

    applyCommand(engineId, command);
  };

  const handlePointerDown = (snapped: { x: number; y: number }, button: number, altKey: boolean) => {
    if (button !== 0) return;

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
    setPolygonSidesValue,
  };
}
