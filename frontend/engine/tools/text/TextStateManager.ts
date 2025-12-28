/**
 * TextStateManager - Manages TextTool state lifecycle.
 * 
 * Extracted from TextTool.ts to handle state initialization, updates,
 * and active text management separately from tool logic.
 */

import { TextBoxMode, TextStyleFlags, TextAlign, TextStyleDefaults, TextToolState } from './types';
import { packColorRGBA } from '@/types/text';

export class TextStateManager {
  private state: TextToolState;
  private styleDefaults: TextStyleDefaults;
  private onStateChange: (state: TextToolState) => void;

  constructor(onStateChange: (state: TextToolState) => void) {
    this.onStateChange = onStateChange;
    this.state = this.createInitialState();
    this.styleDefaults = this.createDefaultStyles();
  }

  /** Get current state (read-only snapshot). */
  getState(): TextToolState {
    return this.state;
  }

  /** Get style defaults. */
  getStyleDefaults(): TextStyleDefaults {
    return this.styleDefaults;
  }

  /** Update style defaults. */
  setStyleDefaults(defaults: Partial<TextStyleDefaults>): void {
    this.styleDefaults = { ...this.styleDefaults, ...defaults };
  }

  /** Update state and notify listeners. */
  updateState(partial: Partial<TextToolState>): void {
    this.state = { ...this.state, ...partial };
    this.onStateChange(this.state);
  }

  /** Shortcut to set mode. */
  setMode(mode: TextToolState['mode']): void {
    this.updateState({ mode });
  }

  /** Enter editing mode for a text entity. */
  setActiveText(
    textId: number,
    anchorX: number,
    anchorY: number,
    rotation: number,
    boxMode: TextBoxMode,
    constraintWidth: number,
    initialCaretIndex: number = 0
  ): void {
    this.updateState({
      mode: 'editing',
      activeTextId: textId,
      anchorX,
      anchorY,
      rotation,
      boxMode,
      constraintWidth,
      caretIndex: initialCaretIndex,
      selectionStart: initialCaretIndex,
      selectionEnd: initialCaretIndex,
    });
  }

  /** Update caret/selection positions. */
  updateSelection(caretIndex: number, selectionStart: number, selectionEnd: number): void {
    this.updateState({
      caretIndex,
      selectionStart,
      selectionEnd,
    });
  }

  // NOTE: updateContent removed — content is now read from engine

  /** Update anchor position. */
  updateAnchor(anchorX: number, anchorY: number): void {
    this.updateState({ anchorX, anchorY });
  }

  /** Clear active text and return to idle. */
  clearActiveText(): void {
    this.updateState(this.createInitialState());
  }

  /** Check if there's an active text being edited. */
  hasActiveText(): boolean {
    return this.state.activeTextId !== null;
  }

  /** Check if currently in editing mode. */
  isEditing(): boolean {
    return this.state.mode === 'editing';
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

  private createDefaultStyles(): TextStyleDefaults {
    return {
      fontId: 4, // Inter/DejaVu Sans - fontId=0 is reserved
      fontSize: 16,
      colorRGBA: packColorRGBA(1, 1, 1, 1), // White
      flags: TextStyleFlags.None,
      align: TextAlign.Left,
    };
  }
}
