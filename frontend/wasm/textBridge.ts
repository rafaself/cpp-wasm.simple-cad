/**
 * Text Bridge - High-level API for Engine-Native Text Operations
 *
 * This module provides a convenient TypeScript interface for text operations,
 * bridging between application code and the WASM engine's text subsystem.
 */

import type { EngineRuntime } from '@/engine/runtime/EngineRuntime';
import {
  CommandOp,
  type TextPayload,
  type TextRunPayload,
  type TextCaretPayload,
  type TextSelectionPayload,
  type TextInsertPayload,
  type TextDeletePayload,
} from '@/engine/runtime/commandBuffer';
import type {
  TextHitResult,
  TextCaretPosition,
  TextQuadBufferMeta,
  TextureBufferMeta,
  TextLayoutResult,
} from '@/types/text';
import { utf8ByteLength } from '@/types/text';

/**
 * Extended CadEngine instance with text methods.
 * These methods are exposed via Embind from the C++ engine.
 */
export interface TextEnabledCadEngine {
  // Existing methods from CadEngineInstance...
  clear: () => void;
  allocBytes: (byteCount: number) => number;
  freeBytes: (ptr: number) => void;
  applyCommandBuffer: (ptr: number, byteCount: number) => void;

  // Text-specific methods
  initializeTextSystem: () => boolean;
  loadFont: (fontId: number, fontDataPtr: number, dataSize: number) => boolean;
  hitTestText: (textId: number, localX: number, localY: number) => TextHitResult;
  getTextCaretPosition: (textId: number, charIndex: number) => TextCaretPosition;
  rebuildTextQuadBuffer: () => void;
  getTextQuadBufferMeta: () => TextQuadBufferMeta;
  getAtlasTextureMeta: () => TextureBufferMeta;
  isAtlasDirty: () => boolean;
  clearAtlasDirty: () => void;
}

/**
 * TextBridge provides high-level text operations.
 */
export class TextBridge {
  private runtime: EngineRuntime;
  private textEngine: TextEnabledCadEngine;
  private initialized = false;

  constructor(runtime: EngineRuntime) {
    this.runtime = runtime;
    // Cast to text-enabled engine (methods may not exist until WASM is built with text)
    this.textEngine = runtime.engine as unknown as TextEnabledCadEngine;
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
    const byteIndex = this.charToByteIndex(content, charIndex);
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
    const startByte = this.charToByteIndex(content, startChar);
    const endByte = this.charToByteIndex(content, endChar);
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
    const byteIndex = this.charToByteIndex(currentContent, charIndex);
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
    const startByte = this.charToByteIndex(currentContent, startChar);
    const endByte = this.charToByteIndex(currentContent, endChar);
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

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Convert character index to UTF-8 byte index.
   */
  private charToByteIndex(content: string, charIndex: number): number {
    const prefix = content.slice(0, charIndex);
    return utf8ByteLength(prefix);
  }
}

/**
 * Create a TextBridge instance from an EngineRuntime.
 */
export function createTextBridge(runtime: EngineRuntime): TextBridge {
  return new TextBridge(runtime);
}
