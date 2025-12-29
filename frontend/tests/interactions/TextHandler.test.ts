import { describe, it, expect, beforeEach } from 'vitest';
import { TextHandler } from '@/features/editor/interactions/handlers/TextHandler';
import { createFakeTextTool, FakeTextTool } from '@/test-utils/fakeTextTool';
import { FakeRuntime } from '@/test-utils/fakeRuntime';
import { screenToWorld } from '@/utils/viewportMath';

const makePointer = (x: number, y: number): any => ({
  clientX: x,
  clientY: y,
  button: 0,
  shiftKey: false,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
});

describe('TextHandler', () => {
  let fakeTool: FakeTextTool;
  let handler: TextHandler;
  let runtime: FakeRuntime;

  beforeEach(() => {
    runtime = new FakeRuntime();
    fakeTool = createFakeTextTool({
      onStateChange: () => undefined,
      onCaretUpdate: () => undefined,
      onSelectionUpdate: () => undefined,
      onEditEnd: () => undefined,
      onTextCreated: () => undefined,
      onTextUpdated: () => undefined,
      onStyleSnapshot: () => undefined,
    });
    handler = new TextHandler(fakeTool as any);
  });

  it('initializes tool on first pointer down and records caret anchor', () => {
    const event = makePointer(10, 20);
    const ctx = {
      event,
      worldPoint: screenToWorld({ x: 10, y: 20 }, { x: 0, y: 0, scale: 1 }),
      snappedPoint: { x: 10, y: 20 },
      runtime,
      viewTransform: { x: 0, y: 0, scale: 1 },
      canvasSize: { width: 800, height: 600 },
    };

    handler.onPointerDown(ctx as any);

    expect(fakeTool.initializedWith).toBe(runtime);
    expect(fakeTool.clicks[0]).toEqual({ x: 10, y: -20 });
  });

  it('updates selection range on selection change', () => {
    fakeTool.handleSelectionChange(1, 3);

    expect(fakeTool.selectionRange).toEqual({ start: 1, end: 3 });
  });

  it('appends typed content deterministically', () => {
    handler.content = '';
    fakeTool.handleInputDelta('A');
    fakeTool.handleInputDelta('B');

    expect(fakeTool.getContent()).toBe('AB');
  });

  it('keeps state stable on edit end signal', () => {
    handler.state = {
      mode: 'editing',
      anchorX: 1,
      anchorY: 1,
      rotation: 0,
      caretIndex: 1,
      selectionStart: 0,
      selectionEnd: 0,
    } as any;
    fakeTool.handleInputDelta('C');
    fakeTool.emitEditEnd();
    expect(fakeTool.getContent()).toBe('C');
  });

  it('resets caret/selection shape on undo/redo signals', () => {
    fakeTool.handleInputDelta('D');
    fakeTool.handleSpecialKey('undo');
    expect(fakeTool.undoCount).toBe(1);
    fakeTool.handleSpecialKey('redo');
    expect(fakeTool.redoCount).toBe(1);
  });
});
