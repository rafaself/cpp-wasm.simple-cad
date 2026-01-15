type TextToolCallbacks = {
  onStateChange: (state: any) => void;
  onCaretUpdate: (x: number, y: number, h: number, rot: number, ax: number, ay: number) => void;
  onSelectionUpdate: (rects: any[]) => void;
  onEditEnd: () => void;
  onTextCreated: (...args: any[]) => void;
  onTextUpdated: () => void;
  onStyleSnapshot: (...args: any[]) => void;
};

export class FakeTextTool {
  private callbacks: TextToolCallbacks;
  private ready = false;
  private content = '';
  public clicks: Array<{ x: number; y: number }> = [];
  public selectionRange = { start: 0, end: 0 };
  public caretIndex = 0;
  public activeTextId = 1;
  public initializedWith: unknown = null;
  public undoCount = 0;
  public redoCount = 0;

  constructor(callbacks: TextToolCallbacks) {
    this.callbacks = callbacks;
  }

  setCallbacks(callbacks: TextToolCallbacks): void {
    this.callbacks = callbacks;
  }

  isReady(): boolean {
    return this.ready;
  }

  initialize(runtime: unknown): void {
    this.ready = true;
    this.initializedWith = runtime;
  }

  handleClick(x: number, y: number): void {
    this.clicks.push({ x, y });
    this.caretIndex = this.content.length;
    const state = {
      mode: 'creating',
      activeTextId: this.activeTextId,
      boxMode: 0,
      constraintWidth: 0,
      anchorX: x,
      anchorY: y,
      rotation: 0,
      caretIndex: this.caretIndex,
      selectionStart: this.selectionRange.start,
      selectionEnd: this.selectionRange.end,
    };
    this.callbacks.onStateChange(state);
    this.callbacks.onCaretUpdate(x, y, 10, 0, x, y);
  }

  handleInputDelta(delta: string): void {
    this.content += delta;
    this.caretIndex = this.content.length;
    this.callbacks.onStateChange({
      mode: 'editing',
      activeTextId: this.activeTextId,
      boxMode: 0,
      constraintWidth: 0,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
      caretIndex: this.caretIndex,
      selectionStart: this.selectionRange.start,
      selectionEnd: this.selectionRange.end,
    });
  }

  handleSelectionChange(start: number, end: number): void {
    this.selectionRange = { start, end };
    this.callbacks.onStateChange({
      mode: 'editing',
      activeTextId: this.activeTextId,
      boxMode: 0,
      constraintWidth: 0,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
      caretIndex: this.caretIndex,
      selectionStart: start,
      selectionEnd: end,
    });
    this.callbacks.onSelectionUpdate([]);
  }

  handleSpecialKey(key: string): void {
    if (key === 'undo') this.undoCount += 1;
    if (key === 'redo') this.redoCount += 1;
    this.callbacks.onStateChange({
      mode: 'editing',
      activeTextId: this.activeTextId,
      boxMode: 0,
      constraintWidth: 0,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
      caretIndex: 0,
      selectionStart: 0,
      selectionEnd: 0,
    });
  }

  getContent(): string {
    return this.content;
  }

  emitEditEnd(): void {
    this.callbacks.onEditEnd();
  }

  commitAndExit(): void {
    this.callbacks.onStateChange({
      mode: 'idle',
      activeTextId: null,
      boxMode: 0,
      constraintWidth: 0,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
      caretIndex: 0,
      selectionStart: 0,
      selectionEnd: 0,
    } as any);
    this.callbacks.onEditEnd();
  }

  handlePointerDown(): void {
    this.callbacks.onStateChange({
      mode: 'editing',
      activeTextId: this.activeTextId,
      boxMode: 0,
      constraintWidth: 0,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
      caretIndex: this.caretIndex,
      selectionStart: this.selectionRange.start,
      selectionEnd: this.selectionRange.end,
    });
  }

  resetEditingState(): void {
    this.content = '';
    this.selectionRange = { start: 0, end: 0 };
    this.caretIndex = 0;
  }

  resyncFromEngine(): void {
    // no-op for tests
  }
}

export const createFakeTextTool = (callbacks: TextToolCallbacks): FakeTextTool => {
  return new FakeTextTool(callbacks);
};
