import { create } from 'zustand';
import { ElectricalElement, FrameSettings, Layer, Patch, Point, SerializedProject, Shape } from '../types';
import { getCombinedBounds, getShapeBounds, getShapeBoundingBox, getShapeCenter, rotatePoint } from '../utils/geometry';
import { QuadTree } from '../utils/spatial';
import { HISTORY } from '../design/tokens';

// Initialize Quadtree outside to avoid reactivity loop, but accessible
const initialQuadTree = new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 });

interface DataState {
  // Document State
  shapes: Record<string, Shape>;
  electricalElements: Record<string, ElectricalElement>;
  layers: Layer[];
  activeLayerId: string;

  // World Scale
  worldScale: number;

  // Layout frame
  frame: FrameSettings;

  // Spatial Index
  spatialIndex: QuadTree;

  // History
  past: Patch[][];
  future: Patch[][];

  // Actions
  addShape: (shape: Shape, electricalElement?: ElectricalElement) => void;
  updateShape: (id: string, diff: Partial<Shape>, recordHistory?: boolean) => void;
  updateShapes: (updater: (prev: Record<string, Shape>) => Record<string, Shape>) => void; // Deprecated, avoid use
  deleteShape: (id: string) => void;
  addElectricalElement: (element: ElectricalElement) => void;
  updateElectricalElement: (id: string, diff: Partial<ElectricalElement>) => void;
  deleteElectricalElement: (id: string) => void;

  // Layer Ops
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => boolean;
  setLayerStrokeColor: (id: string, color: string) => void;
  setLayerFillColor: (id: string, color: string) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;

  // Document settings
  setWorldScale: (scale: number) => void;
  setFrameEnabled: (enabled: boolean) => void;
  setFrameSize: (widthMm: number, heightMm: number) => void;
  setFrameMargin: (marginMm: number) => void;

  // Complex Ops (often rely on selection)
  alignSelected: (ids: string[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  deleteShapes: (ids: string[]) => void;
  rotateSelected: (ids: string[], pivot: Point, angle: number) => void;

  // History Ops
  undo: () => void;
  redo: () => void;
  saveToHistory: (patches: Patch[]) => void;

  // Serialization
  serializeProject: () => SerializedProject;

  // Helpers
  syncQuadTree: () => void;
  ensureLayer: (name: string) => string;
}

export const useDataStore = create<DataState>((set, get) => ({
  shapes: {},
  electricalElements: {},
  layers: [{ id: 'desenho', name: 'Desenho', strokeColor: '#000000', strokeEnabled: true, fillColor: '#ffffff', fillEnabled: true, visible: true, locked: false, isNative: true }],
  activeLayerId: 'desenho',
  worldScale: 50,
  frame: {
    enabled: false,
    widthMm: 297,
    heightMm: 210,
    marginMm: 10,
  },

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
    const { past, future, shapes, spatialIndex, electricalElements } = get();
    if (past.length === 0) return;

    const patches = past[past.length - 1];
    const newPast = past.slice(0, -1);

    const newShapes = { ...shapes };
    const newElectrical = { ...electricalElements };
    const redoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
            const s = newShapes[patch.id];
            if (s) {
              if (s.electricalElementId) {
                delete newElectrical[s.electricalElementId];
              }
              spatialIndex.remove(s);
            }
            delete newShapes[patch.id];
            redoPatches.push({ type: 'DELETE', id: patch.id, prev: patch.data, electricalElement: patch.electricalElement });
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
                const restoredShape = { ...(patch.prev as Shape) };
                if (patch.electricalElement) {
                  newElectrical[patch.electricalElement.id] = { ...patch.electricalElement, shapeId: patch.id };
                  restoredShape.electricalElementId = patch.electricalElement.id;
                }
                newShapes[patch.id] = restoredShape;
                spatialIndex.insert(restoredShape);
                redoPatches.push({ type: 'ADD', id: patch.id, data: restoredShape, electricalElement: patch.electricalElement });
            }
        }
    });

    set({ shapes: newShapes, electricalElements: newElectrical, past: newPast, future: [redoPatches, ...future] });
  },

  redo: () => {
    const { past, future, shapes, spatialIndex, electricalElements } = get();
    if (future.length === 0) return;

    const patches = future[0];
    const newFuture = future.slice(1);

    const newShapes = { ...shapes };
    const newElectrical = { ...electricalElements };
    const undoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
             if (patch.data) {
                 const shapeToAdd = patch.electricalElement
                   ? { ...patch.data, electricalElementId: patch.electricalElement.id }
                   : patch.data;
                 newShapes[patch.id] = shapeToAdd;
                 if (patch.electricalElement) {
                   newElectrical[patch.electricalElement.id] = { ...patch.electricalElement, shapeId: patch.id };
                 }
                 spatialIndex.insert(shapeToAdd);
                 undoPatches.push({ type: 'ADD', id: patch.id, data: shapeToAdd, electricalElement: patch.electricalElement });
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
                const linkedElement = s.electricalElementId ? newElectrical[s.electricalElementId] : undefined;
                if (linkedElement) delete newElectrical[linkedElement.id];
                spatialIndex.remove(s);
                delete newShapes[patch.id];
                undoPatches.push({ type: 'DELETE', id: patch.id, prev: s, electricalElement: patch.electricalElement ?? linkedElement });
             }
        }
    });

    set({ shapes: newShapes, electricalElements: newElectrical, past: [...past, undoPatches], future: newFuture });
  },

  addShape: (shape, electricalElement) => {
      const { shapes, electricalElements, saveToHistory, spatialIndex } = get();

      const linkedShape = electricalElement ? { ...shape, electricalElementId: electricalElement.id } : shape;
      const newShapes = { ...shapes, [linkedShape.id]: linkedShape };
      const newElectrical = electricalElement
        ? { ...electricalElements, [electricalElement.id]: { ...electricalElement, shapeId: linkedShape.id } }
        : electricalElements;

      spatialIndex.insert(linkedShape);
      set({ shapes: newShapes, electricalElements: newElectrical });
      saveToHistory([{ type: 'ADD', id: linkedShape.id, data: linkedShape, electricalElement }]);
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
      const { shapes, electricalElements, saveToHistory, spatialIndex } = get();
      const s = shapes[id];
      if (!s) return;
      const newShapes = { ...shapes };
      const newElectrical = { ...electricalElements };
      const electricalElement = s.electricalElementId ? electricalElements[s.electricalElementId] : undefined;
      if (electricalElement) {
        delete newElectrical[electricalElement.id];
      }
      delete newShapes[id];
      spatialIndex.remove(s);
      set({ shapes: newShapes, electricalElements: newElectrical });
      saveToHistory([{ type: 'DELETE', id, prev: s, electricalElement }]);
  },

  addElectricalElement: (element) => {
      const { shapes } = get();
      const targetShape = shapes[element.shapeId];
      if (!targetShape) return;

      set(state => ({
        electricalElements: { ...state.electricalElements, [element.id]: element },
        shapes: {
          ...state.shapes,
          [element.shapeId]: { ...targetShape, electricalElementId: element.id }
        }
      }));
  },

  updateElectricalElement: (id, diff) => {
      set(state => {
        const existing = state.electricalElements[id];
        if (!existing) return state;
        const updated = { ...existing, ...diff } as ElectricalElement;

        const updatedShapes = { ...state.shapes };
        if (existing.shapeId !== updated.shapeId) {
          const oldShape = updatedShapes[existing.shapeId];
          if (oldShape?.electricalElementId === id) {
            updatedShapes[existing.shapeId] = { ...oldShape, electricalElementId: undefined };
          }
          const newShape = updatedShapes[updated.shapeId];
          if (newShape) {
            updatedShapes[updated.shapeId] = { ...newShape, electricalElementId: id };
          }
        }

        return {
          electricalElements: { ...state.electricalElements, [id]: updated },
          shapes: updatedShapes
        };
      });
  },

  deleteElectricalElement: (id) => {
      const { electricalElements, shapes } = get();
      const element = electricalElements[id];
      if (!element) return;

      const newElectrical = { ...electricalElements };
      delete newElectrical[id];

      const targetShape = shapes[element.shapeId];
      const newShapes = { ...shapes };
      if (targetShape && targetShape.electricalElementId === id) {
        newShapes[element.shapeId] = { ...targetShape, electricalElementId: undefined };
      }

      set({ electricalElements: newElectrical, shapes: newShapes });
  },

  setActiveLayerId: (id) => set({ activeLayerId: id }),

  addLayer: () => set((state) => {
    const newId = Date.now().toString();
    const newLayer: Layer = { id: newId, name: `Layer ${state.layers.length}`, strokeColor: '#000000', strokeEnabled: true, fillColor: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), fillEnabled: true, visible: true, locked: false };
    return { layers: [...state.layers, newLayer], activeLayerId: newId };
  }),

  deleteLayer: (id) => {
    const { layers, shapes, activeLayerId, saveToHistory, spatialIndex, electricalElements } = get();
    const layerToDelete = layers.find(l => l.id === id);
    // Cannot delete: only layer, active layer, or native layers
    if (layers.length <= 1 || id === activeLayerId || layerToDelete?.isNative) return false;

    const newLayers = layers.filter(l => l.id !== id);
    const newShapes = { ...shapes };
    const newElectrical = { ...electricalElements };
    const patches: Patch[] = [];

    Object.values(shapes).forEach((s: Shape) => {
      if (s.layerId === id) {
        const electricalElement = s.electricalElementId ? electricalElements[s.electricalElementId] : undefined;
        if (electricalElement) delete newElectrical[electricalElement.id];
        patches.push({ type: 'DELETE', id: s.id, prev: s, electricalElement });
        delete newShapes[s.id];
        spatialIndex.remove(s);
      }
    });

    set({ layers: newLayers, shapes: newShapes, electricalElements: newElectrical });

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

  setWorldScale: (scale) => set({ worldScale: Math.max(1, scale) }),
  setFrameEnabled: (enabled) => set((state) => ({ frame: { ...state.frame, enabled } })),
  setFrameSize: (widthMm, heightMm) => set((state) => ({
    frame: {
      ...state.frame,
      widthMm: Math.max(1, widthMm),
      heightMm: Math.max(1, heightMm),
      marginMm: Math.max(0, Math.min(state.frame.marginMm, Math.min(widthMm, heightMm) / 2)),
    },
  })),
  setFrameMargin: (marginMm) => set((state) => {
    const safeMargin = Math.max(0, Math.min(marginMm, state.frame.widthMm / 2, state.frame.heightMm / 2));
    return { frame: { ...state.frame, marginMm: safeMargin } };
  }),

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
    const { layers, shapes, saveToHistory, spatialIndex, electricalElements } = get();
    if (ids.length === 0) return;

    const patches: Patch[] = [];
    const newShapes = { ...shapes };
    const newElectrical = { ...electricalElements };

    ids.forEach(id => {
        const s = shapes[id];
        if (!s) return;
        const l = layers.find(lay => lay.id === s.layerId);
        if (l && l.locked) {
            // Keep selected if locked
            return;
        }
        const electricalElement = s.electricalElementId ? electricalElements[s.electricalElementId] : undefined;
        if (electricalElement) delete newElectrical[electricalElement.id];
        delete newShapes[id];
        spatialIndex.remove(s);
        patches.push({ type: 'DELETE', id, prev: s, electricalElement });
    });

    if (patches.length > 0) {
        set({ shapes: newShapes, electricalElements: newElectrical });
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

  serializeProject: () => {
      const { layers, shapes, activeLayerId, electricalElements } = get();
      return {
          layers: [...layers],
          shapes: Object.values(shapes),
          activeLayerId,
          electricalElements: Object.values(electricalElements)
      };
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
