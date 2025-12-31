import React, { useEffect, useRef } from 'react';

import { CanvasController } from '@/engine/core/CanvasController';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';

const TessellatedWasmLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const axesSettings = useSettingsStore((s) => s.display.centerAxes);
  const gridSettings = useSettingsStore((s) => s.grid);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<CanvasController | null>(null);

  useEffect(() => {
    const controller = new CanvasController();
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && controllerRef.current) {
      controllerRef.current.setCanvas(canvas);
    }
  }, []);

  useEffect(() => {
    controllerRef.current?.updateView(viewTransform, canvasSize);
  }, [viewTransform, canvasSize]);

  useEffect(() => {
    controllerRef.current?.setAxesSettings(axesSettings);
  }, [axesSettings]);

  useEffect(() => {
    // Map grid store settings to renderer settings
    const renderGridSettings = {
      enabled: gridSettings.showDots || gridSettings.showLines,
      size: gridSettings.size,
      color: gridSettings.color,
      showDots: gridSettings.showDots,
      showLines: gridSettings.showLines,
      showSubdivisions: gridSettings.showSubdivisions,
      subdivisionCount: gridSettings.subdivisionCount,
      // opacity removed
      lineWidth: gridSettings.lineWidth,
      dotRadius: gridSettings.dotRadius,
    };
    controllerRef.current?.setGridSettings(renderGridSettings);
  }, [gridSettings]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        background: 'transparent',
        pointerEvents: 'none',
      }}
    />
  );
};

export default TessellatedWasmLayer;
