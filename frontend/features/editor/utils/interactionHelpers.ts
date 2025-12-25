/**
 * Interaction Helper Utilities
 * Pure functions extracted from EngineInteractionLayer for reusability.
 */

import type { Shape, ViewTransform, Point } from '@/types';
import { screenToWorld, isPointInShape } from '@/utils/geometry';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import { isShapeInteractable } from '@/utils/visibility';
import { getSymbolAlphaAtUv, primeSymbolAlphaMask } from '@/features/library/symbolAlphaMaskCache';
import { isSymbolInstanceHitAtWorldPoint } from '@/features/library/symbolPicking';

/**
 * Convert pointer event to world coordinates.
 */
export const toWorldPoint = (
  evt: React.PointerEvent<HTMLDivElement>,
  viewTransform: ViewTransform,
): Point => {
  const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
  const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  return screenToWorld(screen, viewTransform);
};

/**
 * Pick a shape at a world point using geometry-based hit testing.
 */
export const pickShapeAtGeometry = (
  worldPoint: Point,
  toleranceWorld: number,
): string | null => {
  const data = useDataStore.getState();
  const ui = useUIStore.getState();

  const queryRect = {
    x: worldPoint.x - toleranceWorld,
    y: worldPoint.y - toleranceWorld,
    width: toleranceWorld * 2,
    height: toleranceWorld * 2,
  };

  const candidates = data.spatialIndex
    .query(queryRect)
    .map((c: any) => data.shapes[c.id])
    .filter(Boolean) as Shape[];

  for (const shape of candidates) {
    const layer = data.layers.find((l) => l.id === shape.layerId);
    if (layer && (!layer.visible || layer.locked)) continue;
    if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
    if (shape.svgSymbolId) {
      if (!isSymbolInstanceHitAtWorldPoint(shape, worldPoint, getSymbolAlphaAtUv, { toleranceWorld })) continue;
      return shape.id;
    }
    if (shape.type === 'rect' && shape.svgRaw) {
      void primeSymbolAlphaMask(shape.id, shape.svgRaw, 256);
      if (!isSymbolInstanceHitAtWorldPoint(shape, worldPoint, getSymbolAlphaAtUv, { toleranceWorld, symbolIdOverride: shape.id })) continue;
      return shape.id;
    }
    if (isPointInShape(worldPoint, shape, ui.viewTransform.scale || 1, layer)) return shape.id;
  }

  return null;
};

/**
 * Clamp tiny values to zero (for floating point stability).
 */
export const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

/**
 * Snap a point to the nearest grid intersection.
 */
export const snapToGrid = (p: Point, gridSize: number): Point => {
  if (!gridSize || gridSize <= 0) return p;
  return { x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
};

/**
 * Determine if a movement qualifies as a drag (vs click).
 */
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > 2;

/**
 * Get cursor CSS for current tool.
 */
export const getCursorForTool = (tool: string): string => {
  if (tool === 'pan') return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'move' || tool === 'rotate') return 'default';
  return 'crosshair';
};
