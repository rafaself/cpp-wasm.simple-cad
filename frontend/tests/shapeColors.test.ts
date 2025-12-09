import { describe, expect, it } from 'vitest';
import { Layer, Shape } from '../types';
import {
  buildColorModeUpdate,
  getDefaultColorMode,
  getEffectiveFillColor,
  getEffectiveStrokeColor,
  getShapeColorMode
} from '../utils/shapeColors';

const baseLayer: Layer = {
  id: 'layer-1',
  name: 'Base',
  fillColor: '#ffffff',
  strokeColor: '#000000',
  visible: true,
  locked: false
};

const createShape = (shape: Partial<Shape> = {}): Shape => ({
  id: 'shape-1',
  layerId: baseLayer.id,
  type: 'rect',
  points: [],
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  strokeColor: '#222222',
  strokeEnabled: true,
  fillColor: '#dddddd',
  colorMode: getDefaultColorMode(),
  ...shape
});

describe('shape color inheritance helpers', () => {
  it('defaults to custom mode for legacy shapes', () => {
    const legacyShape = createShape({ colorMode: undefined });
    const mode = getShapeColorMode(legacyShape);
    expect(mode.fill).toBe('custom');
    expect(mode.stroke).toBe('custom');
  });

  it('uses layer stroke color when stroke mode is set to layer', () => {
    const shape = createShape({
      colorMode: { fill: 'custom', stroke: 'layer' },
      strokeColor: '#ff00ff'
    });
    expect(getEffectiveStrokeColor(shape, baseLayer)).toBe(baseLayer.strokeColor);
  });

  it('uses custom fill color when fill mode is custom even if layer color differs', () => {
    const shape = createShape({ fillColor: '#123456' });
    expect(getEffectiveFillColor(shape, { ...baseLayer, fillColor: '#abcdef' })).toBe('#123456');
  });

  it('only responds to layer color changes when inheriting', () => {
    const inheritingShape = createShape({ colorMode: { fill: 'layer', stroke: 'layer' } });
    const customShape = createShape({ id: 'shape-2' });
    const updatedLayer: Layer = { ...baseLayer, fillColor: '#111111', strokeColor: '#eeeeee' };

    expect(getEffectiveFillColor(inheritingShape, updatedLayer)).toBe('#111111');
    expect(getEffectiveFillColor(customShape, updatedLayer)).toBe(customShape.fillColor);
    expect(getEffectiveStrokeColor(inheritingShape, updatedLayer)).toBe('#eeeeee');
    expect(getEffectiveStrokeColor(customShape, updatedLayer)).toBe(customShape.strokeColor);
  });

  it('switches between layer and custom colors when toggling modes', () => {
    const shape = createShape({ fillColor: '#555555', strokeColor: '#666666' });
    const layer: Layer = { ...baseLayer, fillColor: '#999999', strokeColor: '#aaaaaa' };

    // Start in custom mode
    expect(getEffectiveFillColor(shape, layer)).toBe('#555555');

    const layerMode = buildColorModeUpdate(shape, { fill: 'layer', stroke: 'custom' });
    shape.colorMode = layerMode;
    expect(getEffectiveFillColor(shape, layer)).toBe('#999999');

    const customMode = buildColorModeUpdate(shape, { fill: 'custom' });
    shape.colorMode = customMode;
    expect(getEffectiveFillColor(shape, layer)).toBe('#555555');
  });
});
