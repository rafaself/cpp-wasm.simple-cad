import React, { useEffect, useRef } from 'react';
import '@/design/tailwind.css';
import '@/design/global.css';
import Header from '@/features/editor/components/Header';
import EditorRibbon from '@/features/editor/components/EditorRibbon';
import EditorSidebar from '@/features/editor/components/EditorSidebar';
import SettingsModal from '@/features/settings/SettingsModal';
import LayerManagerModal from '@/features/editor/components/LayerManagerModal';
import LoadingOverlay from '@/components/LoadingOverlay';
import EditorStatusBar from '@/features/editor/components/EditorStatusBar';
import QuickAccessToolbar from '@/features/editor/components/QuickAccessToolbar';
import EditorTabs from '@/features/editor/components/EditorTabs';
import { useKeyboardShortcuts } from '@/features/editor/hooks/useKeyboardShortcuts';
import { useDataStore } from '@/stores/useDataStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useEngineStoreSync } from '@/engine/runtime/useEngineStoreSync';
import CadViewer from './CadViewer';
import EngineInteractionLayer from './EngineInteractionLayer';

const NextCanvasArea: React.FC = () => {
  const setCanvasSize = useUIStore((s) => s.setCanvasSize);
  const { width, height } = useUIStore((s) => s.canvasSize);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [setCanvasSize]);

  return (
    <div className="flex-grow flex flex-col h-full relative overflow-hidden">
      <EditorTabs />

      <div className="flex-grow relative bg-slate-100 overflow-hidden cursor-crosshair select-none" ref={containerRef}>
        <div className="absolute inset-0 pointer-events-none">
          <CadViewer embedded />
        </div>
        <EngineInteractionLayer />
      </div>

      <QuickAccessToolbar />

      <div className="absolute bottom-0 left-0 right-0 z-50">
        <EditorStatusBar />
      </div>
    </div>
  );
};

const NextSurface: React.FC = () => {
  useKeyboardShortcuts();
  useEngineStoreSync();

  const worldScale = useDataStore((state) => state.worldScale);
  const loadLibrary = useLibraryStore((state) => state.loadLibrary);

  useEffect(() => {
    loadLibrary(worldScale);
  }, [loadLibrary, worldScale]);

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      <div className="shrink-0">
        <Header />
      </div>
      <div className="shrink-0">
        <EditorRibbon />
      </div>
      <div className="flex-grow flex relative bg-slate-200 overflow-hidden">
        <div className="flex-grow flex flex-col relative overflow-hidden">
          <NextCanvasArea />
          <SettingsModal />
          <LayerManagerModal />
        </div>
        <EditorSidebar />
      </div>
      <LoadingOverlay />
    </div>
  );
};

export default NextSurface;
