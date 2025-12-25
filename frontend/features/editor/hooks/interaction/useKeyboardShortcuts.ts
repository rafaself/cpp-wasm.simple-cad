import { useEffect } from 'react';
import { useUIStore } from '@/stores/useUIStore';

interface KeyboardHandlers {
  onDelete?: () => void;
  onEscape?: () => void;
  onEnter?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
}

export function useKeyboardShortcuts(handlers: KeyboardHandlers) {
  const activeTool = useUIStore((s) => s.activeTool); // Maybe needed for context?

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // e.preventDefault(); // Sometimes backspace navigates back?
        handlers.onDelete?.();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handlers.onEscape?.();
        return;
      }

      if (e.key === 'Enter') {
         // Enter might default behavior (e.g. form submission), so prevent if handled
         if (handlers.onEnter) {
             e.preventDefault();
             handlers.onEnter();
             return;
         }
      }

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handlers.onRedo?.();
        } else {
          handlers.onUndo?.();
        }
        return;
      }

      if (isMod && e.key === 'a') {
        e.preventDefault();
        handlers.onSelectAll?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, activeTool]);
}
