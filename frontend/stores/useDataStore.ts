import { create } from 'zustand';
import { FrameSettings, Layer, SerializedProject, Shape, VectorSidecar } from '../types';
import { QuadTree } from '../utils/spatial';
import { normalizeShapeStyle, normalizeLayerStyle } from '../utils/storeNormalization';
import { migrateVectorSidecar } from '../utils/vectorSidecar';

import { createShapeSlice, ShapeSlice } from './slices/shapeSlice';
import { createLayerSlice, LayerSlice } from './slices/layerSlice';
export type DataState = ShapeSlice & LayerSlice & {
  // World Scale
  worldScale: number;

  // Layout frame
  frame: FrameSettings;

  // Vector IR sidecar
  vectorSidecar: VectorSidecar | null;

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
  }) => void;

  // Helpers
  ensureLayer: (name: string, defaults?: Partial<Omit<Layer, 'id' | 'name'>>) => string;

  setVectorSidecar: (sidecar: VectorSidecar | null) => void;
};

const buildInitialState = () => ({
  shapes: {} as Record<string, Shape>,
  shapeOrder: [] as string[],
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
  dirtyShapeIds: new Set<string>(),
});

export const useDataStore = create<DataState>()((...args) => {
  const [set, get] = args;

  return {
    ...createShapeSlice(...args),
    ...createLayerSlice(...args),

    // Base state
    worldScale: 100,
    frame: {
      enabled: false,
      widthMm: 297,
      heightMm: 210,
      marginMm: 10,
    },
    vectorSidecar: null,
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

    serializeProject: () => {
        const { layers, shapes, shapeOrder, activeLayerId, vectorSidecar } = get();
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
            activeLayerId
        };
        return vectorSidecar ? { ...base, vectorSidecar } : base;
    },

    resetDocument: () => {
      const initial = buildInitialState();
      set({ ...initial });
    },

    loadSerializedProject: ({ project, worldScale, frame }) => {
      // Data Migration: Explicitly ignore legacy electrical fields (electricalElements, connectionNodes, diagramNodes, diagramEdges)
      // They are simply dropped here as they are not part of the new state schema.

      const nextShapes = Object.fromEntries(project.shapes.map((s) => {
          // Strip electrical properties from shapes if they exist in legacy data
          const {
              // @ts-ignore - explicitly ignoring removed fields
              electricalElementId, connectionPoint, controlPoint, fromNodeId, toNodeId, diagramNodeId, diagramEdgeId, discipline,
              ...cleanShape
          } = s;

          return [cleanShape.id, normalizeShapeStyle(cleanShape as Shape)];
      }));

      const nextShapeOrder = project.shapes.map((s) => s.id);
      const vectorSidecar = migrateVectorSidecar(project.vectorSidecar);

      set({
        layers: project.layers.map(normalizeLayerStyle),
        shapes: nextShapes,
        shapeOrder: nextShapeOrder,
        activeLayerId: project.activeLayerId,
        worldScale,
        frame,
        vectorSidecar,
        dirtyShapeIds: new Set(Object.keys(nextShapes)), // Mark all as dirty on load
      });
    },

    ensureLayer: (name: string, defaults?: Partial<Omit<Layer, 'id' | 'name'>>) => {
        const { layers } = get();
        const existing = layers.find(l => l.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing.id;

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
