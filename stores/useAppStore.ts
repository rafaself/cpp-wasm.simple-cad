import { create } from 'zustand';
import { Layer, Shape, SnapOptions, ToolType, ViewTransform, Point } from '../types';
import { getDistance, getCombinedBounds } from '../utils/geometry';

interface AppState {
  // UI State
  activeTool: ToolType;
  viewTransform: ViewTransform;
  mousePos: Point | null;
  polygonSides: number;
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  canvasSize: { width: number; height: number };
  
  // Canvas Data
  shapes: Shape[];
  layers: Layer[];
  activeLayerId: string;
  selectedShapeIds: Set<string>;
  snapOptions: SnapOptions;

  // Actions
  setTool: (tool: ToolType) => void;
  setViewTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setMousePos: (pos: Point | null) => void;
  setPolygonSides: (sides: number) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFillColor: (color: string) => void;
  
  addShape: (shape: Shape) => void;
  updateShapes: (updater: (prev: Shape[]) => Shape[]) => void;
  
  // Layer Actions
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  
  // Selection Actions
  setSelectedShapeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  
  // Modify Actions
  deleteSelected: () => void;
  joinSelected: () => void;
  explodeSelected: () => void;
  
  // View Actions
  zoomToFit: () => void;
  
  // Snap
  setSnapOptions: (updater: (prev: SnapOptions) => SnapOptions) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTool: 'select',
  viewTransform: { x: 0, y: 0, scale: 1 },
  mousePos: null,
  polygonSides: 5,
  strokeColor: '#000000',
  strokeWidth: 2,
  fillColor: 'transparent',
  canvasSize: { width: 0, height: 0 },
  
  shapes: [],
  layers: [{ id: '0', name: 'Layer 0', color: '#ffffff', visible: true, locked: false }],
  activeLayerId: '0',
  selectedShapeIds: new Set(),
  snapOptions: {
    enabled: true,
    endpoint: true,
    midpoint: true,
    center: true,
    nearest: false
  },

  setTool: (tool) => set({ activeTool: tool }),
  setViewTransform: (transform) => set((state) => ({ 
    viewTransform: typeof transform === 'function' ? transform(state.viewTransform) : transform 
  })),
  setCanvasSize: (size) => set({ canvasSize: size }),
  setMousePos: (pos) => set({ mousePos: pos }),
  setPolygonSides: (sides) => set({ polygonSides: sides }),
  setStrokeColor: (color) => {
    set({ strokeColor: color });
    // Update selected shapes immediately
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) ? { ...s, strokeColor: color } : s) });
    }
  },
  setStrokeWidth: (width) => {
    set({ strokeWidth: width });
    // Update selected shapes immediately
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) ? { ...s, strokeWidth: width } : s) });
    }
  },
  setFillColor: (color) => {
    set({ fillColor: color });
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) ? { ...s, fillColor: color } : s) });
    }
  },

  addShape: (shape) => set((state) => ({ shapes: [...state.shapes, shape] })),
  updateShapes: (updater) => set((state) => ({ shapes: updater(state.shapes) })),

  setActiveLayerId: (id) => set({ activeLayerId: id }),
  addLayer: () => set((state) => {
    const newId = Date.now().toString();
    const newLayer: Layer = {
      id: newId,
      name: `Layer ${state.layers.length}`,
      color: '#' + Math.floor(Math.random()*16777215).toString(16),
      visible: true,
      locked: false
    };
    return { layers: [...state.layers, newLayer], activeLayerId: newId };
  }),
  toggleLayerVisibility: (id) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
  })),
  toggleLayerLock: (id) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l)
  })),

  setSelectedShapeIds: (ids) => set((state) => ({
    selectedShapeIds: typeof ids === 'function' ? ids(state.selectedShapeIds) : ids
  })),

  deleteSelected: () => set((state) => {
    const { selectedShapeIds, layers, shapes } = state;
    if (selectedShapeIds.size > 0) {
        const newShapes = shapes.filter(s => {
           if (!selectedShapeIds.has(s.id)) return true;
           const l = layers.find(lay => lay.id === s.layerId);
           return l && l.locked; // Don't delete if locked
        });
        return { shapes: newShapes, selectedShapeIds: new Set() };
    }
    return {}; 
  }),

  explodeSelected: () => set((state) => {
    if (state.selectedShapeIds.size === 0) return {};
    
    const newShapes: Shape[] = [];
    const idsToDelete = new Set<string>();
    
    state.shapes.forEach(shape => {
      if (!state.selectedShapeIds.has(shape.id)) return;
      const l = state.layers.find(lay => lay.id === shape.layerId);
      if (l && l.locked) return;

      idsToDelete.add(shape.id);

      if (shape.type === 'rect' && shape.width && shape.height && shape.x !== undefined && shape.y !== undefined) {
         const p1 = { x: shape.x, y: shape.y };
         const p2 = { x: shape.x + shape.width, y: shape.y };
         const p3 = { x: shape.x + shape.width, y: shape.y + shape.height };
         const p4 = { x: shape.x, y: shape.y + shape.height };
         const lines = [[p1, p2], [p2, p3], [p3, p4], [p4, p1]];
         lines.forEach(pts => {
            newShapes.push({
               id: Math.random().toString(), layerId: shape.layerId, type: 'line', points: pts,
               strokeColor: shape.strokeColor, strokeWidth: shape.strokeWidth, fillColor: 'transparent'
            });
         });
      }
      else if (shape.type === 'polyline' && shape.points.length > 1) {
         for (let i = 0; i < shape.points.length - 1; i++) {
            newShapes.push({
               id: Math.random().toString(), layerId: shape.layerId, type: 'line', points: [shape.points[i], shape.points[i+1]],
               strokeColor: shape.strokeColor, strokeWidth: shape.strokeWidth, fillColor: 'transparent'
            });
         }
      }
      else if (shape.type === 'polygon' && shape.sides && shape.radius && shape.x !== undefined && shape.y !== undefined) {
          const angleStep = (Math.PI * 2) / shape.sides;
          const startAngle = -Math.PI / 2;
          const pts = [];
          for (let i = 0; i <= shape.sides; i++) {
             pts.push({
               x: shape.x + shape.radius * Math.cos(startAngle + i * angleStep),
               y: shape.y + shape.radius * Math.sin(startAngle + i * angleStep)
             });
          }
          for (let i = 0; i < pts.length - 1; i++) {
             newShapes.push({
               id: Math.random().toString(), layerId: shape.layerId, type: 'line', points: [pts[i], pts[i+1]],
               strokeColor: shape.strokeColor, strokeWidth: shape.strokeWidth, fillColor: 'transparent'
             });
          }
      } 
      else {
         idsToDelete.delete(shape.id);
      }
    });

    if (idsToDelete.size > 0) {
       return { 
           shapes: [...state.shapes.filter(s => !idsToDelete.has(s.id)), ...newShapes],
           selectedShapeIds: new Set()
       };
    }
    return {};
  }),

  joinSelected: () => set((state) => {
    if (state.selectedShapeIds.size < 2) return {};
    const candidates = state.shapes.filter(s => state.selectedShapeIds.has(s.id) && (s.type === 'line' || s.type === 'polyline'));
    if (candidates.length < 2) return {};

    const allPoints: Point[] = [];
    candidates.forEach(s => { if(s.points) allPoints.push(...s.points); });
    
    const uniquePoints = allPoints.filter((p, i) => {
       if (i === 0) return true;
       const prev = allPoints[i-1];
       return getDistance(p, prev) > 0.1;
    });

    const newPoly: Shape = {
       id: Date.now().toString(),
       layerId: state.activeLayerId,
       type: 'polyline',
       points: uniquePoints,
       strokeColor: candidates[0].strokeColor,
       strokeWidth: candidates[0].strokeWidth,
       fillColor: 'transparent'
    };

    return {
       shapes: [...state.shapes.filter(s => !state.selectedShapeIds.has(s.id)), newPoly],
       selectedShapeIds: new Set([newPoly.id])
    };
  }),

  zoomToFit: () => set((state) => {
    const { canvasSize, shapes, selectedShapeIds, layers } = state;
    if (canvasSize.width === 0 || canvasSize.height === 0) return {};

    let targets = shapes.filter(s => {
         const l = layers.find(lay => lay.id === s.layerId);
         return l && l.visible;
    });

    if (selectedShapeIds.size > 0) {
        const selected = targets.filter(s => selectedShapeIds.has(s.id));
        if (selected.length > 0) targets = selected;
    }

    if (targets.length === 0) {
        return { viewTransform: { x: 0, y: 0, scale: 1 } };
    }

    const bounds = getCombinedBounds(targets);
    if (!bounds) return {};

    const padding = 50;
    const availableW = canvasSize.width - padding * 2;
    const availableH = canvasSize.height - padding * 2;
    
    // Protect against zero width/height
    if (bounds.width === 0) bounds.width = 1;
    if (bounds.height === 0) bounds.height = 1;

    const scaleX = availableW / bounds.width;
    const scaleY = availableH / bounds.height;
    const scale = Math.min(scaleX, scaleY, 50);

    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    const newX = (canvasSize.width / 2) - (centerX * scale);
    const newY = (canvasSize.height / 2) - (centerY * scale);

    return { viewTransform: { x: newX, y: newY, scale } };
  }),

  setSnapOptions: (updater) => set((state) => ({ snapOptions: updater(state.snapOptions) })),
}));