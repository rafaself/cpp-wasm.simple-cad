import React from 'react';

import { CommandOp, SelectionModifier, EntityKind } from '@/engine/core/EngineRuntime';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import * as DEFAULTS from '@/theme/defaults';
import { hexToRgb } from '@/utils/color';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';

import { InlinePolygonInput } from '../../components/InlinePolygonInput';
import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';

import type { BeginDraftPayload } from '@/engine/core/commandTypes';

// Reusing types from previous implementation or defining locally
const DraftFlags = {
  None: 0,
  FillByLayer: 1 << 0,
  StrokeByLayer: 1 << 1,
};

interface DraftState {
  kind: 'none' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'polygon' | 'polyline';
  points?: { x: number; y: number }[];
  current?: { x: number; y: number };
  start?: { x: number; y: number };
}

interface ToolDefaults {
  strokeColor?: string | null;
  fillColor?: string | null;
  fillEnabled?: boolean;
  strokeEnabled?: boolean;
  strokeWidth?: number;
  polygonSides?: number;
}

const buildModifierMask = (event: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): number => {
  let mask = 0;
  if (event.shiftKey) mask |= SelectionModifier.Shift;
  if (event.ctrlKey) mask |= SelectionModifier.Ctrl;
  if (event.altKey) mask |= SelectionModifier.Alt;
  if (event.metaKey) mask |= SelectionModifier.Meta;
  return mask;
};

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
  private linePendingCommit = false;
  private arrowPendingCommit = false; // Arrow click-click flow (Phase 2)

  // Polygon Modal State
  private polygonModalOpen = false;
  private polygonModalCenter: { x: number; y: number } | null = null;
  private polygonModalScreenPos: { x: number; y: number } | null = null;
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

  private syncToolDefaults(): void {
    const defaults = useSettingsStore.getState().toolDefaults;
    this.toolDefaults = defaults;
    this.polygonSidesValue = Math.max(3, Math.min(24, Math.floor(defaults.polygonSides ?? 3)));
  }

  // Helper to build draft styling
  private buildDraftStyle(): Omit<BeginDraftPayload, 'kind' | 'x' | 'y' | 'sides' | 'head'> {
    let flags = DraftFlags.None;
    if (this.toolDefaults.fillColor === null) flags |= DraftFlags.FillByLayer;
    if (this.toolDefaults.strokeColor === null) flags |= DraftFlags.StrokeByLayer;

    const stroke = this.colorToRgb01(
      this.toolDefaults.strokeColor ?? DEFAULTS.DEFAULT_STROKE_COLOR,
    );
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
      flags,
    };
  }

  private colorToRgb01(hex: string): { r: number; g: number; b: number } {
    const rgb = hexToRgb(hex) ?? { r: 255, g: 255, b: 255 };
    return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
  }

  private resetDraftState(): void {
    this.draft = { kind: 'none' };
    this.pointerDownScreen = null;
    this.linePendingCommit = false;
    this.arrowPendingCommit = false;
  }

  private runtime: EngineRuntime | null = null; // Store runtime for keyboard events
  private static readonly DRAG_THRESHOLD_PX = 5;

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    if (this.polygonModalOpen) return;
    this.syncToolDefaults();
    this.runtime = ctx.runtime; // Capture runtime

    // ... rest of function ...
    const { runtime, snappedPoint: snapped } = ctx;
    const button = ctx.event.button;

    if (button !== 0 || !runtime) return;

    // Polyline multi-segment logic: don't restart if already drafting
    if (this.activeTool === 'polyline' && this.draft.kind === 'polyline') {
      cadDebugLog('draft', 'polyline-continue', () => ({
        tool: this.activeTool,
        x: snapped.x,
        y: snapped.y,
      }));
      this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };
      return;
    }

    if (this.activeTool === 'line' && this.draft.kind === 'line') {
      cadDebugLog('draft', 'line-continue', () => ({
        tool: this.activeTool,
        x: snapped.x,
        y: snapped.y,
      }));
      this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };
      return;
    }

    if (this.activeTool === 'arrow' && this.draft.kind === 'arrow') {
      cadDebugLog('draft', 'arrow-continue', () => ({
        tool: this.activeTool,
        x: snapped.x,
        y: snapped.y,
      }));
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
      sides = 3; // Drag always creates triangle (Phase 3 spec)
    } else if (this.activeTool === 'polyline') kind = EntityKind.Polyline;
    else if (this.activeTool === 'arrow') {
      kind = EntityKind.Arrow;
      head = Math.round(Math.max(16, (this.toolDefaults.strokeWidth ?? 2) * 10) * 1.1);
    } else return;

    const style = this.buildDraftStyle();
    this.linePendingCommit = false;

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
    cadDebugLog('draft', 'begin', () => ({
      tool: this.activeTool,
      kind,
      x: snapped.x,
      y: snapped.y,
    }));

    this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };

    // Update local state
    if (this.activeTool === 'polyline') {
      this.draft = {
        kind: 'polyline',
        points: [{ x: snapped.x, y: snapped.y }],
        current: { x: snapped.x, y: snapped.y },
      };
    } else {
      const k = this.activeTool === 'circle' ? 'ellipse' : (this.activeTool as any);
      this.draft = {
        kind: k,
        start: { x: snapped.x, y: snapped.y },
        current: { x: snapped.x, y: snapped.y },
      };
    }
  }

  onPointerMove(ctx: InputEventContext): void {
    if (this.polygonModalOpen) return;

    const { runtime, snappedPoint: snapped } = ctx;
    if (!runtime || this.draft.kind === 'none') return;

    const modifiers = buildModifierMask(ctx.event);
    runtime.updateDraft(snapped.x, snapped.y, modifiers);
    if (isCadDebugEnabled('draft')) {
      cadDebugLog('draft', 'update', {
        tool: this.activeTool,
        kind: this.draft.kind,
        x: snapped.x,
        y: snapped.y,
      });
    }

    if (this.draft.current) {
      this.draft.current.x = snapped.x;
      this.draft.current.y = snapped.y;
    }
  }

  onPointerUp(ctx: InputEventContext): InteractionHandler | void {
    if (this.polygonModalOpen) return;

    const { runtime, snappedPoint: snapped, event } = ctx;
    if (!runtime) return;

    const isPolyline = this.activeTool === 'polyline';
    const isLine = this.activeTool === 'line';

    if (isPolyline) {
      if (this.draft.kind !== 'polyline') return;
      if (event.button === 2) {
        this.commitPolyline(runtime);
        return;
      }
      if (event.button !== 0) return;
      if (event.detail >= 2) {
        this.commitPolyline(runtime);
        return;
      }
      const dragDistance = this.pointerDownScreen
        ? Math.hypot(
            event.clientX - this.pointerDownScreen.x,
            event.clientY - this.pointerDownScreen.y,
          )
        : 0;
      const isClick = dragDistance <= DraftingHandler.DRAG_THRESHOLD_PX;
      if (!isClick) return;

      const lastPoint = this.draft.points?.[this.draft.points.length - 1];
      const deltaX = lastPoint ? snapped.x - lastPoint.x : 0;
      const deltaY = lastPoint ? snapped.y - lastPoint.y : 0;
      const distSq = deltaX * deltaX + deltaY * deltaY;
      if (lastPoint && distSq <= 1e-6) return;

      const modifiers = buildModifierMask(event);
      runtime.appendDraftPoint(snapped.x, snapped.y, modifiers);
      cadDebugLog('draft', 'polyline-append', () => ({
        x: snapped.x,
        y: snapped.y,
        points: this.draft.points?.length ?? 0,
      }));
      if (this.draft.kind === 'polyline' && this.draft.points) {
        this.draft.points.push({ x: snapped.x, y: snapped.y });
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

    if (isLine) {
      if (event.button !== 0) return;
      if (this.draft.kind !== 'line') return;
      if (!isClick || this.linePendingCommit) {
        runtime.apply([{ op: CommandOp.CommitDraft }]);
        cadDebugLog('draft', 'commit', () => ({
          tool: this.activeTool,
          x: snapped.x,
          y: snapped.y,
        }));
        this.resetDraftState();
        useUIStore.getState().setTool('select');
        return;
      }
      this.linePendingCommit = true;
      this.pointerDownScreen = null;
      return;
    }

    // Arrow: click-click flow (Phase 2 - same pattern as Line)
    const isArrow = this.activeTool === 'arrow';
    if (isArrow) {
      if (event.button !== 0) return;
      if (this.draft.kind !== 'arrow') return;
      if (!isClick || this.arrowPendingCommit) {
        runtime.apply([{ op: CommandOp.CommitDraft }]);
        cadDebugLog('draft', 'commit', () => ({
          tool: this.activeTool,
          x: snapped.x,
          y: snapped.y,
        }));
        this.resetDraftState();
        useUIStore.getState().setTool('select');
        return;
      }
      this.arrowPendingCommit = true;
      this.pointerDownScreen = null;
      return;
    }

    if (this.activeTool === 'polygon' && this.draft.start && isClick) {
      // Was a simple click → open inline input
      this.cancelDraft(runtime);
      this.polygonModalOpen = true;
      this.polygonModalCenter = snapped;
      this.polygonModalScreenPos = { x: event.clientX, y: event.clientY };
      cadDebugLog('draft', 'polygon-modal', () => ({ x: snapped.x, y: snapped.y }));
      this.notifyChange(); // Trigger React Render for Modal
      return;
    }

    // Rect/Circle: simple click → create 100x100 centered shape
    if ((this.activeTool === 'rect' || this.activeTool === 'circle') && isClick) {
      const kind = this.activeTool === 'rect' ? EntityKind.Rect : EntityKind.Circle;
      const r = 50; // 100x100 total size -> 50 radius/half-size
      const cx = snapped.x;
      const cy = snapped.y;

      const style = this.buildDraftStyle();

      // Cancel the tiny draft created on pointer down
      this.cancelDraft(runtime);

      // Create and commit the full-size shape
      runtime.apply([
        {
          op: CommandOp.BeginDraft,
          draft: {
            kind,
            x: cx - r,
            y: cy - r,
            sides: 0,
            head: 0,
            ...style,
          },
        },
        {
          op: CommandOp.UpdateDraft,
          pos: {
            x: cx + r,
            y: cy + r,
            modifiers: 0,
          },
        },
        { op: CommandOp.CommitDraft },
      ]);

      cadDebugLog('draft', 'click-create', () => ({
        tool: this.activeTool,
        x: cx,
        y: cy,
      }));

      this.resetDraftState();
      useUIStore.getState().setTool('select');
      return;
    }

    // Polygon drag → triangle is already enforced in BeginDraft (sides=3)

    // Commit
    runtime.apply([{ op: CommandOp.CommitDraft }]);
    cadDebugLog('draft', 'commit', () => ({
      tool: this.activeTool,
      x: snapped.x,
      y: snapped.y,
    }));
    this.resetDraftState();
    useUIStore.getState().setTool('select');
  }

  onCancel(): void {
    if (this.runtime) {
      this.cancelDraft(this.runtime);
    }
    this.pointerDownScreen = null;
  }

  commitPolyline(runtime: any) {
    if (runtime && this.draft.kind === 'polyline') runtime.apply([{ op: CommandOp.CommitDraft }]);
    cadDebugLog('draft', 'polyline-commit');
    this.resetDraftState();
    useUIStore.getState().setTool('select');
  }

  cancelDraft(runtime: any) {
    if (runtime) runtime.apply([{ op: CommandOp.CancelDraft }]);
    cadDebugLog('draft', 'cancel');
    this.resetDraftState();
  }

  onLeave(): void {
    if (this.runtime) {
      if (this.activeTool === 'polyline' && this.draft.kind === 'polyline') {
        this.commitPolyline(this.runtime);
      } else {
        this.cancelDraft(this.runtime);
      }
    }
    cadDebugLog('draft', 'leave');
  }

  onKeyDown(e: KeyboardEvent): void {
    if (!this.runtime) return;
    if (this.activeTool !== 'polyline' || this.draft.kind !== 'polyline') return;
    if (e.key === 'Enter') {
      this.commitPolyline(this.runtime);
    } else if (e.key === 'Escape') {
      this.cancelDraft(this.runtime);
    }
  }

  // --- Modal Logic ---

  private commitDefaultPolygon(runtime: any) {
    if (!runtime || !this.polygonModalCenter) return;
    this.syncToolDefaults();
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
      { op: CommandOp.UpdateDraft, pos: { x: center.x + r, y: center.y + r, modifiers: 0 } },
      { op: CommandOp.CommitDraft },
    ]);
    cadDebugLog('draft', 'polygon-commit', () => ({ x: center.x, y: center.y, sides }));

    this.polygonModalOpen = false;
    this.polygonModalCenter = null;
    this.polygonModalScreenPos = null;
    this.notifyChange();
    useUIStore.getState().setTool('select');
  }

  // --- Polygon Modal Callbacks ---

  private handlePolygonConfirm = (sides: number) => {
    // Update local value
    this.polygonSidesValue = sides;
    // Persist to global toolDefaults for future polygons
    useSettingsStore.getState().setPolygonSides(sides);
    // Commit the polygon
    if (this.runtime) {
      this.commitDefaultPolygon(this.runtime);
    }
  };

  private handlePolygonCancel = () => {
    this.polygonModalOpen = false;
    this.polygonModalCenter = null;
    this.polygonModalScreenPos = null;
    cadDebugLog('draft', 'polygon-modal-cancel');
    this.notifyChange();
  };

  // --- Render Overlay (Phase 1: inline numeric input) ---

  renderOverlay(): React.ReactNode {
    if (!this.polygonModalOpen || !this.polygonModalScreenPos) {
      return null;
    }

    return React.createElement(InlinePolygonInput, {
      screenPosition: this.polygonModalScreenPos,
      initialValue: this.polygonSidesValue,
      onConfirm: this.handlePolygonConfirm,
      onCancel: this.handlePolygonCancel,
      minSides: 3,
      maxSides: 30, // Updated max as requested
    });
  }
}
