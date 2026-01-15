/**
 * Shared types for TextTool decomposition.
 */

import {
  TextBoxMode,
  TextStyleFlags,
  TextAlign,
  TextStyleSnapshot,
  TextSelectionRect,
} from '@/types/text';

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
  // NOTE: `content` removed — use getContent() from the engine via TextTool or TextBridge
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
  onSelectionUpdate?: (rects: TextSelectionRect[]) => void;
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
    content: string,
    bounds: { width: number; height: number },
    boxMode: TextBoxMode,
    constraintWidth: number,
    x?: number,
    y?: number,
  ) => void;
  /** Called when text is deleted (for syncing to JS store) */
  onTextDeleted?: (textId: number) => void;
}

export { TextBoxMode, TextStyleFlags, TextAlign };
export type { TextStyleSnapshot, TextSelectionRect };
