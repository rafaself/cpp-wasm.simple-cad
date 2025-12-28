import { useRef, useState, useEffect } from 'react';
import type { ViewTransform } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { CommandOp, type EngineCommand, type BeginDraftPayload } from '@/engine/core/commandBuffer';
import { hexToRgb } from '@/utils/color';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { EntityId } from '@/engine/core/protocol';
import { EntityKind } from '@/engine/types'; // Assuming this maps to C++ EntityKind

// Legacy Draft type kept for compatibility but effectively unused for rendering
export type Draft = { kind: 'none' }; // Reduced to minimal

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

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
  const { activeTool, onFinalizeDraw, activeLayerId, runtime } = params;

  // We no longer track draft geometry in React. Engine handles it.
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
  };

  // Reset transient drawing state when switching tools
  useEffect(() => {
    cancelDraft();
  }, [activeTool]);

  const handlePointerDown = (snapped: { x: number; y: number }, button: number, altKey: boolean) => {
    if (button !== 0 || !runtime) return;

    let kind = 0;
    let sides = 0;
    let head = 0;

    if (activeTool === 'line') kind = 2; // EntityKind::Line
    else if (activeTool === 'rect') kind = 1; // EntityKind::Rect
    else if (activeTool === 'circle') kind = 7; // EntityKind::Circle
    else if (activeTool === 'polygon') {
        kind = 8; // EntityKind::Polygon
        sides = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
    }
    else if (activeTool === 'polyline') kind = 3; // EntityKind::Polyline
    else if (activeTool === 'arrow') {
        kind = 9; // EntityKind::Arrow
        head = Math.round(Math.max(16, (toolDefaults.strokeWidth ?? 2) * 10) * 1.1);
    }
    else return;

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
  };

  const handlePointerMove = (snapped: { x: number; y: number }, shiftKey: boolean) => {
    if (!runtime) return;
    // We send UpdateDraft constantly. 
    // Optimization: we could throttle this, but for now 60fps cmd buffer is fine.
    // Logic for "Shift key" (square/circle) inside engine is missing.
    // For Phase 2, we accept losing Shift-constrain OR we calculate constrained pos here.
    
    // TODO: Implement Shift-constrain logic in JS and send constrained coord to UpdateDraft.
    // Or send Shift flag to Engine? CommandOp doesn't support modifiers yet.
    // We'll calculate here (simple). But "start" position is hidden in Engine. 
    // We can't robustly constrain without knowing start. 
    // We'll skip Shift-constrain for now or rely on a future "UpdateInput" command.
    
    runtime.apply([{
        op: CommandOp.UpdateDraft,
        pos: { x: snapped.x, y: snapped.y }
    }]);
  };

  const handlePointerUp = (snapped: { x: number; y: number }, clickNoDrag: boolean) => {
    if (!runtime) return;

    if (activeTool === 'polyline') {
        // Polyline: Click adds point
        runtime.apply([{
            op: CommandOp.AppendDraftPoint,
            pos: { x: snapped.x, y: snapped.y }
        }]);
        // TODO: detecting "finish" (e.g. double click or Enter) is handled outside this hook usually?
        // Or if clicked on start point?
        // For now, let's assume external "Enter" key commits.
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
        // We already started draft at P, updated at P.
        // We need to update at P + 50.
        runtime.apply([
            { op: CommandOp.UpdateDraft, pos: { x: snapped.x + 50, y: snapped.y + 50 } },
            { op: CommandOp.CommitDraft }
        ]);
    } else {
        runtime.apply([{ op: CommandOp.CommitDraft }]);
    }
  };

  // Helper for Polyline finish (e.g. on Enter key)
  const commitPolyline = (points: {x:number, y:number}[]) => {
      // If we are in engine draft mode, we just commit.
      // Ignoring arguments for legacy compat if called from outside.
      if (runtime) runtime.apply([{ op: CommandOp.CommitDraft }]);
  };

  const commitDefaultPolygonAt = (center: { x: number; y: number }, sides: number) => {
      if (!runtime) return;
      const r = 50;
      // Use direct upsert for one-shot creation
      const engineId = runtime.allocateEntityId();
      const style = buildDraftStyle();
      // Need construct PolygonPayload... it's verbose. 
      // Reuse BeginDraft logic? 
      // runtime.apply([Begin -> Update -> Commit])
      runtime.apply([
          { 
            op: CommandOp.BeginDraft, 
            draft: { 
                kind: 8, // Polygon
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
    draft, // Always none
    setDraft, // No-op
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
