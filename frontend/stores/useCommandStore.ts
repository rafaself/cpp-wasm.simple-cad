import { create } from 'zustand';

const HISTORY_MAX_SIZE = 50;
const HISTORY_STORAGE_KEY = 'eletrocad-command-history';

interface CommandState {
  // Input state
  buffer: string;
  isActive: boolean;

  // History state
  history: string[];
  historyIndex: number; // -1 = not navigating, 0+ = index in history
  savedBuffer: string; // Buffer saved when starting history navigation

  // Feedback state
  error: string | null;
  errorTimeoutId: ReturnType<typeof setTimeout> | null;

  // Actions
  setBuffer: (text: string) => void;
  appendChar: (char: string) => void;
  deleteChar: () => void;
  clearBuffer: () => void;
  setActive: (active: boolean) => void;

  navigateHistory: (direction: 'up' | 'down') => void;
  addToHistory: (command: string) => void;
  loadHistory: () => void;

  setError: (message: string, duration?: number) => void;
  clearError: () => void;
}

const loadHistoryFromStorage = (): string[] => {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, HISTORY_MAX_SIZE);
      }
    }
  } catch {
    // Ignore storage errors
  }
  return [];
};

const saveHistoryToStorage = (history: string[]): void => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, HISTORY_MAX_SIZE)));
  } catch {
    // Ignore storage errors
  }
};

export const useCommandStore = create<CommandState>((set, get) => ({
  // Initial state
  buffer: '',
  isActive: false,
  history: [],
  historyIndex: -1,
  savedBuffer: '',
  error: null,
  errorTimeoutId: null,

  setBuffer: (text) => set({ buffer: text }),

  appendChar: (char) =>
    set((state) => ({
      buffer: state.buffer + char,
      historyIndex: -1, // Reset history navigation when typing
    })),

  deleteChar: () =>
    set((state) => ({
      buffer: state.buffer.slice(0, -1),
    })),

  clearBuffer: () =>
    set({
      buffer: '',
      historyIndex: -1,
      savedBuffer: '',
    }),

  setActive: (active) => set({ isActive: active }),

  navigateHistory: (direction) => {
    const { history, historyIndex, buffer, savedBuffer } = get();

    if (history.length === 0) return;

    if (direction === 'up') {
      if (historyIndex === -1) {
        // Starting navigation, save current buffer
        set({
          savedBuffer: buffer,
          historyIndex: 0,
          buffer: history[0] || '',
        });
      } else if (historyIndex < history.length - 1) {
        // Move up in history
        const newIndex = historyIndex + 1;
        set({
          historyIndex: newIndex,
          buffer: history[newIndex] || '',
        });
      }
      // At the end of history, do nothing
    } else {
      // direction === 'down'
      if (historyIndex === -1) {
        // Not navigating, do nothing
        return;
      } else if (historyIndex === 0) {
        // Return to saved buffer
        set({
          historyIndex: -1,
          buffer: savedBuffer,
          savedBuffer: '',
        });
      } else {
        // Move down in history
        const newIndex = historyIndex - 1;
        set({
          historyIndex: newIndex,
          buffer: history[newIndex] || '',
        });
      }
    }
  },

  addToHistory: (command) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    set((state) => {
      // Remove duplicate if exists
      const filtered = state.history.filter((h) => h !== trimmed);
      // Add to front
      const newHistory = [trimmed, ...filtered].slice(0, HISTORY_MAX_SIZE);
      // Persist
      saveHistoryToStorage(newHistory);

      return {
        history: newHistory,
        historyIndex: -1,
        savedBuffer: '',
      };
    });
  },

  loadHistory: () => {
    const history = loadHistoryFromStorage();
    set({ history });
  },

  setError: (message, duration = 3000) => {
    const { errorTimeoutId } = get();

    // Clear existing timeout
    if (errorTimeoutId) {
      clearTimeout(errorTimeoutId);
    }

    // Set new error with auto-clear
    const newTimeoutId = setTimeout(() => {
      set({ error: null, errorTimeoutId: null });
    }, duration);

    set({ error: message, errorTimeoutId: newTimeoutId });
  },

  clearError: () => {
    const { errorTimeoutId } = get();
    if (errorTimeoutId) {
      clearTimeout(errorTimeoutId);
    }
    set({ error: null, errorTimeoutId: null });
  },
}));
