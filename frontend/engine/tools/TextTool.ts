/**
 * TextTool - Text creation/editing orchestrator.
 * Coordinates TextBridge, TextInputCoordinator, NavigationHandler, StyleHandler.
 */
import { TextBridge } from '@/engine/bridge/textBridge';
import { TextInputCoordinator } from '@/engine/tools/text/TextInputCoordinator';
import { TextNavigationHandler } from '@/engine/tools/text/TextNavigationHandler';
import { TextStateManager } from '@/engine/tools/text/TextStateManager';
import { TextStyleHandler } from '@/engine/tools/text/TextStyleHandler';
import {
  TextBoxMode,
  TextAlign,
  TextStyleFlags,
  charIndexToByteIndex,
  type TextPayload,
  type TextInputDelta,
  type TextCompositionState,
  type TextStyleSnapshot,
} from '@/types/text';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';

// Types

export type TextToolMode = 'idle' | 'creating' | 'editing';

export interface TextToolState {
  mode: TextToolMode;
  /** ID of the text entity being edited (engine ID) */
  activeTextId: number | null;
  /** Box mode: 0 = AutoWidth, 1 = FixedWidth */
  boxMode: TextBoxMode;
  /** For FixedWidth: the constraint width */
  constraintWidth: number;
  /** Current caret position (character index) */
  caretIndex: number;
  /** Selection start (same as caret if no selection) */
  selectionStart: number;
  /** Selection end */
  selectionEnd: number;
  /** Position where text was created */
  anchorX: number;
  anchorY: number;
  rotation: number;
  // NOTE: `content` removed — use getPooledContent() to read from engine
}

export interface TextStyleDefaults {
  fontId: number;
  fontSize: number;
  colorRGBA: number;
  flags: TextStyleFlags;
  align: TextAlign;
}

export interface TextToolCallbacks {
  /** Called when tool state changes */
  onStateChange: (state: TextToolState) => void;
  /** Called when caret position updates (for overlay rendering) */
  onCaretUpdate: (
    x: number,
    y: number,
    height: number,
    rotation: number,
    anchorX: number,
    anchorY: number,
  ) => void;
  /** Called when selection rects update */
  onSelectionUpdate?: (rects: import('@/types/text').TextSelectionRect[]) => void;
  /** Called when engine style snapshot updates (tri-state flags, caret/selection). */
  onStyleSnapshot?: (textId: number, snapshot: TextStyleSnapshot) => void;
  /** Called when editing ends */
  onEditEnd: () => void;
  /** Called when a new text entity is created (for syncing to JS store) */
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
  /** Called when text content/bounds are updated */
  onTextUpdated?: (
    textId: number,
    bounds: { width: number; height: number },
    boxMode: TextBoxMode,
    constraintWidth: number,
    x?: number,
    y?: number,
  ) => void;
  /** Called when text is deleted (for syncing to JS store) */
  onTextDeleted?: (textId: number) => void;
}

// =============================================================================
// TextTool Class
// =============================================================================

export class TextTool {
  private bridge: TextBridge | null = null;
  private callbacks: TextToolCallbacks;
  private initialized = false;

  // Delegated handlers
  private stateManager: TextStateManager;
  private navigationHandler: TextNavigationHandler | null = null;
  private styleHandler: TextStyleHandler | null = null;
  private inputCoordinator: TextInputCoordinator;

  constructor(callbacks: TextToolCallbacks) {
    this.callbacks = callbacks;

    // Create state manager with state change callback
    this.stateManager = new TextStateManager((state) => {
      this.callbacks.onStateChange(state);
    });

    // Create input coordinator with callbacks that sync state with TextTool
    this.inputCoordinator = new TextInputCoordinator(
      {
        onStateChange: (coordState) => {
          // Sync coordinator state to TextTool state via stateManager
          this.stateManager.updateState({
            mode: coordState.mode,
            activeTextId: coordState.activeTextId,
            boxMode: coordState.boxMode,
            constraintWidth: coordState.constraintWidth,
            caretIndex: coordState.caretIndex,
            selectionStart: coordState.selectionStart,
            selectionEnd: coordState.selectionEnd,
            anchorX: coordState.anchorX,
            anchorY: coordState.anchorY,
            rotation: coordState.rotation,
          });
        },
        onTextCreated: callbacks.onTextCreated,
        onTextUpdated: callbacks.onTextUpdated,
        updateCaretPosition: () => this.updateCaretPosition(),
      },
      {
        fontId: this.stateManager.getStyleDefaults().fontId,
        fontSize: this.stateManager.getStyleDefaults().fontSize,
        colorRGBA: this.stateManager.getStyleDefaults().colorRGBA,
        flags: this.stateManager.getStyleDefaults().flags,
      },
    );
  }

  /** Get current state (delegated to stateManager). */
  private get state(): TextToolState {
    return this.stateManager.getState();
  }

  /** Get style defaults (delegated to stateManager). */
  private get styleDefaults(): TextStyleDefaults {
    return this.stateManager.getStyleDefaults();
  }

  private getPooledContent(): string {
    const state = this.stateManager.getState();
    if (!this.bridge || state.activeTextId === null) return '';
    return this.bridge.getTextContent(state.activeTextId) ?? '';
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the text tool with the engine runtime.
   * Must be called before using text features.
   */
  initialize(runtime: EngineRuntime): boolean {
    this.bridge = new TextBridge(runtime);

    // Initialize text system in engine
    const success = this.bridge.initialize();
    if (!success) {
      return false;
    }

    // Initialize navigation handler
    this.navigationHandler = new TextNavigationHandler(this.bridge, this.stateManager, {
      onCaretUpdate: () => this.updateCaretPosition(),
    });

    // Initialize style handler with adapted callback (ignore content param)
    this.styleHandler = new TextStyleHandler(this.bridge, this.stateManager, {
      onTextUpdated: this.callbacks.onTextUpdated
        ? (textId, _content, bounds, boxMode, constraintWidth) =>
            this.callbacks.onTextUpdated!(textId, bounds, boxMode, constraintWidth)
        : undefined,
      onCaretUpdate: () => this.updateCaretPosition(),
    });

    // Initialize the input coordinator
    this.inputCoordinator.initialize(runtime, this.bridge);

    this.initialized = true;
    return true;
  }

  /**
   * Check if the tool is ready for use.
   */
  isReady(): boolean {
    return this.initialized && this.bridge !== null && this.bridge.isAvailable();
  }

  /** Reset editing UI state when document history or tool context changes. */
  resetEditingState(reason: 'undo' | 'redo' | 'load' | 'tool-switch'): void {
    this.inputCoordinator.handleExternalMutation(reason);
    this.stateManager.clearActiveText();
  }

  /** Force a defensive resync from engine (used after external mutations). */
  resyncFromEngine(): void {
    this.inputCoordinator.resyncFromEngine();
  }

  /**
   * Load a font for text rendering.
   */
  loadFont(fontId: number, fontData: Uint8Array): boolean {
    return this.loadFontEx(fontId, fontData, false, false);
  }

  /**
   * Load a font with style variant flags.
   */
  loadFontEx(fontId: number, fontData: Uint8Array, bold: boolean, italic: boolean): boolean {
    if (!this.bridge) return false;
    return this.bridge.loadFontEx(fontId, fontData, bold, italic);
  }

  // ===========================================================================
  // Style Management
  // ===========================================================================

  /**
   * Set default text style for new text.
   */
  setStyleDefaults(defaults: Partial<TextStyleDefaults>): void {
    this.stateManager.setStyleDefaults(defaults);
    const updated = this.stateManager.getStyleDefaults();
    this.inputCoordinator.setStyleDefaults({
      fontId: updated.fontId,
      fontSize: updated.fontSize,
      colorRGBA: updated.colorRGBA,
      flags: updated.flags,
    });
  }

  /**
   * Get current style defaults.
   */
  getStyleDefaults(): TextStyleDefaults {
    return this.stateManager.getStyleDefaults();
  }

  // ===========================================================================
  // Tool Actions
  // ===========================================================================

  /**
   * Handle click on canvas - creates AutoWidth text.
   * @param worldX World X coordinate
   * @param worldY World Y coordinate
   */
  handleClick(worldX: number, worldY: number): void {
    if (!this.isReady()) {
      return;
    }
    this.inputCoordinator.handleClick(worldX, worldY, (textId, x, y, boxMode, constraintWidth) =>
      this.createTextEntity(textId, x, y, boxMode, constraintWidth),
    );
  }

  /** Handle drag on canvas - creates FixedWidth text box. */
  handleDrag(startX: number, startY: number, endX: number, endY: number): void {
    if (!this.isReady()) return;
    this.inputCoordinator.handleDrag(
      startX,
      startY,
      endX,
      endY,
      (textId, x, y, boxMode, constraintWidth) =>
        this.createTextEntity(textId, x, y, boxMode, constraintWidth),
    );
  }

  /** Handle pointer down on text. */
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
    viewScale = 1,
    startDrag = true,
  ): void {
    if (!this.isReady()) return;
    this.inputCoordinator.handlePointerDown(
      textId,
      localX,
      localY,
      shiftKey,
      anchorX,
      anchorY,
      rotation,
      boxMode,
      constraintWidth,
      viewScale,
      startDrag,
    );
  }

  handlePointerMove(textId: number, localX: number, localY: number): void {
    this.inputCoordinator.handlePointerMove(textId, localX, localY);
  }

  handlePointerUp(): void {
    this.inputCoordinator.handlePointerUp();
  }

  /** Resize text entity (updates constraint width). */
  resizeText(textId: number, width: number): { width: number; height: number } | null {
    if (!this.isReady() || !this.bridge) return null;
    if (!this.bridge.setTextConstraintWidth(textId, width)) return null;

    const bounds = this.bridge.getTextBounds(textId);
    if (!bounds || !bounds.valid) return null;

    // Update local state if we are currently editing this text
    const state = this.stateManager.getState();
    if (state.activeTextId === textId) {
      this.stateManager.updateState({
        constraintWidth: width,
        boxMode: TextBoxMode.FixedWidth,
      });
    }

    return {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY,
    };
  }

  /**
   * Move text entity to a new position (anchor point).
   * Called when a text shape is moved via the selection tool.
   * @param textId Text Entity ID
   * @param anchorX New X coordinate (top-left anchor in Y-Up world)
   * @param anchorY New Y coordinate (top-left anchor in Y-Up world)
   * @return True if successful
   */
  moveText(
    textId: number,
    anchorX: number,
    anchorY: number,
    boxMode: TextBoxMode = TextBoxMode.AutoWidth,
    constraintWidth = 0,
  ): boolean {
    if (!this.isReady() || !this.bridge) return false;

    const success = this.bridge.updateTextPosition(
      textId,
      anchorX,
      anchorY,
      boxMode,
      constraintWidth,
    );

    // Update local state if we are currently editing this text
    const state = this.stateManager.getState();
    if (success && state.activeTextId === textId) {
      this.stateManager.updateState({ anchorX, anchorY });
      // Update caret position to reflect new anchor
      this.updateCaretPosition();
    }

    return success;
  }

  // ===========================================================================
  // Input Handling
  // ===========================================================================

  /**
   * Handle text input delta from TextInputProxy.
   */
  handleInputDelta(delta: TextInputDelta): void {
    // Delegate to input coordinator
    this.inputCoordinator.handleInputDelta(delta);
  }

  /**
   * Handle IME composition updates from TextInputProxy.
   */
  handleComposition(state: TextCompositionState): void {
    this.inputCoordinator.handleComposition(state);
  }

  /**
   * Handle selection change from TextInputProxy.
   */
  handleSelectionChange(start: number, end: number): void {
    // Delegate to input coordinator
    this.inputCoordinator.handleSelectionChange(start, end);
  }

  // ==========================================================================
  // Style Commands (delegated to TextStyleHandler)
  // ==========================================================================

  applyStyle(flagsMask: TextStyleFlags, intent: 'set' | 'clear' | 'toggle'): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyStyle(flagsMask, intent);
  }

  applyFontSize(fontSize: number): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyFontSize(fontSize);
  }

  applyTextAlign(align: TextAlign): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyTextAlign(align);
  }

  applyTextAlignToText(textId: number, align: TextAlign): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyTextAlignToText(textId, align);
  }

  applyFontId(fontId: number): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyFontId(fontId);
  }

  applyStyleToText(
    textId: number,
    flagsMask: TextStyleFlags,
    intent: 'set' | 'clear' | 'toggle',
  ): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyStyleToText(textId, flagsMask, intent);
  }

  applyFontSizeToText(textId: number, fontSize: number): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyFontSizeToText(textId, fontSize);
  }

  applyFontIdToText(textId: number, fontId: number): boolean {
    if (!this.styleHandler) return false;
    return this.styleHandler.applyFontIdToText(textId, fontId);
  }

  // ===========================================================================
  // Special Key Handling (delegated to TextNavigationHandler)
  // ===========================================================================

  handleSpecialKey(
    key: string,
    event?: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; preventDefault: () => void },
  ): void {
    // Handle Escape/Enter first
    if (key === 'Escape') {
      this.commitAndExit();
      event?.preventDefault();
      return;
    }
    if (key === 'Enter') {
      // Let TextInputProxy handle newline insertion
      return;
    }

    // Delegate navigation keys to handler
    if (this.isEditing() && this.navigationHandler && event) {
      this.navigationHandler.handleNavigationKey(key, event);
    }
  }

  // ===========================================================================
  // Commit / Cancel
  // ===========================================================================

  /**
   * Commit current text and exit editing mode.
   */
  commitAndExit(): void {
    const state = this.stateManager.getState();
    const textId = state.activeTextId;
    const content =
      textId !== null && this.bridge ? (this.bridge.getTextContent(textId) ?? '') : '';

    if (textId !== null && content.trim() === '') {
      // Delete empty text
      this.bridge?.deleteText(textId);
      this.callbacks.onTextDeleted?.(textId);
    }

    this.stateManager.clearActiveText();
    this.callbacks.onEditEnd();
  }

  /**
   * Cancel editing without committing.
   */
  cancel(): void {
    const state = this.stateManager.getState();
    if (state.mode === 'creating' && state.activeTextId !== null) {
      // Delete the text we were creating
      this.bridge?.deleteText(state.activeTextId);
      this.callbacks.onTextDeleted?.(state.activeTextId);
    }

    this.stateManager.clearActiveText();
    this.callbacks.onEditEnd();
  }

  // ===========================================================================
  // State Access
  // ===========================================================================

  /**
   * Get current tool state.
   */
  getState(): TextToolState {
    return this.stateManager.getState();
  }

  /**
   * Check if currently editing text.
   */
  isEditing(): boolean {
    const state = this.stateManager.getState();
    return state.mode === 'creating' || state.mode === 'editing';
  }

  /**
   * Get the active text ID.
   */
  getActiveTextId(): number | null {
    return this.stateManager.getState().activeTextId;
  }

  /**
   * Get current text content from the engine.
   * Use this to read content instead of relying on state.
   */
  getContent(): string {
    return this.getPooledContent();
  }

  /**
   * Delete a text entity by its engine ID.
   * Called when a text shape is deleted from the JS store.
   * @param textId Engine text ID
   * @return True if successfully deleted
   */
  deleteTextById(textId: number): boolean {
    if (!this.isReady() || !this.bridge) return false;

    const state = this.stateManager.getState();
    if (state.activeTextId === textId) {
      this.stateManager.clearActiveText();
      this.callbacks.onEditEnd();
    }

    this.bridge.deleteText(textId);
    return true;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private createTextEntity(
    textId: number,
    x: number,
    y: number,
    boxMode: TextBoxMode,
    constraintWidth: number,
  ): void {
    if (!this.bridge) return;

    const payload: TextPayload = {
      x,
      y,
      rotation: 0,
      boxMode,
      align: this.styleDefaults.align,
      constraintWidth,
      runs: [
        {
          startIndex: 0,
          length: 0,
          fontId: this.styleDefaults.fontId,
          fontSize: this.styleDefaults.fontSize,
          colorRGBA: this.styleDefaults.colorRGBA,
          flags: this.styleDefaults.flags,
        },
      ],
      content: '',
    };

    this.bridge.upsertText(textId, payload);
  }

  private updateCaretPosition(): void {
    if (!this.bridge || this.state.activeTextId === null) return;

    const updateContent = this.getPooledContent();
    const caretByte = charIndexToByteIndex(updateContent, this.state.caretIndex);
    const caretPos = this.bridge.getCaretPosition(this.state.activeTextId, caretByte);

    if (caretPos) {
      // Pass local coordinates. Overlay handles Transform.
      this.callbacks.onCaretUpdate(
        caretPos.x,
        caretPos.y,
        caretPos.height,
        this.state.rotation,
        this.state.anchorX,
        this.state.anchorY,
      );
    } else {
      // Fallback
      this.callbacks.onCaretUpdate(
        0,
        0,
        16,
        this.state.rotation,
        this.state.anchorX,
        this.state.anchorY,
      );
    }

    // Update selection rects if there is a selection
    if (this.state.selectionStart !== this.state.selectionEnd) {
      const start = Math.min(this.state.selectionStart, this.state.selectionEnd);
      const end = Math.max(this.state.selectionStart, this.state.selectionEnd);

      const localRects = this.bridge.getSelectionRects(
        this.state.activeTextId,
        start,
        end,
        updateContent,
      );

      // Pass local rects directly
      this.callbacks.onSelectionUpdate?.(localRects);
    } else {
      this.callbacks.onSelectionUpdate?.([]);
    }

    if (this.callbacks.onStyleSnapshot && this.bridge && this.state.activeTextId !== null) {
      const snapshot = this.bridge.getTextStyleSnapshot(this.state.activeTextId);
      if (snapshot) {
        this.callbacks.onStyleSnapshot(this.state.activeTextId, snapshot);
      }
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new TextTool instance.
 */
export function createTextTool(callbacks: TextToolCallbacks): TextTool {
  return new TextTool(callbacks);
}

export default TextTool;
