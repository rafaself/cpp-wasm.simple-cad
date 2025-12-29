import { useState, useEffect } from 'react';
import type { ViewTransform } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { CommandOp, type BeginDraftPayload } from '@/engine/core/commandBuffer';
import { hexToRgb } from '@/utils/color';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { EntityId } from '@/engine/core/protocol';
import { EntityKind } from '../../../engine/types';

// Legacy Draft type kept for compatibility and UI state tracking
export type Draft = 
  | { kind: 'none' }
  | { kind: 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'polygon'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'polyline'; points: { x: number; y: number }[]; current?: { x: number; y: number } };



const colorToRgb01 = (hex: string): { r: number; g: number; b: number } => {
  const rgb = hexToRgb(hex) ?? { r: 255, g: 255, b: 255 };
  return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
};

export function useDraftHandler(params: {
  activeTool: any;
  viewTransform: ViewTransform;
  snapSettings: any;
  onFinalizeDraw: (entityId: EntityId) => void;
  activeLayerId: number | null;
  runtime: EngineRuntime | null;
}) {
  const { activeTool, runtime } = params;

  // Track draft geometry for UI state
  const [draft, setDraft] = useState<Draft>({ kind: 'none' });
  const [polygonSidesModal, setPolygonSidesModal] = useState<{ center: { x: number; y: number } } | null>(null);
  const [polygonSidesValue, setPolygonSidesValue] = useState<number>(3);

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);

  // Helper to build draft styling
  const buildDraftStyle = (): Omit<BeginDraftPayload, 'kind' | 'x' | 'y' | 'sides' | 'head'> => {
      const stroke = colorToRgb01(toolDefaults.strokeColor ?? '#FFFFFF');
      const fill = colorToRgb01(toolDefaults.fillColor ?? '#D9D9D9');
      return {
          fillR: fill.r, fillG: fill.g, fillB: fill.b, fillA: toolDefaults.fillEnabled !== false ? 1.0 : 0.0,
          strokeR: stroke.r, strokeG: stroke.g, strokeB: stroke.b, strokeA: 1.0,
          strokeEnabled: toolDefaults.strokeEnabled !== false ? 1.0 : 0.0,
          strokeWidthPx: Math.max(1, Math.min(100, toolDefaults.strokeWidth ?? 1)),
      };
  };

  const cancelDraft = () => {
      if (runtime) {
          runtime.apply([{ op: CommandOp.CancelDraft }]);
      }
      setDraft({ kind: 'none' });
  };

  // Reset transient drawing state when switching tools
  useEffect(() => {
    cancelDraft();
  }, [activeTool]);

  const handlePointerDown = (snapped: { x: number; y: number }, button: number, _altKey: boolean) => {
    if (button !== 0 || !runtime) return;

    let kind = 0;
    let sides = 0;
    let head = 0;

    if (activeTool === 'line') kind = EntityKind.Line;
    else if (activeTool === 'rect') kind = EntityKind.Rect;
    else if (activeTool === 'circle') kind = EntityKind.Circle;
    else if (activeTool === 'polygon') {
        kind = EntityKind.Polygon;
        sides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
    }
    else if (activeTool === 'polyline') kind = EntityKind.Polyline;
    else if (activeTool === 'arrow') {
        kind = EntityKind.Arrow;
        head = Math.round(Math.max(16, (toolDefaults.strokeWidth ?? 2) * 10) * 1.1);
    }
    else return;

    // Polyline multi-segment logic: don't restart if active
    if (activeTool === 'polyline' && draft.kind === 'polyline') {
        return;
    }

    const style = buildDraftStyle();

    // Start draft in Engine
    runtime.apply([{
        op: CommandOp.BeginDraft,
        draft: {
            kind,
            x: snapped.x,
            y: snapped.y,
            sides,
            head,
            ...style
        }
    }]);

    // Update local state
    if (activeTool === 'polyline') {
        setDraft({ kind: 'polyline', points: [snapped], current: snapped });
    } else if (activeTool === 'text') {
        // Text handled externally usually, but if we are here...
    } else if (kind !== 0) {
        // Map activeTool to draft kind where possible
        // Simple fallback for visual state tracking
        const k = activeTool === 'circle' ? 'ellipse' : activeTool;
        setDraft({ kind: k, start: snapped, current: snapped } as any);
    }
  };

  const handlePointerMove = (snapped: { x: number; y: number }, _shiftKey: boolean) => {
    if (!runtime) return;
    // We send UpdateDraft constantly. 
    // Optimization: we could throttle this, but for now 60fps cmd buffer is fine.
    
    runtime.apply([{
        op: CommandOp.UpdateDraft,
        pos: { x: snapped.x, y: snapped.y }
    }]);

    // Update local state for tracking
    if (draft.kind !== 'none') {
        setDraft((prev) => {
           if (prev.kind === 'none') return prev;
           if (prev.kind === 'polyline') return { ...prev, current: snapped };
           return { ...prev, current: snapped };
        });
    }
  };

  const handlePointerUp = (snapped: { x: number; y: number }, clickNoDrag: boolean) => {
    if (!runtime) return;

    if (activeTool === 'polyline') {
        // Polyline: Click adds point
        runtime.apply([{
            op: CommandOp.AppendDraftPoint,
            pos: { x: snapped.x, y: snapped.y }
        }]);
        
        // Update local state
        setDraft(prev => {
             if (prev.kind !== 'polyline') return prev; 
             return { ...prev, points: [...prev.points, snapped] };
        });
        return;
    }

    if (activeTool === 'polygon' && clickNoDrag) {
        // Special case: Open modal
        cancelDraft(); // Cancel the drag-start
        const sides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
        setPolygonSidesValue(sides);
        setPolygonSidesModal({ center: snapped });
        return;
    }
    
    // For other tools, pointer up means commit
    if (clickNoDrag) {
        // Create default shape
        runtime.apply([
            { op: CommandOp.UpdateDraft, pos: { x: snapped.x + 50, y: snapped.y + 50 } },
            { op: CommandOp.CommitDraft }
        ]);
    } else {
        runtime.apply([{ op: CommandOp.CommitDraft }]);
    }
    setDraft({ kind: 'none' });
  };

  // Helper for Polyline finish (e.g. on Enter key)
  const commitPolyline = (_points: {x:number, y:number}[]) => {
      // If we are in engine draft mode, we just commit.
      // Ignoring arguments for legacy compat if called from outside.
      if (runtime) runtime.apply([{ op: CommandOp.CommitDraft }]);
      setDraft({ kind: 'none' });
  };

  const commitDefaultPolygonAt = (center: { x: number; y: number }, sides: number) => {
      if (!runtime) return;
      const r = 50;
      // Use direct upsert for one-shot creation
      const engineId = runtime.allocateEntityId();
      const style = buildDraftStyle();
      runtime.apply([
          { 
            op: CommandOp.BeginDraft, 
            draft: { 
                kind: EntityKind.Polygon,
                x: center.x - r, y: center.y - r, 
                sides, head: 0, 
                ...style 
            } 
          },
          { op: CommandOp.UpdateDraft, pos: { x: center.x + r, y: center.y + r } },
          { op: CommandOp.CommitDraft }
      ]);
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
