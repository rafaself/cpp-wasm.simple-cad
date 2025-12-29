/**
 * Text Bridge - High-level API for Engine-Native Text Operations
 *
 * This module provides a convenient TypeScript interface for text operations,
 * bridging between application code and the WASM engine's text subsystem.
 */

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import {
  CommandOp,
  type ApplyTextStylePayload,
  type TextPayload,
  type TextRunPayload,
  type TextCaretPayload,
  type TextSelectionPayload,
  type TextInsertPayload,
  type TextDeletePayload,
} from '@/engine/core/commandBuffer';
import {
  TextHitResult,
  TextCaretPosition,
  TextQuadBufferMeta,
  TextureBufferMeta,
  TextContentMeta,
  TextBoundsResult,
  TextSelectionRect,
  TextBoxMode,
  TextStyleSnapshot,
} from '@/types/text';
import { TextNavigator, charToByteIndex, byteToCharIndex } from './textNavigation';

/** Extended CadEngine instance with text methods exposed via Embind. */
export interface TextEnabledCadEngine {
  clear: () => void;
  allocBytes: (byteCount: number) => number;
  freeBytes: (ptr: number) => void;
  applyCommandBuffer: (ptr: number, byteCount: number) => void;
  initializeTextSystem: () => boolean;
  loadFont: (fontId: number, fontDataPtr: number, dataSize: number) => boolean;
  hitTestText: (textId: number, localX: number, localY: number) => TextHitResult;
  getTextCaretPosition: (textId: number, charIndex: number) => TextCaretPosition;
  rebuildTextQuadBuffer: () => void;
  getTextQuadBufferMeta: () => TextQuadBufferMeta;
  getAtlasTextureMeta: () => TextureBufferMeta;
  isAtlasDirty: () => boolean;
  clearAtlasDirty: () => void;
  getTextContentMeta: (textId: number) => TextContentMeta;
  getTextBounds: (textId: number) => TextBoundsResult;
  getTextSelectionRects: (textId: number, start: number, end: number) => { size: () => number, get: (i: number) => TextSelectionRect, delete: () => void };
  setTextConstraintWidth: (textId: number, width: number) => boolean;
  setTextPosition: (textId: number, x: number, y: number, boxMode: TextBoxMode, constraintWidth: number) => boolean;
  getTextStyleSnapshot: (textId: number) => TextStyleSnapshot;
  getVisualPrevCharIndex: (textId: number, charIndex: number) => number;
  getVisualNextCharIndex: (textId: number, charIndex: number) => number;
  getWordLeftIndex: (textId: number, charIndex: number) => number;
  getWordRightIndex: (textId: number, charIndex: number) => number;
  getLineStartIndex: (textId: number, charIndex: number) => number;
  getLineEndIndex: (textId: number, charIndex: number) => number;
  getLineUpIndex: (textId: number, charIndex: number) => number;
  getLineDownIndex: (textId: number, charIndex: number) => number;
}

/** TextBridge provides high-level text operations. */
export class TextBridge {
  private runtime: EngineRuntime;
  private textEngine: TextEnabledCadEngine;
  private initialized = false;
  private navigator: TextNavigator;

  /**
   * Get engine-authoritative style snapshot (selection, caret, tri-state flags).
   */
  getTextStyleSnapshot(textId: number): TextStyleSnapshot {
    return this.textEngine.getTextStyleSnapshot(textId);
  }
  constructor(runtime: EngineRuntime) {
    this.runtime = runtime;
    // Text system facade implements the native bindings we need
    this.textEngine = runtime.text as unknown as TextEnabledCadEngine;
    this.navigator = new TextNavigator(this.textEngine, () => this.isAvailable());
  }

  /**
   * Initialize the text subsystem (fonts, layout engine, atlas).
   * Must be called before using text features.
   */
  initialize(): boolean {
    if (this.initialized) return true;

    if (typeof this.textEngine.initializeTextSystem !== 'function') {
      console.warn('TextBridge: Text system not available in this WASM build');
      return false;
    }

    const success = this.textEngine.initializeTextSystem();
    if (success) {
      this.initialized = true;
    }
    return success;
  }

  /**
   * Check if text system is available and initialized.
   */
  isAvailable(): boolean {
    return (
      typeof this.textEngine.initializeTextSystem === 'function' && this.initialized
    );
  }

  /**
   * Load a font into the engine.
   * @param fontId Font identifier to use
   * @param fontData Raw TTF/OTF font data
   * @returns True if font loaded successfully
   */
  loadFont(fontId: number, fontData: Uint8Array): boolean {
    if (!this.isAvailable()) return false;

    const ptr = this.textEngine.allocBytes(fontData.byteLength);
    try {
      this.runtime.module.HEAPU8.set(fontData, ptr);
      return this.textEngine.loadFont(fontId, ptr, fontData.byteLength);
    } finally {
      this.textEngine.freeBytes(ptr);
    }
  }

  /**
   * Create or update a text entity via command buffer.
   * @param id Numeric entity ID
   * @param payload Text payload with properties, runs, and content
   */
  upsertText(id: number, payload: TextPayload): void {
    // Convert to command buffer format
    const runs: TextRunPayload[] = payload.runs.map((run) => ({
      startIndex: run.startIndex,
      length: run.length,
      fontId: run.fontId,
      fontSize: run.fontSize,
      colorRGBA: run.colorRGBA,
      flags: run.flags,
    }));

    this.runtime.apply([
      {
        op: CommandOp.UpsertText,
        id,
        text: {
          x: payload.x,
          y: payload.y,
          rotation: payload.rotation,
          boxMode: payload.boxMode,
          align: payload.align,
          constraintWidth: payload.constraintWidth,
          runs,
          content: payload.content,
        },
      },
    ]);
  }

  /**
   * Delete a text entity.
   * @param id Entity ID to delete
   */
  deleteText(id: number): void {
    this.runtime.apply([{ op: CommandOp.DeleteText, id }]);
  }

  /**
   * Set caret position for a text entity.
   * @param textId Text entity ID
   * @param charIndex Character index (will be converted to byte index)
   * @param content The text content (needed for char-to-byte conversion)
   */
  setCaret(textId: number, charIndex: number, content: string): void {
    const byteIndex = charToByteIndex(content, charIndex);
    this.runtime.apply([
      {
        op: CommandOp.SetTextCaret,
        caret: { textId, caretIndex: byteIndex } as TextCaretPayload,
      },
    ]);
  }

  /**
   * Set caret position using byte index directly.
   */
  setCaretByteIndex(textId: number, byteIndex: number): void {
    this.runtime.apply([
      {
        op: CommandOp.SetTextCaret,
        caret: { textId, caretIndex: byteIndex } as TextCaretPayload,
      },
    ]);
  }

  /**
   * Set selection range for a text entity.
   * @param textId Text entity ID
   * @param startChar Selection start character index
   * @param endChar Selection end character index
   * @param content The text content (needed for char-to-byte conversion)
   */
  setSelection(
    textId: number,
    startChar: number,
    endChar: number,
    content: string
  ): void {
    const startByte = charToByteIndex(content, startChar);
    const endByte = charToByteIndex(content, endChar);
    this.runtime.apply([
      {
        op: CommandOp.SetTextSelection,
        selection: {
          textId,
          selectionStart: startByte,
          selectionEnd: endByte,
        } as TextSelectionPayload,
      },
    ]);
  }

  /**
   * Set selection range using byte indices directly.
   */
  setSelectionByteIndex(
    textId: number,
    startByte: number,
    endByte: number
  ): void {
    this.runtime.apply([
      {
        op: CommandOp.SetTextSelection,
        selection: {
          textId,
          selectionStart: startByte,
          selectionEnd: endByte,
        } as TextSelectionPayload,
      },
    ]);
  }

  /**
   * Apply text style to a logical range.
   */
  applyTextStyle(textId: number, style: ApplyTextStylePayload): void {
    console.log('[DEBUG] TextBridge.applyTextStyle sending command', { textId, style });
    this.runtime.apply([
      {
        op: CommandOp.ApplyTextStyle,
        id: textId,
        style,
      },
    ]);
  }

  /**
   * Set alignment for a text entity.
   */
  setTextAlign(textId: number, align: number): boolean {
    this.runtime.apply([
      {
        op: CommandOp.SetTextAlign,
        align: { textId, align }
      }
    ]);
    return true;
  }

  /**
   * Insert text content at a position.
   * @param textId Text entity ID
   * @param charIndex Character index to insert at
   * @param text Text to insert
   * @param currentContent Current content (needed for char-to-byte conversion)
   */
  insertContent(
    textId: number,
    charIndex: number,
    text: string,
    currentContent: string
  ): void {
    const byteIndex = charToByteIndex(currentContent, charIndex);
    this.runtime.apply([
      {
        op: CommandOp.InsertTextContent,
        insert: {
          textId,
          insertIndex: byteIndex,
          content: text,
        } as TextInsertPayload,
      },
    ]);
  }

  /**
   * Insert text content using byte index directly.
   */
  insertContentByteIndex(
    textId: number,
    byteIndex: number,
    text: string
  ): void {
    console.log('[DEBUG] TextBridge: insertContentByteIndex', { textId, byteIndex, text });
    this.runtime.apply([
      {
        op: CommandOp.InsertTextContent,
        insert: { textId, insertIndex: byteIndex, content: text } as TextInsertPayload,
      },
    ]);
  }

  /**
   * Delete text content in a range.
   * @param textId Text entity ID
   * @param startChar Start character index (inclusive)
   * @param endChar End character index (exclusive)
   * @param currentContent Current content (needed for char-to-byte conversion)
   */
  deleteContent(
    textId: number,
    startChar: number,
    endChar: number,
    currentContent: string
  ): void {
    const startByte = charToByteIndex(currentContent, startChar);
    const endByte = charToByteIndex(currentContent, endChar);
    this.runtime.apply([
      {
        op: CommandOp.DeleteTextContent,
        del: {
          textId,
          startIndex: startByte,
          endIndex: endByte,
        } as TextDeletePayload,
      },
    ]);
  }

  /**
   * Delete text content using byte indices directly.
   */
  deleteContentByteIndex(
    textId: number,
    startByte: number,
    endByte: number
  ): void {
    this.runtime.apply([
      {
        op: CommandOp.DeleteTextContent,
        del: { textId, startIndex: startByte, endIndex: endByte } as TextDeletePayload,
      },
    ]);
  }

  /**
   * Hit test a point against a text entity.
   * @param textId Text entity ID
   * @param localX X coordinate in text-local space
   * @param localY Y coordinate in text-local space
   * @returns Hit result with character byte index
   */
  hitTest(textId: number, localX: number, localY: number): TextHitResult | null {
    if (!this.isAvailable()) return null;
    return this.textEngine.hitTestText(textId, localX, localY);
  }

  /**
   * Get caret position for rendering.
   * @param textId Text entity ID
   * @param byteIndex Character byte index
   * @returns Caret position in text-local coordinates
   */
  getCaretPosition(textId: number, byteIndex: number): TextCaretPosition | null {
    if (!this.isAvailable()) return null;
    return this.textEngine.getTextCaretPosition(textId, byteIndex);
  }

  /**
   * Get text content from engine (source of truth).
   * Use this to sync local state when editing existing text.
   * @param textId Text entity ID
   * @returns UTF-8 text content, or null if text doesn't exist
   */
  getTextContent(textId: number): string | null {
    if (!this.isAvailable()) return null;
    
    const meta = this.textEngine.getTextContentMeta(textId);
    if (!meta.exists || meta.byteCount === 0) {
      return meta.exists ? '' : null;
    }
    
    // Read UTF-8 bytes from WASM memory
    const bytes = this.runtime.module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount);
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  }

  /**
   * Get text entity metadata (box mode, constraint width).
   */
  getTextMeta(textId: number) {
      return this.runtime.getTextEntityMeta(textId);
  }

  /**
   * Get text layout bounds from engine.
   * @param textId Text entity ID
   * @returns Computed bounds or null
   */
  getTextBounds(textId: number): TextBoundsResult | null {
    if (!this.isAvailable()) return null;
    return this.textEngine.getTextBounds(textId);
  }

  /**
   * Get selection rectangles from engine.
   * @param textId Text entity ID
   * @param startChar Selection start character index
   * @param endChar End character index
   * @param content Current content (for conversion)
   */
  getSelectionRects(
    textId: number,
    startChar: number,
    endChar: number,
    content: string
  ): TextSelectionRect[] {
    if (!this.isAvailable()) return [];

    const startByte = charToByteIndex(content, startChar);
    const endByte = charToByteIndex(content, endChar);
    
    // Engine returns a C++ vector wrapper
    const vector = this.textEngine.getTextSelectionRects(textId, startByte, endByte);
    
    const result: TextSelectionRect[] = [];
    const size = vector.size();
    for (let i = 0; i < size; i++) {
      result.push(vector.get(i));
    }
    vector.delete(); // Important: free the C++ vector wrapper
    
    return result;
  }

  /**
   * Set fixed width constraint for text resizing.
   * @param textId Text Entity ID
   * @param width New constraint width
   * @return Success
   */
  setTextConstraintWidth(textId: number, width: number): boolean {
    if (!this.isAvailable()) return false;
    return this.textEngine.setTextConstraintWidth(textId, width);
  }

  /**
   * Update text position without modifying content.
   * Re-upserts the text entity with current content but new coordinates.
   * @param textId Text entity ID
   * @param x New X coordinate (anchor, top-left in Y-Up)
   * @param y New Y coordinate (anchor, top-left in Y-Up)
   * @return True if successful
   */
  updateTextPosition(
    textId: number,
    x: number,
    y: number,
    boxMode: TextBoxMode = TextBoxMode.AutoWidth,
    constraintWidth = 0
  ): boolean {
    if (!this.isAvailable() || typeof this.textEngine.setTextPosition !== 'function') return false;
    return this.textEngine.setTextPosition(textId, x, y, boxMode, constraintWidth);
  }

  /**
   * Rebuild text quad buffer for rendering.
   * Call this after text layout changes before rendering.
   */
  rebuildQuadBuffer(): void {
    if (!this.isAvailable()) return;
    this.textEngine.rebuildTextQuadBuffer();
  }

  /**
   * Get text quad buffer metadata for WebGL rendering.
   * Format: [x, y, z, u, v, r, g, b, a] per vertex, 6 vertices per glyph
   */
  getQuadBufferMeta(): TextQuadBufferMeta | null {
    if (!this.isAvailable()) return null;
    return this.textEngine.getTextQuadBufferMeta();
  }

  /**
   * Get atlas texture metadata for WebGL upload.
   */
  getAtlasTextureMeta(): TextureBufferMeta | null {
    if (!this.isAvailable()) return null;
    return this.textEngine.getAtlasTextureMeta();
  }

  /**
   * Check if atlas texture needs re-upload.
   */
  isAtlasDirty(): boolean {
    if (!this.isAvailable()) return false;
    return this.textEngine.isAtlasDirty();
  }

  /**
   * Clear atlas dirty flag after texture upload.
   */
  clearAtlasDirty(): void {
    if (!this.isAvailable()) return;
    this.textEngine.clearAtlasDirty();
  }

  /**
   * Get atlas texture data as Uint8Array.
   * Returns null if not available.
   */
  getAtlasTextureData(): Uint8Array | null {
    if (!this.isAvailable()) return null;

    const meta = this.textEngine.getAtlasTextureMeta();
    if (!meta || meta.byteCount === 0) return null;

    // Return a view into the WASM heap
    return this.runtime.module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount);
  }

  /**
   * Get text quad vertices as Float32Array.
   * Returns null if not available.
   */
  getQuadBufferData(): Float32Array | null {
    if (!this.isAvailable()) return null;

    const meta = this.textEngine.getTextQuadBufferMeta();
    if (!meta || meta.floatCount === 0) return null;

    // Return a view into the WASM heap
    const byteOffset = meta.ptr;
    const floatOffset = byteOffset / 4;
    return this.runtime.module.HEAPF32.subarray(
      floatOffset,
      floatOffset + meta.floatCount
    );
  }

  /** Get visual previous caret position. */
  getVisualPrev(textId: number, charIndex: number, content: string): number {
    return this.navigator.getVisualPrev(textId, charIndex, content);
  }

  /** Get visual next caret position. */
  getVisualNext(textId: number, charIndex: number, content: string): number {
    return this.navigator.getVisualNext(textId, charIndex, content);
  }

  /** Get word left boundary. */
  getWordLeft(textId: number, charIndex: number, content: string): number {
    return this.navigator.getWordLeft(textId, charIndex, content);
  }

  /** Get word right boundary. */
  getWordRight(textId: number, charIndex: number, content: string): number {
    return this.navigator.getWordRight(textId, charIndex, content);
  }

  /** Get line start boundary. */
  getLineStart(textId: number, charIndex: number, content: string): number {
    return this.navigator.getLineStart(textId, charIndex, content);
  }

  /** Get line end boundary. */
  getLineEnd(textId: number, charIndex: number, content: string): number {
    return this.navigator.getLineEnd(textId, charIndex, content);
  }

  /** Get line up boundary. */
  getLineUp(textId: number, charIndex: number, content: string): number {
    return this.navigator.getLineUp(textId, charIndex, content);
  }

  /** Get line down boundary. */
  getLineDown(textId: number, charIndex: number, content: string): number {
    return this.navigator.getLineDown(textId, charIndex, content);
  }
}

/**
 * Create a TextBridge instance from an EngineRuntime.
 */
export function createTextBridge(runtime: EngineRuntime): TextBridge {
  return new TextBridge(runtime);
}
