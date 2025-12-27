import { StateCreator } from 'zustand';
import type { Layer } from '@/types';
import { DataState } from '../useDataStore';
import { generateId } from '@/utils/uuid';
import { normalizeLayerStyle } from '../../utils/storeNormalization';

export interface LayerSlice {
  layers: Layer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => boolean;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  setLayerStrokeColor: (id: string, color: string) => void;
  setLayerFillColor: (id: string, color: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
}

const generateLayerId = (existingIds: Set<string>): string => {
  let id = generateId();
  while (existingIds.has(id)) {
    id = generateId();
  }
  return id;
};

export const createLayerSlice: StateCreator<
  DataState,
  [],
  [],
  LayerSlice
> = (set, get) => ({
  layers: [
    { id: 'desenho', name: 'Desenho', strokeColor: '#ffffff', strokeEnabled: true, fillColor: '#ffffff', fillEnabled: false, visible: true, locked: false, isNative: true },
  ],
  activeLayerId: 'desenho',

  setActiveLayerId: (id) => set({ activeLayerId: id }),

  addLayer: () => set((state) => {
    const newId = generateLayerId(new Set(state.layers.map(l => l.id)));
    const newLayer: Layer = { id: newId, name: `Layer ${state.layers.length}`, strokeColor: '#000000', strokeEnabled: true, fillColor: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), fillEnabled: true, visible: true, locked: false };
    return { layers: [...state.layers, newLayer], activeLayerId: newId };
  }),

  deleteLayer: (id) => {
    const { layers, shapes, shapeOrder, activeLayerId } = get();
    const layerToDelete = layers.find(l => l.id === id);
    if (layers.length <= 1 || id === activeLayerId || layerToDelete?.isNative) return false;

    const newLayers = layers.filter(l => l.id !== id);
    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];

    Object.values(shapes).forEach((s) => {
      if (s.layerId === id) {
        delete newShapes[s.id];
        if (newShapeOrder.includes(s.id)) newShapeOrder = newShapeOrder.filter((sid) => sid !== s.id);
      }
    });

    newShapeOrder = newShapeOrder.filter((sid) => !!newShapes[sid]);
    set({ layers: newLayers, shapes: newShapes, shapeOrder: newShapeOrder });

    return true;
  },

  setLayerStrokeColor: (id, color) => set(state => ({
      layers: state.layers.map(l => l.id === id ? normalizeLayerStyle({ ...l, strokeColor: color }) : l)
  })),

  setLayerFillColor: (id, color) => set(state => ({
      layers: state.layers.map(l => l.id === id ? normalizeLayerStyle({ ...l, fillColor: color }) : l)
  })),

  toggleLayerVisibility: (id) => set((state) => ({ layers: state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l) })),

  toggleLayerLock: (id) => set((state) => ({ layers: state.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l) })),

  updateLayer: (id, updates) => set((state) => ({
      layers: state.layers.map(l => l.id === id ? normalizeLayerStyle({ ...l, ...updates }) : l)
  })),
});
