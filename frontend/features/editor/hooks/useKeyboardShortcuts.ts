import { useEffect, useRef } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useEditorLogic } from './useEditorLogic';
import { KEYBINDINGS } from '../../../config/keybindings';

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

          // Check exact modifiers if NOT specified (e.g. if config is just 'z', ctrl+z shouldn't trigger it)
          // Exception: simple letters usually allow shift for caps, but strict tools might not.
          // For now, let's keep it simple: if mod is required, it must be there.
          // We should ideally check that *extra* modifiers are NOT pressed, but let's stick to the previous simple logic for now unless strictness is needed.
          
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
           dataStore.undo();
           return;
      }
      if (checkKey('editor.redo')) {
           e.preventDefault();
           dataStore.redo();
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

      // Tool Shortcuts
      if (uiStore.activeTool === 'electrical-symbol') {
        if (checkKey('editor.cancel')) {
          uiStore.setTool('select');
        }
        // Electrical Context Specifics could be added here
        // if (checkKey('electrical.rotate')) { uiStore.rotateElectricalPreview(...); }
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
  }, [uiStore, dataStore, deleteSelected]);
};
