/**
 * Type definitions for Ribbon controls and components.
 */

import type { RefObject, MouseEvent } from 'react';
import { Layer, Shape, ToolType } from '@/types';

// ============================================
// TEXT CONTROL TYPES
// ============================================

export interface TextControlProps {
  selectedTextIds: string[];
  applyTextUpdate: (diff: TextUpdateDiff, recalcSize: boolean) => void;
}

export interface TextUpdateDiff {
  fontFamily?: string;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

// ============================================
// LAYER CONTROL TYPES
// ============================================

export interface LayerControlProps {
  activeLayer: Layer | undefined;
  isDropdownOpen: boolean;
  setDropdownOpen: (open: boolean) => void;
  openDropdown: () => void;
  buttonRef: RefObject<HTMLButtonElement>;
  dropdownRef: RefObject<HTMLDivElement>;
  dropdownPos: { top: number; left: number };
}

// ============================================
// COLOR CONTROL TYPES
// ============================================

export type ColorPickerTargetType = 'stroke' | 'fill' | 'grid';

export interface ColorPickerTarget {
  type: ColorPickerTargetType;
}

export interface ColorControlProps {
  activeLayer: Layer | undefined;
  openColorPicker: (e: MouseEvent, target: ColorPickerTarget) => void;
  selectedShapeIds: string[];
}

// ============================================
// GRID CONTROL TYPES
// ============================================

export interface GridControlProps {
  openColorPicker: (e: MouseEvent, target: ColorPickerTarget) => void;
}

// ============================================
// RIBBON COMMON PROPS
// ============================================

export interface RibbonComponentProps extends 
  TextControlProps, 
  LayerControlProps, 
  ColorControlProps, 
  GridControlProps {
  // Combined props for ComponentRegistry
}

// ============================================
// BUTTON STATE HELPERS
// ============================================

export type ButtonState = 'default' | 'active' | 'disabled';

export interface ApplyLayerButtonState {
  state: ButtonState;
  hasCustomMode: boolean;
  isDifferentLayer: boolean;
}

export const getApplyLayerButtonState = (
  selectedShapeIds: Set<string>,
  shapes: Record<string, Shape>,
  activeLayer: Layer | undefined
): ApplyLayerButtonState => {
  if (selectedShapeIds.size === 0) {
    return { state: 'disabled', hasCustomMode: false, isDifferentLayer: false };
  }

  const firstId = Array.from(selectedShapeIds)[0];
  const shape = shapes[firstId];

  if (!shape) {
    return { state: 'disabled', hasCustomMode: false, isDifferentLayer: false };
  }

  const hasCustomMode = 
    shape.colorMode?.fill === 'custom' || 
    shape.colorMode?.stroke === 'custom';
  
  const isDifferentLayer = 
    activeLayer !== undefined && 
    shape.layerId !== activeLayer.id;

  const state: ButtonState = (hasCustomMode || isDifferentLayer) 
    ? 'active' 
    : 'disabled';

  return { state, hasCustomMode, isDifferentLayer };
};
