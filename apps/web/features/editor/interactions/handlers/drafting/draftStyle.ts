import * as DEFAULTS from '@/theme/defaults';
import { hexToRgb } from '@/utils/color';

import type { BeginDraftPayload } from '@/engine/core/commandTypes';

export const clampPolygonSides = (value: number): number =>
  Math.max(3, Math.min(24, Math.floor(value)));

export const getArrowHeadSize = (strokeWidth?: number): number =>
  Math.round(Math.max(16, (strokeWidth ?? 2) * 10) * 1.1);

export type ToolDefaults = {
  strokeColor?: string | null;
  fillColor?: string | null;
  fillEnabled?: boolean;
  strokeEnabled?: boolean;
  strokeWidth?: number;
  polygonSides?: number;
};

const DraftFlags = {
  None: 0,
  FillByLayer: 1 << 0,
  StrokeByLayer: 1 << 1,
};

const colorToRgb01 = (hex: string): { r: number; g: number; b: number } => {
  const rgb = hexToRgb(hex) ?? { r: 255, g: 255, b: 255 };
  return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255 };
};

export const buildDraftStyle = (
  toolDefaults: ToolDefaults,
): Omit<BeginDraftPayload, 'kind' | 'x' | 'y' | 'sides' | 'head'> => {
  let flags = DraftFlags.None;
  if (toolDefaults.fillColor === null) flags |= DraftFlags.FillByLayer;
  if (toolDefaults.strokeColor === null) flags |= DraftFlags.StrokeByLayer;

  const stroke = colorToRgb01(toolDefaults.strokeColor ?? DEFAULTS.DEFAULT_STROKE_COLOR);
  const fill = colorToRgb01(toolDefaults.fillColor ?? DEFAULTS.DEFAULT_FILL_COLOR);
  return {
    fillR: fill.r,
    fillG: fill.g,
    fillB: fill.b,
    fillA: toolDefaults.fillEnabled !== false ? 1.0 : 0.0,
    strokeR: stroke.r,
    strokeG: stroke.g,
    strokeB: stroke.b,
    strokeA: 1.0,
    strokeEnabled: toolDefaults.strokeEnabled !== false ? 1.0 : 0.0,
    strokeWidthPx: Math.max(1, Math.min(100, toolDefaults.strokeWidth ?? 1)),
    flags,
  };
};
