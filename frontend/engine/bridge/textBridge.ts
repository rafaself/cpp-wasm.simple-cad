/**
 * Text Bridge - High-level API for Engine-Native Text Operations
 *
 * This module provides a convenient TypeScript interface for text operations,
 * bridging between application code and the WASM engine's text subsystem.
 */

import {
  CommandOp,
  type ApplyTextStylePayload,
  type TextPayload,
  type TextRunPayload,
  type TextCaretPayload,
  type TextSelectionPayload,
  type TextInsertPayload,
  type TextDeletePayload,
  type TextReplacePayload,
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

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { TextSystem } from '@/engine/core/runtime/TextSystem';

/** TextBridge provides high-level text operations. */
export class TextBridge {
  private runtime: EngineRuntime;
  private textApi: TextSystem;
  private initialized = false;
  private navigator: TextNavigator;
  private contentCache = new Map<
    number,
    { generation: number; ptr: number; byteCount: number; content: string }
  >();
  private contentCacheGeneration = -1;
  private contentDecoder = new TextDecoder('utf-8');

  /**
   * Get engine-authoritative style snapshot (selection, caret, tri-state flags).
   */
  getTextStyleSnapshot(textId: number): TextStyleSnapshot | null {
    return this.textApi.getTextStyleSnapshot(textId);
  }
  constructor(runtime: EngineRuntime) {
    this.runtime = runtime;
    this.textApi = runtime.text as unknown as TextSystem;
    // Navigator works on the engine-facing api, TextSystem forwards it.
    this.navigator = new TextNavigator(this.textApi as any, () => this.isAvailable());
  }

  /**
   * Initialize the text subsystem (fonts, layout engine, atlas).
   * Must be called before using text features.
   */
  initialize(): boolean {
    if (this.initialized) return true;

    if (typeof (this.textApi as any).initializeTextSystem !== 'function') {
      return false;
    }

    const success = this.textApi.initializeTextSystem();
    if (success) {
      this.initialized = true;
    }
    return success;
  }

  /**
   * Check if text system is available and initialized.
   */
  isAvailable(): boolean {
    return typeof (this.textApi as any).initializeTextSystem === 'function' && this.initialized;
  }

  /**
   * Load a font into the engine.
   * @param fontId Font identifier to use
   * @param fontData Raw TTF/OTF font data
   * @returns True if font loaded successfully
   */
  loadFont(fontId: number, fontData: Uint8Array): boolean {
    return this.loadFontEx(fontId, fontData, false, false);
  }

  /**
   * Load a font with style variant flags.
   * @param fontId Font identifier to use
   * @param fontData Raw TTF/OTF font data
   * @param bold Whether this is a bold variant
   * @param italic Whether this is an italic variant
   * @returns True if font loaded successfully
   */
  loadFontEx(fontId: number, fontData: Uint8Array, bold: boolean, italic: boolean): boolean {
    if (!this.isAvailable()) return false;
    return this.textApi.loadFontEx(fontId, fontData, bold, italic);
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
  setSelection(textId: number, startChar: number, endChar: number, content: string): void {
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
  setSelectionByteIndex(textId: number, startByte: number, endByte: number): void {
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
        align: { textId, align },
      },
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
  insertContent(textId: number, charIndex: number, text: string, currentContent: string): void {
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
  insertContentByteIndex(textId: number, byteIndex: number, text: string): void {
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
  deleteContent(textId: number, startChar: number, endChar: number, currentContent: string): void {
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
  deleteContentByteIndex(textId: number, startByte: number, endByte: number): void {
    this.runtime.apply([
      {
        op: CommandOp.DeleteTextContent,
        del: { textId, startIndex: startByte, endIndex: endByte } as TextDeletePayload,
      },
    ]);
  }

  /**
   * Replace text content in a range.
   */
  replaceContent(
    textId: number,
    startChar: number,
    endChar: number,
    text: string,
    currentContent: string,
  ): void {
    const startByte = charToByteIndex(currentContent, startChar);
    const endByte = charToByteIndex(currentContent, endChar);
    this.runtime.apply([
      {
        op: CommandOp.ReplaceTextContent,
        replace: {
          textId,
          startIndex: startByte,
          endIndex: endByte,
          content: text,
        } as TextReplacePayload,
      },
    ]);
  }

  /**
   * Replace text content using byte indices directly.
   */
  replaceContentByteIndex(textId: number, startByte: number, endByte: number, text: string): void {
    this.runtime.apply([
      {
        op: CommandOp.ReplaceTextContent,
        replace: {
          textId,
          startIndex: startByte,
          endIndex: endByte,
          content: text,
        } as TextReplacePayload,
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
    return this.textApi.hitTestText(textId, localX, localY);
  }

  /**
   * Get caret position for rendering.
   * @param textId Text entity ID
   * @param byteIndex Character byte index
   * @returns Caret position in text-local coordinates
   */
  getCaretPosition(textId: number, byteIndex: number): TextCaretPosition | null {
    if (!this.isAvailable()) return null;
    return this.textApi.getTextCaretPosition(textId, byteIndex);
  }

  /**
   * Get text content from engine (source of truth).
   * Use this to sync local state when editing existing text.
   * @param textId Text entity ID
   * @returns UTF-8 text content, or null if text doesn't exist
   */
  getTextContent(textId: number): string | null {
    if (!this.isAvailable()) return null;

    const stats = this.runtime.getStats();
    if (stats.generation !== this.contentCacheGeneration) {
      this.contentCache.clear();
      this.contentCacheGeneration = stats.generation;
    }

    const meta = this.textApi.getTextContentMeta(textId);
    if (!meta.exists || meta.byteCount === 0) {
      if (!meta.exists) {
        this.contentCache.delete(textId);
        return null;
      }
      const cached = this.contentCache.get(textId);
      if (cached && cached.byteCount === 0 && cached.ptr === meta.ptr) {
        return cached.content;
      }
      this.contentCache.set(textId, {
        generation: stats.generation,
        ptr: meta.ptr,
        byteCount: 0,
        content: '',
      });
      return '';
    }

    const cached = this.contentCache.get(textId);
    if (
      cached &&
      cached.generation === stats.generation &&
      cached.ptr === meta.ptr &&
      cached.byteCount === meta.byteCount
    ) {
      return cached.content;
    }

    const bytes = this.runtime.module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount);
    const content = this.contentDecoder.decode(bytes);
    this.contentCache.set(textId, {
      generation: stats.generation,
      ptr: meta.ptr,
      byteCount: meta.byteCount,
      content,
    });
    return content;
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
    return this.textApi.getTextBounds(textId);
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
    content: string,
  ): TextSelectionRect[] {
    if (!this.isAvailable()) return [];

    const startByte = charToByteIndex(content, startChar);
    const endByte = charToByteIndex(content, endChar);

    // Engine returns a C++ vector wrapper
    const vector = this.textApi.getTextSelectionRects(textId, startByte, endByte);

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
    return this.textApi.setTextConstraintWidth(textId, width);
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
    constraintWidth = 0,
  ): boolean {
    if (!this.isAvailable() || typeof (this.textApi as any).setTextPosition !== 'function')
      return false;
    return this.textApi.setTextPosition(textId, x, y, boxMode, constraintWidth);
  }

  /**
   * Rebuild text quad buffer for rendering.
   * Call this after text layout changes before rendering.
   */
  rebuildQuadBuffer(): void {
    if (!this.isAvailable()) return;
    this.textApi.rebuildTextQuadBuffer();
  }

  /**
   * Get text quad buffer metadata for WebGL rendering.
   * Format: [x, y, z, u, v, r, g, b, a] per vertex, 6 vertices per glyph
   */
  getQuadBufferMeta(): TextQuadBufferMeta | null {
    if (!this.isAvailable()) return null;
    return this.textApi.getTextQuadBufferMeta() ?? null;
  }

  /**
   * Get atlas texture metadata for WebGL upload.
   */
  getAtlasTextureMeta(): TextureBufferMeta | null {
    if (!this.isAvailable()) return null;
    return this.textApi.getAtlasTextureMeta() ?? null;
  }

  /**
   * Check if atlas texture needs re-upload.
   */
  isAtlasDirty(): boolean {
    if (!this.isAvailable()) return false;
    return this.textApi.isAtlasDirty();
  }

  /**
   * Clear atlas dirty flag after texture upload.
   */
  clearAtlasDirty(): void {
    if (!this.isAvailable()) return;
    this.textApi.clearAtlasDirty();
  }

  /**
   * Get atlas texture data as Uint8Array.
   * Returns null if not available.
   */
  getAtlasTextureData(): Uint8Array | null {
    if (!this.isAvailable()) return null;

    const meta = this.textApi.getAtlasTextureMeta();
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

    const meta = this.textApi.getTextQuadBufferMeta();
    if (!meta || meta.floatCount === 0) return null;

    // Return a view into the WASM heap
    const byteOffset = meta.ptr;
    const floatOffset = byteOffset / 4;
    return this.runtime.module.HEAPF32.subarray(floatOffset, floatOffset + meta.floatCount);
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
