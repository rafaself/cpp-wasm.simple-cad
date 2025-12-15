import React, { useEffect } from 'react';
import './design/global.css';
import EditorRibbon from './features/editor/components/EditorRibbon';
import EditorCanvas from './features/editor/components/EditorCanvas';
import EditorStatusBar from './features/editor/components/EditorStatusBar';
import EditorSidebar from './features/editor/components/EditorSidebar';
import QuickAccessToolbar from './features/editor/components/QuickAccessToolbar';
import SettingsModal from './features/settings/SettingsModal';
import LayerManagerModal from './features/editor/components/LayerManagerModal';
import { useKeyboardShortcuts } from './features/editor/hooks/useKeyboardShortcuts';

import Header from './features/editor/components/Header';
import { useDataStore } from './stores/useDataStore';
import { useLibraryStore } from './stores/useLibraryStore';
import LoadingOverlay from './components/LoadingOverlay';

const App: React.FC = () => {
  useKeyboardShortcuts();
  const worldScale = useDataStore((state) => state.worldScale);
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);

  useEffect(() => {
    loadLibrary(worldScale);
  }, [loadLibrary, worldScale]);

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      <div className="shrink-0"><Header /></div>
      <div className="shrink-0"><EditorRibbon /></div>
      <div className="flex-grow flex relative bg-slate-200 overflow-hidden">
        {/* Main Content Area (Canvas + Status Bar) */}
        <div className="flex-grow flex flex-col relative overflow-hidden">
            <EditorCanvas />
            <SettingsModal />
            <LayerManagerModal />
        </div>
        
        {/* Sidebar moved to right */}
        <EditorSidebar />
      </div>
      <LoadingOverlay />
    </div>
  );
};

export default App;
