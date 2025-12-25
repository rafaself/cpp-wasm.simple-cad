import { StateCreator } from 'zustand';
import type { Patch, Shape } from '@/types';
import { DataState } from '../useDataStore';
import { HISTORY } from '@/design/tokens';

export interface HistorySlice {
  past: Patch[][];
  future: Patch[][];
  undo: () => void;
  redo: () => void;
  saveToHistory: (patches: Patch[]) => void;
}

export const createHistorySlice: StateCreator<
  DataState,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  past: [],
  future: [],

  saveToHistory: (patches) => {
      if (patches.length === 0) return;
      const { past } = get();
      const newPast = [...past, patches];
      if (newPast.length > HISTORY.LIMIT) newPast.shift();
      set({ past: newPast, future: [] });
  },

  undo: () => {
    const { past, future, shapes, shapeOrder, spatialIndex } = get();
    if (past.length === 0) return;

    const patches = past[past.length - 1];
    const newPast = past.slice(0, -1);

    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];
    const redoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
            const s = newShapes[patch.id];
            if (s) {
              spatialIndex.remove(s);
            }
            delete newShapes[patch.id];
            if (newShapeOrder.includes(patch.id)) newShapeOrder = newShapeOrder.filter((id) => id !== patch.id);
            redoPatches.push(patch);
        } else if (patch.type === 'UPDATE') {
            const oldS = newShapes[patch.id];
            if (oldS) {
                const updated = { ...oldS, ...(patch.prev as Partial<Shape>) };
                spatialIndex.update(oldS, updated);
                newShapes[patch.id] = updated;
                redoPatches.push(patch);
            }
        } else if (patch.type === 'DELETE') {
            if (patch.prev) {
                const restoredShape = { ...(patch.prev as Shape) };
                newShapes[patch.id] = restoredShape;
                spatialIndex.insert(restoredShape);
                if (!newShapeOrder.includes(patch.id)) {
                  const at = typeof patch.orderIndex === 'number' && Number.isFinite(patch.orderIndex) ? patch.orderIndex : newShapeOrder.length;
                  const clamped = Math.max(0, Math.min(newShapeOrder.length, Math.floor(at)));
                  newShapeOrder = [...newShapeOrder.slice(0, clamped), patch.id, ...newShapeOrder.slice(clamped)];
                }
                redoPatches.push(patch);
            }
        }
    });

    set({
      shapes: newShapes,
      shapeOrder: newShapeOrder.filter((id) => !!newShapes[id]),
      past: newPast,
      future: [redoPatches, ...future]
    });
  },

  redo: () => {
    const { past, future, shapes, shapeOrder, spatialIndex } = get();
    if (future.length === 0) return;

    const patches = future[0];
    const newFuture = future.slice(1);

    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];
    const undoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
             if (patch.data) {
                 const shapeToAdd = patch.data;
                 newShapes[patch.id] = shapeToAdd;
                 if (!newShapeOrder.includes(patch.id)) {
                   const at = typeof patch.orderIndex === 'number' && Number.isFinite(patch.orderIndex) ? patch.orderIndex : newShapeOrder.length;
                   const clamped = Math.max(0, Math.min(newShapeOrder.length, Math.floor(at)));
                   newShapeOrder = [...newShapeOrder.slice(0, clamped), patch.id, ...newShapeOrder.slice(clamped)];
                 }
                 spatialIndex.insert(shapeToAdd);
                 undoPatches.push({
                   type: 'ADD',
                   id: patch.id,
                   data: newShapes[patch.id],
                   orderIndex: patch.orderIndex,
                 });
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
                if (newShapeOrder.includes(patch.id)) newShapeOrder = newShapeOrder.filter((id) => id !== patch.id);
                undoPatches.push({
                  type: 'DELETE',
                  id: patch.id,
                  prev: s,
                  orderIndex: patch.orderIndex,
                });
             }
        }
    });

    set({
      shapes: newShapes,
      shapeOrder: newShapeOrder.filter((id) => !!newShapes[id]),
      past: [...past, undoPatches],
      future: newFuture
    });
  },
});
