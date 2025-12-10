import { describe, expect, it } from 'vitest';
import { Layer, Shape } from '../types';
import {
  buildColorModeUpdate,
  getDefaultColorMode,
  getEffectiveFillColor,
  getEffectiveStrokeColor,
  getShapeColorMode,
  isStrokeEffectivelyEnabled,
  isFillEffectivelyEnabled
} from '../utils/shapeColors';

const baseLayer: Layer = {
  id: 'layer-1',
  name: 'Base',
  fillColor: '#ffffff',
  fillEnabled: true,
  strokeColor: '#000000',
  strokeEnabled: true,
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
  it('defaults to layer mode for shapes without colorMode', () => {
    const legacyShape = createShape({ colorMode: undefined });
    const mode = getShapeColorMode(legacyShape);
    expect(mode.fill).toBe('layer');
    expect(mode.stroke).toBe('layer');
  });

  it('uses layer stroke color when stroke mode is set to layer', () => {
    const shape = createShape({
      colorMode: { fill: 'custom', stroke: 'layer' },
      strokeColor: '#ff00ff'
    });
    expect(getEffectiveStrokeColor(shape, baseLayer)).toBe(baseLayer.strokeColor);
  });

  it('uses custom fill color when fill mode is custom even if layer color differs', () => {
    const shape = createShape({ 
      fillColor: '#123456',
      colorMode: { fill: 'custom', stroke: 'layer' }
    });
    expect(getEffectiveFillColor(shape, { ...baseLayer, fillColor: '#abcdef' })).toBe('#123456');
  });

  it('only responds to layer color changes when inheriting', () => {
    const inheritingShape = createShape({ colorMode: { fill: 'layer', stroke: 'layer' } });
    const customShape = createShape({ id: 'shape-2', colorMode: { fill: 'custom', stroke: 'custom' } });
    const updatedLayer: Layer = { ...baseLayer, fillColor: '#111111', strokeColor: '#eeeeee' };

    expect(getEffectiveFillColor(inheritingShape, updatedLayer)).toBe('#111111');
    expect(getEffectiveFillColor(customShape, updatedLayer)).toBe(customShape.fillColor);
    expect(getEffectiveStrokeColor(inheritingShape, updatedLayer)).toBe('#eeeeee');
    expect(getEffectiveStrokeColor(customShape, updatedLayer)).toBe(customShape.strokeColor);
  });

  it('switches between layer and custom colors when toggling modes', () => {
    const shape = createShape({ fillColor: '#555555', strokeColor: '#666666' });
    const layer: Layer = { ...baseLayer, fillColor: '#999999', strokeColor: '#aaaaaa' };

    // Start in layer mode (default)
    expect(getEffectiveFillColor(shape, layer)).toBe('#999999');

    const customMode = buildColorModeUpdate(shape, { fill: 'custom', stroke: 'custom' });
    shape.colorMode = customMode;
    expect(getEffectiveFillColor(shape, layer)).toBe('#555555');

    const layerMode = buildColorModeUpdate(shape, { fill: 'layer' });
    shape.colorMode = layerMode;
    expect(getEffectiveFillColor(shape, layer)).toBe('#999999');
  });
});

describe('shape enabled state inheritance', () => {
  it('inherits strokeEnabled from layer when in layer mode', () => {
    const shape = createShape({ colorMode: { fill: 'layer', stroke: 'layer' } });
    const disabledStrokeLayer: Layer = { ...baseLayer, strokeEnabled: false };
    
    expect(isStrokeEffectivelyEnabled(shape, baseLayer)).toBe(true);
    expect(isStrokeEffectivelyEnabled(shape, disabledStrokeLayer)).toBe(false);
  });

  it('inherits fillEnabled from layer when in layer mode', () => {
    const shape = createShape({ colorMode: { fill: 'layer', stroke: 'layer' } });
    const disabledFillLayer: Layer = { ...baseLayer, fillEnabled: false };
    
    expect(isFillEffectivelyEnabled(shape, baseLayer)).toBe(true);
    expect(isFillEffectivelyEnabled(shape, disabledFillLayer)).toBe(false);
  });

  it('uses shape strokeEnabled when in custom mode', () => {
    const shapeWithStroke = createShape({ 
      colorMode: { fill: 'layer', stroke: 'custom' },
      strokeEnabled: true 
    });
    const shapeWithoutStroke = createShape({ 
      colorMode: { fill: 'layer', stroke: 'custom' },
      strokeEnabled: false 
    });
    const disabledLayer: Layer = { ...baseLayer, strokeEnabled: false };
    
    // Custom mode ignores layer settings
    expect(isStrokeEffectivelyEnabled(shapeWithStroke, disabledLayer)).toBe(true);
    expect(isStrokeEffectivelyEnabled(shapeWithoutStroke, baseLayer)).toBe(false);
  });

  it('uses shape fillEnabled when in custom mode', () => {
    const shapeWithFill = createShape({ 
      colorMode: { fill: 'custom', stroke: 'layer' },
      fillEnabled: true 
    });
    const shapeWithoutFill = createShape({ 
      colorMode: { fill: 'custom', stroke: 'layer' },
      fillEnabled: false 
    });
    const disabledLayer: Layer = { ...baseLayer, fillEnabled: false };
    
    // Custom mode ignores layer settings
    expect(isFillEffectivelyEnabled(shapeWithFill, disabledLayer)).toBe(true);
    expect(isFillEffectivelyEnabled(shapeWithoutFill, baseLayer)).toBe(false);
  });
});

