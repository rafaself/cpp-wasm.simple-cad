import { Shape } from '../types';

interface ViewContext {
  activeFloorId?: string;
}

const isOnActiveFloor = (shape: Shape, context: ViewContext): boolean => {
  const shapeFloor = shape.floorId || 'terreo';
  if (!context.activeFloorId) return true;
  return shapeFloor === context.activeFloorId;
};

export const isShapeVisible = (shape: Shape, context: ViewContext): boolean => {
  return isOnActiveFloor(shape, context);
};

export const isShapeInteractable = (shape: Shape, context: ViewContext): boolean => {
  return isOnActiveFloor(shape, context);
};

export const isShapeSnappable = (shape: Shape, context: ViewContext): boolean => {
  return isShapeVisible(shape, context);
};
