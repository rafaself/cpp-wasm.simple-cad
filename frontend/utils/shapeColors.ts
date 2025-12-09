import { Layer, Shape, ShapeColorMode } from '../types';

const DEFAULT_COLOR_MODE: ShapeColorMode = { fill: 'custom', stroke: 'custom' };

export const getDefaultColorMode = (): ShapeColorMode => ({ ...DEFAULT_COLOR_MODE });

export const getShapeColorMode = (shape: Shape): ShapeColorMode => {
  if (!shape.colorMode) return getDefaultColorMode();
  return {
    fill: shape.colorMode.fill ?? 'custom',
    stroke: shape.colorMode.stroke ?? 'custom'
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

export const getEffectiveFillColor = (shape: Shape, layer?: Layer | null): string => {
  const mode = getShapeColorMode(shape).fill;
  if (mode === 'layer' && layer) {
    return layer.fillColor;
  }
  return shape.fillColor;
};

export const getEffectiveStrokeColor = (shape: Shape, layer?: Layer | null): string => {
  const mode = getShapeColorMode(shape).stroke;
  if (mode === 'layer' && layer) {
    return layer.strokeColor;
  }
  return shape.strokeColor;
};

export const usesLayerFillColor = (shape: Shape) => getShapeColorMode(shape).fill === 'layer';
export const usesLayerStrokeColor = (shape: Shape) => getShapeColorMode(shape).stroke === 'layer';
