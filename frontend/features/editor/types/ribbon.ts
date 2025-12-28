/**
 * Type definitions for Ribbon controls and components.
 */

import type { RefObject, MouseEvent } from 'react';

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
// COLOR CONTROL TYPES
// ============================================

export type ColorPickerTargetType = 'stroke' | 'fill' | 'grid';

export interface ColorPickerTarget {
  type: ColorPickerTargetType;
}

export interface GridControlProps {
  openColorPicker: (e: MouseEvent, target: ColorPickerTarget) => void;
}

// ============================================
// RIBBON COMMON PROPS
// ============================================

export interface RibbonComponentProps extends TextControlProps, Omit<GridControlProps, 'openColorPicker'> {
  // Combined props for ComponentRegistry
  activeLayer?: unknown;
  isLayerDropdownOpen?: boolean;
  setLayerDropdownOpen?: (open: boolean) => void;
  openLayerDropdown?: () => void;
  layerButtonRef?: RefObject<HTMLButtonElement>;
  layerDropdownRef?: RefObject<HTMLDivElement>;
  dropdownPos?: { top: number; left: number };
  setColorPickerTarget?: (target: ColorPickerTarget | null) => void;
  openColorPicker?: (e: MouseEvent, target: ColorPickerTarget) => void;
  activeColor?: string;
  handleColorChange?: (newColor: string) => void;
}
