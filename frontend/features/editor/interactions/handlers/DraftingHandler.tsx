import React from 'react';

import { CommandOp, type BeginDraftPayload } from '@/engine/core/commandBuffer';
import { EntityKind } from '@/engine/types';
import { hexToRgb } from '@/utils/color';
import * as DEFAULTS from '@/theme/defaults';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';

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
  // State machine:
  // idle -> (pointerDown) drafting/polyline -> (pointerMove) updateDraft -> (pointerUp) commit | append -> idle
  // cancel/tool switch -> idle
  private draft: DraftState = { kind: 'none' };
  // Screen-space pointer down to detect click vs drag
  private pointerDownScreen: { x: number; y: number } | null = null;

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

  getCursor(): string {
    return 'crosshair';
  }

  // Helper to build draft styling
  private buildDraftStyle(): Omit<BeginDraftPayload, 'kind' | 'x' | 'y' | 'sides' | 'head'> {
    const stroke = this.colorToRgb01(this.toolDefaults.strokeColor ?? DEFAULTS.DEFAULT_STROKE_COLOR);
    const fill = this.colorToRgb01(this.toolDefaults.fillColor ?? DEFAULTS.DEFAULT_FILL_COLOR);
    return {
      fillR: fill.r,
      fillG: fill.g,
      fillB: fill.b,
      fillA: this.toolDefaults.fillEnabled !== false ? 1.0 : 0.0,
      strokeR: stroke.r,
      strokeG: stroke.g,
      strokeB: stroke.b,
      strokeA: 1.0,
      strokeEnabled: this.toolDefaults.strokeEnabled !== false ? 1.0 : 0.0,
      strokeWidthPx: Math.max(1, Math.min(100, this.toolDefaults.strokeWidth ?? 1)),
    };
  }

  private colorToRgb01(hex: string): { r: number; g: number; b: number } {
    const rgb = hexToRgb(hex) ?? { r: 255, g: 255, b: 255 };
    return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
  }

  private runtime: EngineRuntime | null = null; // Store runtime for keyboard events
  private static readonly DRAG_THRESHOLD_PX = 2;

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    if (this.polygonModalOpen) return;
    this.runtime = ctx.runtime; // Capture runtime

    // ... rest of function ...
    const { runtime, snappedPoint: snapped } = ctx;
    const button = ctx.event.button;

    if (button !== 0 || !runtime) return;

    // Polyline multi-segment logic: don't restart if already drafting
    if (this.activeTool === 'polyline' && this.draft.kind === 'polyline') {
      this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };
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
    } else if (this.activeTool === 'polyline') kind = EntityKind.Polyline;
    else if (this.activeTool === 'arrow') {
      kind = EntityKind.Arrow;
      head = Math.round(Math.max(16, (this.toolDefaults.strokeWidth ?? 2) * 10) * 1.1);
    } else return;

    const style = this.buildDraftStyle();

    runtime.apply([
      {
        op: CommandOp.BeginDraft,
        draft: {
          kind,
          x: snapped.x,
          y: snapped.y,
          sides,
          head,
          ...style,
        },
      },
    ]);

    this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };

    // Update local state
    if (this.activeTool === 'polyline') {
      this.draft = { kind: 'polyline', points: [snapped], current: snapped };
    } else {
      const k = this.activeTool === 'circle' ? 'ellipse' : (this.activeTool as any);
      this.draft = { kind: k, start: snapped, current: snapped };
    }
  }

  onPointerMove(ctx: InputEventContext): void {
    if (this.polygonModalOpen) return;

    const { runtime, snappedPoint: snapped } = ctx;
    if (!runtime || this.draft.kind === 'none') return;

    runtime.updateDraft(snapped.x, snapped.y);

    this.draft.current = snapped;
  }

  onPointerUp(ctx: InputEventContext): InteractionHandler | void {
    if (this.polygonModalOpen) return;

    const { runtime, snappedPoint: snapped, event } = ctx;
    if (!runtime) return;

    const down =
      (this.draft as any).start ||
      (this.draft.points ? this.draft.points[this.draft.points.length - 1] : snapped);

    // For now, I'll rely on the logic that regular shapes commit on Up.
    const isPolyline = this.activeTool === 'polyline';

    if (isPolyline) {
      runtime.appendDraftPoint(snapped.x, snapped.y);
      if (this.draft.kind === 'polyline' && this.draft.points) {
        this.draft.points.push(snapped);
      }
      return;
    }

    const dragDistance = this.pointerDownScreen
      ? Math.hypot(
          event.clientX - this.pointerDownScreen.x,
          event.clientY - this.pointerDownScreen.y,
        )
      : 0;
    const isClick = dragDistance <= DraftingHandler.DRAG_THRESHOLD_PX;

    if (this.activeTool === 'polygon' && this.draft.start && isClick) {
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
    this.pointerDownScreen = null;
  }

  onCancel(): void {
    if (this.runtime) {
      this.cancelDraft(this.runtime);
    }
    this.pointerDownScreen = null;
  }

  commitPolyline(runtime: any) {
    if (runtime) runtime.apply([{ op: CommandOp.CommitDraft }]);
    this.draft = { kind: 'none' };
  }

  cancelDraft(runtime: any) {
    if (runtime) runtime.apply([{ op: CommandOp.CancelDraft }]);
    this.draft = { kind: 'none' };
    this.pointerDownScreen = null;
  }

  onLeave(): void {
    if (this.runtime) {
      this.cancelDraft(this.runtime);
    }
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
          x: center.x - r,
          y: center.y - r,
          sides,
          head: 0,
          ...style,
        },
      },
      { op: CommandOp.UpdateDraft, pos: { x: center.x + r, y: center.y + r } },
      { op: CommandOp.CommitDraft },
    ]);

    this.polygonModalOpen = false;
    this.polygonModalCenter = null;
    this.notifyChange();
  }
}
