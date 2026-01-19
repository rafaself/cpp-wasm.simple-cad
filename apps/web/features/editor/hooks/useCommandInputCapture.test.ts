import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '@/stores/useCommandStore';
import { useUIStore } from '@/stores/useUIStore';

import { useCommandInputCapture } from './useCommandInputCapture';

// Mock the command executor
vi.mock('../commands/commandExecutor', () => ({
  useCommandExecutor: () => ({
    execute: vi.fn(),
  }),
}));

describe('useCommandInputCapture', () => {
  let inputRef: { current: HTMLInputElement | null };

  beforeEach(() => {
    // Create a mock input element
    inputRef = { current: document.createElement('input') };
    document.body.appendChild(inputRef.current!);

    // Reset stores
    useCommandStore.setState({
      buffer: '',
      isActive: false,
      history: [],
      historyIndex: -1,
      savedBuffer: '',
      error: null,
      errorTimeoutId: null,
    });

    useUIStore.setState({
      isMouseOverCanvas: false,
      engineTextEditState: {
        active: false,
        textId: null,
        editGeneration: 0,
        caretPosition: null,
      },
    } as any);
  });

  afterEach(() => {
    if (inputRef.current) {
      document.body.removeChild(inputRef.current);
    }
    vi.clearAllMocks();
  });

  describe('capture conditions', () => {
    it('captures printable keys when canvas is active', () => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);

      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('L');
    });

    it('does not capture when canvas is not active', () => {
      useUIStore.setState({ isMouseOverCanvas: false } as any);

      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('does not capture when text editing is active', () => {
      useUIStore.setState({
        isMouseOverCanvas: true,
        engineTextEditState: {
          active: true,
          textId: 1,
          editGeneration: 1,
          caretPosition: null,
        },
      } as any);

      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('does not capture when modifier keys are held', () => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);

      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
        );
      });

      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('does not capture space when input is not focused (for pan mode)', () => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);

      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('captures space when input is focused', () => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);
      inputRef.current!.focus();

      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe(' ');
    });
  });

  describe('key handling', () => {
    beforeEach(() => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);
    });

    it('appends multiple characters to buffer', () => {
      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'I', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('LINE');
    });

    it('handles Backspace to delete characters', () => {
      useCommandStore.setState({ buffer: 'LINE' });
      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('LIN');
    });

    it('does not capture Backspace when buffer is empty', () => {
      useCommandStore.setState({ buffer: '' });
      renderHook(() => useCommandInputCapture({ inputRef }));

      const event = new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('handles Escape to clear buffer', () => {
      useCommandStore.setState({ buffer: 'LINE', isActive: true });
      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('lets Escape propagate when buffer is empty', () => {
      useCommandStore.setState({ buffer: '', isActive: false });
      renderHook(() => useCommandInputCapture({ inputRef }));

      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      act(() => {
        window.dispatchEvent(event);
      });

      // Should not stop propagation so Escape can cancel tools
      expect(stopPropagationSpy).not.toHaveBeenCalled();
    });

    it('handles ArrowUp for history navigation when active', () => {
      useCommandStore.setState({ isActive: true, history: ['LINE'], historyIndex: -1 });
      inputRef.current!.focus();
      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      });

      expect(useCommandStore.getState().historyIndex).toBe(0);
    });
  });

  describe('focus management', () => {
    it('focuses the input when capturing a key', () => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);
      const focusSpy = vi.spyOn(inputRef.current!, 'focus');

      renderHook(() => useCommandInputCapture({ inputRef }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
      });

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('does not capture when disabled', () => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);

      renderHook(() => useCommandInputCapture({ inputRef, enabled: false }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('');
    });
  });

  describe('IME composition', () => {
    beforeEach(() => {
      useUIStore.setState({ isMouseOverCanvas: true } as any);
    });

    it('does not capture when composition is in progress', () => {
      renderHook(() => useCommandInputCapture({ inputRef, isComposing: true }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('captures when composition is not active', () => {
      renderHook(() => useCommandInputCapture({ inputRef, isComposing: false }));

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', bubbles: true }));
      });

      expect(useCommandStore.getState().buffer).toBe('L');
    });

    it('does not capture Enter during composition', () => {
      useCommandStore.setState({ buffer: 'LINE' });

      renderHook(() => useCommandInputCapture({ inputRef, isComposing: true }));

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      act(() => {
        window.dispatchEvent(event);
      });

      // Should not prevent or stop propagation during composition
      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(stopPropagationSpy).not.toHaveBeenCalled();
    });

    it('allows Enter after composition ends', () => {
      useCommandStore.setState({ buffer: 'LINE' });

      renderHook(() => useCommandInputCapture({ inputRef, isComposing: false }));

      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      act(() => {
        window.dispatchEvent(event);
      });

      // Should execute when composition is not active
      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
    });
  });
});
