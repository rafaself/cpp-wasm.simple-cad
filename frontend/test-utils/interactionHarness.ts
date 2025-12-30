import { DraftingHandler } from '@/features/editor/interactions/handlers/DraftingHandler';
import { SelectionHandler } from '@/features/editor/interactions/handlers/SelectionHandler';
import { TextHandler } from '@/features/editor/interactions/handlers/TextHandler';
import { screenToWorld } from '@/utils/viewportMath';

import { FakeRuntime } from './fakeRuntime';

import type { FakeTextTool } from './fakeTextTool';
import type { EngineCommand } from '@/engine/core/commandBuffer';
import type { TextTool } from '@/engine/tools/TextTool';
import type { InteractionHandler } from '@/features/editor/interactions/types';
import type { ToolType, ViewTransform } from '@/types';

type PointerOpts = {
  x: number;
  y: number;
  button?: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

type HarnessOptions = {
  runtime?: FakeRuntime;
  viewTransform?: ViewTransform;
  canvasSize?: { width: number; height: number };
  toolDefaults?: any;
  textTool?: FakeTextTool | TextTool;
  activeTool?: ToolType;
};

const defaultView: ViewTransform = { x: 0, y: 0, scale: 1 };

const buildPointerEvent = (
  opts: PointerOpts,
  canvasSize: { width: number; height: number },
): React.PointerEvent => {
  const base = {
    clientX: opts.x,
    clientY: opts.y,
    button: opts.button ?? 0,
    shiftKey: !!opts.shiftKey,
    ctrlKey: !!opts.ctrlKey,
    metaKey: !!opts.metaKey,
    currentTarget: {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: canvasSize.width,
        height: canvasSize.height,
      }),
    },
  } as unknown as React.PointerEvent;
  return base;
};

export class InteractionHarness {
  public runtime: FakeRuntime;
  public handler: InteractionHandler;
  public viewTransform: ViewTransform;
  public canvasSize: { width: number; height: number };
  public toolDefaults: any;
  public updates = 0;

  constructor(options: HarnessOptions = {}) {
    this.runtime = options.runtime ?? new FakeRuntime();
    this.viewTransform = options.viewTransform ?? defaultView;
    this.canvasSize = options.canvasSize ?? { width: 800, height: 600 };
    this.toolDefaults = options.toolDefaults ?? {
      strokeColor: '#FFFFFF',
      fillColor: '#D9D9D9',
      fillEnabled: true,
      strokeEnabled: true,
      strokeWidth: 1,
      polygonSides: 3,
    };
    this.handler = this.createHandler(options.activeTool ?? 'select', options.textTool);
  }

  private createHandler(tool: ToolType, textTool?: FakeTextTool | TextTool): InteractionHandler {
    let handler: InteractionHandler;
    if (tool === 'select') {
      handler = new SelectionHandler();
    } else if (tool === 'text') {
      handler = new TextHandler(textTool as TextTool | undefined);
    } else {
      handler = new DraftingHandler(tool, this.toolDefaults);
    }
    handler.setOnUpdate?.(() => {
      this.updates += 1;
    });
    handler.onEnter?.();
    return handler;
  }

  setTool(tool: ToolType, options: { textTool?: FakeTextTool | TextTool } = {}): void {
    this.handler.onLeave?.();
    this.handler = this.createHandler(tool, options.textTool);
  }

  setViewTransform(transform: ViewTransform): void {
    this.viewTransform = transform;
  }

  pointerDown(opts: PointerOpts): void {
    const ctx = this.buildContext(opts);
    const next = this.handler.onPointerDown(ctx);
    this.applyTransition(next);
  }

  pointerMove(opts: PointerOpts): void {
    const ctx = this.buildContext(opts);
    this.handler.onPointerMove(ctx);
  }

  pointerUp(opts: PointerOpts): void {
    const ctx = this.buildContext(opts);
    const next = this.handler.onPointerUp(ctx);
    this.applyTransition(next);
  }

  doubleClick(opts: PointerOpts): void {
    if (!this.handler.onDoubleClick) return;
    const ctx = this.buildContext(opts);
    this.handler.onDoubleClick(ctx);
  }

  keyDown(key: string, modifiers: { shift?: boolean; ctrl?: boolean; meta?: boolean } = {}): void {
    this.handler.onKeyDown?.({
      key,
      shiftKey: !!modifiers.shift,
      ctrlKey: !!modifiers.ctrl,
      metaKey: !!modifiers.meta,
    } as KeyboardEvent);
  }

  keyUp(key: string): void {
    this.handler.onKeyUp?.({ key } as KeyboardEvent);
  }

  typeText(content: string): void {
    const handler = this.handler as TextHandler;
    for (const char of content) {
      (handler.textTool as any).handleInputDelta(char);
    }
  }

  getCommands(): EngineCommand[] {
    return this.runtime.commands;
  }

  private buildContext(opts: PointerOpts) {
    const event = buildPointerEvent(opts, this.canvasSize);
    const worldPoint = screenToWorld({ x: opts.x, y: opts.y }, this.viewTransform);
    const snappedPoint = this.runtime.getSnappedPoint(worldPoint.x, worldPoint.y);
    return {
      event,
      worldPoint,
      snappedPoint,
      runtime: this.runtime as any,
      viewTransform: this.viewTransform,
      canvasSize: this.canvasSize,
    };
  }

  private applyTransition(next: InteractionHandler | void): void {
    if (!next) return;
    this.handler.onLeave?.();
    next.setOnUpdate?.(() => {
      this.updates += 1;
    });
    next.onEnter?.();
    this.handler = next;
  }
}
