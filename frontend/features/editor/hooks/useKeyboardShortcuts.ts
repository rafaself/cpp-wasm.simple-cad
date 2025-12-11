import { useEffect, useRef } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useEditorLogic } from './useEditorLogic';

export const useKeyboardShortcuts = () => {
  const uiStore = useUIStore();
  const dataStore = useDataStore();
  const { deleteSelected } = useEditorLogic();
  const prevToolRef = useRef<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Undo / Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
           e.preventDefault();
           if (e.shiftKey) dataStore.redo();
           else dataStore.undo();
           return;
        }
        if (e.key.toLowerCase() === 'y') {
           e.preventDefault();
           dataStore.redo();
           return;
        }
      }

      // Pan shortcut (Space)
      if (e.code === 'Space' && !e.repeat) {
        if (uiStore.activeTool !== 'pan') {
          prevToolRef.current = uiStore.activeTool;
          uiStore.setTool('pan');
        }
        return;
      }

      // Tool Shortcuts
      switch(e.key.toLowerCase()) {
        case 'v': uiStore.setTool('select'); break;
        case 'h': uiStore.setTool('pan'); break;
        case 'l': uiStore.setTool('line'); break;
        case 'p': uiStore.setTool('polyline'); break;
        case 'r': uiStore.setTool('rect'); break;
        case 'c': uiStore.setTool('circle'); break;
        case 'g': uiStore.setTool('polygon'); break;
        case 'a': uiStore.setTool('arc'); break;
        case 'm': uiStore.setTool('measure'); break;
        case 't': uiStore.setTool('text'); break;
        case 'delete':
            deleteSelected();
            break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (prevToolRef.current) {
          uiStore.setTool(prevToolRef.current as any);
          prevToolRef.current = null;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [uiStore, dataStore, deleteSelected]);
};
