import React, { useEffect, useMemo, useRef, useState } from 'react';

import { CanvasController } from '@/engine/core/CanvasController';
import { useUIStore } from '@/stores/useUIStore';

const TessellatedWasmLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);

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
