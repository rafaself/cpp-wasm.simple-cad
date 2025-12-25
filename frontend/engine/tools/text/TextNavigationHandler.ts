/**
 * TextNavigationHandler - Keyboard navigation in text.
 * 
 * Extracted from TextTool.ts to handle arrow key navigation,
 * word jumps (Ctrl+Arrow), Home/End, and line up/down.
 */

import type { TextBridge } from '@/engine/bridge/textBridge';
import type { TextStateManager } from './TextStateManager';
import { charIndexToByteIndex } from '@/types/text';

export interface NavigationCallback {
  onCaretUpdate?: () => void;
}

interface KeyEvent {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

export class TextNavigationHandler {
  constructor(
    private bridge: TextBridge,
    private stateManager: TextStateManager,
    private callback: NavigationCallback
  ) {}

  /**
   * Handle navigation key press.
   * @returns true if the key was handled
   */
  handleNavigationKey(key: string, event: KeyEvent): boolean {
    const state = this.stateManager.getState();
    if (state.activeTextId === null) return false;

    const textId = state.activeTextId;
    const currentCaret = state.caretIndex;
    const currentContent = state.content;
    let newCaret = currentCaret;
    let handled = false;

    const isWordMod = event.ctrlKey || event.altKey;

    switch (key) {
      case 'ArrowLeft':
        newCaret = isWordMod
          ? this.bridge.getWordLeft(textId, currentCaret, currentContent)
          : this.bridge.getVisualPrev(textId, currentCaret, currentContent);
        handled = true;
        break;

      case 'ArrowRight':
        newCaret = isWordMod
          ? this.bridge.getWordRight(textId, currentCaret, currentContent)
          : this.bridge.getVisualNext(textId, currentCaret, currentContent);
        handled = true;
        break;

      case 'Home':
        newCaret = this.bridge.getLineStart(textId, currentCaret, currentContent);
        handled = true;
        break;

      case 'End':
        newCaret = this.bridge.getLineEnd(textId, currentCaret, currentContent);
        handled = true;
        break;

      case 'ArrowUp':
        newCaret = this.bridge.getLineUp(textId, currentCaret, currentContent);
        handled = true;
        break;

      case 'ArrowDown':
        newCaret = this.bridge.getLineDown(textId, currentCaret, currentContent);
        handled = true;
        break;
    }

    if (!handled) return false;

    event.preventDefault();

    // Update selection based on shift key
    if (event.shiftKey) {
      // Extending selection
      let anchor = state.selectionStart;
      if (anchor === state.caretIndex) anchor = state.selectionEnd;

      this.stateManager.updateState({
        caretIndex: newCaret,
        selectionStart: Math.min(anchor, newCaret),
        selectionEnd: Math.max(anchor, newCaret),
      });
    } else {
      // Collapsed selection (just move caret)
      this.stateManager.updateState({
        caretIndex: newCaret,
        selectionStart: newCaret,
        selectionEnd: newCaret,
      });
    }

    // Sync to engine
    const updatedState = this.stateManager.getState();
    const caretByte = charIndexToByteIndex(updatedState.content, updatedState.caretIndex);

    if (updatedState.selectionStart !== updatedState.selectionEnd) {
      const sByte = charIndexToByteIndex(updatedState.content, updatedState.selectionStart);
      const eByte = charIndexToByteIndex(updatedState.content, updatedState.selectionEnd);
      this.bridge.setSelectionByteIndex(textId, sByte, eByte);
    } else {
      this.bridge.setCaretByteIndex(textId, caretByte);
    }

    this.callback.onCaretUpdate?.();
    return true;
  }

  /**
   * Handle special keys like Escape.
   * @returns true if the key was handled
   */
  handleSpecialKey(key: string, event?: KeyEvent): 'escape' | 'enter' | null {
    if (key === 'Escape') {
      event?.preventDefault();
      return 'escape';
    }
    if (key === 'Enter') {
      // Let TextInputProxy handle newline insertion
      return 'enter';
    }
    return null;
  }

  /**
   * Move caret programmatically (deprecated, prefer handleNavigationKey).
   */
  moveCaret(direction: 'left' | 'right' | 'up' | 'down'): void {
    const keyMap: Record<string, string> = {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
    };
    this.handleNavigationKey(keyMap[direction], {
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: () => {},
    });
  }
}
