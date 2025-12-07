import React, { useEffect, useRef } from 'react';
import EditorRibbon from './features/editor/components/EditorRibbon';
import EditorCanvas from './features/editor/components/EditorCanvas';
import EditorStatusBar from './features/editor/components/EditorStatusBar';
import SettingsModal from './features/editor/components/SettingsModal';
import { useAppStore } from './stores/useAppStore';

const App: React.FC = () => {
  const store = useAppStore();
  const prevToolRef = useRef<string | null>(null);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // Undo / Redo
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
           e.preventDefault();
           if (e.shiftKey) store.redo();
           else store.undo();
           return;
        }
        if (e.key.toLowerCase() === 'y') {
           e.preventDefault();
           store.redo();
           return;
        }
      }

      // Pan shortcut (Space)
      if (e.code === 'Space' && !e.repeat) {
        if (store.activeTool !== 'pan') {
          prevToolRef.current = store.activeTool;
          store.setTool('pan');
        }
        return;
      }

      // Tool Shortcuts
      switch(e.key.toLowerCase()) {
        case 'v': store.setTool('select'); break;
        case 'h': store.setTool('pan'); break;
        case 'l': store.setTool('line'); break;
        case 'p': store.setTool('polyline'); break;
        case 'r': store.setTool('rect'); break;
        case 'c': store.setTool('circle'); break;
        case 'g': store.setTool('polygon'); break;
        case 'a': store.setTool('arc'); break;
        case 'm': store.setTool('measure'); break;
        case 'delete': store.deleteSelected(); break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (prevToolRef.current) {
          // Type assertion since prevToolRef is string but setTool expects ToolType
          // In a real app we'd type the Ref better
          store.setTool(prevToolRef.current as any);
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
  }, [store]);

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      <EditorRibbon />
      <div className="flex-grow relative bg-slate-200 overflow-hidden">
        <EditorCanvas />
        <SettingsModal />
      </div>
      <EditorStatusBar />
    </div>
  );
};

export default App;