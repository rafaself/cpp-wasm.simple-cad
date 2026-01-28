import type { PointerEvent as ReactPointerEvent } from 'react';

import { CommandOp, EntityKind } from '@/engine/core/EngineRuntime';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';

import { buildModifierMask } from '../../modifierMask';
import { buildDraftStyle, getArrowHeadSize, type ToolDefaults } from './draftStyle';

import type { InputEventContext, EngineRuntime } from '../../types';

interface DraftState {
  kind: 'none' | 'line' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'polygon' | 'polyline';
  points?: { x: number; y: number }[];
  current?: { x: number; y: number };
  start?: { x: number; y: number };
}

type DraftingDeps = {
  getActiveTool: () => string;
  getToolDefaults: () => ToolDefaults;
  syncToolDefaults: () => void;
  isPolygonModalOpen: () => boolean;
  openPolygonModal: (world: { x: number; y: number }, screen: { x: number; y: number }) => void;
  setToolSelect: () => void;
};

export class DraftingSessionController {
  private draft: DraftState = { kind: 'none' };
  private pointerDownScreen: { x: number; y: number } | null = null;
  private linePendingCommit = false;
  private arrowPendingCommit = false;
  private rectCirclePendingCommit = false;
  private runtime: EngineRuntime | null = null;

  static readonly DRAG_THRESHOLD_PX = 5;

  constructor(private readonly deps: DraftingDeps) {}

  getRuntime(): EngineRuntime | null {
    return this.runtime;
  }

  onPointerDown(ctx: InputEventContext): void {
    if (this.deps.isPolygonModalOpen()) return;
    this.deps.syncToolDefaults();
    this.runtime = ctx.runtime;

    const { runtime, snappedPoint: snapped } = ctx;
    const button = ctx.event.button;
    if (button !== 0 || !runtime) return;

    const tool = this.deps.getActiveTool();

    if (tool === 'polyline' && this.draft.kind === 'polyline') {
      cadDebugLog('draft', 'polyline-continue', () => ({ tool, x: snapped.x, y: snapped.y }));
      this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };
      return;
    }

    if (tool === 'line' && this.draft.kind === 'line') {
      cadDebugLog('draft', 'line-continue', () => ({ tool, x: snapped.x, y: snapped.y }));
      this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };
      return;
    }

    if (tool === 'arrow' && this.draft.kind === 'arrow') {
      cadDebugLog('draft', 'arrow-continue', () => ({ tool, x: snapped.x, y: snapped.y }));
      this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };
      return;
    }

    const rectDraftActive = tool === 'rect' && this.draft.kind === 'rect';
    const circleDraftActive = tool === 'circle' && this.draft.kind === 'ellipse';
    if (rectDraftActive || circleDraftActive) {
      this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };
      return;
    }

    let kind = 0;
    let sides = 0;
    let head = 0;
    if (tool === 'line') kind = EntityKind.Line;
    else if (tool === 'rect') kind = EntityKind.Rect;
    else if (tool === 'circle') kind = EntityKind.Circle;
    else if (tool === 'polygon') {
      kind = EntityKind.Polygon;
      sides = 3;
    } else if (tool === 'polyline') kind = EntityKind.Polyline;
    else if (tool === 'arrow') {
      kind = EntityKind.Arrow;
      head = getArrowHeadSize(this.deps.getToolDefaults().strokeWidth);
    } else {
      return;
    }

    const style = buildDraftStyle(this.deps.getToolDefaults());
    this.linePendingCommit = false;
    this.arrowPendingCommit = false;
    this.rectCirclePendingCommit = false;

    runtime.apply([
      {
        op: CommandOp.BeginDraft,
        draft: { kind, x: snapped.x, y: snapped.y, sides, head, ...style },
      },
    ]);
    cadDebugLog('draft', 'begin', () => ({ tool, kind, x: snapped.x, y: snapped.y }));

    this.pointerDownScreen = { x: ctx.event.clientX, y: ctx.event.clientY };

    if (tool === 'polyline') {
      this.draft = {
        kind: 'polyline',
        points: [{ x: snapped.x, y: snapped.y }],
        current: { x: snapped.x, y: snapped.y },
      };
      return;
    }

    const localKind = tool === 'circle' ? 'ellipse' : (tool as DraftState['kind']);
    this.draft = {
      kind: localKind,
      start: { x: snapped.x, y: snapped.y },
      current: { x: snapped.x, y: snapped.y },
    };
  }

  onPointerMove(ctx: InputEventContext): void {
    if (this.deps.isPolygonModalOpen()) return;

    const { runtime, snappedPoint: snapped } = ctx;
    if (!runtime || this.draft.kind === 'none') return;

    const modifiers = buildModifierMask(ctx.event);
    runtime.updateDraft(snapped.x, snapped.y, modifiers);
    if (isCadDebugEnabled('draft')) {
      cadDebugLog('draft', 'update', {
        tool: this.deps.getActiveTool(),
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

  onPointerUp(ctx: InputEventContext): void {
    if (this.deps.isPolygonModalOpen()) return;

    const { runtime, snappedPoint: snapped, event } = ctx;
    if (!runtime) return;

    const tool = this.deps.getActiveTool();
    if (tool === 'polyline') {
      this.handlePolylinePointerUp(runtime, snapped, event);
      return;
    }

    const dragDistance = this.computeDragDistance(event);
    const isClick = dragDistance <= DraftingSessionController.DRAG_THRESHOLD_PX;

    if (tool === 'line') {
      this.handleLinePointerUp(runtime, snapped, event, isClick);
      return;
    }

    if (tool === 'arrow') {
      this.handleArrowPointerUp(runtime, snapped, event, isClick);
      return;
    }

    if (tool === 'rect' || tool === 'circle') {
      this.handleRectCirclePointerUp(runtime, snapped, event, isClick, tool);
      return;
    }

    if (tool === 'polygon' && this.draft.start && isClick) {
      this.cancelDraft(runtime);
      this.deps.openPolygonModal(snapped, { x: event.clientX, y: event.clientY });
      cadDebugLog('draft', 'polygon-modal', () => ({ x: snapped.x, y: snapped.y }));
      return;
    }

    runtime.apply([{ op: CommandOp.CommitDraft }]);
    cadDebugLog('draft', 'commit', () => ({ tool, x: snapped.x, y: snapped.y }));
    this.resetDraftState();
    this.deps.setToolSelect();
  }

  onCancel(): void {
    if (this.runtime) {
      this.cancelDraft(this.runtime);
    }
    this.pointerDownScreen = null;
  }

  cancelWithRuntime(runtime: EngineRuntime): void {
    this.cancelDraft(runtime);
  }

  onLeave(): void {
    if (!this.runtime) return;
    if (this.deps.getActiveTool() === 'polyline' && this.draft.kind === 'polyline') {
      this.commitPolyline(this.runtime);
      return;
    }
    this.cancelDraft(this.runtime);
  }

  onKeyDown(e: KeyboardEvent): void {
    if (!this.runtime) return;
    if (e.key !== 'Enter' && e.key !== 'Escape') return;

    const tool = this.deps.getActiveTool();
    if (tool === 'polyline' && this.draft.kind === 'polyline') {
      if (e.key === 'Enter') this.commitPolyline(this.runtime);
      else this.cancelDraft(this.runtime);
      return;
    }

    if (tool === 'line' && this.draft.kind === 'line') {
      if (e.key === 'Escape') {
        this.cancelDraft(this.runtime);
      } else {
        const current = this.draft.current ?? this.draft.start;
        if (this.linePendingCommit && current && this.hasDraftDelta(current)) {
          this.runtime.apply([{ op: CommandOp.CommitDraft }]);
          cadDebugLog('draft', 'commit', () => ({ tool, x: current.x, y: current.y }));
        } else {
          this.cancelDraft(this.runtime);
        }
      }
      this.resetDraftState();
      this.deps.setToolSelect();
      return;
    }

    if (tool === 'rect' || tool === 'circle') {
      const expectedKind = tool === 'circle' ? 'ellipse' : 'rect';
      if (this.draft.kind !== expectedKind) return;
      if (e.key === 'Escape') {
        this.cancelDraft(this.runtime);
      } else {
        const current = this.draft.current;
        if (current && this.hasDraftDelta(current)) {
          this.runtime.apply([{ op: CommandOp.CommitDraft }]);
          cadDebugLog('draft', 'commit', () => ({ tool, x: current.x, y: current.y }));
        } else {
          this.cancelDraft(this.runtime);
        }
      }
      this.resetDraftState();
      this.deps.setToolSelect();
    }
  }

  private handlePolylinePointerUp(
    runtime: EngineRuntime,
    snapped: { x: number; y: number },
    event: PointerEvent | ReactPointerEvent,
  ): void {
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

    const dragDistance = this.computeDragDistance(event);
    const isClick = dragDistance <= DraftingSessionController.DRAG_THRESHOLD_PX;
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
  }

  private handleLinePointerUp(
    runtime: EngineRuntime,
    snapped: { x: number; y: number },
    event: PointerEvent | ReactPointerEvent,
    isClick: boolean,
  ): void {
    if (this.draft.kind !== 'line') return;
    if (event.button === 2) {
      if (this.linePendingCommit && this.hasDraftDelta(snapped)) {
        runtime.apply([{ op: CommandOp.CommitDraft }]);
      } else {
        this.cancelDraft(runtime);
      }
      this.resetDraftState();
      this.deps.setToolSelect();
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
        this.deps.setToolSelect();
        return;
      }
      this.beginLineDraft(runtime, snapped);
      this.pointerDownScreen = null;
      return;
    }

    if (hasDelta) {
      runtime.apply([{ op: CommandOp.CommitDraft }]);
      cadDebugLog('draft', 'commit', () => ({
        tool: this.deps.getActiveTool(),
        x: snapped.x,
        y: snapped.y,
      }));
    } else {
      this.cancelDraft(runtime);
    }

    if (finishRequested) {
      this.resetDraftState();
      this.deps.setToolSelect();
      return;
    }

    this.beginLineDraft(runtime, snapped);
    this.pointerDownScreen = null;
  }

  private handleArrowPointerUp(
    runtime: EngineRuntime,
    snapped: { x: number; y: number },
    event: PointerEvent | ReactPointerEvent,
    isClick: boolean,
  ): void {
    if (event.button !== 0) return;
    if (this.draft.kind !== 'arrow') return;
    if (!isClick || this.arrowPendingCommit) {
      runtime.apply([{ op: CommandOp.CommitDraft }]);
      cadDebugLog('draft', 'commit', () => ({
        tool: this.deps.getActiveTool(),
        x: snapped.x,
        y: snapped.y,
      }));
      this.resetDraftState();
      this.deps.setToolSelect();
      return;
    }
    this.arrowPendingCommit = true;
    this.pointerDownScreen = null;
  }

  private handleRectCirclePointerUp(
    runtime: EngineRuntime,
    snapped: { x: number; y: number },
    event: PointerEvent | ReactPointerEvent,
    isClick: boolean,
    tool: 'rect' | 'circle',
  ): void {
    const expectedKind = tool === 'circle' ? 'ellipse' : 'rect';
    if (this.draft.kind !== expectedKind) return;
    if (event.button === 2) {
      this.cancelDraft(runtime);
      this.deps.setToolSelect();
      return;
    }
    if (event.button !== 0) return;

    if (!isClick || this.rectCirclePendingCommit) {
      runtime.apply([{ op: CommandOp.CommitDraft }]);
      cadDebugLog('draft', 'commit', () => ({
        tool: this.deps.getActiveTool(),
        x: snapped.x,
        y: snapped.y,
      }));
      this.resetDraftState();
      this.deps.setToolSelect();
      return;
    }

    this.rectCirclePendingCommit = true;
    this.pointerDownScreen = null;
  }

  private resetDraftState(): void {
    this.draft = { kind: 'none' };
    this.pointerDownScreen = null;
    this.linePendingCommit = false;
    this.arrowPendingCommit = false;
    this.rectCirclePendingCommit = false;
  }

  private beginLineDraft(runtime: EngineRuntime, point: { x: number; y: number }): void {
    const style = buildDraftStyle(this.deps.getToolDefaults());
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

  private computeDragDistance(event: PointerEvent | ReactPointerEvent): number {
    if (!this.pointerDownScreen) return 0;
    const dx = event.clientX - this.pointerDownScreen.x;
    const dy = event.clientY - this.pointerDownScreen.y;
    return Math.hypot(dx, dy);
  }

  private commitPolyline(runtime: EngineRuntime): void {
    if (this.draft.kind === 'polyline') {
      runtime.apply([{ op: CommandOp.CommitDraft }]);
    }
    cadDebugLog('draft', 'polyline-commit');
    this.resetDraftState();
    this.deps.setToolSelect();
  }

  private cancelDraft(runtime: EngineRuntime): void {
    runtime.apply([{ op: CommandOp.CancelDraft }]);
    cadDebugLog('draft', 'cancel');
    this.resetDraftState();
  }
}
