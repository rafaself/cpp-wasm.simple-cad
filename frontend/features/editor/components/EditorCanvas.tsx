import React, { useRef, useEffect } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import CanvasManager from './canvas/CanvasManager';
import EditorStatusBar from './EditorStatusBar';
import QuickAccessToolbar from './QuickAccessToolbar';
import UserHint from './UserHint';
import EditorTabs from './EditorTabs';

const EditorCanvas: React.FC = () => {
  const setCanvasSize = useUIStore((s) => s.setCanvasSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useUIStore(s => s.canvasSize);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width, height });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [setCanvasSize]);

  return (
    <div className="flex-grow flex flex-col h-full relative overflow-hidden">
      <EditorTabs />
      <div className="flex-grow relative bg-slate-100 overflow-hidden cursor-crosshair select-none" ref={containerRef}>
        <CanvasManager width={width} height={height} />
      </div>
      
      <QuickAccessToolbar />
      
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50">
        <UserHint />
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 z-50">
        <EditorStatusBar />
      </div>
    </div>
  );
};

export default EditorCanvas;
