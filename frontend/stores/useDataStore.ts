import { create } from 'zustand';
import { ConnectionNode, DiagramEdge, DiagramNode, ElectricalElement, FrameSettings, Layer, Patch, Point, SerializedProject, Shape } from '../types';
import { getCombinedBounds, getShapeBounds, getShapeBoundingBox, getShapeCenter, rotatePoint } from '../utils/geometry';
import { QuadTree } from '../utils/spatial';
import { HISTORY } from '../design/tokens';
import { detachAnchoredNodesForShape, getConduitNodeUsage, normalizeConnectionTopology, resolveConnectionNodePosition } from '../utils/connections';
import { generateId } from '../utils/uuid';

// Initialize Quadtree outside to avoid reactivity loop, but accessible
const initialQuadTree = new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 });

const generateLayerId = (existingIds: Set<string>): string => {
  let id = generateId();
  while (existingIds.has(id)) {
    id = generateId();
  }
  return id;
};

interface DataState {
  // Document State
  shapes: Record<string, Shape>;
  electricalElements: Record<string, ElectricalElement>;
  connectionNodes: Record<string, ConnectionNode>;
  diagramNodes: Record<string, DiagramNode>;
  diagramEdges: Record<string, DiagramEdge>;
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
  addShape: (shape: Shape, electricalElement?: ElectricalElement, diagram?: { node?: DiagramNode; edge?: DiagramEdge }) => void;
  addShapes: (shapes: Shape[]) => void;
  updateShape: (id: string, diff: Partial<Shape>, recordHistory?: boolean) => void;
  deleteShape: (id: string) => void;
  createFreeConnectionNode: (position: Point) => string;
  getOrCreateAnchoredConnectionNode: (shapeId: string) => string;
  addConduitBetweenNodes: (params: { fromNodeId: string; toNodeId: string; layerId: string; strokeColor: string; floorId?: string; discipline?: 'architecture' | 'electrical' }) => string;
  addElectricalElement: (element: ElectricalElement) => void;
  updateElectricalElement: (id: string, diff: Partial<ElectricalElement>) => void;
  updateSharedElectricalProperties: (sourceElement: ElectricalElement, diff: Record<string, any>) => void; // Added for shared props
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
  syncDiagramEdgesGeometry: () => void;
  syncConnections: () => void;
  ensureLayer: (name: string, defaults?: Partial<Omit<Layer, 'id' | 'name'>>) => string;
}

const buildInitialState = () => ({
  shapes: {} as Record<string, Shape>,
  electricalElements: {} as Record<string, ElectricalElement>,
  connectionNodes: {} as Record<string, ConnectionNode>,
  diagramNodes: {} as Record<string, DiagramNode>,
  diagramEdges: {} as Record<string, DiagramEdge>,
  layers: [
    { id: 'desenho', name: 'Desenho', strokeColor: '#000000', strokeEnabled: true, fillColor: '#ffffff', fillEnabled: true, visible: true, locked: false, isNative: true },
    { id: 'eletrodutos', name: 'Eletrodutos', strokeColor: '#8b5cf6', strokeEnabled: true, fillColor: '#ffffff', fillEnabled: false, visible: true, locked: false, isNative: true }
  ] as Layer[],
  activeLayerId: 'desenho',
  worldScale: 100,
  frame: {
    enabled: false,
    widthMm: 297,
    heightMm: 210,
    marginMm: 10,
  },
  spatialIndex: new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 }),
  past: [] as Patch[][],
  future: [] as Patch[][],
});

export const useDataStore = create<DataState>((set, get) => ({
  ...buildInitialState(),

  syncQuadTree: () => {
    const { shapes, spatialIndex } = get();
    spatialIndex.clear();
    Object.values(shapes).forEach(shape => spatialIndex.insert(shape));
  },

  syncConnections: () => {
    const { shapes, connectionNodes, spatialIndex } = get();

    const normalized = normalizeConnectionTopology(shapes, connectionNodes, { pruneOrphans: true });
    const nextShapes = normalized.shapes;
    const nextNodes = normalized.nodes;

    // Update spatial index only for conduits whose endpoints moved.
    Object.values(nextShapes).forEach((s) => {
      const prev = shapes[s.id];
      if (!prev) return;
      const isConduit = (s.type === 'eletroduto' || s.type === 'conduit');
      if (!isConduit) return;
      const prevPts = prev.points ?? [];
      const nextPts = s.points ?? [];
      const changed =
        prevPts.length < 2 ||
        nextPts.length < 2 ||
        prevPts[0]?.x !== nextPts[0]?.x ||
        prevPts[0]?.y !== nextPts[0]?.y ||
        prevPts[1]?.x !== nextPts[1]?.x ||
        prevPts[1]?.y !== nextPts[1]?.y;
      if (changed) spatialIndex.update(prev, s);
    });

    // Only set if something actually changed (avoid extra reactivity during drags).
    if (nextShapes !== shapes || nextNodes !== connectionNodes) {
      set({ shapes: nextShapes, connectionNodes: nextNodes });
    }
  },

  syncDiagramEdgesGeometry: () => {
    const { diagramEdges, diagramNodes, shapes, spatialIndex } = get();
    let updatedShapes = shapes;
    let changed = false;

    Object.values(diagramEdges).forEach(edge => {
      const fromNode = diagramNodes[edge.fromId];
      const toNode = diagramNodes[edge.toId];
      if (!fromNode || !toNode) return;

      const fromShape = updatedShapes[fromNode.shapeId];
      const toShape = updatedShapes[toNode.shapeId];
      const edgeShape = updatedShapes[edge.shapeId];
      if (!fromShape || !toShape || !edgeShape) return;

      const start = getShapeCenter(fromShape);
      const end = getShapeCenter(toShape);
      const nextPoints = [start, end];
      const current = edgeShape.points ?? [];
      const hasDiff =
        current.length < 2 ||
        current[0].x !== start.x ||
        current[0].y !== start.y ||
        current[1].x !== end.x ||
        current[1].y !== end.y;

      if (hasDiff) {
        updatedShapes = { ...updatedShapes, [edgeShape.id]: { ...edgeShape, points: nextPoints } };
        changed = true;
      }
    });

    if (changed) {
      spatialIndex.clear();
      Object.values(updatedShapes).forEach(shape => spatialIndex.insert(shape));
      set({ shapes: updatedShapes });
    }
  },

  saveToHistory: (patches) => {
      if (patches.length === 0) return;
      const { past } = get();
      const newPast = [...past, patches];
      if (newPast.length > HISTORY.LIMIT) newPast.shift();
      set({ past: newPast, future: [] });
  },

  undo: () => {
    const { past, future, shapes, spatialIndex, electricalElements, diagramNodes, diagramEdges } = get();
    if (past.length === 0) return;

    const patches = past[past.length - 1];
    const newPast = past.slice(0, -1);

    const newShapes = { ...shapes };
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
            if (patch.diagramNode) delete newDiagramNodes[patch.diagramNode.id];
            if (patch.diagramEdge) delete newDiagramEdges[patch.diagramEdge.id];
            redoPatches.push({
              type: 'DELETE',
              id: patch.id,
              prev: patch.data,
              electricalElement: patch.electricalElement,
              diagramNode: patch.diagramNode,
              diagramEdge: patch.diagramEdge
            });
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
                redoPatches.push({
                  type: 'ADD',
                  id: patch.id,
                  data: restoredShape,
                  electricalElement: patch.electricalElement,
                  diagramNode: patch.diagramNode,
                  diagramEdge: patch.diagramEdge
                });
            }
        }
    });

    set({
      shapes: newShapes,
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
    const { past, future, shapes, spatialIndex, electricalElements, diagramNodes, diagramEdges } = get();
    if (future.length === 0) return;

    const patches = future[0];
    const newFuture = future.slice(1);

    const newShapes = { ...shapes };
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
                undoPatches.push({
                  type: 'DELETE',
                  id: patch.id,
                  prev: s,
                  electricalElement: patch.electricalElement ?? linkedElement,
                  diagramNode: patch.diagramNode,
                  diagramEdge: patch.diagramEdge
                });
             }
        }
    });

    set({
      shapes: newShapes,
      electricalElements: newElectrical,
      diagramNodes: newDiagramNodes,
      diagramEdges: newDiagramEdges,
      past: [...past, undoPatches],
      future: newFuture
    });
    get().syncConnections();
    get().syncDiagramEdgesGeometry();
  },

  addShape: (shape, electricalElement, diagram) => {
      const { shapes, electricalElements, diagramNodes, diagramEdges, saveToHistory, spatialIndex } = get();

      const linkedShape = electricalElement ? { ...shape, electricalElementId: electricalElement.id } : shape;
      const newShapes = { ...shapes, [linkedShape.id]: linkedShape };
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
      set({ shapes: newShapes, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges });
      get().syncConnections();
      saveToHistory([{
        type: 'ADD',
        id: linkedShape.id,
        data: linkedShape,
        electricalElement,
        diagramNode: diagram?.node,
        diagramEdge: diagram?.edge
      }]);
      get().syncDiagramEdgesGeometry();
  },

  addShapes: (shapesToAdd) => {
      const { shapes, saveToHistory, spatialIndex } = get();
      const newShapes = { ...shapes };
      const patches: Patch[] = [];

      shapesToAdd.forEach(shape => {
          newShapes[shape.id] = shape;
          spatialIndex.insert(shape);
          patches.push({
              type: 'ADD',
              id: shape.id,
              data: shape
          });
      });
      
      set({ shapes: newShapes });
      get().syncConnections();
      saveToHistory(patches);
  },

  updateShape: (id, diff, recordHistory = true) => {
      const { shapes, saveToHistory, spatialIndex, connectionNodes } = get();
      const oldShape = shapes[id];
      if (!oldShape) return;

      let newShape: Shape = { ...oldShape, ...diff };

      // If editing a conduit endpoint that is anchored or shared, detach to a new free node
      // to preserve the "edit this conduit only" behavior.
      const isConduit = (newShape.type === 'eletroduto' || newShape.type === 'conduit');
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
      const { shapes, electricalElements, diagramNodes, diagramEdges, saveToHistory, spatialIndex, connectionNodes } = get();
      const targetShape = shapes[id];
      if (!targetShape) return;

      const newShapes = { ...shapes };
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
        if (edgeShape) {
          delete newShapes[edgeShape.id];
          spatialIndex.remove(edgeShape);
        }
        if (edge) {
          delete newDiagramEdges[edge.id];
          patches.push({ type: 'DELETE', id: edge.shapeId, prev: edgeShape, diagramEdge: edge });
        }
      });

      delete newShapes[id];
      spatialIndex.remove(targetShape);
      patches.push({ type: 'DELETE', id, prev: targetShape, electricalElement, diagramNode });

      set({ shapes: newShapes, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges, connectionNodes: newConnectionNodes });
      saveToHistory(patches);
      get().syncConnections();
      get().syncDiagramEdgesGeometry();
  },

  createFreeConnectionNode: (position) => {
    const id = generateId();
    set((state) => ({ connectionNodes: { ...state.connectionNodes, [id]: { id, kind: 'free', position } } }));
    return id;
  },

  getOrCreateAnchoredConnectionNode: (shapeId) => {
    const { connectionNodes, shapes } = get();
    const existing = Object.values(connectionNodes).find((n) => n.kind === 'anchored' && n.anchorShapeId === shapeId);
    if (existing) return existing.id;

    const id = generateId();
    const node: ConnectionNode = { id, kind: 'anchored', anchorShapeId: shapeId };
    const pos = resolveConnectionNodePosition(node, shapes);
    set((state) => ({ connectionNodes: { ...state.connectionNodes, [id]: { ...node, position: pos ?? undefined } } }));
    return id;
  },

  addConduitBetweenNodes: ({ fromNodeId, toNodeId, layerId, strokeColor }) => {
    const data = get();
    const id = generateId();
    const fromNode = data.connectionNodes[fromNodeId];
    const toNode = data.connectionNodes[toNodeId];
    const start = fromNode ? (resolveConnectionNodePosition(fromNode, data.shapes) ?? fromNode.position) : null;
    const end = toNode ? (resolveConnectionNodePosition(toNode, data.shapes) ?? toNode.position) : null;
    const points: Point[] = start && end ? [start, end] : [];

    const fromConnectionId = fromNode?.kind === 'anchored' ? fromNode.anchorShapeId : undefined;
    const toConnectionId = toNode?.kind === 'anchored' ? toNode.anchorShapeId : undefined;

    data.addShape({
      id,
      layerId,
      type: 'eletroduto',
      strokeColor,
      strokeWidth: 2,
      strokeEnabled: true,
      fillColor: 'transparent',
      fillEnabled: false,
      colorMode: { stroke: 'layer', fill: 'layer' },
      points,
      fromNodeId,
      toNodeId,
      fromConnectionId,
      toConnectionId,
      connectedStartId: fromConnectionId,
      connectedEndId: toConnectionId,
    });
    return id;
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

  updateSharedElectricalProperties: (sourceElement, diff) => {
      set(state => {
          const updates: Record<string, ElectricalElement> = {};
          // Rule: "Conexões da mesma natureza compartilham o mesmo nome e descrição"
          // We identify "nature" by the current Name or the Symbol Name.
          // If we are changing the name, we want to update all elements that currently have the SAME name as the source.
          // Or if we are changing description, etc.
          // The requirement says: "Conexões da mesma natureza compartilham o mesmo nome e descrição. Alterar em uma deve refletir em todas do mesmo tipo"
          // This usually implies grouping by 'name' (e.g. all 'TUG's).

          // If 'name' is being changed, we find all elements with the OLD name.
          // If 'description' is being changed, we find all elements with the CURRENT name.

          const targetName = sourceElement.metadata?.name ?? sourceElement.name;

          Object.values(state.electricalElements).forEach(el => {
              const elName = el.metadata?.name ?? el.name;
              // Check if it matches the "nature" (same name) and same category
              if (elName === targetName && el.category === sourceElement.category) {
                   const mergedMetadata = { ...el.metadata, ...diff };
                   updates[el.id] = { ...el, metadata: mergedMetadata };
              }
          });

          return {
              electricalElements: { ...state.electricalElements, ...updates }
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
    const newId = generateLayerId(new Set(state.layers.map(l => l.id)));
    const newLayer: Layer = { id: newId, name: `Layer ${state.layers.length}`, strokeColor: '#000000', strokeEnabled: true, fillColor: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'), fillEnabled: true, visible: true, locked: false };
    return { layers: [...state.layers, newLayer], activeLayerId: newId };
  }),

  deleteLayer: (id) => {
    const { layers, shapes, activeLayerId, saveToHistory, spatialIndex, electricalElements, diagramNodes, diagramEdges } = get();
    const layerToDelete = layers.find(l => l.id === id);
    // Cannot delete: only layer, active layer, or native layers
    if (layers.length <= 1 || id === activeLayerId || layerToDelete?.isNative) return false;

    const newLayers = layers.filter(l => l.id !== id);
    const newShapes = { ...shapes };
    const newElectrical = { ...electricalElements };
    const newDiagramNodes = { ...diagramNodes };
    const newDiagramEdges = { ...diagramEdges };
    const edgeIdsToDrop = new Set<string>();
    const patches: Patch[] = [];

    Object.values(shapes).forEach((s: Shape) => {
      if (s.layerId === id) {
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
        patches.push({ type: 'DELETE', id: s.id, prev: s, electricalElement, diagramNode });
        delete newShapes[s.id];
        spatialIndex.remove(s);
      }
    });

    edgeIdsToDrop.forEach(edgeId => {
      const edge = diagramEdges[edgeId];
      const edgeShape = edge ? shapes[edge.shapeId] : undefined;
      if (edgeShape) {
        delete newShapes[edgeShape.id];
        spatialIndex.remove(edgeShape);
      }
      if (edge) {
        delete newDiagramEdges[edge.id];
        patches.push({ type: 'DELETE', id: edge.shapeId, prev: edgeShape, diagramEdge: edge });
      }
    });

    set({ layers: newLayers, shapes: newShapes, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges });

    if (patches.length > 0) {
      saveToHistory(patches);
    }
    get().syncDiagramEdgesGeometry();
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
    const { layers, shapes, saveToHistory, spatialIndex, electricalElements, diagramNodes, diagramEdges, connectionNodes } = get();
    if (ids.length === 0) return;

    const patches: Patch[] = [];
    const newShapes = { ...shapes };
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
        spatialIndex.remove(s);
        patches.push({ type: 'DELETE', id, prev: s, electricalElement, diagramNode });
    });

    edgeIdsToDrop.forEach(edgeId => {
      const edge = diagramEdges[edgeId];
      const edgeShape = edge ? shapes[edge.shapeId] : undefined;
      if (edgeShape) {
        delete newShapes[edgeShape.id];
        spatialIndex.remove(edgeShape);
      }
      if (edge) {
        delete newDiagramEdges[edge.id];
        patches.push({ type: 'DELETE', id: edge.shapeId, prev: edgeShape, diagramEdge: edge });
      }
    });

    if (patches.length > 0) {
        set({ shapes: newShapes, electricalElements: newElectrical, diagramNodes: newDiagramNodes, diagramEdges: newDiagramEdges, connectionNodes: newConnectionNodes });
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

  serializeProject: () => {
      const { layers, shapes, activeLayerId, electricalElements, connectionNodes, diagramNodes, diagramEdges } = get();
      return {
          layers: [...layers],
          shapes: Object.values(shapes),
          activeLayerId,
          electricalElements: Object.values(electricalElements),
          connectionNodes: Object.values(connectionNodes),
          diagramNodes: Object.values(diagramNodes),
          diagramEdges: Object.values(diagramEdges)
      };
  },

  ensureLayer: (name: string, defaults?: Partial<Omit<Layer, 'id' | 'name'>>) => {
      const { layers } = get();
      const existing = layers.find(l => l.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing.id;

      const existingIds = new Set(layers.map(l => l.id));
      const newId = generateLayerId(existingIds);
      const newLayer: Layer = {
        id: newId,
        name,
        strokeColor: defaults?.strokeColor ?? '#000000',
        strokeEnabled: defaults?.strokeEnabled ?? true,
        fillColor: defaults?.fillColor ?? '#ffffff',
        fillEnabled: defaults?.fillEnabled ?? true,
        visible: defaults?.visible ?? true,
        locked: defaults?.locked ?? false,
        isNative: defaults?.isNative,
      };

      set(state => ({ layers: [...state.layers, newLayer] }));
      return newId;
  },
}));

// Test helper (intended for unit tests)
export const __resetDataStoreForTests = () => {
  const initial = buildInitialState();
  useDataStore.setState({
    ...useDataStore.getState(),
    ...initial,
  }, true);
};
