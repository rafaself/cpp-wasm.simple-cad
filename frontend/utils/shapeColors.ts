import { Layer, Shape, ShapeColorMode } from '../types';

const DEFAULT_COLOR_MODE: ShapeColorMode = { fill: 'layer', stroke: 'layer' };

export const getDefaultColorMode = (): ShapeColorMode => ({ ...DEFAULT_COLOR_MODE });

export const getShapeColorMode = (shape: Shape): ShapeColorMode => {
  if (!shape.colorMode) return getDefaultColorMode();
  return {
    fill: shape.colorMode.fill ?? 'layer',
    stroke: shape.colorMode.stroke ?? 'layer'
  };
};

export const buildColorModeUpdate = (
  shape: Shape,
  overrides: Partial<ShapeColorMode>
): ShapeColorMode => ({
  ...getDefaultColorMode(),
  ...shape.colorMode,
  ...overrides
});

// ============================================
// EFFECTIVE COLOR RESOLUTION
// ============================================

export const getEffectiveStrokeColor = (shape: Shape, layer?: Layer | null): string => {
  const mode = getShapeColorMode(shape).stroke;
  if (mode === 'layer' && layer) {
    return layer.strokeColor;
  }
  return shape.strokeColor;
};

export const getEffectiveFillColor = (shape: Shape, layer?: Layer | null): string => {
  const mode = getShapeColorMode(shape).fill;
  if (mode === 'layer' && layer) {
    return layer.fillColor;
  }
  return shape.fillColor;
};

// ============================================
// EFFECTIVE ENABLED STATE RESOLUTION
// ============================================

/**
 * Resolves whether stroke is effectively enabled considering inheritance.
 * - If colorMode.stroke === 'layer': uses layer.strokeEnabled
 * - If colorMode.stroke === 'custom': uses shape.strokeEnabled
 */
export const isStrokeEffectivelyEnabled = (shape: Shape, layer?: Layer | null): boolean => {
  const mode = getShapeColorMode(shape).stroke;
  if (mode === 'layer' && layer) {
    return layer.strokeEnabled !== false;
  }
  return shape.strokeEnabled !== false;
};

/**
 * Resolves whether fill is effectively enabled considering inheritance.
 * - If colorMode.fill === 'layer': uses layer.fillEnabled
 * - If colorMode.fill === 'custom': uses shape.fillEnabled
 */
export const isFillEffectivelyEnabled = (shape: Shape, layer?: Layer | null): boolean => {
  const mode = getShapeColorMode(shape).fill;
  if (mode === 'layer' && layer) {
    return layer.fillEnabled !== false;
  }
  return shape.fillEnabled !== false;
};

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

export const usesLayerFillColor = (shape: Shape) => getShapeColorMode(shape).fill === 'layer';
export const usesLayerStrokeColor = (shape: Shape) => getShapeColorMode(shape).stroke === 'layer';

/**
 * Resolves all effective visual properties for a shape, considering layer inheritance.
 * Useful for rendering and UI display.
 */
export interface EffectiveProperties {
  strokeColor: string;
  strokeEnabled: boolean;
  fillColor: string;
  fillEnabled: boolean;
  strokeWidth: number;
}

export const getEffectiveProperties = (shape: Shape, layer?: Layer | null): EffectiveProperties => ({
  strokeColor: getEffectiveStrokeColor(shape, layer),
  strokeEnabled: isStrokeEffectivelyEnabled(shape, layer),
  fillColor: getEffectiveFillColor(shape, layer),
  fillEnabled: isFillEffectivelyEnabled(shape, layer),
  strokeWidth: shape.strokeWidth ?? 1
});

