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
  editingTextId: string | null;

  // Selection
  selectedShapeIds: Set<string>;

  // Creation Defaults / Tool Options
  strokeColor: string;
  strokeWidth: number;
  strokeEnabled: boolean;
  fillColor: string;
  polygonSides: number;

  // Grid
  gridSize: number;
  gridColor: string;
  gridShowDots: boolean;
  gridShowLines: boolean;

  // Center Display
  showCenterAxes: boolean;
  showCenterIcon: boolean;
  axisXColor: string;
  axisYColor: string;
  axisXDashed: boolean;
  axisYDashed: boolean;
  centerIconColor: string;

  // Snap
  snapOptions: SnapOptions;

  // Text Tool Options
  textFontSize: number;
  textFontFamily: string;
  textAlign: 'left' | 'center' | 'right';
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  textStrike: boolean;

  // Setters
  setTool: (tool: ToolType) => void;
  setSidebarTab: (tab: string) => void;
  setViewTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setMousePos: (pos: Point | null) => void;

  setSettingsModalOpen: (isOpen: boolean) => void;
  setLayerManagerOpen: (isOpen: boolean) => void;
  setEditingTextId: (id: string | null) => void;

  setSelectedShapeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

  setSnapOptions: (updater: (prev: SnapOptions) => SnapOptions) => void;
  setGridSize: (size: number) => void;
  setGridColor: (color: string) => void;
  setGridShowDots: (show: boolean) => void;
  setGridShowLines: (show: boolean) => void;
  setShowCenterAxes: (show: boolean) => void;
  setShowCenterIcon: (show: boolean) => void;
  setAxisXColor: (color: string) => void;
  setAxisYColor: (color: string) => void;
  setAxisXDashed: (dashed: boolean) => void;
  setAxisYDashed: (dashed: boolean) => void;
  setCenterIconColor: (color: string) => void;

  // Tool Option Setters
  setPolygonSides: (sides: number) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeEnabled: (enabled: boolean) => void;
  setFillColor: (color: string) => void;
  
  setTextFontSize: (size: number) => void;
  setTextFontFamily: (family: string) => void;
  setTextAlign: (align: 'left' | 'center' | 'right') => void;
  setTextBold: (bold: boolean) => void;
  setTextItalic: (italic: boolean) => void;
  setTextUnderline: (underline: boolean) => void;
  setTextStrike: (strike: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  sidebarTab: 'edificacao',
  viewTransform: { x: 0, y: 0, scale: 1 },
  mousePos: null,
  canvasSize: { width: 0, height: 0 },
  isSettingsModalOpen: false,
  isLayerManagerOpen: false,
  editingTextId: null,

  selectedShapeIds: new Set<string>(),

  strokeColor: '#000000',
  strokeWidth: 1,
  strokeEnabled: true,
  fillColor: 'transparent',
  polygonSides: 5,
  
  // Text Defaults
  textFontSize: 16,
  textFontFamily: 'Inter',
  textAlign: 'left',
  textBold: false,
  textItalic: false,
  textUnderline: false,
  textStrike: false,

  gridSize: 100,
  gridColor: '#E3E3E3', // Light gray grid
  gridShowDots: true,
  gridShowLines: false,

  showCenterAxes: true,
  showCenterIcon: true,
  axisXColor: 'rgba(239, 68, 68, 0.4)',   // red-500 with opacity
  axisYColor: 'rgba(34, 197, 94, 0.4)',   // green-500 with opacity
  axisXDashed: true,
  axisYDashed: true,
  centerIconColor: 'rgba(100, 116, 139, 0.5)', // slate-500 with opacity

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
  setEditingTextId: (id) => set({ editingTextId: id }),

  setSelectedShapeIds: (ids) => set((state) => ({ selectedShapeIds: typeof ids === 'function' ? ids(state.selectedShapeIds) : ids })),

  setSnapOptions: (updater) => set((state) => ({ snapOptions: updater(state.snapOptions) })),
  setGridSize: (size) => set({ gridSize: size }),
  setGridColor: (color) => set({ gridColor: color }),
  setGridShowDots: (show) => set({ gridShowDots: show }),
  setGridShowLines: (show) => set({ gridShowLines: show }),
  setShowCenterAxes: (show) => set({ showCenterAxes: show }),
  setShowCenterIcon: (show) => set({ showCenterIcon: show }),
  setAxisXColor: (color) => set({ axisXColor: color }),
  setAxisYColor: (color) => set({ axisYColor: color }),
  setAxisXDashed: (dashed) => set({ axisXDashed: dashed }),
  setAxisYDashed: (dashed) => set({ axisYDashed: dashed }),
  setCenterIconColor: (color) => set({ centerIconColor: color }),

  setPolygonSides: (sides) => set({ polygonSides: sides }),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setStrokeEnabled: (enabled) => set({ strokeEnabled: enabled }),
  setFillColor: (color) => set({ fillColor: color }),

  setTextFontSize: (size) => set({ textFontSize: size }),
  setTextFontFamily: (family) => set({ textFontFamily: family }),
  setTextAlign: (align) => set({ textAlign: align }),
  setTextBold: (bold) => set({ textBold: bold }),
  setTextItalic: (italic) => set({ textItalic: italic }),
  setTextUnderline: (underline) => set({ textUnderline: underline }),
  setTextStrike: (strike) => set({ textStrike: strike }),
}));
