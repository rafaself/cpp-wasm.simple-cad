import { Layer, Shape } from '../types';
import { hexToRgb } from './color';

const isValidHexColor = (color: string | undefined): boolean => {
  if (!color) return false;
  if (!color.startsWith('#')) return false;
  return hexToRgb(color) !== null;
};

const normalizeStoredColor = (color: string | undefined, fallback: string): string => {
  if (!color) return fallback;
  if (color.toLowerCase() === 'transparent') return fallback;
  return isValidHexColor(color) ? color : fallback;
};

export const normalizeLayerStyle = (layer: Layer): Layer => {
  const next: Layer = { ...layer };

  if (typeof next.fillColor === 'string' && next.fillColor.toLowerCase() === 'transparent') {
    next.fillColor = '#ffffff';
    next.fillEnabled = false;
  }
  if (typeof next.strokeColor === 'string' && next.strokeColor.toLowerCase() === 'transparent') {
    next.strokeColor = '#000000';
    next.strokeEnabled = false;
  }

  next.fillColor = normalizeStoredColor(next.fillColor, '#ffffff');
  next.strokeColor = normalizeStoredColor(next.strokeColor, '#000000');

  return next;
};

export const normalizeShapeStyle = (shape: Shape): Shape => {
  const next: Shape = { ...shape };

  if (typeof next.fillColor === 'string' && next.fillColor.toLowerCase() === 'transparent') {
    next.fillColor = '#ffffff';
    next.fillEnabled = false;
  }
  if (typeof next.strokeColor === 'string' && next.strokeColor.toLowerCase() === 'transparent') {
    next.strokeColor = '#000000';
    next.strokeEnabled = false;
  }

  next.fillColor = normalizeStoredColor(next.fillColor, '#ffffff');
  next.strokeColor = normalizeStoredColor(next.strokeColor, '#000000');

  return next;
};
