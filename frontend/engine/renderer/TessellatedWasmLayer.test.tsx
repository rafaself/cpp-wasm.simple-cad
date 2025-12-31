/**
 * @vitest-environment jsdom
 */
import { render, waitFor, act } from '@testing-library/react';
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import TessellatedWasmLayer from './TessellatedWasmLayer';
import { CanvasController } from '@/engine/core/CanvasController';
import { useSettingsStore } from '@/stores/useSettingsStore';

// Mock CanvasController class
vi.mock('@/engine/core/CanvasController', () => {
  return {
    CanvasController: vi.fn(function () {
      return {
        setCanvas: vi.fn(),
        updateView: vi.fn(),
        setAxesSettings: vi.fn(),
        setGridSettings: vi.fn(),
        setClearColor: vi.fn(),
        dispose: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }),
  };
});

describe('TessellatedWasmLayer', () => {
  let originalGetComputedStyle: typeof window.getComputedStyle;

  beforeEach(() => {
    vi.clearAllMocks();
    originalGetComputedStyle = window.getComputedStyle;
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    vi.restoreAllMocks();
  });

  it('initializes controller and sets clear color from direct value', async () => {
    useSettingsStore.setState({
      display: {
        ...useSettingsStore.getState().display,
        backgroundColor: 'rgb(25, 25, 25)',
      },
    });

    render(<TessellatedWasmLayer />);

    await waitFor(() => {
      const instances = (CanvasController as unknown as { mock: { instances: any[] } }).mock.instances;
      const instance = instances[instances.length - 1];
      expect(instance.setClearColor).toHaveBeenCalledWith({
        r: 25 / 255,
        g: 25 / 255,
        b: 25 / 255,
        a: 1,
      });
    });
  });

  it('updates clear color when theme (mutation) changes', async () => {
    // Mock getComputedStyle to simulate CSS variable resolution on documentElement
    window.getComputedStyle = vi.fn((el: Element) => {
      if (el === document.documentElement) {
        return {
          getPropertyValue: (prop: string) => {
             if (prop === '--canvas-bg') return '#666666'; // Simulating resolved hex
             return '';
          }
        } as unknown as CSSStyleDeclaration;
      }
      return {
         getPropertyValue: () => ''
      } as unknown as CSSStyleDeclaration;
    });

    useSettingsStore.setState({
      display: {
        ...useSettingsStore.getState().display,
        backgroundColor: 'var(--canvas-bg)',
      },
    });

    render(<TessellatedWasmLayer />);

    // Initial check
    await waitFor(() => {
      const instances = (CanvasController as unknown as { mock: { instances: any[] } }).mock.instances;
      const instance = instances[instances.length - 1];
      expect(instance.setClearColor).toHaveBeenCalledWith({
        r: 0.4, // 102/255 approx -> 0x66 = 102. 102/255 = 0.4
        g: 0.4,
        b: 0.4,
        a: 1,
      });
    });

    // Update mock for next call (simulate theme change affecting the variable value)
    window.getComputedStyle = vi.fn((el: Element) => {
       if (el === document.documentElement) {
        return {
          getPropertyValue: (prop: string) => {
             if (prop === '--canvas-bg') return '#CCCCCC'; // Simulating new resolved hex
             return '';
          }
        } as unknown as CSSStyleDeclaration;
      }
      return {
         getPropertyValue: () => ''
      } as unknown as CSSStyleDeclaration;
    });

    // Simulate theme change via Mutation
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
    });

    await waitFor(() => {
      const instances = (CanvasController as unknown as { mock: { instances: any[] } }).mock.instances;
      const instance = instances[instances.length - 1];
      expect(instance.setClearColor).toHaveBeenCalledWith({
        r: 0.8, // 204/255 = 0.8
        g: 0.8,
        b: 0.8,
        a: 1,
      });
    });
  });
});
