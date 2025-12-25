import { StateCreator } from 'zustand';
import type { Patch, Shape, ElectricalElement, DiagramNode, DiagramEdge } from '@/types';
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
    const { past, future, shapes, shapeOrder, spatialIndex, electricalElements, diagramNodes, diagramEdges } = get();
    if (past.length === 0) return;

    const patches = past[past.length - 1];
    const newPast = past.slice(0, -1);

    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];
    const newElectrical = { ...electricalElements };
    const newDiagramNodes = { ...diagramNodes };
    const newDiagramEdges = { ...diagramEdges };
    const redoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
            const s = newShapes[patch.id];
            if (s) {
              if (s.electricalElementId) {
                delete newElectrical[s.electricalElementId];
              }
              if (s.diagramNodeId) {
                const linkedNode = Object.values(newDiagramNodes).find(n => n.shapeId === s.id);
                if (linkedNode) delete newDiagramNodes[linkedNode.id];
              }
              if (s.diagramEdgeId) {
                const linkedEdge = Object.values(newDiagramEdges).find(e => e.shapeId === s.id);
                if (linkedEdge) delete newDiagramEdges[linkedEdge.id];
              }
              spatialIndex.remove(s);
            }
            delete newShapes[patch.id];
            if (newShapeOrder.includes(patch.id)) newShapeOrder = newShapeOrder.filter((id) => id !== patch.id);
            if (patch.diagramNode) delete newDiagramNodes[patch.diagramNode.id];
            if (patch.diagramEdge) delete newDiagramEdges[patch.diagramEdge.id];
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
                if (patch.electricalElement) {
                  newElectrical[patch.electricalElement.id] = { ...patch.electricalElement, shapeId: patch.id };
                  restoredShape.electricalElementId = patch.electricalElement.id;
                }
                if (patch.diagramNode) {
                  newDiagramNodes[patch.diagramNode.id] = patch.diagramNode;
                  restoredShape.diagramNodeId = patch.diagramNode.id;
                }
                if (patch.diagramEdge) {
                  newDiagramEdges[patch.diagramEdge.id] = patch.diagramEdge;
                  restoredShape.diagramEdgeId = patch.diagramEdge.id;
                }
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
      electricalElements: newElectrical,
      diagramNodes: newDiagramNodes,
      diagramEdges: newDiagramEdges,
      past: newPast,
      future: [redoPatches, ...future]
    });
    get().syncConnections();
    get().syncDiagramEdgesGeometry();
  },

  redo: () => {
    const { past, future, shapes, shapeOrder, spatialIndex, electricalElements, diagramNodes, diagramEdges } = get();
    if (future.length === 0) return;

    const patches = future[0];
    const newFuture = future.slice(1);

    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];
    const newElectrical = { ...electricalElements };
    const newDiagramNodes = { ...diagramNodes };
    const newDiagramEdges = { ...diagramEdges };
    const undoPatches: Patch[] = [];

    patches.forEach(patch => {
        if (patch.type === 'ADD') {
             if (patch.data) {
                 const shapeToAdd = patch.electricalElement
                   ? { ...patch.data, electricalElementId: patch.electricalElement.id }
                   : patch.data;
                 newShapes[patch.id] = shapeToAdd;
                 if (!newShapeOrder.includes(patch.id)) {
                   const at = typeof patch.orderIndex === 'number' && Number.isFinite(patch.orderIndex) ? patch.orderIndex : newShapeOrder.length;
                   const clamped = Math.max(0, Math.min(newShapeOrder.length, Math.floor(at)));
                   newShapeOrder = [...newShapeOrder.slice(0, clamped), patch.id, ...newShapeOrder.slice(clamped)];
                 }
                 if (patch.electricalElement) {
                   newElectrical[patch.electricalElement.id] = { ...patch.electricalElement, shapeId: patch.id };
                 }
                 if (patch.diagramNode) {
                   newDiagramNodes[patch.diagramNode.id] = patch.diagramNode;
                   newShapes[patch.id] = { ...shapeToAdd, diagramNodeId: patch.diagramNode.id };
                 }
                 if (patch.diagramEdge) {
                   newDiagramEdges[patch.diagramEdge.id] = patch.diagramEdge;
                   newShapes[patch.id] = { ...newShapes[patch.id], diagramEdgeId: patch.diagramEdge.id };
                 }
                 spatialIndex.insert(shapeToAdd);
                 undoPatches.push({
                   type: 'ADD',
                   id: patch.id,
                   data: newShapes[patch.id],
                   orderIndex: patch.orderIndex,
                   electricalElement: patch.electricalElement,
                   diagramNode: patch.diagramNode,
                   diagramEdge: patch.diagramEdge
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
                const linkedElement = s.electricalElementId ? newElectrical[s.electricalElementId] : undefined;
                if (linkedElement) delete newElectrical[linkedElement.id];
                if (s.diagramNodeId) {
                  const linkedNode = Object.values(newDiagramNodes).find(n => n.shapeId === s.id);
                  if (linkedNode) delete newDiagramNodes[linkedNode.id];
                }
                if (s.diagramEdgeId) {
                  const linkedEdge = Object.values(newDiagramEdges).find(e => e.shapeId === s.id);
                  if (linkedEdge) delete newDiagramEdges[linkedEdge.id];
                }
                spatialIndex.remove(s);
                delete newShapes[patch.id];
                if (newShapeOrder.includes(patch.id)) newShapeOrder = newShapeOrder.filter((id) => id !== patch.id);
                undoPatches.push({
                  type: 'DELETE',
                  id: patch.id,
                  prev: s,
                  orderIndex: patch.orderIndex,
                  electricalElement: patch.electricalElement ?? linkedElement,
                  diagramNode: patch.diagramNode,
                  diagramEdge: patch.diagramEdge
                });
             }
        }
    });

    set({
      shapes: newShapes,
      shapeOrder: newShapeOrder.filter((id) => !!newShapes[id]),
      electricalElements: newElectrical,
      diagramNodes: newDiagramNodes,
      diagramEdges: newDiagramEdges,
      past: [...past, undoPatches],
      future: newFuture
    });
    get().syncConnections();
    get().syncDiagramEdgesGeometry();
  },
});
