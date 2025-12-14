import { Shape } from '../types';

interface ViewContext {
  activeFloorId: string;
  activeDiscipline: 'architecture' | 'electrical';
}

export const isShapeVisible = (shape: Shape, context: ViewContext): boolean => {
  const shapeFloor = shape.floorId || 'terreo'; // Default legacy
  if (shapeFloor !== context.activeFloorId) return false;

  const shapeDiscipline = shape.discipline || 'electrical'; // Default legacy

  // Architecture Mode: Show ONLY Architecture
  if (context.activeDiscipline === 'architecture') {
    return shapeDiscipline === 'architecture';
  }

  // Electrical Mode: Show Architecture (Background) + Electrical (Foreground)
  return true; 
};

export const isShapeInteractable = (shape: Shape, context: ViewContext): boolean => {
  const shapeFloor = shape.floorId || 'terreo';
  if (shapeFloor !== context.activeFloorId) return false;

  const shapeDiscipline = shape.discipline || 'electrical';

  // Strict Isolation: Can only select/edit shapes of the ACTIVE discipline
  return shapeDiscipline === context.activeDiscipline;
};

export const isShapeSnappable = (shape: Shape, context: ViewContext): boolean => {
  // Snappable if visible (reference layers are snappable but not interactable)
  return isShapeVisible(shape, context);
};
