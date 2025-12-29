import React from 'react';
import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';
import { EntityKind } from '@/engine/types';
import { CommandOp, type BeginDraftPayload } from '@/engine/core/commandBuffer';
import { hexToRgb } from '@/utils/color';

// Reusing types from previous implementation or defining locally
interface DraftState {
  kind: 'none' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'polygon' | 'polyline';
  points?: { x: number; y: number }[];
  current?: { x: number; y: number };
  start?: { x: number; y: number };
}

interface ToolDefaults {
  strokeColor?: string;
  fillColor?: string;
  fillEnabled?: boolean;
  strokeEnabled?: boolean;
  strokeWidth?: number;
  polygonSides?: number;
}

export class DraftingHandler extends BaseInteractionHandler {
  name = 'drafting';
  
  private activeTool: string;
  private toolDefaults: ToolDefaults;
  private draft: DraftState = { kind: 'none' };
  
  // Polygon Modal State
  private polygonModalOpen = false;
  private polygonModalCenter: { x: number; y: number } | null = null;
  private polygonSidesValue: number = 3;

  constructor(activeTool: string, toolDefaults: ToolDefaults) {
    super();
    this.activeTool = activeTool;
    this.toolDefaults = toolDefaults;
    this.polygonSidesValue = Math.max(3, Math.min(24, Math.floor(toolDefaults.polygonSides ?? 3)));
  }

  // Helper to build draft styling
  private buildDraftStyle(): Omit<BeginDraftPayload, 'kind' | 'x' | 'y' | 'sides' | 'head'> {
      const stroke = this.colorToRgb01(this.toolDefaults.strokeColor ?? '#FFFFFF');
      const fill = this.colorToRgb01(this.toolDefaults.fillColor ?? '#D9D9D9');
      return {
          fillR: fill.r, fillG: fill.g, fillB: fill.b, fillA: this.toolDefaults.fillEnabled !== false ? 1.0 : 0.0,
          strokeR: stroke.r, strokeG: stroke.g, strokeB: stroke.b, strokeA: 1.0,
          strokeEnabled: this.toolDefaults.strokeEnabled !== false ? 1.0 : 0.0,
          strokeWidthPx: Math.max(1, Math.min(100, this.toolDefaults.strokeWidth ?? 1)),
      };
  }

  private colorToRgb01(hex: string): { r: number; g: number; b: number } {
    const rgb = hexToRgb(hex) ?? { r: 255, g: 255, b: 255 };
    return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
  }

  private runtime: EngineRuntime | null = null; // Store runtime for keyboard events

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    if (this.polygonModalOpen) return;
    this.runtime = ctx.runtime; // Capture runtime
    
    // ... rest of function ...
    const { runtime, snappedPoint: snapped } = ctx;
    const button = ctx.event.button;

    if (button !== 0 || !runtime) return;

    // Polyline multi-segment logic: don't restart if already drafting
    if (this.activeTool === 'polyline' && this.draft.kind === 'polyline') {
        return;
    }
    
    // ...
    let kind = 0;
    let sides = 0;
    let head = 0;

    if (this.activeTool === 'line') kind = EntityKind.Line;
    else if (this.activeTool === 'rect') kind = EntityKind.Rect;
    else if (this.activeTool === 'circle') kind = EntityKind.Circle;
    else if (this.activeTool === 'polygon') {
        kind = EntityKind.Polygon;
        sides = this.polygonSidesValue;
    }
    else if (this.activeTool === 'polyline') kind = EntityKind.Polyline;
    else if (this.activeTool === 'arrow') {
        kind = EntityKind.Arrow;
        head = Math.round(Math.max(16, (this.toolDefaults.strokeWidth ?? 2) * 10) * 1.1);
    }
    else return;

    const style = this.buildDraftStyle();

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
    if (this.activeTool === 'polyline') {
        this.draft = { kind: 'polyline', points: [snapped], current: snapped };
    } else {
        const k = this.activeTool === 'circle' ? 'ellipse' : this.activeTool as any;
        this.draft = { kind: k, start: snapped, current: snapped };
    }
  }

  onPointerMove(ctx: InputEventContext): void {
    if (this.polygonModalOpen) return;

    const { runtime, snappedPoint: snapped } = ctx;
    if (!runtime) return;

    runtime.apply([{
        op: CommandOp.UpdateDraft,
        pos: { x: snapped.x, y: snapped.y }
    }]);

    if (this.draft.kind !== 'none') {
        this.draft.current = snapped;
        // Again, assuming visual feedback is mostly Engine-side.
    }
  }

  onPointerUp(ctx: InputEventContext): InteractionHandler | void {
    if (this.polygonModalOpen) return;

    const { runtime, snappedPoint: snapped, event } = ctx;
    if (!runtime) return;

    const down = (this.draft as any).start || (this.draft.points ? this.draft.points[this.draft.points.length - 1] : snapped);
    
    // For now, I'll rely on the logic that regular shapes commit on Up.
    const isPolyline = this.activeTool === 'polyline';

    if (isPolyline) {
        runtime.apply([{
            op: CommandOp.AppendDraftPoint,
            pos: { x: snapped.x, y: snapped.y }
        }]);
        if (this.draft.kind === 'polyline' && this.draft.points) {
            this.draft.points.push(snapped);
        }
        return;
    }

    // Check for Polygon "Click to Open Modal"
    // We need to know if it was a drag or click.
    // Since we don't store "Down" location in this class, we might miss it.
    // Improvement: Store `pointerDownStart` in `onPointerDown`.
    const isClick = true; // TODO: Implement drag check. For now assume click if start ~= current
    // If we have start in draft:
    if (this.draft.start) {
        const dist = Math.hypot(this.draft.current!.x - this.draft.start.x, this.draft.current!.y - this.draft.start.y);
        // Map units check? Just assume some threshold.
    }

    if (this.activeTool === 'polygon' && this.draft.start && Math.hypot(snapped.x - this.draft.start.x, snapped.y - this.draft.start.y) < 1) {
        // Was a simple click
        this.cancelDraft(runtime);
        this.polygonModalOpen = true;
        this.polygonModalCenter = snapped;
        this.notifyChange(); // Trigger React Render for Modal
        return;
    }

    // Commit
    runtime.apply([{ op: CommandOp.CommitDraft }]);
    this.draft = { kind: 'none' };
  }

  onCancel(): void {
    // Esc pressed?
    // If polyline, finish or cancel? Legacy behavior: Right click finishes. Esc cancels?
    // Let's implement cancel via Engine.
    // Actually we need the runtime. 
    // `onCancel` doesn't pass context in my interface definition? 
    // I should check types.ts. It implies generic cancel.
    // I might need to store runtime reference or pass it.
    // For now, we miss runtime in onCancel sans context.
    // I'll update Interface later if needed, or store runtime in onEnter/PointerDown.
  }

  commitPolyline(runtime: any) {
    if (runtime) runtime.apply([{ op: CommandOp.CommitDraft }]);
    this.draft = { kind: 'none' };
  }

  cancelDraft(runtime: any) {
    if (runtime) runtime.apply([{ op: CommandOp.CancelDraft }]);
    this.draft = { kind: 'none' };
  }

  // --- Modal Logic ---

  private commitDefaultPolygon(runtime: any) {
      if (!runtime || !this.polygonModalCenter) return;
      const center = this.polygonModalCenter;
      const sides = this.polygonSidesValue;
      const r = 50;

      const style = this.buildDraftStyle();
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
      
      this.polygonModalOpen = false;
      this.polygonModalCenter = null;
      this.notifyChange();
  }

}
