/**
 * TextInputCoordinator - Handles text input and pointer events for TextTool
 * Manages click/drag creation, pointer selection, text input deltas, and selection changes.
 */

import {
  TextBoxMode,
  TextStyleFlags,
  charIndexToByteIndex,
  byteIndexToCharIndex,
  type TextInputDelta,
} from '@/types/text';

import type { TextBridge } from '@/engine/bridge/textBridge';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';

export interface TextInputState {
  mode: 'idle' | 'creating' | 'editing';
  activeTextId: number | null;
  boxMode: TextBoxMode;
  constraintWidth: number;
  caretIndex: number;
  selectionStart: number;
  selectionEnd: number;
  anchorX: number;
  anchorY: number;
  rotation: number;
}

export interface StyleDefaults {
  fontId: number;
  fontSize: number;
  colorRGBA: number;
  flags: TextStyleFlags;
}

export interface CoordinatorCallbacks {
  onStateChange: (state: TextInputState) => void;
  onTextCreated?: (
    shapeId: string,
    textId: number,
    x: number,
    y: number,
    boxMode: TextBoxMode,
    constraintWidth: number,
    initialWidth: number,
    initialHeight: number,
  ) => void;
  onTextUpdated?: (
    textId: number,
    bounds: { width: number; height: number },
    boxMode: TextBoxMode,
    constraintWidth: number,
  ) => void;
  updateCaretPosition: () => void;
}

export class TextInputCoordinator {
  private runtime: EngineRuntime | null = null;
  private bridge: TextBridge | null = null;
  private state: TextInputState;
  private styleDefaults: StyleDefaults;
  private callbacks: CoordinatorCallbacks;
  private lastDiagnosticTs = 0;

  // Selection drag state
  private selectionDragAnchor: number | null = null;
  private isDragging = false;
  private lastClickInfo: {
    textId: number | null;
    time: number;
    x: number;
    y: number;
    count: number;
  } = {
    textId: null,
    time: 0,
    x: 0,
    y: 0,
    count: 0,
  };

  constructor(callbacks: CoordinatorCallbacks, styleDefaults: StyleDefaults) {
    this.callbacks = callbacks;
    this.styleDefaults = styleDefaults;
    this.state = this.createInitialState();
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  initialize(runtime: EngineRuntime, bridge: TextBridge): void {
    this.runtime = runtime;
    this.bridge = bridge;
  }

  isReady(): boolean {
    return this.bridge !== null && this.bridge.isAvailable();
  }

  // ===========================================================================
  // State Management
  // ===========================================================================

  getState(): TextInputState {
    return { ...this.state };
  }

  setState(state: Partial<TextInputState>): void {
    this.state = { ...this.state, ...state };
  }

  private createInitialState(): TextInputState {
    return {
      mode: 'idle',
      activeTextId: null,
      boxMode: TextBoxMode.AutoWidth,
      constraintWidth: 0,
      caretIndex: 0,
      selectionStart: 0,
      selectionEnd: 0,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
    };
  }

  resetState(): void {
    this.state = this.createInitialState();
    this.selectionDragAnchor = null;
    this.isDragging = false;
  }

  /**
   * External reset hook for undo/redo/doc load/tool switch.
   * Resets UI state and emits a diagnostic for observability (rate-limited).
   */
  handleExternalMutation(reason: 'undo' | 'redo' | 'load' | 'tool-switch'): void {
    const activeId = this.state.activeTextId;
    this.resetState();
    this.callbacks.onStateChange(this.state);
    this.callbacks.updateCaretPosition();
    this.emitDiagnostic('text-sync:external-reset', { reason, activeId });
  }

  /** Public resync hook to pull state from engine defensively. */
  resyncFromEngine(): void {
    this.syncStateFromEngine();
  }

  setStyleDefaults(defaults: StyleDefaults): void {
    this.styleDefaults = defaults;
  }

  private getPooledContent(): string {
    if (!this.bridge || this.state.activeTextId === null) return '';
    return this.bridge.getTextContent(this.state.activeTextId) ?? '';
  }

  // ===========================================================================
  // Click/Drag Handlers (Text Creation)
  // ===========================================================================

  /**
   * Handle click on canvas - creates AutoWidth text.
   */
  handleClick(
    worldX: number,
    worldY: number,
    createTextEntity: (
      textId: number,
      x: number,
      y: number,
      boxMode: TextBoxMode,
      constraintWidth: number,
    ) => void,
  ): void {
    if (import.meta.env.DEV) {
      console.warn('[DEBUG] TextInputCoordinator: handleClick', { worldX, worldY });
    }
    if (!this.isReady() || !this.runtime) {
      console.warn('TextInputCoordinator.handleClick: Not ready');
      return;
    }

    // Create new text entity with AutoWidth mode
    const textId = this.runtime.allocateEntityId();
    const shapeId = `entity-${textId}`;

    this.state = {
      mode: 'creating',
      activeTextId: textId,
      boxMode: TextBoxMode.AutoWidth,
      constraintWidth: 0,
      caretIndex: 0,
      selectionStart: 0,
      selectionEnd: 0,
      anchorX: worldX,
      anchorY: worldY,
      rotation: 0,
    };

    // Create empty text entity in engine
    createTextEntity(textId, worldX, worldY, TextBoxMode.AutoWidth, 0);

    // Get bounds from engine
    const bounds = this.bridge?.getTextBounds(textId);
    const w = bounds && bounds.valid ? bounds.maxX - bounds.minX : 0;
    const h =
      bounds && bounds.valid ? bounds.maxY - bounds.minY : this.styleDefaults.fontSize * 1.2;

    this.callbacks.onTextCreated?.(shapeId, textId, worldX, worldY, TextBoxMode.AutoWidth, 0, w, h);

    this.callbacks.onStateChange(this.state);
    this.callbacks.updateCaretPosition();
  }

  /**
   * Handle drag on canvas - creates FixedWidth text box.
   */
  handleDrag(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    createTextEntity: (
      textId: number,
      x: number,
      y: number,
      boxMode: TextBoxMode,
      constraintWidth: number,
    ) => void,
  ): void {
    if (!this.isReady() || !this.runtime) return;

    // Calculate box dimensions
    const x = Math.min(startX, endX);
    const y = Math.max(startY, endY); // Y-Up: Top is Max Y
    const width = Math.abs(endX - startX);
    const height = Math.max(Math.abs(endY - startY), this.styleDefaults.fontSize * 1.2);

    // Minimum width for fixed-width text
    const constraintWidth = Math.max(width, 50);

    // Create new text entity with FixedWidth mode
    const textId = this.runtime.allocateEntityId();
    const shapeId = `entity-${textId}`;

    this.state = {
      mode: 'creating',
      activeTextId: textId,
      boxMode: TextBoxMode.FixedWidth,
      constraintWidth,
      caretIndex: 0,
      selectionStart: 0,
      selectionEnd: 0,
      anchorX: x,
      anchorY: y,
      rotation: 0,
    };

    // Create empty text entity in engine
    createTextEntity(textId, x, y, TextBoxMode.FixedWidth, constraintWidth);

    // Notify for JS shape creation
    const w = constraintWidth;
    const h = height;

    this.callbacks.onTextCreated?.(
      shapeId,
      textId,
      x,
      y,
      TextBoxMode.FixedWidth,
      constraintWidth,
      w,
      h,
    );

    this.callbacks.onStateChange(this.state);
    this.callbacks.updateCaretPosition();
  }

  // ===========================================================================
  // Pointer Event Handlers (Selection)
  // ===========================================================================

  /**
   * Handle pointer down on text.
   */
  handlePointerDown(
    textId: number,
    localX: number,
    localY: number,
    shiftKey: boolean,
    anchorX: number,
    anchorY: number,
    rotation: number,
    boxMode?: TextBoxMode,
    constraintWidth?: number,
    startDrag = true,
  ): void {
    if (!this.isReady() || !this.bridge) return;

    const resolvedBoxMode = boxMode ?? this.state.boxMode ?? TextBoxMode.AutoWidth;
    const resolvedConstraint =
      constraintWidth ??
      (resolvedBoxMode === TextBoxMode.FixedWidth ? this.state.constraintWidth : 0);

    // 1. Hit test
    const hitResult = this.bridge.hitTest(textId, localX, localY);
    let charIndex = 0;

    const content = this.bridge.getTextContent(textId) || '';

    if (hitResult) {
      charIndex = byteIndexToCharIndex(content, hitResult.byteIndex);
    }

    // Multi-click detection (word / all selection)
    const now = performance.now();
    const CLICK_THRESHOLD_MS = 500;
    const CLICK_DIST_THRESH = 4;
    let clickCount = 1;

    if (
      this.lastClickInfo.textId === textId &&
      now - this.lastClickInfo.time <= CLICK_THRESHOLD_MS &&
      Math.hypot(localX - this.lastClickInfo.x, localY - this.lastClickInfo.y) <= CLICK_DIST_THRESH
    ) {
      clickCount = Math.min(3, this.lastClickInfo.count + 1);
    }

    this.lastClickInfo = { textId, time: now, x: localX, y: localY, count: clickCount };

    if (this.state.activeTextId !== textId) {
      // Start editing new text
      this.state = {
        mode: 'editing',
        activeTextId: textId,
        boxMode: resolvedBoxMode,
        constraintWidth: resolvedConstraint,
        caretIndex: charIndex,
        selectionStart: charIndex,
        selectionEnd: charIndex,
        anchorX,
        anchorY,
        rotation,
      };
    } else {
      // Already editing - update state
      this.state = {
        ...this.state,
        anchorX,
        anchorY,
        rotation,
        boxMode: resolvedBoxMode,
        constraintWidth: resolvedConstraint,
      };

      if (this.state.selectionStart === this.state.selectionEnd) {
        this.selectionDragAnchor = this.state.caretIndex;
      }

      if (shiftKey && this.selectionDragAnchor !== null) {
        // Shift-click extend
        const start = Math.min(this.selectionDragAnchor, charIndex);
        const end = Math.max(this.selectionDragAnchor, charIndex);
        this.state = {
          ...this.state,
          caretIndex: charIndex,
          selectionStart: start,
          selectionEnd: end,
        };
      } else {
        // Reset selection
        this.state = {
          ...this.state,
          caretIndex: charIndex,
          selectionStart: charIndex,
          selectionEnd: charIndex,
        };
        this.selectionDragAnchor = charIndex;
      }
    }

    this.isDragging = startDrag;
    if (!shiftKey) {
      this.selectionDragAnchor = charIndex;
    }

    // Apply word / all selection for multi-clicks
    if (clickCount === 2 && this.bridge) {
      const wordStart = this.bridge.getWordLeft(textId, charIndex, content);
      const wordEnd = this.bridge.getWordRight(textId, charIndex, content);
      this.state = {
        ...this.state,
        caretIndex: wordEnd,
        selectionStart: Math.min(wordStart, wordEnd),
        selectionEnd: Math.max(wordStart, wordEnd),
      };
      this.selectionDragAnchor = wordStart;
      this.isDragging = false;
    } else if (clickCount >= 3) {
      const endIdx = content.length;
      this.state = {
        ...this.state,
        caretIndex: endIdx,
        selectionStart: 0,
        selectionEnd: endIdx,
      };
      this.selectionDragAnchor = 0;
      this.isDragging = false;
    }

    // Update engine
    this.bridge.setCaretByteIndex(textId, charIndexToByteIndex(content, this.state.caretIndex));

    this.callbacks.onStateChange(this.state);
    this.callbacks.updateCaretPosition();
  }

  /**
   * Handle pointer move during text selection drag.
   */
  handlePointerMove(textId: number, localX: number, localY: number): void {
    if (!this.isDragging || !this.bridge || this.state.activeTextId !== textId) return;

    const hitResult = this.bridge.hitTest(textId, localX, localY);
    if (!hitResult) return;

    const currentContent = this.getPooledContent();
    const charIndex = byteIndexToCharIndex(currentContent, hitResult.byteIndex);
    const anchor = this.selectionDragAnchor ?? charIndex;

    const start = Math.min(anchor, charIndex);
    const end = Math.max(anchor, charIndex);

    this.state = {
      ...this.state,
      caretIndex: charIndex,
      selectionStart: start,
      selectionEnd: end,
    };

    this.callbacks.onStateChange(this.state);
    this.callbacks.updateCaretPosition();
  }

  /**
   * Handle pointer up - end selection drag.
   */
  handlePointerUp(): void {
    this.isDragging = false;
  }

  // ===========================================================================
  // Input Delta Handling
  // ===========================================================================

  /**
   * Sync local state from engine (Single Source of Truth).
   * Call this after any operation that modifies text or selection.
   */
  private syncStateFromEngine(): void {
    if (!this.bridge || this.state.activeTextId === null) return;

    const textId = this.state.activeTextId;
    const content = this.bridge.getTextContent(textId);
    if (content === null) {
      this.resetState();
      this.callbacks.onStateChange(this.state);
      this.callbacks.updateCaretPosition();
      this.emitDiagnostic('text-sync:missing-entity', { textId });
      return;
    }

    const snapshot = this.bridge.getTextStyleSnapshot(textId);
    if (!snapshot) {
      this.resetState();
      this.callbacks.onStateChange(this.state);
      this.callbacks.updateCaretPosition();
      this.emitDiagnostic('text-sync:missing-snapshot', { textId });
      return;
    }

    const clamp = (value: number): number => Math.max(0, Math.min(value, content.length));
    const caretIndex = clamp(snapshot.caretLogical);
    const selectionStart = clamp(snapshot.selectionStartLogical);
    const selectionEnd = clamp(snapshot.selectionEndLogical);
    if (
      caretIndex !== snapshot.caretLogical ||
      selectionStart !== snapshot.selectionStartLogical ||
      selectionEnd !== snapshot.selectionEndLogical
    ) {
      this.emitDiagnostic('text-sync:clamped-selection', {
        textId,
        caretLogical: snapshot.caretLogical,
        selectionStartLogical: snapshot.selectionStartLogical,
        selectionEndLogical: snapshot.selectionEndLogical,
        contentLength: content.length,
      });
    }

    // Update state from engine snapshot
    // Note: Engine provides 'Logical' indices which correspond to JS char indices (usually)
    // If mismatch proves to be an issue with emojis, we might need byte-to-char conversion
    // but TextStyleSnapshot.caretLogical is designed for this.
    this.state = {
      ...this.state,
      caretIndex,
      selectionStart,
      selectionEnd,
    };

    this.callbacks.onStateChange(this.state);
    this.callbacks.updateCaretPosition();
  }

  private emitDiagnostic(reason: string, payload: Record<string, unknown>): void {
    const now =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (now - this.lastDiagnosticTs < 200) return; // prevent log spam
    this.lastDiagnosticTs = now;
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[text-sync]', reason, payload);
    }
  }

  /**
   * Handle text input delta from TextInputProxy.
   */
  handleInputDelta(delta: TextInputDelta): void {
    if (!this.isReady() || !this.bridge || this.state.activeTextId === null) {
      console.warn('[DEBUG] TextInputCoordinator: handleInputDelta skipped');
      return;
    }

    if (import.meta.env.DEV) {
      console.warn('[DEBUG] TextInputCoordinator: handleInputDelta', delta);
    }

    const textId = this.state.activeTextId;

    // 1. Apply changes to Engine
    switch (delta.type) {
      case 'insert': {
        const currentContent = this.getPooledContent();
        const byteIndex = charIndexToByteIndex(currentContent, delta.at);
        this.bridge.insertContentByteIndex(textId, byteIndex, delta.text);
        break;
      }

      case 'delete': {
        const currentContent = this.getPooledContent();
        const startByte = charIndexToByteIndex(currentContent, delta.start);
        const endByte = charIndexToByteIndex(currentContent, delta.end);
        this.bridge.deleteContentByteIndex(textId, startByte, endByte);
        break;
      }

      case 'replace': {
        const currentContent = this.getPooledContent();
        const startByte = charIndexToByteIndex(currentContent, delta.start);
        const endByte = charIndexToByteIndex(currentContent, delta.end);

        this.bridge.deleteContentByteIndex(textId, startByte, endByte);
        this.bridge.insertContentByteIndex(textId, startByte, delta.text);
        break;
      }
    }

    // 2. Sync state from Engine (SSOT)
    // We assume the Engine updates the caret automatically after insertion/deletion
    // If not, we might need to set it manually based on delta,
    // but ideally the Engine handles 'insert moves caret'.
    // NOTE: If engine doesn't auto-move caret on insert, we might need explicitly set it.
    // Let's assume for now we need to hint the engine if it doesn't auto-update,
    // but standard behavior is valid.
    // Actually, TextBridge operations (insertContent) usually DON'T move caret automatically
    // in strict ECS, but let's check.
    // If they don't, we should send SetCaret command too.

    // For now, let's explicitly update caret in Engine based on delta,
    // THEN read back. This keeps 'logic' here but 'truth' from Engine.
    // Ideally Engine command `InsertText` should update caret.
    // If we rely on the bridge commands which are atomic, we might need to set caret.

    // Let's optimize: calculate target caret, set in engine, them read back.
    // This is still cleaner than keeping local state authoritative.

    let targetCaretChar = this.state.caretIndex;
    if (delta.type === 'insert') targetCaretChar = delta.at + delta.text.length;
    else if (delta.type === 'delete') targetCaretChar = delta.start;
    else if (delta.type === 'replace') targetCaretChar = delta.start + delta.text.length;

    const contentAfter = this.getPooledContent();
    const caretByte = charIndexToByteIndex(contentAfter, targetCaretChar);
    this.bridge.setCaretByteIndex(textId, caretByte);

    this.syncStateFromEngine();

    // 3. Notify JS side for shape bounds (estimated or computed)
    const bounds = this.bridge.getTextBounds(textId);
    let estimatedWidth = 100;
    let estimatedHeight = 16;

    if (bounds && bounds.valid) {
      estimatedWidth = bounds.maxX - bounds.minX;
      estimatedHeight = bounds.maxY - bounds.minY;
    } else {
      estimatedWidth =
        this.state.boxMode === TextBoxMode.FixedWidth ? this.state.constraintWidth : 50;
      estimatedHeight = this.styleDefaults.fontSize;
    }

    this.callbacks.onTextUpdated?.(
      textId,
      { width: estimatedWidth, height: estimatedHeight },
      this.state.boxMode,
      this.state.constraintWidth,
    );
  }

  /**
   * Handle selection change from TextInputProxy.
   */
  handleSelectionChange(start: number, end: number): void {
    if (!this.isReady() || !this.bridge || this.state.activeTextId === null) return;

    const textId = this.state.activeTextId;
    const currentContent = this.getPooledContent();

    const startByte = charIndexToByteIndex(currentContent, start);
    const endByte = charIndexToByteIndex(currentContent, end);

    if (start === end) {
      this.bridge.setCaretByteIndex(textId, startByte);
    } else {
      this.bridge.setSelectionByteIndex(textId, startByte, endByte);
    }

    this.syncStateFromEngine();
  }
}
