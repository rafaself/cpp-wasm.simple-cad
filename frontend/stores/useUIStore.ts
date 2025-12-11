import { create } from 'zustand';
import { Point, ToolType, ViewTransform } from '../types';

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
}));
