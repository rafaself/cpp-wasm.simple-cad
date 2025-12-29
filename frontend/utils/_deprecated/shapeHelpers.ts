/**
 * @deprecated LEGACY CODE — NOT IN USE
 * 
 * Este arquivo contém helpers para o tipo Shape legado.
 * NÃO É UTILIZADO no código atual — o engine C++ é a fonte de verdade.
 * 
 * Mantido em _deprecated/ caso seja necessário para:
 * - Referência histórica
 * - Possível reutilização em pipeline de import futuro
 * 
 * @see AGENTS.md seção "Engine-First Architecture"
 * @see docs/agents/audit-action-plan.md
 */

import { Shape, Layer } from '../../types';

/**
 * Gets a shape if it exists (engine handles locked state).
 * Returns null if shape doesn't exist.
 */
export const getEditableShape = (
  id: string,
  shapes: Record<string, Shape>,
  _layers: Layer[]
): Shape | null => {
  const shape = shapes[id];
  if (!shape) return null;

  return shape;
};

/**
 * Gets a shape and its layer if both exist.
 */
export const getShapeWithLayer = (
  id: string,
  shapes: Record<string, Shape>,
  layers: Layer[]
): { shape: Shape; layer: Layer | undefined } | null => {
  const shape = shapes[id];
  if (!shape) return null;

  const layer = layers.find(l => l.id === shape.layerId);
  return { shape, layer };
};

/**
 * Checks if a shape is visible (layer is visible).
 */
export const isShapeVisible = (shape: Shape, layers: Layer[]): boolean => {
  const layer = layers.find(l => l.id === shape.layerId);
  return layer ? layer.visible : true;
};

/**
 * Filters an array of shape IDs to only include editable shapes.
 */
export const filterEditableIds = (
  ids: string[],
  shapes: Record<string, Shape>,
  layers: Layer[]
): string[] => {
  return ids.filter(id => getEditableShape(id, shapes, layers) !== null);
};

/**
 * Gets the first selected shape from a Set of IDs.
 */
export const getFirstSelectedShape = (
  selectedIds: Set<string>,
  shapes: Record<string, Shape>
): Shape | null => {
  const firstId = selectedIds.values().next().value;
  if (!firstId) return null;
  return shapes[firstId] || null;
};

/**
 * Converts a Set to an array of shape IDs (typed).
 */
export const selectedIdsToArray = (selectedIds: Set<string>): string[] => {
  return Array.from(selectedIds);
};

/**
 * Checks if all required position properties exist for a shape.
 */
export const hasValidPosition = (shape: Shape): boolean => {
  if (shape.type === 'line' || shape.type === 'polyline' || 
      shape.type === 'arrow' || shape.type === 'measure' || shape.type === 'arc') {
    return Array.isArray(shape.points) && shape.points.length > 0;
  }
  return shape.x !== undefined && shape.y !== undefined && 
         !isNaN(shape.x) && !isNaN(shape.y);
};

/**
 * Gets shapes that match the given type filter.
 */
export const filterShapesByType = (
  ids: string[],
  shapes: Record<string, Shape>,
  types: Shape['type'][]
): Shape[] => {
  return ids
    .map(id => shapes[id])
    .filter((s): s is Shape => s !== undefined && types.includes(s.type));
};
