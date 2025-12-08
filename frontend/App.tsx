import React from 'react';
import EditorRibbon from './features/editor/components/EditorRibbon';
import EditorCanvas from './features/editor/components/EditorCanvas';
import EditorStatusBar from './features/editor/components/EditorStatusBar';
import EditorSidebar from './features/editor/components/EditorSidebar';
import QuickAccessToolbar from './features/editor/components/QuickAccessToolbar';
import SettingsModal from './features/editor/components/SettingsModal';
import LayerManagerModal from './features/editor/components/LayerManagerModal';
import { useKeyboardShortcuts } from './features/editor/hooks/useKeyboardShortcuts';

import Header from './features/editor/components/Header';

const App: React.FC = () => {
  useKeyboardShortcuts();

  // Global Styles for Smooth Transitions
  const globalStyles = `
    @keyframes menuFadeIn {
      from { opacity: 0; transform: translateY(4px); filter: blur(2px); }
      to { opacity: 1; transform: translateY(0); filter: blur(0); }
    }
    .menu-transition {
      animation: menuFadeIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
    .ribbon-tab-active {
        position: relative;
    }
    .ribbon-tab-active::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 2px;
        background-color: #3b82f6; /* blue-500 */
        transform-origin: center;
        animation: scaleXIn 0.2s ease-out forwards;
    }
    .sidebar-tab-active {
        position: relative;
    }
    .sidebar-tab-active::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 2px;
        background-color: #3b82f6; /* blue-500 */
        transform-origin: center;
        animation: scaleXIn 0.2s ease-out forwards;
    }
    @keyframes scaleXIn {
        from { transform: scaleX(0); }
        to { transform: scaleX(1); }
    }
    @keyframes backdropFade {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    .backdrop-enter {
        animation: backdropFade 0.2s ease-out forwards;
    }
    @keyframes dialogEnter {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .dialog-enter {
         animation: dialogEnter 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  `;

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      <style>{globalStyles}</style>
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
