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
    const { layers, shapes, shapeOrder, activeLayerId, saveToHistory, spatialIndex, electricalElements, diagramNodes, diagramEdges } = get();
    const layerToDelete = layers.find(l => l.id === id);
    if (layers.length <= 1 || id === activeLayerId || layerToDelete?.isNative) return false;

    const newLayers = layers.filter(l => l.id !== id);
    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];
    const newElectrical = { ...electricalElements };
    const newDiagramNodes = { ...diagramNodes };
    const newDiagramEdges = { ...diagramEdges };
    const edgeIdsToDrop = new Set<string>();
    const patches: any[] = []; // Patch type

    Object.values(shapes).forEach((s) => {
      if (s.layerId === id) {
        const orderIndex = shapeOrder.indexOf(s.id);
        const electricalElement = s.electricalElementId ? electricalElements[s.electricalElementId] : undefined;
        if (electricalElement) delete newElectrical[electricalElement.id];
        const diagramNode = Object.values(diagramNodes).find(n => n.shapeId === s.id);
        if (diagramNode) {
          delete newDiagramNodes[diagramNode.id];
          Object.values(diagramEdges).forEach(edge => {
            if (edge.fromId === diagramNode.id || edge.toId === diagramNode.id) edgeIdsToDrop.add(edge.id);
          });
        }
        Object.values(diagramEdges).forEach(edge => {
          if (edge.shapeId === s.id) edgeIdsToDrop.add(edge.id);
        });
        patches.push({ type: 'DELETE', id: s.id, prev: s, orderIndex: orderIndex >= 0 ? orderIndex : undefined, electricalElement, diagramNode });
        delete newShapes[s.id];
        if (newShapeOrder.includes(s.id)) newShapeOrder = newShapeOrder.filter((sid) => sid !== s.id);
        spatialIndex.remove(s);
      }
    });

    edgeIdsToDrop.forEach(edgeId => {
      const edge = diagramEdges[edgeId];
      const edgeShape = edge ? shapes[edge.shapeId] : undefined;
      const edgeOrderIndex = edgeShape ? shapeOrder.indexOf(edgeShape.id) : -1;
      if (edgeShape) {
        delete newShapes[edgeShape.id];
        if (newShapeOrder.includes(edgeShape.id)) newShapeOrder = newShapeOrder.filter((sid) => sid !== edgeShape.id);
        spatialIndex.remove(edgeShape);
      }
      if (edge) {
        delete newDiagramEdges[edge.id];
        patches.push({ type: 'DELETE', id: edge.shapeId, prev: edgeShape, orderIndex: edgeOrderIndex >= 0 ? edgeOrderIndex : undefined, diagramEdge: edge });
      }
    });

    newShapeOrder = newShapeOrder.filter((sid) => !!newShapes[sid]);
    set({ layers: newLayers, shapes: newShapes, shapeOrder: newShapeOrder, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges });

    if (patches.length > 0) {
      saveToHistory(patches);
    }
    get().syncDiagramEdgesGeometry();
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
