import { create } from 'zustand';
import { Point, ToolType, ViewTransform } from '../types';

export interface EditorTab {
  floorId: string;
  discipline: 'architecture' | 'electrical';
}

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

  activeFloorId: string;
  activeDiscipline: 'architecture' | 'electrical';
  
  openTabs: EditorTab[];
  openTab: (tab: EditorTab) => void;
  closeTab: (tab: EditorTab) => void;

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
  setViewTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setMousePos: (pos: Point | null) => void;

  setSettingsModalOpen: (isOpen: boolean) => void;
  setLayerManagerOpen: (isOpen: boolean) => void;
  setEditingTextId: (id: string | null) => void;

  setActiveFloorId: (id: string) => void;
  setActiveDiscipline: (discipline: 'architecture' | 'electrical') => void;

  setElectricalSymbolId: (id: string | null) => void;
  rotateElectricalPreview: (delta: number) => void;
  flipElectricalPreview: (axis: 'x' | 'y') => void;
  resetElectricalPreview: () => void;

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

  activeFloorId: 'terreo',
  activeDiscipline: 'electrical',
  
  openTabs: [{ floorId: 'terreo', discipline: 'electrical' }],
  
  openTab: (tab) => set((state) => {
    const exists = state.openTabs.some(t => t.floorId === tab.floorId && t.discipline === tab.discipline);
    if (exists) {
        return { activeFloorId: tab.floorId, activeDiscipline: tab.discipline };
    }
    return { 
        openTabs: [...state.openTabs, tab],
        activeFloorId: tab.floorId,
        activeDiscipline: tab.discipline
    };
  }),
  
  closeTab: (tab) => set((state) => {
    const newTabs = state.openTabs.filter(t => !(t.floorId === tab.floorId && t.discipline === tab.discipline));
    if (newTabs.length === 0) return { openTabs: newTabs }; // Allow empty, UI should handle it or prevent closing last

    let updates: Partial<UIState> = { openTabs: newTabs };
    
    // If closing active tab, switch to last available
    if (state.activeFloorId === tab.floorId && state.activeDiscipline === tab.discipline) {
        const last = newTabs[newTabs.length - 1];
        updates.activeFloorId = last.floorId;
        updates.activeDiscipline = last.discipline;
    }
    return updates;
  }),

  activeElectricalSymbolId: null,
  electricalRotation: 0,
  electricalFlipX: 1,
  electricalFlipY: 1,

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

  setActiveFloorId: (id) => set({ activeFloorId: id }),
  setActiveDiscipline: (discipline) => set({ activeDiscipline: discipline }),

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
