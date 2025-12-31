import React, { useEffect, useRef } from 'react';

import { hexToRgb } from '@/utils/color';

import { CanvasController } from '@/engine/core/CanvasController';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';

/**
 * TessellatedWasmLayer
 *
 * This layer manages the WebGL2/Wasm rendering context.
 * It synchronizes the canvas background color with the application theme
 * by observing the '--canvas-bg' CSS variable derived from the current theme.
 * The `CanvasController` is updated with the resolved RGB values whenever
 * the theme changes, ensuring the renderer's clear color matches the UI.
 */
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

  const backgroundColor = useSettingsStore((s) => s.display.backgroundColor);

  useEffect(() => {
    const updateColor = () => {
      if (!controllerRef.current) return;

      let colorStr = backgroundColor;

      // Resolve CSS variable if needed
      if (colorStr.startsWith('var(')) {
        const varName = colorStr.match(/var\(([^)]+)\)/)?.[1];
        if (varName) {
          const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
          if (resolved) colorStr = resolved;
        }
      }

      const rgb = hexToRgb(colorStr);
      if (rgb) {
        controllerRef.current.setClearColor({
          r: rgb.r / 255,
          g: rgb.g / 255,
          b: rgb.b / 255,
          a: 1,
        });
      }
    };

    updateColor();

    const observer = new MutationObserver(updateColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    return () => observer.disconnect();
  }, [backgroundColor]);

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
