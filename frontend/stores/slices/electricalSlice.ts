import { StateCreator } from 'zustand';
import type { ElectricalElement, ConnectionNode, DiagramNode, DiagramEdge, Point } from '@/types';
import { DataState } from '../useDataStore';
import { generateId } from '@/utils/uuid';
import { resolveConnectionNodePosition, normalizeConnectionTopology } from '@/utils/connections';

export interface ElectricalSlice {
  electricalElements: Record<string, ElectricalElement>;
  connectionNodes: Record<string, ConnectionNode>;
  diagramNodes: Record<string, DiagramNode>;
  diagramEdges: Record<string, DiagramEdge>;
  addElectricalElement: (element: ElectricalElement) => void;
  updateElectricalElement: (id: string, diff: Partial<ElectricalElement>) => void;
  updateSharedElectricalProperties: (sourceElement: ElectricalElement, diff: Partial<ElectricalElement>) => void;
  deleteElectricalElement: (id: string) => void;
  createFreeConnectionNode: (position: Point) => string;
  getOrCreateAnchoredConnectionNode: (shapeId: string) => string;
  addConduitBetweenNodes: (params: { fromNodeId: string; toNodeId: string; layerId: string; strokeColor: string; floorId?: string; discipline?: 'architecture' | 'electrical' }) => string;
}

export const createElectricalSlice: StateCreator<
  DataState,
  [],
  [],
  ElectricalSlice
> = (set, get) => ({
  electricalElements: {},
  connectionNodes: {},
  diagramNodes: {},
  diagramEdges: {},

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

    data.addShape({
      id,
      layerId,
      type: 'eletroduto',
      strokeColor,
      strokeWidth: 2,
      strokeEnabled: true,
      fillColor: '#ffffff',
      fillEnabled: false,
      colorMode: { stroke: 'layer', fill: 'layer' },
      points,
      fromNodeId,
      toNodeId,
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
          const targetName = sourceElement.metadata?.name ?? sourceElement.name;

          Object.values(state.electricalElements).forEach(el => {
              const elName = el.metadata?.name ?? el.name;
              if (elName === targetName && el.category === sourceElement.category) {
                   const mergedMetadata = { ...el.metadata, ...diff } as ElectricalElement['metadata'];
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
});
