import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from './useCommandStore';

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('useCommandStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useCommandStore.setState({
      buffer: '',
      isActive: false,
      history: [],
      historyIndex: -1,
      savedBuffer: '',
      error: null,
      errorTimeoutId: null,
    });

    // Clear localStorage
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('buffer operations', () => {
    it('sets buffer directly', () => {
      useCommandStore.getState().setBuffer('LINE');
      expect(useCommandStore.getState().buffer).toBe('LINE');
    });

    it('appends character to buffer', () => {
      useCommandStore.getState().setBuffer('LIN');
      useCommandStore.getState().appendChar('E');
      expect(useCommandStore.getState().buffer).toBe('LINE');
    });

    it('deletes last character from buffer', () => {
      useCommandStore.getState().setBuffer('LINE');
      useCommandStore.getState().deleteChar();
      expect(useCommandStore.getState().buffer).toBe('LIN');
    });

    it('handles deleteChar on empty buffer', () => {
      useCommandStore.getState().setBuffer('');
      useCommandStore.getState().deleteChar();
      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('clears buffer', () => {
      useCommandStore.getState().setBuffer('LINE');
      useCommandStore.getState().clearBuffer();
      expect(useCommandStore.getState().buffer).toBe('');
    });

    it('appendChar resets history navigation', () => {
      useCommandStore.setState({ historyIndex: 2 });
      useCommandStore.getState().appendChar('A');
      expect(useCommandStore.getState().historyIndex).toBe(-1);
    });
  });

  describe('active state', () => {
    it('sets active state', () => {
      useCommandStore.getState().setActive(true);
      expect(useCommandStore.getState().isActive).toBe(true);

      useCommandStore.getState().setActive(false);
      expect(useCommandStore.getState().isActive).toBe(false);
    });
  });

  describe('history', () => {
    it('adds command to history', () => {
      useCommandStore.getState().addToHistory('LINE');
      expect(useCommandStore.getState().history).toContain('LINE');
    });

    it('adds to front of history', () => {
      useCommandStore.getState().addToHistory('LINE');
      useCommandStore.getState().addToHistory('RECT');
      expect(useCommandStore.getState().history[0]).toBe('RECT');
      expect(useCommandStore.getState().history[1]).toBe('LINE');
    });

    it('deduplicates history', () => {
      useCommandStore.getState().addToHistory('LINE');
      useCommandStore.getState().addToHistory('RECT');
      useCommandStore.getState().addToHistory('LINE');

      const { history } = useCommandStore.getState();
      expect(history).toHaveLength(2);
      expect(history[0]).toBe('LINE'); // Most recent
      expect(history[1]).toBe('RECT');
    });

    it('ignores empty commands', () => {
      useCommandStore.getState().addToHistory('');
      useCommandStore.getState().addToHistory('   ');
      expect(useCommandStore.getState().history).toHaveLength(0);
    });

    it('trims command before adding', () => {
      useCommandStore.getState().addToHistory('  LINE  ');
      expect(useCommandStore.getState().history[0]).toBe('LINE');
    });
  });

  describe('history navigation', () => {
    beforeEach(() => {
      // Set up history: ['RECT', 'LINE'] (RECT is most recent)
      useCommandStore.setState({
        history: ['RECT', 'LINE'],
        historyIndex: -1,
        buffer: 'CUR',
        savedBuffer: '',
      });
    });

    it('navigates up from current buffer', () => {
      useCommandStore.getState().navigateHistory('up');

      const state = useCommandStore.getState();
      expect(state.historyIndex).toBe(0);
      expect(state.buffer).toBe('RECT');
      expect(state.savedBuffer).toBe('CUR');
    });

    it('navigates up through history', () => {
      useCommandStore.getState().navigateHistory('up'); // → RECT
      useCommandStore.getState().navigateHistory('up'); // → LINE

      expect(useCommandStore.getState().buffer).toBe('LINE');
      expect(useCommandStore.getState().historyIndex).toBe(1);
    });

    it('stops at end of history when navigating up', () => {
      useCommandStore.getState().navigateHistory('up'); // → RECT
      useCommandStore.getState().navigateHistory('up'); // → LINE
      useCommandStore.getState().navigateHistory('up'); // → LINE (no change)

      expect(useCommandStore.getState().buffer).toBe('LINE');
      expect(useCommandStore.getState().historyIndex).toBe(1);
    });

    it('navigates down to more recent', () => {
      useCommandStore.getState().navigateHistory('up'); // → RECT
      useCommandStore.getState().navigateHistory('up'); // → LINE
      useCommandStore.getState().navigateHistory('down'); // → RECT

      expect(useCommandStore.getState().buffer).toBe('RECT');
      expect(useCommandStore.getState().historyIndex).toBe(0);
    });

    it('navigates down back to saved buffer', () => {
      useCommandStore.getState().navigateHistory('up'); // → RECT
      useCommandStore.getState().navigateHistory('down'); // → CUR

      const state = useCommandStore.getState();
      expect(state.buffer).toBe('CUR');
      expect(state.historyIndex).toBe(-1);
      expect(state.savedBuffer).toBe('');
    });

    it('does nothing when navigating down with no history navigation', () => {
      useCommandStore.getState().navigateHistory('down');

      expect(useCommandStore.getState().buffer).toBe('CUR');
      expect(useCommandStore.getState().historyIndex).toBe(-1);
    });

    it('does nothing when history is empty', () => {
      useCommandStore.setState({ history: [], buffer: 'TEST' });
      useCommandStore.getState().navigateHistory('up');

      expect(useCommandStore.getState().buffer).toBe('TEST');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sets error message', () => {
      useCommandStore.getState().setError('Unknown command');
      expect(useCommandStore.getState().error).toBe('Unknown command');
    });

    it('auto-clears error after duration', () => {
      useCommandStore.getState().setError('Unknown command', 2000);

      expect(useCommandStore.getState().error).toBe('Unknown command');

      vi.advanceTimersByTime(2000);

      expect(useCommandStore.getState().error).toBeNull();
    });

    it('clears previous timeout when setting new error', () => {
      useCommandStore.getState().setError('Error 1', 3000);
      vi.advanceTimersByTime(1000);

      useCommandStore.getState().setError('Error 2', 3000);
      vi.advanceTimersByTime(2000);

      // Error 1 timeout would have fired, but it was replaced
      expect(useCommandStore.getState().error).toBe('Error 2');

      vi.advanceTimersByTime(1000);
      expect(useCommandStore.getState().error).toBeNull();
    });

    it('clears error manually', () => {
      useCommandStore.getState().setError('Error');
      useCommandStore.getState().clearError();
      expect(useCommandStore.getState().error).toBeNull();
    });

    it('clearError cancels timeout', () => {
      useCommandStore.getState().setError('Error', 3000);
      useCommandStore.getState().clearError();

      vi.advanceTimersByTime(3000);

      // No error should be set (timeout was cancelled)
      expect(useCommandStore.getState().error).toBeNull();
    });
  });

  describe('localStorage persistence', () => {
    it('saves history to localStorage', () => {
      useCommandStore.getState().addToHistory('LINE');
      useCommandStore.getState().addToHistory('RECT');

      const stored = localStorage.getItem('eletrocad-command-history');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored!);
      expect(parsed).toContain('RECT');
      expect(parsed).toContain('LINE');
    });

    it('loads history from localStorage', () => {
      localStorage.setItem('eletrocad-command-history', JSON.stringify(['CIRCLE', 'POLYGON']));

      useCommandStore.getState().loadHistory();

      const { history } = useCommandStore.getState();
      expect(history).toContain('CIRCLE');
      expect(history).toContain('POLYGON');
    });

    it('handles invalid localStorage data gracefully', () => {
      localStorage.setItem('eletrocad-command-history', 'invalid json');

      useCommandStore.getState().loadHistory();

      expect(useCommandStore.getState().history).toEqual([]);
    });

    it('handles missing localStorage gracefully', () => {
      localStorage.removeItem('eletrocad-command-history');

      useCommandStore.getState().loadHistory();

      expect(useCommandStore.getState().history).toEqual([]);
    });
  });
});
