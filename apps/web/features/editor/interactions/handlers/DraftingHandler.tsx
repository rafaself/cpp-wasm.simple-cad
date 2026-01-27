import type { ReactNode } from 'react';

import { CommandOp, EntityKind } from '@/engine/core/EngineRuntime';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { buildModifierMask } from '../modifierMask';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';
import { buildDraftStyle, clampPolygonSides, getArrowHeadSize, type ToolDefaults } from './drafting/draftStyle';
import { PolygonModalController } from './drafting/PolygonModalController';

interface DraftState {
  kind: 'none' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'polygon' | 'polyline';
  points?: { x: number; y: number }[];
  current?: { x: number; y: number };
  start?: { x: number; y: number };
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
  private linePendingCommit = false;
  private arrowPendingCommit = false; // Arrow click-click flow (Phase 2)
  private rectCirclePendingCommit = false;

  // Polygon Modal State
  private polygonModal: PolygonModalController;

  constructor(activeTool: string, toolDefaults: ToolDefaults) {
    super();
    this.activeTool = activeTool;
    this.toolDefaults = toolDefaults;
    this.polygonModal = new PolygonModalController(
      () => this.notifyChange(),
      clampPolygonSides(toolDefaults.polygonSides ?? 3),
    );
  }

  getCursor(): string {
    return 'crosshair';
  }

  private syncToolDefaults(): void {
    const defaults = useSettingsStore.getState().toolDefaults;
    this.toolDefaults = defaults;
    this.polygonModal.syncSides(clampPolygonSides(defaults.polygonSides ?? 3));
  }

  private resetDraftState(): void {
    this.draft = { kind: 'none' };
    this.pointerDownScreen = null;
    this.linePendingCommit = false;
    this.arrowPendingCommit = false;
    this.rectCirclePendingCommit = false;
  }

  private beginLineDraft(runtime: EngineRuntime, point: { x: number; y: number }): void {
    const style = buildDraftStyle(this.toolDefaults);
    runtime.apply([
      {
        op: CommandOp.BeginDraft,
        draft: {
          kind: EntityKind.Line,
          x: point.x,
          y: point.y,
          sides: 0,
          head: 0,
          ...style,
        },
      },
    ]);
    this.draft = {
      kind: 'line',
      start: { x: point.x, y: point.y },
      current: { x: point.x, y: point.y },
    };
    this.linePendingCommit = true;
  }

  private hasDraftDelta(target: { x: number; y: number }): boolean {
    const start = this.draft.start;
    if (!start) return true;
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    return dx * dx + dy * dy > 1e-8;
  }

  private runtime: EngineRuntime | null = null; // Store runtime for keyboard events
  private static readonly DRAG_THRESHOLD_PX = 5;

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    if (this.polygonModal.isOpen()) return;
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

    const rectDraftActive = this.activeTool === 'rect' && this.draft.kind === 'rect';
    const circleDraftActive = this.activeTool === 'circle' && this.draft.kind === 'ellipse';
    if (rectDraftActive || circleDraftActive) {
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
      head = getArrowHeadSize(this.toolDefaults.strokeWidth);
    } else return;

    const style = buildDraftStyle(this.toolDefaults);
    this.linePendingCommit = false;
    this.rectCirclePendingCommit = false;

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
    if (this.polygonModal.isOpen()) return;

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
    if (this.polygonModal.isOpen()) return;

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
      if (this.draft.kind !== 'line') return;
      if (event.button === 2) {
        if (this.linePendingCommit && this.hasDraftDelta(snapped)) {
          runtime.apply([{ op: CommandOp.CommitDraft }]);
        } else {
          this.cancelDraft(runtime);
        }
        this.resetDraftState();
        useUIStore.getState().setTool('select');
        return;
      }
      if (event.button !== 0) return;

      const finishRequested = event.detail >= 2;
      const hasDelta = this.hasDraftDelta(snapped);

      if (!this.linePendingCommit) {
        if (isClick) {
          this.linePendingCommit = true;
          this.pointerDownScreen = null;
          return;
        }
        if (hasDelta) {
          runtime.apply([{ op: CommandOp.CommitDraft }]);
        } else {
          this.cancelDraft(runtime);
        }
        if (finishRequested) {
          this.resetDraftState();
          useUIStore.getState().setTool('select');
          return;
        }
        this.beginLineDraft(runtime, snapped);
        this.pointerDownScreen = null;
        return;
      }

      if (hasDelta) {
        runtime.apply([{ op: CommandOp.CommitDraft }]);
        cadDebugLog('draft', 'commit', () => ({
          tool: this.activeTool,
          x: snapped.x,
          y: snapped.y,
        }));
      } else {
        this.cancelDraft(runtime);
      }

      if (finishRequested) {
        this.resetDraftState();
        useUIStore.getState().setTool('select');
        return;
      }

      this.beginLineDraft(runtime, snapped);
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

    const isRectOrCircle = this.activeTool === 'rect' || this.activeTool === 'circle';
    if (isRectOrCircle) {
      const expectedKind = this.activeTool === 'circle' ? 'ellipse' : 'rect';
      if (this.draft.kind !== expectedKind) return;
      if (event.button === 2) {
        this.cancelDraft(runtime);
        useUIStore.getState().setTool('select');
        return;
      }
      if (event.button !== 0) return;

      if (!isClick || this.rectCirclePendingCommit) {
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

      this.rectCirclePendingCommit = true;
      this.pointerDownScreen = null;
      return;
    }

    if (this.activeTool === 'polygon' && this.draft.start && isClick) {
      // Was a simple click → open inline input
      this.cancelDraft(runtime);
      this.polygonModal.openAt(snapped, { x: event.clientX, y: event.clientY });
      cadDebugLog('draft', 'polygon-modal', () => ({ x: snapped.x, y: snapped.y }));
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
    if (e.key !== 'Enter' && e.key !== 'Escape') return;

    if (this.activeTool === 'polyline' && this.draft.kind === 'polyline') {
      if (e.key === 'Enter') {
        this.commitPolyline(this.runtime);
      } else {
        this.cancelDraft(this.runtime);
      }
      return;
    }

    if (this.activeTool === 'line' && this.draft.kind === 'line') {
      if (e.key === 'Escape') {
        this.cancelDraft(this.runtime);
      } else {
        const current = this.draft.current ?? this.draft.start;
        if (this.linePendingCommit && current && this.hasDraftDelta(current)) {
          this.runtime.apply([{ op: CommandOp.CommitDraft }]);
          cadDebugLog('draft', 'commit', () => ({
            tool: this.activeTool,
            x: current.x,
            y: current.y,
          }));
        } else {
          this.cancelDraft(this.runtime);
        }
      }
      this.resetDraftState();
      useUIStore.getState().setTool('select');
      return;
    }

    const isRectOrCircle = this.activeTool === 'rect' || this.activeTool === 'circle';
    if (isRectOrCircle) {
      const expectedKind = this.activeTool === 'circle' ? 'ellipse' : 'rect';
      if (this.draft.kind !== expectedKind) return;
      if (e.key === 'Escape') {
        this.cancelDraft(this.runtime);
      } else {
        const current = this.draft.current;
        if (current && this.hasDraftDelta(current)) {
          this.runtime.apply([{ op: CommandOp.CommitDraft }]);
          cadDebugLog('draft', 'commit', () => ({
            tool: this.activeTool,
            x: current.x,
            y: current.y,
          }));
        } else {
          this.cancelDraft(this.runtime);
        }
      }
      this.resetDraftState();
      useUIStore.getState().setTool('select');
    }
  }

  // --- Modal Logic ---

  private commitDefaultPolygon(runtime: any) {
    const center = this.polygonModal.getCenter();
    if (!runtime || !center) return;
    this.syncToolDefaults();
    const sides = this.polygonModal.getSides();
    const r = 50;

    const style = buildDraftStyle(this.toolDefaults);
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

    this.polygonModal.close();
    useUIStore.getState().setTool('select');
  }

  // --- Polygon Modal Callbacks ---

  private handlePolygonConfirm = (sides: number) => {
    this.polygonModal.setSides(sides);
    // Persist to global toolDefaults for future polygons
    useSettingsStore.getState().setPolygonSides(sides);
    // Commit the polygon
    if (this.runtime) {
      this.commitDefaultPolygon(this.runtime);
    }
  };

  private handlePolygonCancel = () => {
    this.polygonModal.close();
    cadDebugLog('draft', 'polygon-modal-cancel');
  };

  // --- Render Overlay (Phase 1: inline numeric input) ---

  renderOverlay(): ReactNode {
    return this.polygonModal.render(this.handlePolygonConfirm, this.handlePolygonCancel);
  }
}
