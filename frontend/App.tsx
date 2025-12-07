import React, { useEffect, useRef } from 'react';
import EditorRibbon from './features/editor/components/EditorRibbon';
import EditorCanvas from './features/editor/components/EditorCanvas';
import EditorStatusBar from './features/editor/components/EditorStatusBar';
import EditorSidebar from './features/editor/components/EditorSidebar';
import QuickAccessToolbar from './features/editor/components/QuickAccessToolbar';
import SettingsModal from './features/editor/components/SettingsModal';
import LayerManagerModal from './features/editor/components/LayerManagerModal';
import { useAppStore } from './stores/useAppStore';

import Header from './features/editor/components/Header';

const App: React.FC = () => {
  const store = useAppStore();
  const prevToolRef = useRef<string | null>(null);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

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
      <Header />
      <EditorRibbon />
      <div className="flex-grow flex relative bg-slate-200 overflow-hidden">
        {/* Main Content Area (Canvas + Status Bar) */}
        <div className="flex-grow flex flex-col relative overflow-hidden">
            <div className="flex-grow relative overflow-hidden">
                <EditorCanvas />
                <QuickAccessToolbar />
                <SettingsModal />
                <LayerManagerModal />
            </div>
            <EditorStatusBar />
        </div>
        
        {/* Sidebar moved to right */}
        <EditorSidebar />
      </div>
    </div>
  );
};

export default App;