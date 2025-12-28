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

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { ApplyTextStylePayload } from '@/engine/core/commandBuffer';
import { TextBridge } from '@/engine/bridge/textBridge';
import {
  TextBoxMode,
  TextAlign,
  TextStyleFlags,
  packColorRGBA,
  charIndexToByteIndex,
  byteIndexToCharIndex,
  type TextPayload,
  type TextInputDelta,
  type TextStyleSnapshot,
} from '@/types/text';
import { getTextMeta } from '@/engine/core/textEngineSync';
import { registerEngineId } from '@/engine/core/IdRegistry';
import { TextInputCoordinator } from '@/engine/tools/text/TextInputCoordinator';

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
  onCaretUpdate: (x: number, y: number, height: number, rotation: number, anchorX: number, anchorY: number) => void;
  /** Called when selection rects update */
  onSelectionUpdate?: (rects: import('@/types/text').TextSelectionRect[]) => void;
  /** Called when engine style snapshot updates (tri-state flags, caret/selection). */
  onStyleSnapshot?: (textId: number, snapshot: TextStyleSnapshot) => void;
  /** Called when editing ends */
  onEditEnd: () => void;
  /** Called when a new text entity is created (for syncing to JS store) */
  onTextCreated?: (shapeId: string, textId: number, x: number, y: number, boxMode: TextBoxMode, constraintWidth: number, initialWidth: number, initialHeight: number) => void;
  /** Called when text content/bounds are updated */
  onTextUpdated?: (
    textId: number,
    bounds: { width: number; height: number },
    boxMode: TextBoxMode,
    constraintWidth: number,
    x?: number,
    y?: number
  ) => void;
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
  private initialized = false;
  private inputCoordinator: TextInputCoordinator;

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

    // Create input coordinator with callbacks that sync state with TextTool
    this.inputCoordinator = new TextInputCoordinator(
      {
        onStateChange: (coordState) => {
          // Sync coordinator state to TextTool state
          this.state = {
            ...this.state,
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
          };
          this.callbacks.onStateChange(this.state);
        },
        onTextCreated: callbacks.onTextCreated,
        onTextUpdated: callbacks.onTextUpdated,
        updateCaretPosition: () => this.updateCaretPosition(),
      },
      {
        fontId: this.styleDefaults.fontId,
        fontSize: this.styleDefaults.fontSize,
        colorRGBA: this.styleDefaults.colorRGBA,
        flags: this.styleDefaults.flags,
      }
    );
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
    };
  }

  private getPooledContent(): string {
     if (!this.bridge || this.state.activeTextId === null) return '';
     return this.bridge.getTextContent(this.state.activeTextId) ?? '';
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

    // Delegate to input coordinator
    this.inputCoordinator.handleClick(
      worldX,
      worldY,
      (textId, x, y, boxMode, constraintWidth) => this.createTextEntity(textId, x, y, boxMode, constraintWidth)
    );
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

    // Delegate to input coordinator
    this.inputCoordinator.handleDrag(
      startX,
      startY,
      endX,
      endY,
      (textId, x, y, boxMode, constraintWidth) => this.createTextEntity(textId, x, y, boxMode, constraintWidth)
    );
  }

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
    rotation: number,
    boxMode?: TextBoxMode,
    constraintWidth?: number,
    startDrag = true
  ): void {
    if (!this.isReady()) return;

    // Delegate to input coordinator
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
      startDrag
    );
  }

  handlePointerMove(textId: number, localX: number, localY: number): void {
    // Delegate to input coordinator
    this.inputCoordinator.handlePointerMove(textId, localX, localY);
  }

  handlePointerUp(): void {
    // Delegate to input coordinator
    this.inputCoordinator.handlePointerUp();
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
  moveText(
    textId: number,
    anchorX: number,
    anchorY: number,
    boxMode: TextBoxMode = TextBoxMode.AutoWidth,
    constraintWidth = 0
  ): boolean {
    if (!this.isReady() || !this.bridge) return false;

    const success = this.bridge.updateTextPosition(textId, anchorX, anchorY, boxMode, constraintWidth);
    
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
    // Delegate to input coordinator
    this.inputCoordinator.handleInputDelta(delta);
  }

  /**
   * Handle selection change from TextInputProxy.
   */
  handleSelectionChange(start: number, end: number): void {
    // Delegate to input coordinator
    this.inputCoordinator.handleSelectionChange(start, end);
  }

  // ==========================================================================
  // Style Commands
  // ==========================================================================

  applyStyle(flagsMask: TextStyleFlags, intent: 'set' | 'clear' | 'toggle'): boolean {
    if (!this.isReady() || !this.bridge || this.state.activeTextId === null) {
      console.warn('[TextTool] applyStyle: Not ready or no active text', { ready: this.isReady(), active: this.state.activeTextId });
      return false;
    }

    const textId = this.state.activeTextId;
    const currentContent = this.getPooledContent();
    const contentLength = currentContent.length;

    let rangeStart = Math.min(this.state.selectionStart, this.state.selectionEnd);
    let rangeEnd = Math.max(this.state.selectionStart, this.state.selectionEnd);

    // Keep ranges in bounds
    rangeStart = Math.max(0, Math.min(rangeStart, contentLength));
    rangeEnd = Math.max(0, Math.min(rangeEnd, contentLength));

    // Handle collapsed selection: use caret for both start and end to signal 
    // engine to apply typing attributes (via zero-length run).
    if (rangeStart === rangeEnd) {
      // Ensure we use the exact caret position
      const caret = Math.max(0, Math.min(this.state.caretIndex, contentLength));
      rangeStart = caret;
      rangeEnd = caret;
    }
    
    console.log('[TextTool] applyStyle', { textId, rangeStart, rangeEnd, flagsMask, intent });

    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: rangeStart,
      rangeEndLogical: rangeEnd,
      flagsMask,
      flagsValue: intent === 'set' ? flagsMask : 0,
      mode: intent === 'toggle' ? 2 : intent === 'set' ? 0 : 1,
      styleParamsVersion: 0,
      styleParams: new Uint8Array(),
    };

    this.bridge.applyTextStyle(textId, payload);

    // Sync caret to engine to ensure typing style run is found on next insert
    const caretByteAfterStyle = charIndexToByteIndex(currentContent, this.state.caretIndex);
    this.bridge.setCaretByteIndex(textId, caretByteAfterStyle);

    // Update tool defaults to reflect the new state...
    const snapshot = this.bridge.getTextStyleSnapshot(textId);
    if (snapshot) {
      // Snapshot format: 2 bits per attr in styleTriStateFlags
      // Bit 0-1: Bold, Bit 2-3: Italic, Bit 4-5: Underline, Bit 6-7: Strikethrough
      const updateDefault = (mask: TextStyleFlags, shift: number) => {
        const val = (snapshot.styleTriStateFlags >> shift) & 0b11;
        if (val === 1) { // On
          this.styleDefaults.flags |= mask;
        } else if (val === 0) { // Off
          this.styleDefaults.flags &= ~mask;
        }
      };

      updateDefault(TextStyleFlags.Bold, 0);
      updateDefault(TextStyleFlags.Italic, 2);
      updateDefault(TextStyleFlags.Underline, 4);
      updateDefault(TextStyleFlags.Strikethrough, 6);
    }

    const bounds = this.bridge.getTextBounds(textId);
    if (bounds && bounds.valid) {
      this.callbacks.onTextUpdated?.(
        textId,
        { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
        this.state.boxMode,
        this.state.constraintWidth
      );
    }

    this.updateCaretPosition();
    return true;
  }

  applyFontSize(fontSize: number): boolean {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x03); // textStyleTagFontSize
    view.setFloat32(1, fontSize, true);
    return this.applyStyleWithParams(buf);
  }

  applyTextAlign(align: TextAlign): boolean {
    if (!this.isReady() || !this.bridge || this.state.activeTextId === null) return false;
    const textId = this.state.activeTextId;
    const success = this.bridge.setTextAlign(textId, align);
    if (success) {
      this.styleDefaults.align = align;
      this.updateCaretPosition();
    }
    return success;
  }

  applyTextAlignToText(textId: number, align: TextAlign): boolean {
    if (!this.isReady() || !this.bridge) return false;
    return this.bridge.setTextAlign(textId, align);
  }

  applyFontId(fontId: number): boolean {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x04); // textStyleTagFontId
    view.setUint32(1, fontId, true);
    return this.applyStyleWithParams(buf);
  }

  private applyStyleWithParams(params: Uint8Array): boolean {
    if (!this.isReady() || !this.bridge || this.state.activeTextId === null) return false;
    const textId = this.state.activeTextId;
    const currentContent = this.getPooledContent();
    const contentLength = currentContent.length;
    let rangeStart = Math.min(this.state.selectionStart, this.state.selectionEnd);
    let rangeEnd = Math.max(this.state.selectionStart, this.state.selectionEnd);
    rangeStart = Math.max(0, Math.min(rangeStart, contentLength));
    rangeEnd = Math.max(0, Math.min(rangeEnd, contentLength));
    
    // Handle collapsed selection
    if (rangeStart === rangeEnd) {
      const caret = Math.max(0, Math.min(this.state.caretIndex, contentLength));
      rangeStart = caret;
      rangeEnd = caret;
    }

    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: rangeStart,
      rangeEndLogical: rangeEnd,
      flagsMask: 0,
      flagsValue: 0,
      mode: 0, 
      styleParamsVersion: 1,
      styleParams: params,
    };
    
    this.bridge.applyTextStyle(textId, payload);

    // Sync caret to engine to ensure typing style run is found on next insert
    const caretByteForStyle = charIndexToByteIndex(currentContent, this.state.caretIndex);
    this.bridge.setCaretByteIndex(textId, caretByteForStyle);

    return true;
  }

  // ===========================================================================
  // Manual Style Application (Object Selection Support)
  // ===========================================================================

  /**
   * Apply style flags to an arbitrary text entity (e.g. object selection).
   * Updates the engine and triggers a sync back to the JS store.
   */
  applyStyleToText(textId: number, flagsMask: TextStyleFlags, intent: 'set' | 'clear' | 'toggle'): boolean {
    if (!this.isReady() || !this.bridge) return false;

    const content = this.bridge.getTextContent(textId);
    if (content === null) return false;

    // Apply to entire text
    const rangeStart = 0;
    const rangeEnd = content.length;

    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: rangeStart,
      rangeEndLogical: rangeEnd,
      flagsMask,
      flagsValue: intent === 'set' ? flagsMask : 0,
      mode: intent === 'toggle' ? 2 : intent === 'set' ? 0 : 1,
      styleParamsVersion: 0,
      styleParams: new Uint8Array(),
    };

    console.log('[TextTool] applyStyleToText', { textId, flagsMask, intent });
    this.bridge.applyTextStyle(textId, payload);

    // Sync bounds back to JS store
    this.syncTextToBounds(textId, content);
    return true;
  }

  /**
   * Apply font size to an arbitrary text entity.
   */
  applyFontSizeToText(textId: number, fontSize: number): boolean {
    if (!this.isReady() || !this.bridge) return false;
    
    // Validate font size (clamp 4-512)
    const size = Math.max(4, Math.min(512, fontSize));

    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x03); // textStyleTagFontSize
    view.setFloat32(1, size, true);

    return this.applyStyleParamsToText(textId, buf);
  }

  /**
   * Apply font ID to an arbitrary text entity.
   */
  applyFontIdToText(textId: number, fontId: number): boolean {
    if (!this.isReady() || !this.bridge) return false;

    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x04); // textStyleTagFontId
    view.setUint32(1, fontId, true);

    return this.applyStyleParamsToText(textId, buf);
  }

  private applyStyleParamsToText(textId: number, params: Uint8Array): boolean {
    if (!this.isReady() || !this.bridge) return false;

    const content = this.bridge.getTextContent(textId);
    if (content === null) return false;
    
    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: 0,
      rangeEndLogical: content.length,
      flagsMask: 0,
      flagsValue: 0,
      mode: 0, 
      styleParamsVersion: 1,
      styleParams: params,
    };
    
    this.bridge.applyTextStyle(textId, payload);
    this.syncTextToBounds(textId, content);
    return true;
  }

  private syncTextToBounds(textId: number, content: string): void {
     if (!this.bridge) return;
     const bounds = this.bridge.getTextBounds(textId);
     if (bounds && bounds.valid) {
       const meta = getTextMeta(textId);
       const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
       const constraint = meta?.constraintWidth ?? 0;
       
       this.callbacks.onTextUpdated?.(
         textId,
         { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
         boxMode,
         constraint
       );
     }
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
        const currentContent = this.getPooledContent();
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
            const navContent = this.getPooledContent();
            const caretByte = charIndexToByteIndex(navContent, this.state.caretIndex);
            
            // Sync selection if needed
            if (this.state.selectionStart !== this.state.selectionEnd) {
                const sByte = charIndexToByteIndex(navContent, this.state.selectionStart);
                const eByte = charIndexToByteIndex(navContent, this.state.selectionEnd);
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
    const commitContent = textId !== null ? this.getPooledContent() : '';
    if (textId !== null && commitContent.trim() === '') {
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

    const updateContent = this.getPooledContent();
    const caretByte = charIndexToByteIndex(updateContent, this.state.caretIndex);
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
        updateContent
      );

      // Pass local rects directly
      this.callbacks.onSelectionUpdate?.(localRects);
    } else {
      this.callbacks.onSelectionUpdate?.([]);
    }

    if (this.callbacks.onStyleSnapshot && this.bridge && this.state.activeTextId !== null) {
      const snapshot = this.bridge.getTextStyleSnapshot(this.state.activeTextId);
      this.callbacks.onStyleSnapshot(this.state.activeTextId, snapshot);
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
