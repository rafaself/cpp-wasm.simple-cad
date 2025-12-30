import React, { useEffect, useRef } from 'react';

import LoadingOverlay from '@/components/LoadingOverlay';
import Toast from '@/components/ui/Toast';
import { useEngineEvents } from '@/engine/core/useEngineEvents';
import TessellatedWasmLayer from '@/engine/renderer/TessellatedWasmLayer';
import EditorRibbon from '@/features/editor/components/EditorRibbon';
import EditorSidebar from '@/features/editor/components/EditorSidebar';
import EditorStatusBar from '@/features/editor/components/EditorStatusBar';
import EditorTabs from '@/features/editor/components/EditorTabs';
import Header from '@/features/editor/components/Header';
import LayerManagerModal from '@/features/editor/components/LayerManagerModal';
import QuickAccessToolbar from '@/features/editor/components/QuickAccessToolbar';
import { useKeyboardShortcuts } from '@/features/editor/hooks/useKeyboardShortcuts';
import SettingsModal from '@/features/settings/SettingsModal';
import { useUIStore } from '@/stores/useUIStore';

import EngineInteractionLayer from './EngineInteractionLayer';

const NextCanvasArea: React.FC = () => {
  const setCanvasSize = useUIStore((s) => s.setCanvasSize);
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
    <div
      className="flex-grow flex flex-col h-full relative overflow-hidden"
      role="main"
      tabIndex={-1}
    >
      <EditorTabs />

      <div
        className="flex-grow relative bg-bg overflow-hidden cursor-crosshair select-none"
        ref={containerRef}
      >
        <div className="absolute inset-0 pointer-events-none">
          <TessellatedWasmLayer />
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
  useEngineEvents();
  const { toast, hideToast } = useUIStore();

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-bg text-text">
      <div className="shrink-0">
        <Header />
      </div>
      <div className="shrink-0">
        <EditorRibbon />
      </div>
      <div className="flex-grow flex relative bg-surface1 overflow-hidden">
        <div className="flex-grow flex flex-col relative overflow-hidden">
          <NextCanvasArea />
          <SettingsModal />
          <LayerManagerModal />
        </div>
        <EditorSidebar />
      </div>
      <LoadingOverlay />
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};

export default NextSurface;
