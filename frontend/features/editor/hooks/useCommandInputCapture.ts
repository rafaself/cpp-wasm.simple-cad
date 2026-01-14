/**
 * useCommandInputCapture
 *
 * Captures keyboard input and routes printable characters to the command input
 * when the canvas is active and no other input element has focus.
 *
 * This hook uses the capture phase to intercept events before they reach
 * other handlers like useKeyboardShortcuts.
 */

import { useEffect, useRef, type RefObject } from 'react';

import { useCommandStore } from '@/stores/useCommandStore';
import { useUIStore } from '@/stores/useUIStore';

import { useCommandExecutor } from '../commands/commandExecutor';

/**
 * Checks if an element is an editable element (input, textarea, contenteditable).
 */
function isEditableElement(element: Element | null): boolean {
  if (!element) return false;

  const tagName = element.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    return true;
  }

  // Check for contenteditable
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Checks if a key event has modifiers that should prevent capture.
 * We allow Shift (for uppercase) but not Ctrl/Cmd/Alt.
 */
function hasBlockingModifiers(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey;
}

/**
 * Checks if a key is a printable character that should be captured.
 * Excludes space (used for pan mode) unless command input is already focused.
 */
function isPrintableKey(e: KeyboardEvent, allowSpace: boolean): boolean {
  // Single character keys are printable
  if (e.key.length !== 1) return false;

  // Space is only captured when the input is already focused
  // Otherwise, it's used for pan mode
  if (e.key === ' ' && !allowSpace) return false;

  return true;
}

/**
 * Checks if the key is a special command key we handle.
 */
function isCommandKey(key: string): boolean {
  return ['Enter', 'Escape', 'Backspace', 'ArrowUp', 'ArrowDown', 'Tab'].includes(key);
}

export interface UseCommandInputCaptureOptions {
  /** Ref to the command input element for focusing */
  inputRef?: RefObject<HTMLInputElement>;
  /** Whether capture is enabled (default: true) */
  enabled?: boolean;
  /** Whether IME composition is in progress */
  isComposing?: boolean;
}

/**
 * Hook that captures keyboard input and routes it to the command input.
 *
 * Capture conditions:
 * - Canvas is active (mouse is over canvas) OR command input already has focus
 * - No text editing is active in the engine
 * - No IME composition is in progress
 * - No modifier keys held (except Shift)
 * - No editable element (input/textarea/contenteditable) has focus
 *
 * @param options - Configuration options
 */
export function useCommandInputCapture(options: UseCommandInputCaptureOptions = {}) {
  const { inputRef, enabled = true, isComposing = false } = options;

  const { execute } = useCommandExecutor();

  // Store refs to avoid stale closures
  const executeRef = useRef(execute);
  executeRef.current = execute;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Get current state
      const uiState = useUIStore.getState();
      const commandState = useCommandStore.getState();

      // === SKIP CONDITIONS ===

      // 1. Skip if text editing is active in the engine
      if (uiState.engineTextEditState.active) {
        return;
      }

      // 2. Skip if IME composition is in progress
      if (isComposing) {
        return;
      }

      // 3. Skip if an editable element has focus (unless it's our command input)
      const activeElement = document.activeElement;
      const isOurInput = Boolean(inputRef?.current && activeElement === inputRef.current);

      if (!isOurInput && isEditableElement(activeElement)) {
        return;
      }

      // 4. Skip if blocking modifiers are held (Ctrl/Cmd/Alt)
      if (hasBlockingModifiers(e)) {
        return;
      }

      // === DETERMINE IF WE SHOULD CAPTURE ===

      // Capture if:
      // - Our command input has focus, OR
      // - Mouse is over canvas and it's a relevant key
      const allowSpace = isOurInput; // Only allow space when input is focused
      const shouldCapture =
        isOurInput ||
        (uiState.isMouseOverCanvas && (isPrintableKey(e, allowSpace) || isCommandKey(e.key)));

      if (!shouldCapture) {
        return;
      }

      // === HANDLE THE KEY ===

      if (isPrintableKey(e, allowSpace)) {
        // Printable character - append to buffer
        e.preventDefault();
        e.stopPropagation();

        commandState.appendChar(e.key);

        // Focus the input if not already focused
        if (!isOurInput && inputRef?.current) {
          inputRef.current.focus();
        }
        return;
      }

      // Handle special keys
      switch (e.key) {
        case 'Enter':
          // Don't execute during IME composition
          if (commandState.buffer.trim() && !isComposing) {
            e.preventDefault();
            e.stopPropagation();
            executeRef.current();
          }
          break;

        case 'Escape':
          if (commandState.buffer || commandState.isActive) {
            e.preventDefault();
            e.stopPropagation();
            commandState.clearBuffer();
            commandState.clearError();
            inputRef?.current?.blur();
          }
          // If buffer is empty, let Escape propagate to cancel tools
          break;

        case 'Backspace':
          if (commandState.buffer) {
            e.preventDefault();
            e.stopPropagation();
            commandState.deleteChar();
          }
          // If buffer is empty, don't capture (prevent browser back navigation handled elsewhere)
          break;

        case 'ArrowUp':
          if (isOurInput || commandState.isActive) {
            e.preventDefault();
            e.stopPropagation();
            commandState.navigateHistory('up');
          }
          break;

        case 'ArrowDown':
          if (isOurInput || commandState.isActive) {
            e.preventDefault();
            e.stopPropagation();
            commandState.navigateHistory('down');
          }
          break;

        case 'Tab':
          if (isOurInput && commandState.buffer.trim()) {
            e.preventDefault();
            e.stopPropagation();
            // Tab completion handled by CommandInput component
          }
          break;
      }
    };

    // Use capture phase to intercept events before other handlers
    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, inputRef, isComposing]);
}

export default useCommandInputCapture;
