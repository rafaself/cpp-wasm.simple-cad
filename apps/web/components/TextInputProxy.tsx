/**
 * TextInputProxy - Hidden input element for keyboard/IME capture
 *
 * This component provides an invisible input proxy that:
 * - Captures keyboard input (keydown, keyup, input events)
 * - Handles IME composition (compositionstart, compositionupdate, compositionend)
 * - Captures clipboard operations (paste, cut, copy)
 * - Positions itself near the caret for proper IME popup placement
 *
 * It does NOT:
 * - Measure text or calculate layout
 * - Render text visually
 * - Manage selection highlighting (that's done by overlay)
 */

import React, { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';

import type { TextInputDelta, TextCompositionState } from '@/types/text';

// =============================================================================
// Types
// =============================================================================

export interface TextInputProxyProps {
  /** Whether the proxy should capture input */
  active: boolean;
  /** Current text content (for selection/caret context) */
  content: string;
  /** Current caret position (character index) */
  caretIndex: number;
  /** Selection start (character index), same as caretIndex if no selection */
  selectionStart: number;
  /** Selection end (character index) */
  selectionEnd: number;
  /** Position hint for IME popup (screen coordinates) */
  positionHint?: { x: number; y: number };
  /** Callback when text input occurs */
  onInput: (delta: TextInputDelta) => void;
  /** Callback when caret/selection changes via keyboard */
  onSelectionChange?: (start: number, end: number) => void;
  /** Callback for composition state changes */
  onCompositionChange?: (state: TextCompositionState) => void;
  /** Callback for special keys (Enter, Escape, Tab, etc.) */
  onSpecialKey?: (key: string, event: React.KeyboardEvent) => void;
}

export interface TextInputProxyRef {
  /** Focus the hidden input */
  focus: () => void;
  /** Blur the hidden input */
  blur: () => void;
  /** Check if focused */
  isFocused: () => boolean;
  /** Set content for IME context */
  setContent: (content: string, caretIndex: number) => void;
}

type SelectionRange = { start: number; end: number };

// =============================================================================
// Component
// =============================================================================

export const TextInputProxy = forwardRef<TextInputProxyRef, TextInputProxyProps>(
  function TextInputProxy(
    {
      active,
      content,
      selectionStart,
      selectionEnd,
      positionHint,
      onInput,
      onSelectionChange,
      onCompositionChange,
      onSpecialKey,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const composingRef = useRef(false);
    const lastContentRef = useRef(content);
    const lastSelectionRef = useRef<SelectionRange>({
      start: selectionStart,
      end: selectionEnd,
    });

    // Expose imperative methods
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      isFocused: () => document.activeElement === inputRef.current,
      setContent: (newContent: string, newCaretIndex: number) => {
        if (inputRef.current) {
          inputRef.current.value = newContent;
          inputRef.current.setSelectionRange(newCaretIndex, newCaretIndex);
          lastContentRef.current = newContent;
          lastSelectionRef.current = { start: newCaretIndex, end: newCaretIndex };
        }
      },
    }));

    // Sync content and selection to hidden input
    useEffect(() => {
      if (!inputRef.current || composingRef.current) return;

      // Only update if content changed
      if (inputRef.current.value !== content) {
        inputRef.current.value = content;
        lastContentRef.current = content;
      }

      // Update selection
      const start = Math.min(selectionStart, content.length);
      const end = Math.min(selectionEnd, content.length);
      if (inputRef.current.selectionStart !== start || inputRef.current.selectionEnd !== end) {
        inputRef.current.setSelectionRange(start, end);
      }
      lastSelectionRef.current = { start, end };
    }, [content, selectionStart, selectionEnd]);

    // Auto-focus when active
    useEffect(() => {
      if (active && inputRef.current) {
        inputRef.current.focus();
      }
    }, [active]);

    // =========================================================================
    // Event Handlers
    // =========================================================================

    const handleInput = useCallback(
      (e: React.FormEvent<HTMLTextAreaElement>) => {
        if (composingRef.current) return; // Skip during IME composition

        const target = e.currentTarget;
        const newValue = target.value;
        const oldValue = lastContentRef.current;
        const selectionBefore = lastSelectionRef.current;
        const caretAfter = target.selectionStart ?? 0;

        // Calculate the delta
        const delta = computeInputDelta(oldValue, newValue, caretAfter, selectionBefore);

        if (delta) {
          lastContentRef.current = newValue;
          lastSelectionRef.current = {
            start: target.selectionStart ?? 0,
            end: target.selectionEnd ?? 0,
          };
          onInput(delta);
        }
      },
      [onInput],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Handle special keys before default behavior
        const { key } = e;

        // Handle special keys including navigation
        if (e.nativeEvent.isComposing) return;

        const isNavigation = [
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Home',
          'End',
        ].includes(key);
        const isControl = ['Enter', 'Escape', 'Tab', 'Backspace', 'Delete'].includes(key);

        if (isNavigation || isControl) {
          if (onSpecialKey) {
            onSpecialKey(key, e);
            if (e.defaultPrevented) {
              return;
            }
          }
        }

        // Navigation keys that might change selection (if not prevented)
        if (isNavigation) {
          // Let the browser handle it, then report the new selection
          requestAnimationFrame(() => {
            if (inputRef.current && onSelectionChange) {
              onSelectionChange(
                inputRef.current.selectionStart ?? 0,
                inputRef.current.selectionEnd ?? 0,
              );
            }
          });
          return;
        }

        // Special keys default behaviors
        if (key === 'Escape') {
          e.preventDefault();
        }
        if (key === 'Tab') {
          e.preventDefault();
        }
        // Enter falls through to input usually? Or separate handler.
        // Original code returned for Enter/Escape/Tab.
        if (['Enter', 'Escape', 'Tab'].includes(key)) {
          return;
        }

        // Handle backspace/delete for better delta detection
        if (key === 'Backspace' || key === 'Delete') {
          // Will be handled in handleInput
          return;
        }
      },
      [onSelectionChange, onSpecialKey],
    );

    const handleCompositionStart = useCallback(
      (e: React.CompositionEvent<HTMLTextAreaElement>) => {
        composingRef.current = true;
        onCompositionChange?.({
          composing: true,
          phase: 'start',
          compositionText: e.data || '',
          compositionStart: e.currentTarget.selectionStart ?? 0,
        });
      },
      [onCompositionChange],
    );

    const handleCompositionUpdate = useCallback(
      (e: React.CompositionEvent<HTMLTextAreaElement>) => {
        onCompositionChange?.({
          composing: true,
          phase: 'update',
          compositionText: e.data || '',
          compositionStart: e.currentTarget.selectionStart ?? 0,
        });
      },
      [onCompositionChange],
    );

    const handleCompositionEnd = useCallback(
      (e: React.CompositionEvent<HTMLTextAreaElement>) => {
        composingRef.current = false;

        onCompositionChange?.({
          composing: false,
          phase: 'end',
          compositionText: e.data || '',
          compositionStart: e.currentTarget.selectionStart ?? 0,
        });

        lastContentRef.current = e.currentTarget.value;
        lastSelectionRef.current = {
          start: e.currentTarget.selectionStart ?? 0,
          end: e.currentTarget.selectionEnd ?? 0,
        };
      },
      [onCompositionChange],
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pastedText = e.clipboardData.getData('text/plain');
        if (!pastedText) return;

        e.preventDefault();

        const target = e.currentTarget;
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;

        if (start !== end) {
          // Replace selection
          onInput({
            type: 'replace',
            start,
            end,
            text: pastedText,
          });
        } else {
          // Insert at caret
          onInput({
            type: 'insert',
            at: start,
            text: pastedText,
          });
        }
      },
      [onInput],
    );

    const handleCut = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const target = e.currentTarget;
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;

        if (start === end) return; // Nothing selected

        // Copy to clipboard
        const selectedText = content.slice(start, end);
        e.clipboardData.setData('text/plain', selectedText);
        e.preventDefault();

        // Delete selection
        onInput({
          type: 'delete',
          start,
          end,
        });
      },
      [content, onInput],
    );

    const handleCopy = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const target = e.currentTarget;
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;

        if (start === end) return; // Nothing selected

        const selectedText = content.slice(start, end);
        e.clipboardData.setData('text/plain', selectedText);
        e.preventDefault();
      },
      [content],
    );

    const handleSelect = useCallback(() => {
      if (inputRef.current && onSelectionChange) {
        const start = inputRef.current.selectionStart ?? 0;
        const end = inputRef.current.selectionEnd ?? 0;
        lastSelectionRef.current = { start, end };
        onSelectionChange(start, end);
      }
    }, [onSelectionChange]);

    // =========================================================================
    // Render
    // =========================================================================

    // Position the hidden input near the caret for proper IME popup
    const style: React.CSSProperties = {
      position: 'fixed',
      left: positionHint?.x ?? -9999,
      top: positionHint?.y ?? -9999,
      width: 1,
      height: 20,
      opacity: 0,
      // Keep it non-interactive for pointer events, but in a high z-index layer
      // so focus + IME behavior is consistent across browsers.
      pointerEvents: 'none',
      zIndex: 9999,
      // Prevent any visual rendering
      border: 'none',
      outline: 'none',
      padding: 0,
      margin: 0,
      resize: 'none',
      overflow: 'hidden',
      background: 'transparent',
      color: 'transparent',
      caretColor: 'transparent',
    };

    return (
      <textarea
        ref={inputRef}
        style={style}
        aria-hidden="true"
        tabIndex={active ? 0 : -1}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionUpdate={handleCompositionUpdate}
        onCompositionEnd={handleCompositionEnd}
        onPaste={handlePaste}
        onCut={handleCut}
        onCopy={handleCopy}
        onSelect={handleSelect}
      />
    );
  },
);

// =============================================================================
// Helpers
// =============================================================================

/**
 * Compute the input delta between old and new values.
 * Handles insert, delete, and replace operations.
 */
export function computeInputDelta(
  oldValue: string,
  newValue: string,
  caretAfter: number,
  selectionBefore: SelectionRange,
): TextInputDelta | null {
  if (oldValue === newValue) return null;

  const oldLen = oldValue.length;
  const newLen = newValue.length;
  const selectionStart = Math.max(
    0,
    Math.min(Math.min(selectionBefore.start, selectionBefore.end), oldLen),
  );
  const selectionEnd = Math.max(
    0,
    Math.min(Math.max(selectionBefore.start, selectionBefore.end), oldLen),
  );
  const selectionLen = selectionEnd - selectionStart;
  const netDelta = newLen - oldLen;

  if (selectionLen > 0) {
    const insertedLen = newLen - (oldLen - selectionLen);
    if (insertedLen <= 0) {
      return { type: 'delete', start: selectionStart, end: selectionEnd };
    }
    const insertedText = newValue.slice(selectionStart, selectionStart + insertedLen);
    return {
      type: 'replace',
      start: selectionStart,
      end: selectionEnd,
      text: insertedText,
    };
  }

  if (netDelta > 0) {
    const insertAt = Math.max(0, Math.min(selectionStart, oldLen));
    const insertedText = newValue.slice(insertAt, insertAt + netDelta);
    return { type: 'insert', at: insertAt, text: insertedText };
  }

  if (netDelta < 0) {
    const deleteLen = -netDelta;
    const caret = Math.max(0, Math.min(caretAfter, newLen));
    let deleteStart = selectionStart;
    if (caret < selectionStart) {
      deleteStart = caret;
    }
    const deleteEnd = Math.min(oldLen, deleteStart + deleteLen);
    return { type: 'delete', start: deleteStart, end: deleteEnd };
  }

  // Find common prefix
  let prefixLen = 0;
  while (prefixLen < oldLen && prefixLen < newLen && oldValue[prefixLen] === newValue[prefixLen]) {
    prefixLen++;
  }
  if (netDelta > 0) {
    const insertionPoint = Math.max(0, Math.min(caretAfter - netDelta, newLen));
    prefixLen = Math.min(prefixLen, insertionPoint);
  }

  // Find common suffix (from the end, not overlapping with prefix)
  let oldSuffixStart = oldLen;
  let newSuffixStart = newLen;
  while (
    oldSuffixStart > prefixLen &&
    newSuffixStart > prefixLen &&
    oldValue[oldSuffixStart - 1] === newValue[newSuffixStart - 1]
  ) {
    oldSuffixStart--;
    newSuffixStart--;
  }

  const deletedLen = oldSuffixStart - prefixLen;
  const insertedText = newValue.slice(prefixLen, newSuffixStart);

  if (deletedLen > 0 && insertedText.length > 0) {
    return {
      type: 'replace',
      start: prefixLen,
      end: oldSuffixStart,
      text: insertedText,
    };
  } else if (deletedLen > 0) {
    return {
      type: 'delete',
      start: prefixLen,
      end: oldSuffixStart,
    };
  } else if (insertedText.length > 0) {
    return {
      type: 'insert',
      at: prefixLen,
      text: insertedText,
    };
  }

  return null;
}

export default TextInputProxy;
