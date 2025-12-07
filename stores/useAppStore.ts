import { create } from 'zustand';
import { Layer, Shape, SnapOptions, ToolType, ViewTransform, Point } from '../types';
import { getDistance, getCombinedBounds, getShapeBounds, rotatePoint } from '../utils/geometry';

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
  isSettingsModalOpen: boolean;
  
  // Text Settings
  textSize: number;
  fontFamily: string;
  fontBold: boolean;
  fontItalic: boolean;
  fontUnderline: boolean;
  fontStrike: boolean;
  
  // Grid Settings
  gridSize: number;
  gridColor: string;
  
  // Canvas Data
  shapes: Shape[];
  layers: Layer[];
  activeLayerId: string;
  selectedShapeIds: Set<string>;
  snapOptions: SnapOptions;
  
  // History
  past: Shape[][];
  future: Shape[][];
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Actions
  setTool: (tool: ToolType) => void;
  setViewTransform: (transform: ViewTransform | ((prev: ViewTransform) => ViewTransform)) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setMousePos: (pos: Point | null) => void;
  setPolygonSides: (sides: number) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setFillColor: (color: string) => void;
  setSettingsModalOpen: (isOpen: boolean) => void;
  setGridSize: (size: number) => void;
  setGridColor: (color: string) => void;
  
  // Text Actions
  setTextSize: (size: number) => void;
  setFontFamily: (font: string) => void;
  toggleFontBold: () => void;
  toggleFontItalic: () => void;
  toggleFontUnderline: () => void;
  toggleFontStrike: () => void;
  
  addShape: (shape: Shape) => void;
  updateShapes: (updater: (prev: Shape[]) => Shape[]) => void;
  
  // Layer Actions
  setActiveLayerId: (id: string) => void;
  addLayer: () => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  
  // Selection Actions
  setSelectedShapeIds: (ids: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  alignSelected: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  
  // Modify Actions
  deleteSelected: () => void;
  joinSelected: () => void;
  explodeSelected: () => void;
  rotateSelected: (pivot: Point, angle: number) => void;
  
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
  isSettingsModalOpen: false,
  
  // Text defaults
  textSize: 20,
  fontFamily: 'sans-serif',
  fontBold: false,
  fontItalic: false,
  fontUnderline: false,
  fontStrike: false,
  
  gridSize: 50,
  gridColor: '#e5e7eb',
  
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
  
  past: [],
  future: [],

  saveHistory: () => {
    const { shapes, past } = get();
    // Limit history size to 50 steps
    const newPast = [...past, shapes];
    if (newPast.length > 50) newPast.shift();
    set({ past: newPast, future: [] });
  },

  undo: () => set((state) => {
    if (state.past.length === 0) return {};
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, -1);
    return {
      shapes: previous,
      past: newPast,
      future: [state.shapes, ...state.future]
    };
  }),

  redo: () => set((state) => {
    if (state.future.length === 0) return {};
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return {
      shapes: next,
      past: [...state.past, state.shapes],
      future: newFuture
    };
  }),

  setTool: (tool) => set({ activeTool: tool }),
  setViewTransform: (transform) => set((state) => ({ 
    viewTransform: typeof transform === 'function' ? transform(state.viewTransform) : transform 
  })),
  setCanvasSize: (size) => set({ canvasSize: size }),
  setMousePos: (pos) => set({ mousePos: pos }),
  setPolygonSides: (sides) => set({ polygonSides: sides }),
  setSettingsModalOpen: (isOpen) => set({ isSettingsModalOpen: isOpen }),
  setGridSize: (size) => set({ gridSize: size }),
  setGridColor: (color) => set({ gridColor: color }),
  
  setStrokeColor: (color) => {
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    set({ strokeColor: color });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) ? { ...s, strokeColor: color } : s) });
    }
  },
  
  setStrokeWidth: (width) => {
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    set({ strokeWidth: width });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) ? { ...s, strokeWidth: width } : s) });
    }
  },
  
  setFillColor: (color) => {
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    set({ fillColor: color });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) ? { ...s, fillColor: color } : s) });
    }
  },

  setTextSize: (size) => {
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    set({ textSize: size });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) && s.type === 'text' ? { ...s, fontSize: size } : s) });
    }
  },

  setFontFamily: (font) => {
    const { selectedShapeIds, shapes } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    set({ fontFamily: font });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) && s.type === 'text' ? { ...s, fontFamily: font } : s) });
    }
  },

  toggleFontBold: () => {
    const { selectedShapeIds, shapes, fontBold } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    const newVal = !fontBold;
    set({ fontBold: newVal });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) && s.type === 'text' ? { ...s, fontBold: newVal } : s) });
    }
  },

  toggleFontItalic: () => {
    const { selectedShapeIds, shapes, fontItalic } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    const newVal = !fontItalic;
    set({ fontItalic: newVal });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) && s.type === 'text' ? { ...s, fontItalic: newVal } : s) });
    }
  },

  toggleFontUnderline: () => {
    const { selectedShapeIds, shapes, fontUnderline } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    const newVal = !fontUnderline;
    set({ fontUnderline: newVal });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) && s.type === 'text' ? { ...s, fontUnderline: newVal } : s) });
    }
  },

  toggleFontStrike: () => {
    const { selectedShapeIds, shapes, fontStrike } = get();
    if (selectedShapeIds.size > 0) get().saveHistory();
    const newVal = !fontStrike;
    set({ fontStrike: newVal });
    if (selectedShapeIds.size > 0) {
        set({ shapes: shapes.map(s => selectedShapeIds.has(s.id) && s.type === 'text' ? { ...s, fontStrike: newVal } : s) });
    }
  },

  addShape: (shape) => {
      get().saveHistory();
      set((state) => ({ shapes: [...state.shapes, shape] }));
  },
  
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

  alignSelected: (alignment) => {
    const { selectedShapeIds, shapes, saveHistory } = get();
    if (selectedShapeIds.size < 2) return;

    const selectedShapes = shapes.filter(s => selectedShapeIds.has(s.id));
    const combinedBounds = getCombinedBounds(selectedShapes);
    
    if (!combinedBounds) return;

    saveHistory();

    set(state => ({
      shapes: state.shapes.map(s => {
        if (!selectedShapeIds.has(s.id)) return s;
        
        const bounds = getShapeBounds(s);
        if (!bounds) return s;

        let dx = 0;
        let dy = 0;

        switch (alignment) {
          case 'left':
            dx = combinedBounds.x - bounds.x;
            break;
          case 'center':
            const targetCenterX = combinedBounds.x + combinedBounds.width / 2;
            const currentCenterX = bounds.x + bounds.width / 2;
            dx = targetCenterX - currentCenterX;
            break;
          case 'right':
            const targetRight = combinedBounds.x + combinedBounds.width;
            const currentRight = bounds.x + bounds.width;
            dx = targetRight - currentRight;
            break;
          case 'top':
            dy = combinedBounds.y - bounds.y;
            break;
          case 'middle':
            const targetCenterY = combinedBounds.y + combinedBounds.height / 2;
            const currentCenterY = bounds.y + bounds.height / 2;
            dy = targetCenterY - currentCenterY;
            break;
          case 'bottom':
            const targetBottom = combinedBounds.y + combinedBounds.height;
            const currentBottom = bounds.y + bounds.height;
            dy = targetBottom - currentBottom;
            break;
        }

        if (dx === 0 && dy === 0) return s;

        const n = { ...s };
        if (n.x !== undefined) n.x += dx;
        if (n.y !== undefined) n.y += dy;
        if (n.points) {
          n.points = n.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        }
        return n;
      })
    }));
  },

  deleteSelected: () => {
    get().saveHistory();
    set((state) => {
        const { selectedShapeIds, layers, shapes } = state;
        if (selectedShapeIds.size > 0) {
            const newShapes = shapes.filter(s => {
            if (!selectedShapeIds.has(s.id)) return true;
            const l = layers.find(lay => lay.id === s.layerId);
            return l && l.locked; 
            });
            return { shapes: newShapes, selectedShapeIds: new Set() };
        }
        return {}; 
    });
  },

  explodeSelected: () => {
    get().saveHistory();
    set((state) => {
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
    });
  },

  joinSelected: () => {
    get().saveHistory();
    set((state) => {
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
    });
  },

  rotateSelected: (pivot: Point, angle: number) => {
      get().saveHistory();
      set((state) => {
          const { selectedShapeIds, shapes } = state;
          if (selectedShapeIds.size === 0) return {};
          
          const newShapes = shapes.map(s => {
              if (!selectedShapeIds.has(s.id)) return s;
              const l = state.layers.find(lay => lay.id === s.layerId);
              if (l && l.locked) return s;

              const n = { ...s };

              // For primitives defined by points (Line, Polyline, Measure)
              if (n.points && n.points.length > 0) {
                  n.points = n.points.map(p => rotatePoint(p, pivot, angle));
              }

              // For primitives defined by origin (Text, Circle, Polygon, Rect)
              if (n.x !== undefined && n.y !== undefined) {
                  const rotatedOrigin = rotatePoint({x: n.x, y: n.y}, pivot, angle);
                  n.x = rotatedOrigin.x;
                  n.y = rotatedOrigin.y;
              }

              // Special handling for Rect
              if (n.type === 'rect' && n.width && n.height) {
                  n.rotation = (n.rotation || 0) + angle;
              }
              
              if (n.type === 'text') {
                  n.rotation = (n.rotation || 0) + angle;
              }

              return n;
          });

          return { shapes: newShapes };
      });
  },

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