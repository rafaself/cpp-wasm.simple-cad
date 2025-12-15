import { create } from 'zustand';
import { Point, ToolType, ViewTransform } from '../types';

interface UIState {
  // UI State
  activeTool: ToolType;
  sidebarTab: string;
  activeFloorId?: string;
  activeDiscipline: 'architecture' | 'electrical';
  viewTransform: ViewTransform;
  mousePos: Point | null;
  canvasSize: { width: number; height: number };
  isSettingsModalOpen: boolean;
  isLayerManagerOpen: boolean;
  editingTextId: string | null;

  // Electrical insertion
  activeElectricalSymbolId: string | null;
  electricalRotation: number;
  electricalFlipX: number;
  electricalFlipY: number;

  // Selection
  selectedShapeIds: Set<string>;

  // Setters
  setTool: (tool: ToolType) => void;
  setSidebarTab: (tab: string) => void;
  setActiveFloorId: (floorId?: string) => void;
  setActiveDiscipline: (discipline: 'architecture' | 'electrical') => void;
  setViewTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setMousePos: (pos: Point | null) => void;

  setSettingsModalOpen: (isOpen: boolean) => void;
  setLayerManagerOpen: (isOpen: boolean) => void;
  setEditingTextId: (id: string | null) => void;

  setElectricalSymbolId: (id: string | null) => void;
  rotateElectricalPreview: (delta: number) => void;
  flipElectricalPreview: (axis: 'x' | 'y') => void;
  resetElectricalPreview: () => void;

  setSelectedShapeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  sidebarTab: 'edificacao',
  activeFloorId: undefined,
  activeDiscipline: 'architecture',
  viewTransform: { x: 0, y: 0, scale: 1 },
  mousePos: null,
  canvasSize: { width: 0, height: 0 },
  isSettingsModalOpen: false,
  isLayerManagerOpen: false,
  editingTextId: null,

  activeElectricalSymbolId: null,
  electricalRotation: 0,
  electricalFlipX: 1,
  electricalFlipY: 1,

  selectedShapeIds: new Set<string>(),

  setTool: (tool) => set({ activeTool: tool }),
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  setActiveFloorId: (floorId) => set({ activeFloorId: floorId }),
  setActiveDiscipline: (discipline) => set({ activeDiscipline: discipline }),
  setViewTransform: (transform) => set((state) => ({
    viewTransform: typeof transform === 'function' ? transform(state.viewTransform) : transform
  })),
  setCanvasSize: (size) => set({ canvasSize: size }),
  setMousePos: (pos) => set({ mousePos: pos }),

  setSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),
  setLayerManagerOpen: (isOpen) => set({ isLayerManagerOpen: isOpen }),
  setEditingTextId: (id) => set({ editingTextId: id }),

  setElectricalSymbolId: (id) => set({ activeElectricalSymbolId: id }),
  rotateElectricalPreview: (delta) => set((state) => {
    let newRotation = state.electricalRotation + delta;
    // Ensure rotation stays within [0, 2*PI)
    newRotation = (newRotation % (Math.PI * 2) + (Math.PI * 2)) % (Math.PI * 2);
    return { electricalRotation: newRotation };
  }),
  flipElectricalPreview: (axis) => set((state) => ({
    electricalFlipX: axis === 'x' ? state.electricalFlipX * -1 : state.electricalFlipX,
    electricalFlipY: axis === 'y' ? state.electricalFlipY * -1 : state.electricalFlipY,
  })),
  resetElectricalPreview: () => set({ electricalRotation: 0, electricalFlipX: 1, electricalFlipY: 1 }),

  setSelectedShapeIds: (ids) => set((state) => ({ selectedShapeIds: typeof ids === 'function' ? ids(state.selectedShapeIds) : ids })),
}));
