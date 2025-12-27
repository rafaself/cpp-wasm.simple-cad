import { StateCreator } from 'zustand';
import type { Shape, Point } from '@/types';
import { DataState } from '../useDataStore';
import { normalizeShapeStyle } from '../../utils/storeNormalization';
import { getCombinedBounds, getShapeBounds, getShapeBoundingBox, getShapeCenter, rotatePoint } from '@/utils/geometry';

export interface ShapeSlice {
  shapes: Record<string, Shape>;
  shapeOrder: string[];
  addShape: (shape: Shape) => void;
  addShapes: (shapes: Shape[]) => void;
  updateShape: (id: string, diff: Partial<Shape>, optionsOrRecordHistory?: boolean | { recordHistory?: boolean; skipConnectionSync?: boolean }) => void;
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

  addShape: (shape) => {
      const { shapes, shapeOrder, dirtyShapeIds } = get();

      const linkedShape = normalizeShapeStyle(shape);
      const newShapes = { ...shapes, [linkedShape.id]: linkedShape };
      const newShapeOrder = shapeOrder.includes(linkedShape.id) ? shapeOrder : [...shapeOrder, linkedShape.id];

      const newDirty = new Set(dirtyShapeIds);
      newDirty.add(linkedShape.id);

      set({ shapes: newShapes, shapeOrder: newShapeOrder, dirtyShapeIds: newDirty });
  },

  addShapes: (shapesToAdd) => {
      const { shapes, shapeOrder, dirtyShapeIds } = get();
      const newShapes = { ...shapes };
      const newShapeOrder = [...shapeOrder];
      const newDirty = new Set(dirtyShapeIds);

      shapesToAdd.forEach(shape => {
          const normalized = normalizeShapeStyle(shape);
          newShapes[normalized.id] = normalized;
          if (!newShapeOrder.includes(normalized.id)) newShapeOrder.push(normalized.id);
          newDirty.add(normalized.id);
      });

      set({ shapes: newShapes, shapeOrder: newShapeOrder, dirtyShapeIds: newDirty });
  },

  updateShape: (id, diff, _optionsOrRecordHistory = true) => {
      const { shapes, dirtyShapeIds } = get();
      const oldShape = shapes[id];
      if (!oldShape) return;

      let newShape: Shape = normalizeShapeStyle({ ...oldShape, ...diff });

      const newShapes = { ...shapes, [id]: newShape };
      const newDirty = new Set(dirtyShapeIds);
      newDirty.add(id);

      set({ shapes: newShapes, dirtyShapeIds: newDirty });

  },

  deleteShape: (id) => {
      const { shapes, shapeOrder } = get();
      const targetShape = shapes[id];
      if (!targetShape) return;

      const newShapes = { ...shapes };
      const orderIndex = shapeOrder.indexOf(id);
      const newShapeOrder = orderIndex >= 0 ? shapeOrder.filter((sid) => sid !== id) : shapeOrder;
      delete newShapes[id];

      const finalOrder = newShapeOrder.filter((sid) => !!newShapes[sid]);

      set({ shapes: newShapes, shapeOrder: finalOrder });
  },

  alignSelected: (ids, alignment) => {
    const { shapes, updateShape } = get();
    if (ids.length < 2) return;
    const selectedList = ids.map((id: string) => shapes[id]).filter(s => !!s);
    const combinedBounds = getCombinedBounds(selectedList);
    if (!combinedBounds) return;

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
        updateShape(s.id, diff, false);
    });
  },

  deleteShapes: (ids) => {
    const { shapes, shapeOrder } = get();
    if (ids.length === 0) return;

    const newShapes = { ...shapes };
    let newShapeOrder = [...shapeOrder];

    ids.forEach(id => {
        const s = shapes[id];
        if (!s) return;

        delete newShapes[id];
        if (newShapeOrder.includes(id)) newShapeOrder = newShapeOrder.filter((sid) => sid !== id);
        const orderIndex = shapeOrder.indexOf(id);
    });

    newShapeOrder = newShapeOrder.filter((sid) => !!newShapes[sid]);
    set({ shapes: newShapes, shapeOrder: newShapeOrder });
  },

  rotateSelected: (ids, pivot, angle) => {
     const { shapes, updateShape } = get();
     if (ids.length === 0) return;
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
         updateShape(id, diff, false);
     });
  },
});
