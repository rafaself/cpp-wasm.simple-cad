import { create } from 'zustand';
import { Layer, Patch, Point, Shape } from '../types';
import { getCombinedBounds, getShapeBounds, getShapeBoundingBox, getShapeCenter, rotatePoint } from '../utils/geometry';
import { QuadTree } from '../utils/spatial';
import { HISTORY } from '../design/tokens';

// Initialize Quadtree outside to avoid reactivity loop, but accessible
const initialQuadTree = new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 });

interface DataState {
  // Document State
  shapes: Record<string, Shape>;
  layers: Layer[];
  activeLayerId: string;

  // World Scale
  worldScale: number;

  // Spatial Index
  spatialIndex: QuadTree;

  // History
  past: Patch[][];
  future: Patch[][];

  // Actions
  addShape: (shape: Shape) => void;
  updateShape: (id: string, diff: Partial<Shape>, recordHistory?: boolean) => void;
  updateShapes: (updater: (prev: Record<string, Shape>) => Record<string, Shape>) => void; // Deprecated, avoid use
  deleteShape: (id: string) => void;

  // Layer Ops
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => boolean;
  setLayerStrokeColor: (id: string, color: string) => void;
  setLayerFillColor: (id: string, color: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;

  // Complex Ops (often rely on selection)
  alignSelected: (ids: string[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  deleteShapes: (ids: string[]) => void;
  rotateSelected: (ids: string[], pivot: Point, angle: number) => void;

  // History Ops
  undo: () => void;
  redo: () => void;
  saveToHistory: (patches: Patch[]) => void;

  // Helpers
  syncQuadTree: () => void;
  ensureLayer: (name: string) => string;
}

export const useDataStore = create<DataState>((set, get) => ({
  shapes: {},
  layers: [{ id: 'desenho', name: 'Desenho', strokeColor: '#000000', strokeEnabled: true, fillColor: '#ffffff', fillEnabled: true, visible: true, locked: false, isNative: true }],
  activeLayerId: 'desenho',
  worldScale: 50,

  spatialIndex: initialQuadTree,
  past: [],
  future: [],

  syncQuadTree: () => {
    const { shapes, spatialIndex } = get();
    spatialIndex.clear();
    Object.values(shapes).forEach(shape => spatialIndex.insert(shape));
  },

  saveToHistory: (patches) => {
      if (patches.length === 0) return;
      const { past } = get();
      const newPast = [...past, patches];
      if (newPast.length > HISTORY.LIMIT) newPast.shift();
      set({ past: newPast, future: [] });
  },

  undo: () => {
    const { past, future, shapes, spatialIndex } = get();
    if (past.length === 0) return;

    const patches = past[past.length - 1];
    const newPast = past.slice(0, -1);

    const newShapes = { ...shapes };
    const redoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
            const s = newShapes[patch.id];
            if (s) spatialIndex.remove(s);
            delete newShapes[patch.id];
            redoPatches.push({ type: 'DELETE', id: patch.id, prev: patch.data });
        } else if (patch.type === 'UPDATE') {
            const oldS = newShapes[patch.id];
            if (oldS) {
                const updated = { ...oldS, ...(patch.prev as Partial<Shape>) };
                spatialIndex.update(oldS, updated);
                newShapes[patch.id] = updated;
                redoPatches.push({ type: 'UPDATE', id: patch.id, diff: patch.diff, prev: patch.prev });
            }
        } else if (patch.type === 'DELETE') {
            if (patch.prev) {
                const s = patch.prev as Shape;
                newShapes[patch.id] = s;
                spatialIndex.insert(s);
                redoPatches.push({ type: 'ADD', id: patch.id, data: s });
            }
        }
    });

    set({ shapes: newShapes, past: newPast, future: [redoPatches, ...future] });
  },

  redo: () => {
    const { past, future, shapes, spatialIndex } = get();
    if (future.length === 0) return;

    const patches = future[0];
    const newFuture = future.slice(1);

    const newShapes = { ...shapes };
    const undoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
             if (patch.data) {
                 newShapes[patch.id] = patch.data;
                 spatialIndex.insert(patch.data);
                 undoPatches.push({ type: 'ADD', id: patch.id, data: patch.data });
             }
        } else if (patch.type === 'UPDATE') {
             const oldS = newShapes[patch.id];
             if (oldS) {
                const updated = { ...oldS, ...patch.diff };
                spatialIndex.update(oldS, updated);
                newShapes[patch.id] = updated;
                undoPatches.push(patch);
             }
        } else if (patch.type === 'DELETE') {
             const s = newShapes[patch.id];
             if (s) {
                spatialIndex.remove(s);
                delete newShapes[patch.id];
                undoPatches.push(patch);
             }
        }
    });

    set({ shapes: newShapes, past: [...past, undoPatches], future: newFuture });
  },

  addShape: (shape) => {
      const { shapes, saveToHistory, spatialIndex } = get();

      const newShapes = { ...shapes, [shape.id]: shape };
      spatialIndex.insert(shape);
      set({ shapes: newShapes });
      saveToHistory([{ type: 'ADD', id: shape.id, data: shape }]);
  },

  updateShape: (id, diff, recordHistory = true) => {
      const { shapes, saveToHistory, spatialIndex } = get();
      const oldShape = shapes[id];
      if (!oldShape) return;

      const newShape = { ...oldShape, ...diff };

      const newShapes = { ...shapes, [id]: newShape };

      spatialIndex.update(oldShape, newShape);
      set({ shapes: newShapes });

      if (recordHistory) {
          saveToHistory([{ type: 'UPDATE', id, diff, prev: oldShape }]);
      }
  },

  updateShapes: (updater) => {
      set(state => {
          const newShapes = updater(state.shapes);
          // With bulk update, it's safer to full sync for now unless we track diffs
          state.spatialIndex.clear();
          Object.values(newShapes).forEach(s => state.spatialIndex.insert(s));
          return { shapes: newShapes };
      });
  },

  deleteShape: (id) => {
      const { shapes, saveToHistory, spatialIndex } = get();
      const s = shapes[id];
      if (!s) return;
      const newShapes = { ...shapes };
      delete newShapes[id];
      spatialIndex.remove(s);
      set({ shapes: newShapes });
      saveToHistory([{ type: 'DELETE', id, prev: s }]);
  },

  setActiveLayerId: (id) => set({ activeLayerId: id }),

  addLayer: () => set((state) => {
    const newId = Date.now().toString();
    const newLayer: Layer = { id: newId, name: `Layer ${state.layers.length}`, strokeColor: '#000000', strokeEnabled: true, fillColor: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), fillEnabled: true, visible: true, locked: false };
    return { layers: [...state.layers, newLayer], activeLayerId: newId };
  }),

  deleteLayer: (id) => {
    const { layers, shapes, activeLayerId, saveToHistory, spatialIndex } = get();
    const layerToDelete = layers.find(l => l.id === id);
    // Cannot delete: only layer, active layer, or native layers
    if (layers.length <= 1 || id === activeLayerId || layerToDelete?.isNative) return false;

    const newLayers = layers.filter(l => l.id !== id);
    const newShapes = { ...shapes };
    const patches: Patch[] = [];

    Object.values(shapes).forEach((s: Shape) => {
      if (s.layerId === id) {
        patches.push({ type: 'DELETE', id: s.id, prev: s });
        delete newShapes[s.id];
        spatialIndex.remove(s);
      }
    });

    set({ layers: newLayers, shapes: newShapes });

    if (patches.length > 0) {
      saveToHistory(patches);
    }
    return true;
  },

  setLayerStrokeColor: (id, color) => set(state => ({
      layers: state.layers.map(l => l.id === id ? { ...l, strokeColor: color } : l)
  })),

  setLayerFillColor: (id, color) => set(state => ({
      layers: state.layers.map(l => l.id === id ? { ...l, fillColor: color } : l)
  })),

  toggleLayerVisibility: (id) => set((state) => ({ layers: state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l) })),

  toggleLayerLock: (id) => set((state) => ({ layers: state.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l) })),
  
  updateLayer: (id, updates) => set((state) => ({
      layers: state.layers.map(l => l.id === id ? { ...l, ...updates } : l)
  })),

  alignSelected: (ids, alignment) => {
    const { shapes, saveToHistory, updateShape } = get();
    if (ids.length < 2) return;
    const selectedList = ids.map((id: string) => shapes[id]).filter(s => !!s);
    const combinedBounds = getCombinedBounds(selectedList);
    if (!combinedBounds) return;

    const patches: Patch[] = [];
    selectedList.forEach(s => {
        const bounds = getShapeBounds(s);
        if (!bounds) return;
        let dx = 0, dy = 0;

        switch (alignment) {
          case 'left': dx = combinedBounds.x - bounds.x; break;
          case 'center': dx = (combinedBounds.x + combinedBounds.width / 2) - (bounds.x + bounds.width / 2); break;
          case 'right': dx = (combinedBounds.x + combinedBounds.width) - (bounds.x + bounds.width); break;
          case 'top': dy = combinedBounds.y - bounds.y; break;
          case 'middle': dy = (combinedBounds.y + combinedBounds.height / 2) - (bounds.y + bounds.height / 2); break;
          case 'bottom': dy = (combinedBounds.y + combinedBounds.height) - (bounds.y + bounds.height); break;
        }

        if (dx === 0 && dy === 0) return;

        const diff: Partial<Shape> = { x: (s.x||0) + dx, y: (s.y||0) + dy };
        if (s.points) diff.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));

        const prev: Partial<Shape> = { x: s.x, y: s.y, points: s.points };
        patches.push({ type: 'UPDATE', id: s.id, diff, prev });
        updateShape(s.id, diff, false);
    });

    saveToHistory(patches);
  },

  deleteShapes: (ids) => {
    const { layers, shapes, saveToHistory, spatialIndex } = get();
    if (ids.length === 0) return;

    const patches: Patch[] = [];
    const newShapes = { ...shapes };

    ids.forEach(id => {
        const s = shapes[id];
        if (!s) return;
        const l = layers.find(lay => lay.id === s.layerId);
        if (l && l.locked) {
            // Keep selected if locked
            return;
        }
        delete newShapes[id];
        spatialIndex.remove(s);
        patches.push({ type: 'DELETE', id, prev: s });
    });

    if (patches.length > 0) {
        set({ shapes: newShapes });
        saveToHistory(patches);
    }
  },

  rotateSelected: (ids, pivot, angle) => {
     const { shapes, saveToHistory, updateShape } = get();
     if (ids.length === 0) return;
     const patches: Patch[] = [];
     ids.forEach(id => {
         const s = shapes[id];
         if (!s) return;
         let diff: Partial<Shape> = {};
         if (s.points) diff.points = s.points.map(p => rotatePoint(p, pivot, angle));

         const supportsCenteredRotation = (s.type === 'rect' || s.type === 'text' || s.type === 'circle' || s.type === 'polygon');
         if (supportsCenteredRotation) {
             const bounds = getShapeBoundingBox(s);
             const center = getShapeCenter(s);
             const newCenter = rotatePoint(center, pivot, angle);

             if (s.type === 'circle' || s.type === 'polygon') {
                 diff.x = newCenter.x;
                 diff.y = newCenter.y;
             } else {
                 diff.x = newCenter.x - bounds.width / 2;
                 diff.y = newCenter.y - bounds.height / 2;
             }
             diff.rotation = (s.rotation || 0) + angle;
         } else if (s.x !== undefined && s.y !== undefined) {
             const np = rotatePoint({ x: s.x, y: s.y }, pivot, angle);
             diff.x = np.x; diff.y = np.y;
         }

         const prev: Partial<Shape> = { points: s.points, x: s.x, y: s.y, rotation: s.rotation };
         patches.push({ type: 'UPDATE', id, diff, prev });
         updateShape(id, diff, false);
     });
     saveToHistory(patches);
  },

  ensureLayer: (name: string) => {
      const { layers } = get();
      const existing = layers.find(l => l.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing.id;
      
      const newId = Date.now().toString();
      set(state => ({
          layers: [...state.layers, {
              id: newId,
              name: name,
              strokeColor: '#000000',
              strokeEnabled: true,
              fillColor: '#ffffff',
              fillEnabled: true,
              visible: true,
              locked: false
          }]
      }));
      return newId;
  },
}));
