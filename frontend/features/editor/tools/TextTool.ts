/**
 * TextTool - Engine-Native Text Tool Integration
 *
 * This module handles text creation and editing workflows:
 * - AutoWidth mode: Click to create text that grows horizontally
 * - FixedWidth mode: Drag to create a text box with word wrapping
 *
 * The tool coordinates between:
 * - TextBridge: Sends commands to the WASM engine
 * - TextInputProxy: Captures keyboard/IME input
 * - TextCaretOverlay: Renders caret and selection visuals
 */

import type { EngineRuntime } from '@/engine/runtime/EngineRuntime';
import { TextBridge } from '@/wasm/textBridge';
import {
  TextBoxMode,
  TextAlign,
  TextStyleFlags,
  packColorRGBA,
  charIndexToByteIndex,
  byteIndexToCharIndex,
  type TextPayload,
  type TextInputDelta,
} from '@/types/text';

// =============================================================================
// Types
// =============================================================================

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
  /** Current text content (for TextInputProxy sync) */
  content: string;
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
  onCaretUpdate: (x: number, y: number, height: number) => void;
  /** Called when editing ends */
  onEditEnd: () => void;
  /** Called when a new text entity is created (for syncing to JS store) */
  onTextCreated?: (textId: number, x: number, y: number, boxMode: TextBoxMode, constraintWidth: number) => void;
  /** Called when text content/bounds are updated */
  onTextUpdated?: (textId: number, content: string, bounds: { width: number; height: number }) => void;
  /** Called when text is deleted (for syncing to JS store) */
  onTextDeleted?: (textId: number) => void;
}

// =============================================================================
// TextTool Class
// =============================================================================

export class TextTool {
  private runtime: EngineRuntime | null = null;
  private bridge: TextBridge | null = null;
  private state: TextToolState;
  private styleDefaults: TextStyleDefaults;
  private callbacks: TextToolCallbacks;
  private nextTextId = 1;
  private initialized = false;

  constructor(callbacks: TextToolCallbacks) {
    this.callbacks = callbacks;
    this.state = this.createInitialState();
    this.styleDefaults = {
      fontId: 4, // Use fontId=4 (Inter/DejaVu Sans) as default - fontId=0 is reserved but has no font loaded
      fontSize: 16,
      colorRGBA: packColorRGBA(1, 1, 1, 1), // White (default canvas background is dark)
      flags: TextStyleFlags.None,
      align: TextAlign.Left,
    };
  }

  private createInitialState(): TextToolState {
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
      content: '',
    };
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize the text tool with the engine runtime.
   * Must be called before using text features.
   */
  initialize(runtime: EngineRuntime): boolean {
    this.runtime = runtime;
    this.bridge = new TextBridge(runtime);

    // Initialize text system in engine
    const success = this.bridge.initialize();
    if (!success) {
      console.warn('TextTool: Failed to initialize text system');
      return false;
    }

    this.initialized = true;
    return true;
  }

  /**
   * Check if the tool is ready for use.
   */
  isReady(): boolean {
    return this.initialized && this.bridge !== null && this.bridge.isAvailable();
  }

  /**
   * Load a font for text rendering.
   */
  loadFont(fontId: number, fontData: Uint8Array): boolean {
    if (!this.bridge) return false;
    return this.bridge.loadFont(fontId, fontData);
  }

  // ===========================================================================
  // Style Management
  // ===========================================================================

  /**
   * Set default text style for new text.
   */
  setStyleDefaults(defaults: Partial<TextStyleDefaults>): void {
    this.styleDefaults = { ...this.styleDefaults, ...defaults };
  }

  /**
   * Get current style defaults.
   */
  getStyleDefaults(): TextStyleDefaults {
    return { ...this.styleDefaults };
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
    console.log('[DEBUG] TextTool: handleClick', { worldX, worldY });
    if (!this.isReady()) {
      console.warn('TextTool.handleClick: Tool not ready', {
        initialized: this.initialized,
        bridge: !!this.bridge,
        bridgeAvailable: this.bridge?.isAvailable(),
      });
      return;
    }

    // Create new text entity with AutoWidth mode
    const textId = this.allocateTextId();

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
      content: '',
    };

    // Create empty text entity in engine
    this.createTextEntity(textId, worldX, worldY, TextBoxMode.AutoWidth, 0);

    // Notify for JS shape creation
    this.callbacks.onTextCreated?.(textId, worldX, worldY, TextBoxMode.AutoWidth, 0);

    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  /**
   * Handle drag on canvas - creates FixedWidth text box.
   * @param startX Start X coordinate (world)
   * @param startY Start Y coordinate (world)
   * @param endX End X coordinate (world)
   * @param endY End Y coordinate (world)
   */
  handleDrag(startX: number, startY: number, endX: number, endY: number): void {
    if (!this.isReady()) return;

    // Calculate box dimensions
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const width = Math.abs(endX - startX);

    // Minimum width for fixed-width text
    const constraintWidth = Math.max(width, 50);

    // Create new text entity with FixedWidth mode
    const textId = this.allocateTextId();

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
      content: '',
    };

    // Create empty text entity in engine
    this.createTextEntity(textId, x, y, TextBoxMode.FixedWidth, constraintWidth);

    // Notify for JS shape creation
    this.callbacks.onTextCreated?.(textId, x, y, TextBoxMode.FixedWidth, constraintWidth);

    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  /**
   * Handle click on existing text to edit it.
   * @param textId Engine text ID
   * @param localX Local X coordinate (within text bounds)
   * @param localY Local Y coordinate (within text bounds)
   */
  handleEditClick(textId: number, localX: number, localY: number): void {
    if (!this.isReady() || !this.bridge) return;

    // Hit test to find caret position (returns byte index)
    const hitResult = this.bridge.hitTest(textId, localX, localY);
    
    // Get existing text content from engine (source of truth)
    const content = this.bridge.getTextContent(textId);
    if (content === null) {
      // Text entity doesn't exist
      console.warn('TextTool.handleEditClick: Text entity not found', { textId });
      return;
    }

    // Determine caret position - use hitResult if available, otherwise start of text
    let byteIndex = 0;
    if (hitResult) {
      byteIndex = hitResult.byteIndex;
    }
    
    // Convert byte index to character index for local state
    const charIndex = byteIndexToCharIndex(content, byteIndex);

    this.state = {
      mode: 'editing',
      activeTextId: textId,
      boxMode: TextBoxMode.AutoWidth, // TODO: Query engine for actual mode
      constraintWidth: 0,
      caretIndex: charIndex,
      selectionStart: charIndex,
      selectionEnd: charIndex,
      anchorX: 0, // TODO: Query engine for position
      anchorY: 0,
      content,
    };

    // Set caret in engine using byte index
    this.bridge.setCaretByteIndex(textId, byteIndex);

    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  // ===========================================================================
  // Input Handling
  // ===========================================================================

  /**
   * Handle text input delta from TextInputProxy.
   */
  handleInputDelta(delta: TextInputDelta): void {
    if (!this.isReady() || !this.bridge || this.state.activeTextId === null) {
      console.warn('[DEBUG] TextTool: handleInputDelta skipped', { ready: this.isReady(), bridge: !!this.bridge, activeTextId: this.state.activeTextId });
      return;
    }

    console.log('[DEBUG] TextTool: handleInputDelta', delta);

    const textId = this.state.activeTextId;

    switch (delta.type) {
      case 'insert': {
        // Convert character index to byte index for engine
        const byteIndex = charIndexToByteIndex(this.state.content, delta.at);
        this.bridge.insertContentByteIndex(textId, byteIndex, delta.text);

        // Update local state
        const newContent =
          this.state.content.slice(0, delta.at) +
          delta.text +
          this.state.content.slice(delta.at);
        const newCaretIndex = delta.at + delta.text.length;

        this.state = {
          ...this.state,
          content: newContent,
          caretIndex: newCaretIndex,
          selectionStart: newCaretIndex,
          selectionEnd: newCaretIndex,
        };
        break;
      }

      case 'delete': {
        const startByte = charIndexToByteIndex(this.state.content, delta.start);
        const endByte = charIndexToByteIndex(this.state.content, delta.end);
        this.bridge.deleteContentByteIndex(textId, startByte, endByte);

        // Update local state
        const newContent =
          this.state.content.slice(0, delta.start) + this.state.content.slice(delta.end);

        this.state = {
          ...this.state,
          content: newContent,
          caretIndex: delta.start,
          selectionStart: delta.start,
          selectionEnd: delta.start,
        };
        break;
      }

      case 'replace': {
        const startByte = charIndexToByteIndex(this.state.content, delta.start);
        const endByte = charIndexToByteIndex(this.state.content, delta.end);

        // Delete then insert
        this.bridge.deleteContentByteIndex(textId, startByte, endByte);
        this.bridge.insertContentByteIndex(textId, startByte, delta.text);

        // Update local state
        const newContent =
          this.state.content.slice(0, delta.start) +
          delta.text +
          this.state.content.slice(delta.end);
        const newCaretIndex = delta.start + delta.text.length;

        this.state = {
          ...this.state,
          content: newContent,
          caretIndex: newCaretIndex,
          selectionStart: newCaretIndex,
          selectionEnd: newCaretIndex,
        };
        break;
      }
    }

    // Update caret in engine
    const caretByte = charIndexToByteIndex(this.state.content, this.state.caretIndex);
    this.bridge.setCaretByteIndex(textId, caretByte);

    // Notify JS side of text update (for bounds sync)
    // TODO: Get layout bounds from engine for accurate sizing
    const estimatedWidth = this.state.boxMode === TextBoxMode.FixedWidth 
      ? this.state.constraintWidth 
      : Math.max(50, this.state.content.length * (this.styleDefaults.fontSize * 0.6));
    const estimatedHeight = this.styleDefaults.fontSize * 1.2;
    this.callbacks.onTextUpdated?.(textId, this.state.content, { width: estimatedWidth, height: estimatedHeight });

    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  /**
   * Handle selection change from TextInputProxy.
   */
  handleSelectionChange(start: number, end: number): void {
    if (!this.isReady() || !this.bridge || this.state.activeTextId === null) return;

    const textId = this.state.activeTextId;

    // Convert to byte indices
    const startByte = charIndexToByteIndex(this.state.content, start);
    const endByte = charIndexToByteIndex(this.state.content, end);

    // Update engine
    if (start === end) {
      this.bridge.setCaretByteIndex(textId, startByte);
    } else {
      this.bridge.setSelectionByteIndex(textId, startByte, endByte);
    }

    this.state = {
      ...this.state,
      caretIndex: end,
      selectionStart: start,
      selectionEnd: end,
    };

    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  /**
   * Handle special key press (Enter, Escape, Tab).
   */
  handleSpecialKey(key: string): void {
    if (key === 'Escape') {
      this.commitAndExit();
    } else if (key === 'Enter') {
      // Insert newline - handled as regular input
    }
  }

  // ===========================================================================
  // Commit / Cancel
  // ===========================================================================

  /**
   * Commit current text and exit editing mode.
   */
  commitAndExit(): void {
    const textId = this.state.activeTextId;
    if (textId !== null && this.state.content.trim() === '') {
      // Delete empty text
      this.bridge?.deleteText(textId);
      this.callbacks.onTextDeleted?.(textId);
    }

    this.state = this.createInitialState();
    this.callbacks.onStateChange(this.state);
    this.callbacks.onEditEnd();
  }

  /**
   * Cancel editing without committing.
   */
  cancel(): void {
    const textId = this.state.activeTextId;
    if (this.state.mode === 'creating' && textId !== null) {
      // Delete the text we were creating
      this.bridge?.deleteText(textId);
      this.callbacks.onTextDeleted?.(textId);
    }

    this.state = this.createInitialState();
    this.callbacks.onStateChange(this.state);
    this.callbacks.onEditEnd();
  }

  // ===========================================================================
  // State Access
  // ===========================================================================

  /**
   * Get current tool state.
   */
  getState(): TextToolState {
    return { ...this.state };
  }

  /**
   * Check if currently editing text.
   */
  isEditing(): boolean {
    return this.state.mode === 'creating' || this.state.mode === 'editing';
  }

  /**
   * Get the active text ID.
   */
  getActiveTextId(): number | null {
    return this.state.activeTextId;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private allocateTextId(): number {
    return this.nextTextId++;
  }

  private createTextEntity(
    textId: number,
    x: number,
    y: number,
    boxMode: TextBoxMode,
    constraintWidth: number
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

    const caretByte = charIndexToByteIndex(this.state.content, this.state.caretIndex);
    const caretPos = this.bridge.getCaretPosition(this.state.activeTextId, caretByte);

    if (caretPos) {
      // Engine returns caret in text-local coordinates; overlay expects world coords.
      this.callbacks.onCaretUpdate(this.state.anchorX + caretPos.x, this.state.anchorY + caretPos.y, caretPos.height);
    } else {
      // Fallback: use anchor position with default height
      this.callbacks.onCaretUpdate(this.state.anchorX, this.state.anchorY, 16);
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
