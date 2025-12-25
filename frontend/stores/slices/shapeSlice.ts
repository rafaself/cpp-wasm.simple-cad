import { StateCreator } from 'zustand';
import type { Shape, ElectricalElement, DiagramNode, DiagramEdge, Patch, Point } from '@/types';
import { DataState } from '../useDataStore';
import { generateId } from '@/utils/uuid';
import { normalizeShapeStyle } from '../../utils/storeNormalization';
import { getCombinedBounds, getShapeBounds, getShapeBoundingBox, getShapeCenter, rotatePoint } from '@/utils/geometry';
import { detachAnchoredNodesForShape, getConduitNodeUsage } from '@/utils/connections';

export interface ShapeSlice {
  shapes: Record<string, Shape>;
  shapeOrder: string[];
  addShape: (shape: Shape, electricalElement?: ElectricalElement, diagram?: { node?: DiagramNode; edge?: DiagramEdge }) => void;
  addShapes: (shapes: Shape[]) => void;
  updateShape: (id: string, diff: Partial<Shape>, recordHistory?: boolean) => void;
  deleteShape: (id: string) => void;
  deleteShapes: (ids: string[]) => void;
  alignSelected: (ids: string[], alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  rotateSelected: (ids: string[], pivot: Point, angle: number) => void;
}

export const createShapeSlice: StateCreator<
  DataState,
  [],
  [],
  ShapeSlice
> = (set, get) => ({
  shapes: {},
  shapeOrder: [],

  addShape: (shape, electricalElement, diagram) => {
      const { shapes, shapeOrder, electricalElements, diagramNodes, diagramEdges, saveToHistory, spatialIndex } = get();

      const linkedShapeRaw = electricalElement ? { ...shape, electricalElementId: electricalElement.id } : shape;
      const linkedShape = normalizeShapeStyle(linkedShapeRaw);
      const newShapes = { ...shapes, [linkedShape.id]: linkedShape };
      const newShapeOrder = shapeOrder.includes(linkedShape.id) ? shapeOrder : [...shapeOrder, linkedShape.id];
      const newElectrical = electricalElement
        ? { ...electricalElements, [electricalElement.id]: { ...electricalElement, shapeId: linkedShape.id } }
        : electricalElements;
      const newDiagramNodes = diagram?.node
        ? { ...diagramNodes, [diagram.node.id]: { ...diagram.node, shapeId: linkedShape.id } }
        : diagramNodes;
      const newDiagramEdges = diagram?.edge
        ? { ...diagramEdges, [diagram.edge.id]: { ...diagram.edge, shapeId: diagram.edge.shapeId ?? linkedShape.id } }
        : diagramEdges;

      spatialIndex.insert(linkedShape);
      set({ shapes: newShapes, shapeOrder: newShapeOrder, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges });
      get().syncConnections();
      saveToHistory([{
        type: 'ADD',
        id: linkedShape.id,
        data: linkedShape,
        orderIndex: newShapeOrder.indexOf(linkedShape.id),
        electricalElement,
        diagramNode: diagram?.node,
        diagramEdge: diagram?.edge
      }]);
      get().syncDiagramEdgesGeometry();
  },

  addShapes: (shapesToAdd) => {
      const { shapes, shapeOrder, saveToHistory, spatialIndex } = get();
      const newShapes = { ...shapes };
      const newShapeOrder = [...shapeOrder];
      const patches: Patch[] = [];

      shapesToAdd.forEach(shape => {
          const normalized = normalizeShapeStyle(shape);
          newShapes[normalized.id] = normalized;
          if (!newShapeOrder.includes(normalized.id)) newShapeOrder.push(normalized.id);
          spatialIndex.insert(normalized);
          patches.push({
              type: 'ADD',
              id: normalized.id,
              data: normalized,
              orderIndex: newShapeOrder.indexOf(normalized.id),
          });
      });

      set({ shapes: newShapes, shapeOrder: newShapeOrder });
      get().syncConnections();
      saveToHistory(patches);
  },

  updateShape: (id, diff, recordHistory = true) => {
      const { shapes, saveToHistory, spatialIndex, connectionNodes } = get();
      const oldShape = shapes[id];
      if (!oldShape) return;

      let newShape: Shape = normalizeShapeStyle({ ...oldShape, ...diff });

      // If editing a conduit endpoint that is anchored or shared, detach to a new free node
      // to preserve the "edit this conduit only" behavior.
      const isConduit = newShape.type === 'eletroduto';
      if (isConduit && diff.points && diff.points.length >= 2) {
        const usage = getConduitNodeUsage(shapes);
        let nextNodes = connectionNodes;

        const detachEndpointIfNeeded = (endpoint: 'from' | 'to', p: Point) => {
          const nodeId = endpoint === 'from' ? newShape.fromNodeId : newShape.toNodeId;
          if (!nodeId) return;
          const node = nextNodes[nodeId];
          if (!node) return;
          const shared = (usage[nodeId] ?? 0) > 1;
          const anchored = node.kind === 'anchored';
            if (shared || anchored) {
              const newNodeId = generateId();
              nextNodes = { ...nextNodes, [newNodeId]: { id: newNodeId, kind: 'free', position: p, pinned: true } };
              newShape = endpoint === 'from'
                ? { ...newShape, fromNodeId: newNodeId }
                : { ...newShape, toNodeId: newNodeId };
            } else if (node.kind === 'free') {
              nextNodes = { ...nextNodes, [nodeId]: { ...node, position: p } };
            }
        };

        detachEndpointIfNeeded('from', diff.points[0]);
        detachEndpointIfNeeded('to', diff.points[1]);

        if (nextNodes !== connectionNodes) set({ connectionNodes: nextNodes });
      }

      const newShapes = { ...shapes, [id]: newShape };

      spatialIndex.update(oldShape, newShape);
      set({ shapes: newShapes });
      get().syncConnections();
      get().syncDiagramEdgesGeometry();

      if (recordHistory) {
          saveToHistory([{ type: 'UPDATE', id, diff, prev: oldShape }]);
      }
  },

  deleteShape: (id) => {
      const { shapes, shapeOrder, electricalElements, diagramNodes, diagramEdges, saveToHistory, spatialIndex, connectionNodes } = get();
      const targetShape = shapes[id];
      if (!targetShape) return;

      const newShapes = { ...shapes };
      const orderIndex = shapeOrder.indexOf(id);
      const newShapeOrder = orderIndex >= 0 ? shapeOrder.filter((sid) => sid !== id) : shapeOrder;
      const newElectrical = { ...electricalElements };
      let newConnectionNodes = connectionNodes;
      const newDiagramNodes = { ...diagramNodes };
      const newDiagramEdges = { ...diagramEdges };
      const patches: Patch[] = [];

      // If deleting an anchored shape, detach its nodes to free nodes to preserve conduit geometry.
      newConnectionNodes = detachAnchoredNodesForShape(newConnectionNodes, shapes, id);

      const electricalElement = targetShape.electricalElementId ? electricalElements[targetShape.electricalElementId] : undefined;
      if (electricalElement) {
        delete newElectrical[electricalElement.id];
      }

      const diagramNode = Object.values(diagramNodes).find(n => n.shapeId === id);
      if (diagramNode) {
        delete newDiagramNodes[diagramNode.id];
      }

      const edgesToDrop = new Set<string>();
      Object.values(diagramEdges).forEach(edge => {
        if (edge.shapeId === id) edgesToDrop.add(edge.id);
        if (diagramNode && (edge.fromId === diagramNode.id || edge.toId === diagramNode.id)) edgesToDrop.add(edge.id);
      });

      edgesToDrop.forEach(edgeId => {
        const edge = diagramEdges[edgeId];
        const edgeShape = edge ? shapes[edge.shapeId] : undefined;
        const edgeOrderIndex = edgeShape ? shapeOrder.indexOf(edgeShape.id) : -1;
        if (edgeShape) {
          delete newShapes[edgeShape.id];
          spatialIndex.remove(edgeShape);
        }
        if (edge) {
          delete newDiagramEdges[edge.id];
          patches.push({ type: 'DELETE', id: edge.shapeId, prev: edgeShape, orderIndex: edgeOrderIndex >= 0 ? edgeOrderIndex : undefined, diagramEdge: edge });
        }
      });

      delete newShapes[id];
      spatialIndex.remove(targetShape);
      patches.push({ type: 'DELETE', id, prev: targetShape, orderIndex: orderIndex >= 0 ? orderIndex : undefined, electricalElement, diagramNode });

      const finalOrder = newShapeOrder.filter((sid) => !!newShapes[sid]);
      set({ shapes: newShapes, shapeOrder: finalOrder, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges, connectionNodes: newConnectionNodes });
      saveToHistory(patches);
      get().syncConnections();
      get().syncDiagramEdgesGeometry();
  },

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

        const diff: Partial<Shape> = {};
        if (s.x !== undefined) diff.x = s.x + dx;
        if (s.y !== undefined) diff.y = s.y + dy;
        if (s.points) diff.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));

        const prev: Partial<Shape> = { x: s.x, y: s.y, points: s.points };
        patches.push({ type: 'UPDATE', id: s.id, diff, prev });
        updateShape(s.id, diff, false);
    });

    saveToHistory(patches);
  },

  deleteShapes: (ids) => {
    const { layers, shapes, shapeOrder, saveToHistory, spatialIndex, electricalElements, diagramNodes, diagramEdges, connectionNodes } = get();
    if (ids.length === 0) return;

    const patches: Patch[] = [];
    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];
    const newElectrical = { ...electricalElements };
    let newConnectionNodes = connectionNodes;
    const newDiagramNodes = { ...diagramNodes };
    const newDiagramEdges = { ...diagramEdges };
    const edgeIdsToDrop = new Set<string>();

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

        const diagramNode = Object.values(diagramNodes).find(n => n.shapeId === id);
        if (diagramNode) {
          delete newDiagramNodes[diagramNode.id];
          Object.values(diagramEdges).forEach(edge => {
            if (edge.fromId === diagramNode.id || edge.toId === diagramNode.id) edgeIdsToDrop.add(edge.id);
          });
        }
        Object.values(diagramEdges).forEach(edge => {
          if (edge.shapeId === id) edgeIdsToDrop.add(edge.id);
        });

        // If deleting an anchored shape, detach its nodes to free nodes to preserve conduit geometry.
        newConnectionNodes = detachAnchoredNodesForShape(newConnectionNodes, shapes, id);

        delete newShapes[id];
        if (newShapeOrder.includes(id)) newShapeOrder = newShapeOrder.filter((sid) => sid !== id);
        spatialIndex.remove(s);
        const orderIndex = shapeOrder.indexOf(id);
        patches.push({ type: 'DELETE', id, prev: s, orderIndex: orderIndex >= 0 ? orderIndex : undefined, electricalElement, diagramNode });
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

    if (patches.length > 0) {
        newShapeOrder = newShapeOrder.filter((sid) => !!newShapes[sid]);
        set({ shapes: newShapes, shapeOrder: newShapeOrder, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges, connectionNodes: newConnectionNodes });
        saveToHistory(patches);
        get().syncConnections();
        get().syncDiagramEdgesGeometry();
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
});
