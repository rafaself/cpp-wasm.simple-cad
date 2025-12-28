import { useEffect, useRef } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useEditorLogic } from './useEditorLogic';
import { KEYBINDINGS } from '../../../config/keybindings';
import { getEngineRuntime } from '@/engine/core/singleton';

export const useKeyboardShortcuts = () => {
  const uiStore = useUIStore();
  const { deleteSelected } = useEditorLogic();
  const prevToolRef = useRef<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // When engine-native text editing is active, do not process global shortcuts.
      // (TextInputProxy should own keyboard input during editing.)
      if (useUIStore.getState().engineTextEditState.active) return;

      // Ignore shortcuts if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const checkKey = (bindingId: string) => {
        const binding = KEYBINDINGS[bindingId];
        if (!binding) return false;

        return binding.keys.some(keyCombo => {
          const parts = keyCombo.toLowerCase().split('+');
          const mainKey = parts[parts.length - 1];
          const hasCtrl = parts.includes('ctrl');
          const hasMeta = parts.includes('meta');
          const hasShift = parts.includes('shift');
          const hasAlt = parts.includes('alt');

          // Check modifiers
          if (hasCtrl && !e.ctrlKey) return false;
          if (hasMeta && !e.metaKey) return false;
          if (hasShift && !e.shiftKey) return false;
          if (hasAlt && !e.altKey) return false;

          // Check main key
          if (mainKey === 'space' && e.code === 'Space') return true;
          if (mainKey === 'delete' && e.key === 'Delete') return true;
          if (mainKey === 'escape' && e.key === 'Escape') return true;
          
          return e.key.toLowerCase() === mainKey;
        });
      };

      // Undo / Redo
      if (checkKey('editor.undo')) {
           e.preventDefault();
           void getEngineRuntime().then((runtime) => runtime.undo());
           return;
      }
      if (checkKey('editor.redo')) {
           e.preventDefault();
           void getEngineRuntime().then((runtime) => runtime.redo());
           return;
      }

      // Pan shortcut (Space)
      if (checkKey('nav.pan') && !e.repeat) {
        if (uiStore.activeTool !== 'pan') {
          prevToolRef.current = uiStore.activeTool;
          uiStore.setTool('pan');
        }
        return;
      }

      // Global Tools
      if (checkKey('tools.select')) uiStore.setTool('select');
      else if (checkKey('nav.pan')) uiStore.setTool('pan'); // 'h' key
      else if (checkKey('tools.line')) uiStore.setTool('line');
      else if (checkKey('tools.polyline')) uiStore.setTool('polyline');
      else if (checkKey('tools.rect')) uiStore.setTool('rect');
      else if (checkKey('tools.circle')) uiStore.setTool('circle');
      else if (checkKey('tools.polygon')) uiStore.setTool('polygon');
      else if (checkKey('tools.measure')) uiStore.setTool('measure');
      else if (checkKey('tools.text')) uiStore.setTool('text');
      else if (checkKey('editor.delete')) deleteSelected();
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
  }, [uiStore, deleteSelected]);
};
