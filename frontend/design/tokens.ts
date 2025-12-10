/**
 * Design tokens and shared constants for the EndeavourCanvas frontend.
 * Centralizes all magic numbers, style constants, and design system values.
 */

// ============================================
// INTERACTION CONSTANTS
// ============================================

export const INTERACTION = {
  /** Tolerance in world units for connecting lines during join */
  JOIN_TOLERANCE: 10,
  /** Screen-space tolerance for hit testing shapes */
  HIT_TOLERANCE_SCREEN: 10,
  /** Threshold for snap point detection (scaled by zoom) */
  SNAP_THRESHOLD: 20,
  /** Minimum size for shapes during resize */
  MIN_SHAPE_SIZE: 5,
  /** Default radius for single-click shape creation */
  DEFAULT_SHAPE_SIZE: 50,
  /** Single click distance threshold (to distinguish click from drag) */
  SINGLE_CLICK_THRESHOLD: 5,
} as const;

// ============================================
// GRID CONSTANTS
// ============================================

export const GRID = {
  DEFAULT_SIZE: 100,
  DEFAULT_COLOR: '#6b7280',
  MIN_SIZE: 10,
  MAX_SIZE: 500,
} as const;

// ============================================
// CANVAS CONSTANTS
// ============================================

export const CANVAS = {
  /** Padding for text elements */
  TEXT_PADDING: 4,
  /** Default arrow head size */
  ARROW_HEAD_SIZE: 15,
  /** Default font size */
  DEFAULT_FONT_SIZE: 16,
  /** Default line height multiplier */
  LINE_HEIGHT_MULTIPLIER: 1.2,
  /** Character width approximation (as fraction of font size) */
  CHAR_WIDTH_RATIO: 0.6,
} as const;

// ============================================
// UI DIMENSIONS
// ============================================

export const UI = {
  /** Ribbon surface background color */
  RIBBON_SURFACE_COLOR: '#0f172a',
  /** Handle size for selection/resize handles */
  HANDLE_SIZE: 10,
  /** Zoom fit padding */
  ZOOM_FIT_PADDING: 50,
  /** Max zoom level */
  MAX_ZOOM: 5,
  /** Min zoom level */
  MIN_ZOOM: 0.1,
} as const;

// ============================================
// HISTORY
// ============================================

export const HISTORY = {
  /** Maximum undo/redo history entries */
  LIMIT: 50,
} as const;

// ============================================
// SHARED TAILWIND STYLES
// ============================================

export const TEXT_STYLES = {
  /** Small uppercase label */
  label: 'text-[9px] text-slate-400 uppercase tracking-wider font-semibold',
  /** Section title in sidebar */
  sidebarTitle: 'text-[10px] font-bold text-slate-900 uppercase tracking-wide',
  /** Hint/helper text */
  hint: 'text-[9px] text-slate-400',
  /** Small mono text for values */
  mono: 'text-[11px] text-slate-700 font-mono',
} as const;

export const INPUT_STYLES = {
  /** Dark-themed input for ribbon */
  ribbon: 'w-full h-7 bg-slate-900 border border-slate-700/50 rounded flex items-center px-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all',
  /** Light-themed input for sidebar */
  sidebar: 'w-full border rounded px-2 h-7 text-[11px] bg-slate-50 border-slate-200 focus:outline-none focus:border-blue-500',
  /** Disabled state for sidebar */
  sidebarDisabled: 'bg-slate-100 border-slate-200 cursor-not-allowed',
} as const;

export const BUTTON_STYLES = {
  /** Base button style */
  base: 'rounded hover:bg-slate-700 active:bg-slate-600 transition-colors text-slate-400 hover:text-slate-100 border border-transparent',
  /** Centered flex button */
  centered: 'flex items-center justify-center rounded hover:bg-slate-700 active:bg-slate-600 transition-colors text-slate-400 hover:text-slate-100 border border-transparent',
  /** Active/selected state */
  active: 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30',
} as const;
