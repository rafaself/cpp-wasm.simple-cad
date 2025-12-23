/**
 * Text Types for Engine-Native Text Pipeline
 *
 * These TypeScript types mirror the C++ types defined in cpp/engine/types.h
 * Used for type-safe communication between JS and the WASM text engine.
 */

// =============================================================================
// Enums
// =============================================================================

/**
 * Text style flags (bitfield)
 * Matches C++ TextStyleFlags enum
 */
export const enum TextStyleFlags {
  None = 0,
  Bold = 1 << 0,
  Italic = 1 << 1,
  Underline = 1 << 2,
  Strikethrough = 1 << 3,
}

/**
 * Text alignment mode
 * Matches C++ TextAlign enum
 */
export const enum TextAlign {
  Left = 0,
  Center = 1,
  Right = 2,
}

/**
 * Text box sizing mode
 * Matches C++ TextBoxMode enum
 */
export const enum TextBoxMode {
  /** Grows horizontally, no auto-wrap (only explicit \n) */
  AutoWidth = 0,
  /** Wraps at constraintWidth */
  FixedWidth = 1,
}

// =============================================================================
// Data Structures
// =============================================================================

/**
 * A text run represents a contiguous span with uniform styling.
 * Multiple runs = rich text within a single TextRec.
 */
export interface TextRun {
  /** UTF-8 byte offset into content buffer */
  startIndex: number;
  /** UTF-8 byte length of this run */
  length: number;
  /** Font identifier (0 = default) */
  fontId: number;
  /** Font size in canvas units */
  fontSize: number;
  /** Packed color: 0xRRGGBBAA */
  colorRGBA: number;
  /** TextStyleFlags bitfield */
  flags: TextStyleFlags;
}

/**
 * Main text entity properties (input from JS to engine).
 * Layout results are computed by the engine.
 */
export interface TextProperties {
  /** Anchor position X (top-left) */
  x: number;
  /** Anchor position Y (top-left) */
  y: number;
  /** Rotation in radians */
  rotation: number;
  /** AutoWidth or FixedWidth */
  boxMode: TextBoxMode;
  /** Left, Center, Right alignment */
  align: TextAlign;
  /** Width constraint (used when boxMode == FixedWidth) */
  constraintWidth: number;
}

/**
 * Full text payload for upsert command.
 */
export interface TextPayload extends TextProperties {
  /** Array of styling runs */
  runs: readonly TextRun[];
  /** UTF-8 text content */
  content: string;
}

/**
 * Layout results from engine (read-only).
 */
export interface TextLayoutResult {
  /** Computed width (max line width or constraintWidth) */
  layoutWidth: number;
  /** Computed height (sum of line heights) */
  layoutHeight: number;
  /** AABB min X */
  minX: number;
  /** AABB min Y */
  minY: number;
  /** AABB max X */
  maxX: number;
  /** AABB max Y */
  maxY: number;
}

/**
 * Result of querying text layout bounds from engine.
 * Used for sync with JS shape bounds.
 */
export interface TextBoundsResult {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  valid: boolean;
}

/**
 * Caret/selection state for text editing.
 */
export interface TextCaretState {
  /** Text entity ID */
  textId: number;
  /** UTF-8 byte position of caret */
  caretIndex: number;
  /** Selection anchor (same as caretIndex if no selection) */
  selectionStart: number;
  /** Selection extent */
  selectionEnd: number;
}

/**
 * Result of hit-testing a point against text.
 * Note: All indices are UTF-8 byte offsets, NOT character indices.
 */
export interface TextHitResult {
  /** UTF-8 byte index of hit character (NOT character index) */
  byteIndex: number;
  /** Line number (0-based) */
  lineIndex: number;
  /** True if hit is on leading edge of glyph */
  isLeadingEdge: boolean;
}

/**
 * Caret position for rendering.
 */
export interface TextCaretPosition {
  /** X position (text-local coordinates) */
  x: number;
  /** Y position (text-local coordinates) */
  y: number;
  /** Caret height (line height) */
  height: number;
  /** Which line the caret is on */
  lineIndex: number;
}

/**
 * Engine-authoritative text style snapshot (preferred over queries).
 */
export interface TextStyleSnapshot {
  selectionStartLogical: number;
  selectionEndLogical: number;
  selectionStartByte: number;
  selectionEndByte: number;
  caretLogical: number;
  caretByte: number;
  lineIndex: number;
  x: number;
  y: number;
  lineHeight: number;
  /** 2 bits per attr: bold bits0-1, italic bits2-3, underline bits4-5, strike bits6-7 */
  styleTriStateFlags: number;
  textGeneration: number;
  styleTriStateParamsLen: number;
}

/**
 * Selection rectangle for rendering.
 */
export interface TextSelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  lineIndex: number;
}

// =============================================================================
// Engine Buffer Metadata
// =============================================================================

/**
 * Metadata for text quad vertex buffer.
 * Format: [x, y, z, u, v, r, g, b, a] per vertex, 6 vertices per glyph
 */
export interface TextQuadBufferMeta {
  generation: number;
  vertexCount: number;
  capacity: number;
  floatCount: number;
  ptr: number;
}

/**
 * Metadata for MSDF atlas texture.
 */
export interface TextureBufferMeta {
  generation: number;
  width: number;
  height: number;
  byteCount: number;
  ptr: number;
}

/**
 * Metadata for text content buffer (from engine).
 * Used to read text content directly from WASM memory as source of truth.
 */
export interface TextContentMeta {
  /** Length of UTF-8 content in bytes */
  byteCount: number;
  /** Pointer to UTF-8 data in WASM memory */
  ptr: number;
  /** Whether the text entity exists */
  exists: boolean;
}

// =============================================================================
// Input Event Types
// =============================================================================

/**
 * Text input delta for incremental editing.
 */
export type TextInputDelta =
  | { type: 'insert'; text: string; at: number }
  | { type: 'delete'; start: number; end: number }
  | { type: 'replace'; start: number; end: number; text: string };

/**
 * Composition state for IME input.
 */
export interface TextCompositionState {
  /** Whether we're in an IME composition */
  composing: boolean;
  /** Composition preview text */
  compositionText: string;
  /** Where the composition started */
  compositionStart: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Pack RGBA color into uint32 (0xRRGGBBAA format).
 */
export function packColorRGBA(r: number, g: number, b: number, a: number): number {
  const ri = Math.round(Math.max(0, Math.min(255, r * 255)));
  const gi = Math.round(Math.max(0, Math.min(255, g * 255)));
  const bi = Math.round(Math.max(0, Math.min(255, b * 255)));
  const ai = Math.round(Math.max(0, Math.min(255, a * 255)));
  return ((ri << 24) | (gi << 16) | (bi << 8) | ai) >>> 0;
}

/**
 * Unpack uint32 color to RGBA floats (0-1 range).
 */
export function unpackColorRGBA(packed: number): { r: number; g: number; b: number; a: number } {
  return {
    r: ((packed >>> 24) & 0xff) / 255,
    g: ((packed >>> 16) & 0xff) / 255,
    b: ((packed >>> 8) & 0xff) / 255,
    a: (packed & 0xff) / 255,
  };
}

/**
 * Calculate UTF-8 byte length of a string.
 */
export function utf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * Get byte index from character index in a string.
 * @param str The string
 * @param charIndex Character index (code unit index)
 * @returns UTF-8 byte index
 */
export function charIndexToByteIndex(str: string, charIndex: number): number {
  const encoder = new TextEncoder();
  const prefix = str.slice(0, charIndex);
  return encoder.encode(prefix).length;
}

/**
 * Get character index from byte index in a string.
 * @param str The string
 * @param byteIndex UTF-8 byte index
 * @returns Character index (code unit index)
 */
export function byteIndexToCharIndex(str: string, byteIndex: number): number {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const decoder = new TextDecoder();
  const prefix = decoder.decode(bytes.slice(0, byteIndex));
  return prefix.length;
}

/**
 * Create a default text run for simple single-style text.
 */
export function createDefaultRun(
  content: string,
  fontSize = 16,
  colorRGBA = 0x000000ff,
  fontId = 0,
): TextRun {
  return {
    startIndex: 0,
    length: utf8ByteLength(content),
    fontId,
    fontSize,
    colorRGBA,
    flags: TextStyleFlags.None,
  };
}

/**
 * Create a simple text payload with a single run.
 */
export function createSimpleTextPayload(
  content: string,
  x: number,
  y: number,
  options?: Partial<TextProperties & { fontSize?: number; colorRGBA?: number }>,
): TextPayload {
  const fontSize = options?.fontSize ?? 16;
  const colorRGBA = options?.colorRGBA ?? 0x000000ff;

  return {
    x,
    y,
    rotation: options?.rotation ?? 0,
    boxMode: options?.boxMode ?? TextBoxMode.AutoWidth,
    align: options?.align ?? TextAlign.Left,
    constraintWidth: options?.constraintWidth ?? 0,
    runs: [createDefaultRun(content, fontSize, colorRGBA)],
    content,
  };
}
