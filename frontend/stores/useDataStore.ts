import { create } from 'zustand';
import { FrameSettings, Layer, Patch, SerializedProject, Shape, VectorSidecar, ElectricalElement, ConnectionNode, DiagramNode, DiagramEdge } from '../types';
import { QuadTree } from '../utils/spatial';
import { normalizeConnectionTopology, resolveConnectionNodePosition } from '../utils/connections';
import { normalizeShapeStyle, normalizeLayerStyle } from '../utils/storeNormalization';
import { migrateVectorSidecar } from '../utils/vectorSidecar';
import { getShapeCenter } from '../utils/geometry';

import { createShapeSlice, ShapeSlice } from './slices/shapeSlice';
import { createLayerSlice, LayerSlice } from './slices/layerSlice';
import { createHistorySlice, HistorySlice } from './slices/historySlice';
import { createElectricalSlice, ElectricalSlice } from './slices/electricalSlice';

// Initialize Quadtree outside to avoid reactivity loop, but accessible
const initialQuadTree = new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 });

export type DataState = ShapeSlice & LayerSlice & HistorySlice & ElectricalSlice & {
  // World Scale
  worldScale: number;

  // Layout frame
  frame: FrameSettings;

  // Vector IR sidecar
  vectorSidecar: VectorSidecar | null;

  // Spatial Index
  spatialIndex: QuadTree;

  // Sync Optimization
  dirtyShapeIds: Set<string>;
  clearDirtyShapeIds: () => void;

  // Document settings
  setWorldScale: (scale: number) => void;
  setFrameEnabled: (enabled: boolean) => void;
  setFrameSize: (widthMm: number, heightMm: number) => void;
  setFrameMargin: (marginMm: number) => void;

  // Serialization
  serializeProject: () => SerializedProject;
  resetDocument: () => void;
  loadSerializedProject: (params: {
    project: SerializedProject;
    worldScale: number;
    frame: FrameSettings;
    history?: { past: Patch[][]; future: Patch[][] };
  }) => void;

  // Helpers
  syncQuadTree: () => void;
  syncDiagramEdgesGeometry: () => void;
  syncConnections: () => void;
  ensureLayer: (name: string, defaults?: Partial<Omit<Layer, 'id' | 'name'>>) => string;

  setVectorSidecar: (sidecar: VectorSidecar | null) => void;
};

const buildInitialState = () => ({
  shapes: {} as Record<string, Shape>,
  shapeOrder: [] as string[],
  electricalElements: {} as Record<string, ElectricalElement>,
  connectionNodes: {} as Record<string, ConnectionNode>,
  diagramNodes: {} as Record<string, DiagramNode>,
  diagramEdges: {} as Record<string, DiagramEdge>,
  layers: [
    { id: 'desenho', name: 'Desenho', strokeColor: '#ffffff', strokeEnabled: true, fillColor: '#ffffff', fillEnabled: false, visible: true, locked: false, isNative: true },
  ] as Layer[],
  activeLayerId: 'desenho',
  worldScale: 100,
  frame: {
    enabled: false,
    widthMm: 297,
    heightMm: 210,
    marginMm: 10,
  },
  vectorSidecar: null,
  spatialIndex: new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 }),
  dirtyShapeIds: new Set<string>(),
  past: [] as Patch[][],
  future: [] as Patch[][],
});

export const useDataStore = create<DataState>()((...args) => {
  const [set, get] = args;

  return {
    ...createShapeSlice(...args),
    ...createLayerSlice(...args),
    ...createHistorySlice(...args),
    ...createElectricalSlice(...args),

    // Base state
    worldScale: 100,
    frame: {
      enabled: false,
      widthMm: 297,
      heightMm: 210,
      marginMm: 10,
    },
    vectorSidecar: null,
    spatialIndex: initialQuadTree,
    dirtyShapeIds: new Set<string>(),

    clearDirtyShapeIds: () => set({ dirtyShapeIds: new Set() }),

    // Document settings actions
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

    // Coordination
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

      Object.values(nextShapes).forEach((s) => {
        const prev = shapes[s.id];
        if (!prev) return;
        const isConduit = s.type === 'eletroduto';
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

    serializeProject: () => {
        const { layers, shapes, shapeOrder, activeLayerId, electricalElements, connectionNodes, diagramNodes, diagramEdges, vectorSidecar } = get();
        const ordered: Shape[] = [];
        const seen = new Set<string>();
        for (const id of shapeOrder) {
          const s = shapes[id];
          if (!s) continue;
          ordered.push(s);
          seen.add(id);
        }
        const missing = Object.keys(shapes).filter((id) => !seen.has(id)).sort((a, b) => a.localeCompare(b));
        for (const id of missing) ordered.push(shapes[id]!);
        const base = {
            layers: [...layers],
            shapes: ordered,
            activeLayerId,
            electricalElements: Object.values(electricalElements),
            connectionNodes: Object.values(connectionNodes),
            diagramNodes: Object.values(diagramNodes),
            diagramEdges: Object.values(diagramEdges)
        };
        return vectorSidecar ? { ...base, vectorSidecar } : base;
    },

    resetDocument: () => {
      const initial = buildInitialState();
      set({ ...initial });
    },

    loadSerializedProject: ({ project, worldScale, frame, history }) => {
      const nextShapes = Object.fromEntries(project.shapes.map((s) => [s.id, normalizeShapeStyle(s)]));
      const nextShapeOrder = project.shapes.map((s) => s.id);
      const nextElectrical = Object.fromEntries(project.electricalElements.map((e) => [e.id, e]));
      const nextNodes = Object.fromEntries(project.connectionNodes.map((n) => [n.id, n]));
      const nextDiagramNodes = Object.fromEntries(project.diagramNodes.map((n) => [n.id, n]));
      const nextDiagramEdges = Object.fromEntries(project.diagramEdges.map((e) => [e.id, e]));
      const vectorSidecar = migrateVectorSidecar(project.vectorSidecar);

      const spatialIndex = new QuadTree({ x: -100000, y: -100000, width: 200000, height: 200000 });
      Object.values(nextShapes).forEach((shape) => spatialIndex.insert(shape));

      set({
        layers: project.layers.map(normalizeLayerStyle),
        shapes: nextShapes,
        shapeOrder: nextShapeOrder,
        electricalElements: nextElectrical,
        connectionNodes: nextNodes,
        diagramNodes: nextDiagramNodes,
        diagramEdges: nextDiagramEdges,
        activeLayerId: project.activeLayerId,
        worldScale,
        frame,
        vectorSidecar,
        spatialIndex,
        dirtyShapeIds: new Set(Object.keys(nextShapes)), // Mark all as dirty on load
        past: history?.past ?? [],
        future: history?.future ?? [],
      });

      get().syncConnections();
      get().syncDiagramEdgesGeometry();
    },

    ensureLayer: (name: string, defaults?: Partial<Omit<Layer, 'id' | 'name'>>) => {
        const { layers } = get();
        const existing = layers.find(l => l.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing.id;

        const { addLayer, updateLayer } = get();
        // Since we need to return the ID, and addLayer doesn't return it directly in slice...
        // We will implement logic here or rely on slice implementation if possible.
        // Slice implementation uses generateLayerId. We can reuse the logic here to match.
        // But better to use the slice method if it allowed custom ID or returned it.
        // The slice method `addLayer` generates internal ID and updates state. It doesn't accept params.

        // So we implement specific logic here as this is a "coordination" helper.
        // Note: We need to import `generateLayerId` logic or replicate it.
        // Since it's internal to module, we replicate or refactor.
        // For now, simple replication of logic:

        // Replicating generateLayerId locally
        const _generateId = () => Math.random().toString(36).substr(2, 9);
        const _genLayerId = (ids: Set<string>) => {
            let id = _generateId();
            while(ids.has(id)) id = _generateId();
            return id;
        };

        const existingIds = new Set(layers.map(l => l.id));
        const newId = _genLayerId(existingIds);

        const newLayerRaw: Layer = {
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

        const newLayer = normalizeLayerStyle(newLayerRaw);
        set(state => ({ layers: [...state.layers, newLayer] }));
        return newId;
    },

    setVectorSidecar: (sidecar) => set({ vectorSidecar: sidecar }),
  };
});

// Test helper (intended for unit tests)
export const __resetDataStoreForTests = () => {
  const initial = buildInitialState();
  useDataStore.setState({
    ...useDataStore.getState(),
    ...initial,
  }, true);
};
