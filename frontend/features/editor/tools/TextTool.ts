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
  rotation: number;
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
  onCaretUpdate: (x: number, y: number, height: number, rotation: number, anchorX: number, anchorY: number) => void;
  /** Called when selection rects update */
  onSelectionUpdate?: (rects: import('@/types/text').TextSelectionRect[]) => void;
  /** Called when editing ends */
  onEditEnd: () => void;
  /** Called when a new text entity is created (for syncing to JS store) */
  onTextCreated?: (textId: number, x: number, y: number, boxMode: TextBoxMode, constraintWidth: number, initialWidth: number, initialHeight: number) => void;
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
      rotation: 0,
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
      rotation: 0,
      content: '',
    };

    // Create empty text entity in engine
    this.createTextEntity(textId, worldX, worldY, TextBoxMode.AutoWidth, 0);

    // Notify for JS shape creation with real bounds
    const bounds = this.bridge?.getTextBounds(textId);
    // Initial empty text has 0 width but non-zero height (line height)
    const w = bounds && bounds.valid ? bounds.maxX - bounds.minX : 0;
    const h = bounds && bounds.valid ? bounds.maxY - bounds.minY : this.styleDefaults.fontSize * 1.2;

    this.callbacks.onTextCreated?.(textId, worldX, worldY, TextBoxMode.AutoWidth, 0, w, h);

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
    const y = Math.max(startY, endY); // Y-Up: Top is Max Y
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
      rotation: 0,
      content: '',
    };

    // Create empty text entity in engine
    this.createTextEntity(textId, x, y, TextBoxMode.FixedWidth, constraintWidth);

    // Notify for JS shape creation with real bounds
    const bounds = this.bridge?.getTextBounds(textId);
    const w = bounds && bounds.valid ? bounds.maxX - bounds.minX : constraintWidth;
    const h = bounds && bounds.valid ? bounds.maxY - bounds.minY : this.styleDefaults.fontSize * 1.2;

    this.callbacks.onTextCreated?.(textId, x, y, TextBoxMode.FixedWidth, constraintWidth, w, h);

    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  /**
   * Handle click on existing text to edit it.
   * @param textId Engine text ID
   * @param localX Local X coordinate (within text bounds)
   * @param localY Local Y coordinate (within text bounds)
   */
  private selectionDragAnchor: number | null = null;
  private isDragging = false;

  /**
   * Handle pointer down on text.
   * @param textId Target text entity ID
   * @param localX Click X in text-local space
   * @param localY Click Y in text-local space
   * @param shiftKey Whether shift is held (selection extension)
   * @param anchorX World X of text anchor (top-left)
   * @param anchorY World Y of text anchor (top-left)
   */
  handlePointerDown(
    textId: number,
    localX: number,
    localY: number,
    shiftKey: boolean,
    anchorX: number,
    anchorY: number,
    rotation: number
  ): void {
    if (!this.isReady() || !this.bridge) return;

    // 1. Hit test
    const hitResult = this.bridge.hitTest(textId, localX, localY);
    let charIndex = 0;
    
    // Get content
    let content = '';
    if (this.state.activeTextId === textId && this.state.content) {
      content = this.state.content;
    } else {
      content = this.bridge.getTextContent(textId) || '';
    }

    if (hitResult) {
      charIndex = byteIndexToCharIndex(content, hitResult.byteIndex);
    }

    if (this.state.activeTextId !== textId) {
      // Start editing new text
      this.state = {
        mode: 'editing',
        activeTextId: textId,
        boxMode: TextBoxMode.AutoWidth,
        constraintWidth: 0,
        caretIndex: charIndex,
        selectionStart: charIndex,
        selectionEnd: charIndex,
        anchorX,
        anchorY,
        rotation,
        content,
      };
    } else {
      // Already editing
      
      // Update anchor/rotation in case they changed (e.g. alignment shift, though unlikely for same ID)
      this.state = {
         ...this.state,
         anchorX,
         anchorY,
         rotation
      };

      // If selection is collapsed, the anchor should be the current caret (handles case where typing moved caret)
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

    this.isDragging = true;
    if (!shiftKey) {
        this.selectionDragAnchor = charIndex;
    }

    // Update engine
    this.bridge.setCaretByteIndex(textId, charIndexToByteIndex(content, charIndex));

    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  handlePointerMove(textId: number, localX: number, localY: number): void {
    if (!this.isDragging || !this.bridge || this.state.activeTextId !== textId) return;

    const hitResult = this.bridge.hitTest(textId, localX, localY);
    // If no hit, we might be dragging outside. 
    // Ideally calculate nearest char. Engine hitTest usually returns nearest?
    // If hitResult is null, ignore? Or clamp?
    if (!hitResult) return;

    const charIndex = byteIndexToCharIndex(this.state.content, hitResult.byteIndex);
    const anchor = this.selectionDragAnchor ?? charIndex;

    const start = Math.min(anchor, charIndex);
    const end = Math.max(anchor, charIndex);

    this.state = {
      ...this.state,
      caretIndex: charIndex,
      selectionStart: start,
      selectionEnd: end,
    };

    // We do NOT update engine selection continuously here to avoid perf spam, 
    // only caret for consistency? 
    // Actually selection is visualized via onSelectionUpdate in updateCaretPosition.
    
    this.callbacks.onStateChange(this.state);
    this.updateCaretPosition();
  }

  handlePointerUp(): void {
    this.isDragging = false;
  }

  /**
   * Resize text entity (updates constraint width).
   * @param textId Text Entity ID
   * @param width New width constraint
   * @return New bounds { width, height } or null if failed
   */
  resizeText(textId: number, width: number): { width: number; height: number } | null {
    if (!this.isReady() || !this.bridge) return null;

    if (!this.bridge.setTextConstraintWidth(textId, width)) return null;

    const bounds = this.bridge.getTextBounds(textId);
    if (!bounds.valid) return null;

    // Update local state if we are currently editing this text
    if (this.state.activeTextId === textId) {
        this.state = {
            ...this.state,
            constraintWidth: width,
            boxMode: TextBoxMode.FixedWidth,
        };
        // Trigger generic update?
    }

    // Engine bounds are relative to text origin (0,0 typically minX/minY?)
    // Actually getTextBounds returns World Bounds relative to Anchor?
    // Let's check engine.cpp/getTextBounds. 
    // It usually returns minX, minY, maxX, maxY relative to text anchor (0,0).
    // So width = maxX - minX, height = maxY - minY.
    // If text is top-left aligned, minX=0, minY=0 (or ascent?).
    // We assume the shape bounding box matches these text bounds.

    return {
      width: bounds.maxX - bounds.minX,
      height: bounds.maxY - bounds.minY
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
  moveText(textId: number, anchorX: number, anchorY: number): boolean {
    if (!this.isReady() || !this.bridge) return false;

    const success = this.bridge.updateTextPosition(textId, anchorX, anchorY);
    
    // Update local state if we are currently editing this text
    if (success && this.state.activeTextId === textId) {
      this.state = {
        ...this.state,
        anchorX,
        anchorY,
      };
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
    const bounds = this.bridge.getTextBounds(textId);
    let estimatedWidth = 100;
    let estimatedHeight = 16;
    
    if (bounds && bounds.valid) {
      estimatedWidth = bounds.maxX - bounds.minX;
      estimatedHeight = bounds.maxY - bounds.minY;
    } else {
       // Should not happen if engine is healthy, but soft fallback to preserve crash-safety
       // without complex estimation logic.
       estimatedWidth = this.state.boxMode === TextBoxMode.FixedWidth ? this.state.constraintWidth : 50;
       estimatedHeight = this.styleDefaults.fontSize;
    }

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
  /**
   * Handle special key press (Enter, Escape, Tab, Arrows).
   */
  handleSpecialKey(key: string, event?: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; preventDefault: () => void }): void {
    if (key === 'Escape') {
      this.commitAndExit();
      event?.preventDefault();
      return;
    } else if (key === 'Enter') {
      // Insert newline - let fall through to TextInputProxy?
      // Usually Enter inserts newline char.
      return;
    }

    // Navigation
    if (this.isEditing() && this.bridge && this.state.activeTextId !== null && event) {
        const textId = this.state.activeTextId;
        const currentCaret = this.state.caretIndex;
        const currentContent = this.state.content;
        let newCaret = currentCaret;
        let handled = false;

        const isWordMod = event.ctrlKey || event.altKey;

        if (key === 'ArrowLeft') {
            if (isWordMod) {
                newCaret = this.bridge.getWordLeft(textId, currentCaret, currentContent);
            } else {
                newCaret = this.bridge.getVisualPrev(textId, currentCaret, currentContent);
            }
            handled = true;
        } else if (key === 'ArrowRight') {
            if (isWordMod) {
                newCaret = this.bridge.getWordRight(textId, currentCaret, currentContent);
            } else {
                newCaret = this.bridge.getVisualNext(textId, currentCaret, currentContent);
            }
            handled = true;
        } else if (key === 'Home') {
            newCaret = this.bridge.getLineStart(textId, currentCaret, currentContent);
            handled = true;
        } else if (key === 'End') {
            newCaret = this.bridge.getLineEnd(textId, currentCaret, currentContent);
            handled = true;
        }
        else if (key === 'ArrowUp') {
            newCaret = this.bridge.getLineUp(textId, currentCaret, currentContent);
            handled = true;
        } else if (key === 'ArrowDown') {
            newCaret = this.bridge.getLineDown(textId, currentCaret, currentContent);
            handled = true;
        }

        if (handled) {
            event.preventDefault(); // Stop browser caret movement

            // Update state
            let newStart = this.state.selectionStart;
            let newEnd = this.state.selectionEnd;

            if (event.shiftKey) {
                // Expanding selection
                // If we don't have a pivot, current selection start/end logic implies:
                // Caret is usually at 'end' if we moved 'end'.
                // Ideally track 'anchor' and 'focus' of selection.
                // TextToolState has selectionStart/End (min/max usually?).
                // Let's assume selectionEnd follows caret if shift was held?
                
                // We need to know which end is the "active" end (caret).
                // `caretIndex` tracks the active end.
                // `selectionStart` usually tracks the anchor?
                // Actually TextToolState defines start/end as standard range.
                // But caretIndex is the "cursor".
                
                if (this.state.selectionStart === this.state.selectionEnd) {
                    // Start selecting
                    // Anchor is old caret.
                    // New caret is focus.
                    newEnd = newCaret;
                    // Sort start/end? No, state.selectionStart/End usually implies indices.
                    // But for rendering we might normalize.
                    // Let's keep start/end as anchor/focus or min/max?
                    // TextCaretOverlay expects start/end probably ordered?
                    // Engine API expects start/end ordered?
                    // Byte conversion doesn't care. selection rects uses min/max usually.
                    // Let's update `caretIndex` to new location.
                    // And update selection range to cover [anchor, newCaret].
                    
                    // We need to persist the anchor. 
                    // Use `selectionStart` as anchor if we were collapsed?
                    // Or standard logic: 
                    // If collapsed, Anchor = OldCaret.
                    // If expanded, Anchor is the end *opposite* to caret.
                }
                
                // Determine Anchor
                let anchor = this.state.selectionStart;
                if (anchor === this.state.caretIndex) anchor = this.state.selectionEnd;
                // If start==end==caret, anchor is caret.
                
                // Wait, if start != end.
                // if caret == start, anchor is end.
                // if caret == end, anchor is start.
                
                // Update selection range
                // We don't normalize start/end in state?
                // TextInputProxy expects normalized? `inputRef.current.setSelectionRange` expects start, end, direction.
                // TextToolState comments say "Selection start... Selection end".
                // Usually means min/max.
                // But `caretIndex` tracks the visual caret.
                // So we can compute min/max for the State.
                
                this.state = {
                    ...this.state,
                    caretIndex: newCaret,
                    selectionStart: Math.min(anchor, newCaret),
                    selectionEnd: Math.max(anchor, newCaret),
                };
            } else {
                // Determine new selection (collapsed)
                this.state = {
                    ...this.state,
                    caretIndex: newCaret,
                    selectionStart: newCaret,
                    selectionEnd: newCaret,
                };
            }

            // Sync to Engine (and TextInputProxy via state update loop -> TextInteractionLayer -> Props)
            const caretByte = charIndexToByteIndex(this.state.content, this.state.caretIndex);
            
            // Sync selection if needed
            if (this.state.selectionStart !== this.state.selectionEnd) {
                const sByte = charIndexToByteIndex(this.state.content, this.state.selectionStart);
                const eByte = charIndexToByteIndex(this.state.content, this.state.selectionEnd);
                this.bridge.setSelectionByteIndex(textId, sByte, eByte);
            } else {
                this.bridge.setCaretByteIndex(textId, caretByte);
            }

            this.callbacks.onStateChange(this.state);
            this.updateCaretPosition();
        }
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

  /**
   * Delete a text entity by its engine ID.
   * Called when a text shape is deleted from the JS store.
   * @param textId Engine text ID
   * @return True if successfully deleted
   */
  deleteTextById(textId: number): boolean {
    if (!this.isReady() || !this.bridge) return false;
    
    // If we're currently editing this text, cancel first
    if (this.state.activeTextId === textId) {
      this.state = this.createInitialState();
      this.callbacks.onStateChange(this.state);
      this.callbacks.onEditEnd();
    }
    
    this.bridge.deleteText(textId);
    return true;
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
      // Pass local coordinates. Overlay handles Transform.
      this.callbacks.onCaretUpdate(caretPos.x, caretPos.y, caretPos.height, this.state.rotation, this.state.anchorX, this.state.anchorY);
    } else {
      // Fallback
      this.callbacks.onCaretUpdate(0, 0, 16, this.state.rotation, this.state.anchorX, this.state.anchorY);
    }

    // Update selection rects if there is a selection
    if (this.state.selectionStart !== this.state.selectionEnd) {
      const start = Math.min(this.state.selectionStart, this.state.selectionEnd);
      const end = Math.max(this.state.selectionStart, this.state.selectionEnd);
      
      const localRects = this.bridge.getSelectionRects(
        this.state.activeTextId,
        start,
        end,
        this.state.content
      );

      // Pass local rects directly
      this.callbacks.onSelectionUpdate?.(localRects);
    } else {
      this.callbacks.onSelectionUpdate?.([]);
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
