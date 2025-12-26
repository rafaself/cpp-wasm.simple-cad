import { create } from 'zustand';
import { TextStyleSnapshot } from '../types/text';
import { Point, ToolType, ViewTransform } from '../types';

export interface EditorTab {
  floorId: string;
  discipline: 'architecture';
}

interface UIState {
  // UI State
  activeTool: ToolType;
  sidebarTab: string;
  activeFloorId?: string;
  activeDiscipline: 'architecture';
  viewTransform: ViewTransform;
  mousePos: Point | null;
  canvasSize: { width: number; height: number };
  isSettingsModalOpen: boolean;
  isLayerManagerOpen: boolean;
  editingTextId: string | null;
  isEditingAppearance: boolean;
  engineInteractionActive: boolean;
  interactionDragActive: boolean;

  // Engine-native text editing state
  engineTextEditState: {
    active: boolean;
    textId: number | null;
    content: string;
    caretIndex: number;
    selectionStart: number;
    selectionEnd: number;
    caretPosition: { x: number; y: number; height: number } | null;
  };
  engineTextStyleSnapshot: { textId: number; snapshot: TextStyleSnapshot } | null;

  
  openTabs: EditorTab[];
  openTab: (tab: EditorTab) => void;
  closeTab: (tab: EditorTab) => void;

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
  setIsEditingAppearance: (isEditing: boolean) => void;
  setEngineInteractionActive: (active: boolean) => void;
  setInteractionDragActive: (active: boolean) => void;

  // Engine text editing setters
  setEngineTextEditActive: (active: boolean, textId?: number | null) => void;
  setEngineTextEditContent: (content: string) => void;
  setEngineTextEditCaret: (caretIndex: number, selectionStart?: number, selectionEnd?: number) => void;
  setEngineTextEditCaretPosition: (position: { x: number; y: number; height: number } | null) => void;
  clearEngineTextEdit: () => void;
  setEngineTextStyleSnapshot: (textId: number, snapshot: TextStyleSnapshot) => void;
  clearEngineTextStyleSnapshot: () => void;

  setActiveFloorId: (id: string) => void;
  setActiveDiscipline: (discipline: 'architecture') => void;

  setSelectedShapeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

  // References
  referencedDisciplines: Map<string, Set<'architecture'>>; // Map<floorId, Set<discipline>>
  toggleReference: (floorId: string, disciplineToToggle: 'architecture') => void;
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
  isEditingAppearance: false,
  engineInteractionActive: false,
  interactionDragActive: false,

  engineTextEditState: {
    active: false,
    textId: null,
    content: '',
    caretIndex: 0,
    selectionStart: 0,
    selectionEnd: 0,
    caretPosition: null,
  },
  engineTextStyleSnapshot: null,

  activeFloorId: 'terreo',
  activeDiscipline: 'architecture',
  
  openTabs: [{ floorId: 'terreo', discipline: 'architecture' }],

  referencedDisciplines: new Map(), // Default to empty Map
  toggleReference: (floorId, disciplineToToggle) => set((state) => {
      const newReferences = new Map(state.referencedDisciplines);
      let floorReferences = newReferences.get(floorId) || new Set();

      if (floorReferences.has(disciplineToToggle)) {
          floorReferences.delete(disciplineToToggle);
      } else {
          floorReferences.add(disciplineToToggle);
      }

      if (floorReferences.size > 0) {
          newReferences.set(floorId, new Set(floorReferences)); // Ensure new Set instance for immutability
      } else {
          newReferences.delete(floorId);
      }
      return { referencedDisciplines: newReferences };
  }),
  
  openTab: (tab) => set((state) => {
    const exists = state.openTabs.some(t => t.floorId === tab.floorId && t.discipline === tab.discipline);
    
    // Always clear selection when switching context
    const updates = { 
        activeFloorId: tab.floorId, 
        activeDiscipline: tab.discipline,
        selectedShapeIds: new Set<string>() 
    };

    if (exists) {
        return updates;
    }
    return { 
        ...updates,
        openTabs: [...state.openTabs, tab],
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
  setIsEditingAppearance: (isEditing) => set({ isEditingAppearance: isEditing }),
  setEngineInteractionActive: (active) => set({ engineInteractionActive: active }),
  setInteractionDragActive: (active) => set({ interactionDragActive: active }),

  // Engine text editing setters
  setEngineTextEditActive: (active, textId = null) => set((state) => ({
    engineTextEditState: {
      ...state.engineTextEditState,
      active,
      textId: active ? (textId ?? state.engineTextEditState.textId) : null,
      content: active ? state.engineTextEditState.content : '',
      caretIndex: active ? state.engineTextEditState.caretIndex : 0,
      selectionStart: active ? state.engineTextEditState.selectionStart : 0,
      selectionEnd: active ? state.engineTextEditState.selectionEnd : 0,
    },
  })),
  setEngineTextEditContent: (content) => set((state) => ({
    engineTextEditState: { ...state.engineTextEditState, content },
  })),
  setEngineTextEditCaret: (caretIndex, selectionStart, selectionEnd) => set((state) => ({
    engineTextEditState: {
      ...state.engineTextEditState,
      caretIndex,
      selectionStart: selectionStart ?? caretIndex,
      selectionEnd: selectionEnd ?? caretIndex,
    },
  })),
  setEngineTextEditCaretPosition: (position) => set((state) => ({
    engineTextEditState: { ...state.engineTextEditState, caretPosition: position },
  })),
  clearEngineTextEdit: () => set({
    engineTextEditState: {
      active: false,
      textId: null,
      content: '',
      caretIndex: 0,
      selectionStart: 0,
      selectionEnd: 0,
      caretPosition: null,
    },
    engineTextStyleSnapshot: null,
  }),
  setEngineTextStyleSnapshot: (textId, snapshot) => set({ engineTextStyleSnapshot: { textId, snapshot } }),
  clearEngineTextStyleSnapshot: () => set({ engineTextStyleSnapshot: null }),

  setActiveFloorId: (id) => set({ activeFloorId: id, selectedShapeIds: new Set() }),
  setActiveDiscipline: (discipline) =>
    set((state) => (state.activeDiscipline === discipline ? state : { activeDiscipline: discipline, selectedShapeIds: new Set() })),

  setSelectedShapeIds: (ids) => set((state) => ({ selectedShapeIds: typeof ids === 'function' ? ids(state.selectedShapeIds) : ids })),
}));
