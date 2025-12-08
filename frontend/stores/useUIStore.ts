import { create } from 'zustand';
import { Point, SnapOptions, ToolType, ViewTransform } from '../types';

interface UIState {
  // UI State
  activeTool: ToolType;
  sidebarTab: string;
  viewTransform: ViewTransform;
  mousePos: Point | null;
  canvasSize: { width: number; height: number };
  isSettingsModalOpen: boolean;
  isLayerManagerOpen: boolean;

  // Selection
  selectedShapeIds: Set<string>;

  // Creation Defaults / Tool Options
  strokeColor: string;
  strokeWidth: number;
  strokeEnabled: boolean;
  fillColor: string;
  polygonSides: number;
  textSize: number;
  fontFamily: string;
  fontBold: boolean;
  fontItalic: boolean;
  fontUnderline: boolean;
  fontStrike: boolean;

  // Grid
  gridSize: number;
  gridColor: string;

  // Snap
  snapOptions: SnapOptions;

  // Setters
  setTool: (tool: ToolType) => void;
  setSidebarTab: (tab: string) => void;
  setViewTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setMousePos: (pos: Point | null) => void;

  setSettingsModalOpen: (isOpen: boolean) => void;
  setLayerManagerOpen: (isOpen: boolean) => void;

  setSelectedShapeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

  setSnapOptions: (updater: (prev: SnapOptions) => SnapOptions) => void;
  setGridSize: (size: number) => void;
  setGridColor: (color: string) => void;

  // Tool Option Setters
  setPolygonSides: (sides: number) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeEnabled: (enabled: boolean) => void;
  setFillColor: (color: string) => void;
  setTextSize: (size: number) => void;
  setFontFamily: (font: string) => void;
  toggleFontBold: () => void;
  toggleFontItalic: () => void;
  toggleFontUnderline: () => void;
  toggleFontStrike: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  sidebarTab: 'edificacao',
  viewTransform: { x: 0, y: 0, scale: 1 },
  mousePos: null,
  canvasSize: { width: 0, height: 0 },
  isSettingsModalOpen: false,
  isLayerManagerOpen: false,

  selectedShapeIds: new Set<string>(),

  strokeColor: '#000000',
  strokeWidth: 2,
  strokeEnabled: true,
  fillColor: 'transparent',
  polygonSides: 5,

  textSize: 20,
  fontFamily: 'sans-serif',
  fontBold: false,
  fontItalic: false,
  fontUnderline: false,
  fontStrike: false,

  gridSize: 50,
  gridColor: '#e5e7eb',

  snapOptions: { enabled: true, endpoint: true, midpoint: true, center: true, nearest: false, grid: false },

  setTool: (tool) => set({ activeTool: tool }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setViewTransform: (transform) => set((state) => ({
    viewTransform: typeof transform === 'function' ? transform(state.viewTransform) : transform
  })),
  setCanvasSize: (size) => set({ canvasSize: size }),
  setMousePos: (pos) => set({ mousePos: pos }),

  setSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),
  setLayerManagerOpen: (isOpen) => set({ isLayerManagerOpen: isOpen }),

  setSelectedShapeIds: (ids) => set((state) => ({ selectedShapeIds: typeof ids === 'function' ? ids(state.selectedShapeIds) : ids })),

  setSnapOptions: (updater) => set((state) => ({ snapOptions: updater(state.snapOptions) })),
  setGridSize: (size) => set({ gridSize: size }),
  setGridColor: (color) => set({ gridColor: color }),

  setPolygonSides: (sides) => set({ polygonSides: sides }),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setStrokeEnabled: (enabled) => set({ strokeEnabled: enabled }),
  setFillColor: (color) => set({ fillColor: color }),
  setTextSize: (size) => set({ textSize: size }),
  setFontFamily: (font) => set({ fontFamily: font }),
  toggleFontBold: () => set(s => ({ fontBold: !s.fontBold })),
  toggleFontItalic: () => set(s => ({ fontItalic: !s.fontItalic })),
  toggleFontUnderline: () => set(s => ({ fontUnderline: !s.fontUnderline })),
  toggleFontStrike: () => set(s => ({ fontStrike: !s.fontStrike })),
}));
