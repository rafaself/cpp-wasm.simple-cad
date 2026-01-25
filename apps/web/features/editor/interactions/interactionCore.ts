import { cadDebugLog } from '@/utils/dev/cadDebug';
import { startTiming, endTiming } from '@/utils/dev/hotPathTiming';

import { DraftingHandler } from './handlers/DraftingHandler';
import { IdleHandler } from './handlers/IdleHandler';
import { PanHandler } from './handlers/PanHandler';
import { SelectionHandler } from './handlers/SelectionHandler';
import { TextHandler } from './handlers/TextHandler';

import type { MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { InteractionHandler, InputEventContext, EngineRuntime } from './types';
import type { ToolDefaults } from './handlers/drafting/draftStyle';
import type { ToolType, ViewTransform } from '@/types';

type PointerRect = { left: number; top: number };

export class InteractionCore {
  private handler: InteractionHandler = new IdleHandler();
  private runtime: EngineRuntime | null = null;
  private viewTransform: ViewTransform;
  private canvasSize: { width: number; height: number };
  private toolDefaults: ToolDefaults;
  private onUpdate: (() => void) | null = null;
  private ctxRef: InputEventContext;

  constructor(
    private readonly pointerRectRef: MutableRefObject<PointerRect>,
    viewTransform: ViewTransform,
    canvasSize: { width: number; height: number },
    toolDefaults: ToolDefaults,
  ) {
    this.viewTransform = viewTransform;
    this.canvasSize = canvasSize;
    this.toolDefaults = toolDefaults;
    this.ctxRef = {
      event: null as unknown as ReactPointerEvent,
      screenPoint: { x: 0, y: 0 },
      worldPoint: { x: 0, y: 0 },
      snappedPoint: { x: 0, y: 0 },
      runtime: null,
      viewTransform,
      canvasSize,
    };
  }

  setOnUpdate(onUpdate: () => void): void {
    this.onUpdate = onUpdate;
    if (this.handler.setOnUpdate) {
      this.handler.setOnUpdate(onUpdate);
    }
  }

  setRuntime(runtime: EngineRuntime | null): void {
    this.runtime = runtime;
  }

  setViewTransform(viewTransform: ViewTransform): void {
    this.viewTransform = viewTransform;
  }

  setCanvasSize(canvasSize: { width: number; height: number }): void {
    this.canvasSize = canvasSize;
  }

  setToolDefaults(toolDefaults: ToolDefaults): void {
    this.toolDefaults = toolDefaults;
  }

  setActiveTool(tool: ToolType): void {
    const prev = this.handler;

    let next: InteractionHandler;
    switch (tool) {
      case 'select':
        next = new SelectionHandler();
        break;
      case 'pan':
        next = new PanHandler();
        break;
      case 'line':
      case 'rect':
      case 'circle':
      case 'polygon':
      case 'polyline':
      case 'arrow':
        next = new DraftingHandler(tool, this.toolDefaults);
        break;
      case 'text':
        next = new TextHandler();
        break;
      default:
        next = new IdleHandler();
        break;
    }

    cadDebugLog('tool', 'tool-switch', () => ({
      tool,
      from: prev.name,
      to: next.name,
    }));

    this.transitionTo(next, 'tool-switch');
  }

  getOverlay(): ReactNode {
    return this.handler.renderOverlay ? this.handler.renderOverlay() : null;
  }

  getCursor(): string | null {
    return this.handler.getCursor ? this.handler.getCursor() : null;
  }

  getActiveHandlerName(): string {
    return this.handler.name;
  }

  handlePointerDown(e: ReactPointerEvent): void {
    const ctx = this.buildContext(e);
    if (!ctx) return;
    const result = this.handler.onPointerDown(ctx);
    if (result) {
      const prevName = this.handler.name;
      cadDebugLog('tool', 'handler-transition', () => ({
        from: prevName,
        to: result.name,
        reason: 'pointerdown',
      }));
      this.transitionTo(result, 'pointerdown');
    }
  }

  handlePointerMove(e: ReactPointerEvent): void {
    startTiming('pointermove');
    const ctx = this.buildContext(e);
    if (!ctx) {
      endTiming('pointermove');
      return;
    }
    this.handler.onPointerMove(ctx);
    endTiming('pointermove');
  }

  handlePointerUp(e: ReactPointerEvent): void {
    const ctx = this.buildContext(e);
    if (!ctx) return;
    const result = this.handler.onPointerUp(ctx);
    if (result) {
      const prevName = this.handler.name;
      cadDebugLog('tool', 'handler-transition', () => ({
        from: prevName,
        to: result.name,
        reason: 'pointerup',
      }));
      this.transitionTo(result, 'pointerup');
    }
  }

  handleDoubleClick(e: ReactPointerEvent): void {
    if (!this.handler.onDoubleClick) return;
    const ctx = this.buildContext(e);
    if (!ctx) return;
    this.handler.onDoubleClick(ctx);
  }

  handleCancel(): void {
    this.handler.onCancel?.();
  }

  handleKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const isInput =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (isInput && e.key !== 'Escape') return;

    cadDebugLog('tool', 'keydown', () => ({
      key: e.key,
      code: e.code,
      target: (e.target as HTMLElement | null)?.tagName ?? null,
    }));
    this.handler.onKeyDown?.(e);
  }

  handleKeyUp(e: KeyboardEvent): void {
    cadDebugLog('tool', 'keyup', () => ({ key: e.key, code: e.code }));
    this.handler.onKeyUp?.(e);
  }

  handleBlur(): void {
    cadDebugLog('tool', 'window-blur');
    this.handler.onBlur?.();
  }

  private transitionTo(next: InteractionHandler, reason: string): void {
    if (this.handler.onLeave) this.handler.onLeave();
    this.handler = next;
    if (this.handler.setOnUpdate && this.onUpdate) {
      this.handler.setOnUpdate(this.onUpdate);
    }
    if (this.handler.onEnter) this.handler.onEnter();
    cadDebugLog('tool', 'handler-transition-complete', () => ({
      to: this.handler.name,
      reason,
    }));
    this.onUpdate?.();
  }

  private buildContext(e: ReactPointerEvent): InputEventContext | null {
    const runtime = this.runtime;
    if (!runtime) return null;
    const rect = this.pointerRectRef.current;
    const ctx = this.ctxRef;
    const screen = ctx.screenPoint;
    const clientX = e.clientX;
    const clientY = e.clientY;
    screen.x = clientX - rect.left;
    screen.y = clientY - rect.top;
    runtime.viewport.screenToWorldWithTransformInto(screen, this.viewTransform, ctx.worldPoint);
    ctx.snappedPoint.x = ctx.worldPoint.x;
    ctx.snappedPoint.y = ctx.worldPoint.y;
    ctx.event = e;
    ctx.runtime = runtime;
    ctx.viewTransform = this.viewTransform;
    ctx.canvasSize = this.canvasSize;
    return ctx;
  }
}
