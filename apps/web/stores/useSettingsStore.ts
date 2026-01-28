import { create } from 'zustand';

import { supportsEngineResize } from '@/engine/core/capabilities';

import { INTERACTION } from '../src/constants/interaction';
import { GRID } from '../src/constants/ui';
import * as DEFAULTS from '../theme/defaults';
import { SnapOptions } from '../types';

export type SnapSettings = SnapOptions & { tolerancePx: number };

export interface OrthoSettings {
  persistentEnabled: boolean;
  shiftOverrideEnabled: boolean;
}

export interface GridSettings {
  size: number;
  color: string;
  showDots: boolean;
  showLines: boolean;
  showSubdivisions: boolean;
  subdivisionCount: number;
  lineWidth: number; // pixels
  dotRadius: number; // pixels
}

export interface DisplaySettings {
  centerAxes: {
    show: boolean;
    xColor: string;
    yColor: string;
    xDashed: boolean;
    yDashed: boolean;
  };
  centerIcon: {
    show: boolean;
    color: string;
  };
  backgroundColor: string;
  showQuickAccess: boolean;
  showSidebarScrollIndicators: boolean;
}

export interface ToolDefaults {
  /** Cor do traço. null = herdar da camada (ByLayer) */
  strokeColor: string | null;
  strokeWidth: number;
  strokeEnabled: boolean;
  /** Cor do preenchimento. null = herdar da camada (ByLayer) */
  fillColor: string | null;
  fillEnabled: boolean;
  polygonSides: number;
  text: {
    fontSize: number;
    fontFamily: string;
    align: 'left' | 'center' | 'right';
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    /** Cor do texto. null = herdar da camada (ByLayer) */
    textColor: string | null;
    /** Cor do fundo do texto. null = herdar da camada (ByLayer) */
    textBackgroundColor: string | null;
    textBackgroundEnabled: boolean;
  };
}

interface SettingsState {
  grid: GridSettings;
  snap: SnapSettings;
  ortho: OrthoSettings;
  display: DisplaySettings;
  toolDefaults: ToolDefaults;
  featureFlags: {
    enableColorsRibbon: boolean;
    enableRibbonV2: boolean;
    enableEngineResize: boolean;
    enablePickProfiling: boolean;
    enablePickThrottling: boolean;
    enablePolygonContourSelection: boolean;
    enablePolygonEdgeGrips: boolean;
    enableGripBudget: boolean; // Phase 3: Grip budget system
    enableGripPerformanceMonitoring: boolean; // Phase 3: Performance tracking
    enableSnapIndicator: boolean; // Phase 3: Visual snap feedback
  };
  performance: {
    pickThrottleInterval: number; // ms
  };
  engineCapabilitiesMask: number;

  setSnapEnabled: (enabled: boolean) => void;
  setSnapOption: (option: keyof SnapOptions, value: boolean) => void;
  setSnapTolerance: (tolerancePx: number) => void;
  setOrthoPersistentEnabled: (enabled: boolean) => void;
  toggleOrthoPersistent: () => void;

  setGridSize: (size: number) => void;
  setGridColor: (color: string) => void;
  setGridShowDots: (show: boolean) => void;
  setGridShowLines: (show: boolean) => void;
  setGridShowSubdivisions: (show: boolean) => void;
  setGridSubdivisionCount: (count: number) => void;
  // opacity removed
  setGridLineWidth: (width: number) => void;
  setGridDotRadius: (radius: number) => void;
  resetGridToDefaults: () => void;
  applyGridPreset: (preset: 'dots' | 'lines' | 'combined' | 'minimal') => void;

  setShowCenterAxes: (show: boolean) => void;
  setAxisXColor: (color: string) => void;
  setAxisYColor: (color: string) => void;
  setAxisXDashed: (dashed: boolean) => void;
  setAxisYDashed: (dashed: boolean) => void;
  setShowCenterIcon: (show: boolean) => void;
  setCenterIconColor: (color: string) => void;
  setCanvasBackgroundColor: (color: string) => void;
  setShowQuickAccess: (show: boolean) => void;
  setShowSidebarScrollIndicators: (show: boolean) => void;

  setStrokeColor: (color: string | null) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeEnabled: (enabled: boolean) => void;
  setFillColor: (color: string | null) => void;
  setFillEnabled: (enabled: boolean) => void;
  setPolygonSides: (sides: number) => void;

  setTextFontSize: (size: number) => void;
  setTextFontFamily: (family: string) => void;
  setTextAlign: (align: 'left' | 'center' | 'right') => void;
  setTextBold: (bold: boolean) => void;
  setTextItalic: (italic: boolean) => void;
  setTextUnderline: (underline: boolean) => void;
  setTextStrike: (strike: boolean) => void;
  setTextColor: (color: string | null) => void;
  setTextBackgroundColor: (color: string | null) => void;
  setTextBackgroundEnabled: (enabled: boolean) => void;

  setRibbonV2Enabled: (enabled: boolean) => void;
  setEngineResizeEnabled: (enabled: boolean) => void;
  setEngineCapabilitiesMask: (mask: number) => void;
  setPickProfilingEnabled: (enabled: boolean) => void;
  setPickThrottlingEnabled: (enabled: boolean) => void;
  setPickThrottleInterval: (interval: number) => void;
  setPolygonContourSelectionEnabled: (enabled: boolean) => void;
  setPolygonEdgeGripsEnabled: (enabled: boolean) => void;
  setGripBudgetEnabled: (enabled: boolean) => void;
  setGripPerformanceMonitoringEnabled: (enabled: boolean) => void;
  setSnapIndicatorEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  grid: {
    size: GRID.DEFAULT_SIZE_WU,
    color: DEFAULTS.DEFAULT_GRID_COLOR,
    showDots: false,
    showLines: false,
    showSubdivisions: true,
    subdivisionCount: 5,
    lineWidth: 1,
    dotRadius: 2,
  },
  snap: {
    enabled: true,
    endpoint: true,
    midpoint: true,
    center: true,
    nearest: false,
    grid: false,
    tolerancePx: INTERACTION.SNAP_THRESHOLD_PX,
  },
  ortho: {
    persistentEnabled: false,
    shiftOverrideEnabled: true,
  },
  display: {
    centerAxes: {
      show: true,
      xColor: DEFAULTS.DEFAULT_AXIS_X_COLOR,
      yColor: DEFAULTS.DEFAULT_AXIS_Y_COLOR,
      xDashed: true,
      yDashed: true,
    },
    centerIcon: {
      show: false,
      color: DEFAULTS.DEFAULT_CENTER_ICON_COLOR,
    },
    backgroundColor: DEFAULTS.DEFAULT_CANVAS_BG,
    showQuickAccess: false,
    showSidebarScrollIndicators: true,
  },
  toolDefaults: {
    strokeColor: null, // ByLayer
    strokeWidth: 1,
    strokeEnabled: true,
    fillColor: null, // ByLayer
    fillEnabled: true,
    polygonSides: 3,
    text: {
      fontSize: 16,
      fontFamily: 'Open Sans',
      align: 'left',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      textColor: null, // ByLayer
      textBackgroundColor: null, // ByLayer
      textBackgroundEnabled: false,
    },
  },
  featureFlags: {
    enableColorsRibbon: true,
    enableRibbonV2: false,
    enableEngineResize: false,
    enablePickProfiling: process.env.NODE_ENV !== 'production',
    enablePickThrottling: false,
    enablePolygonContourSelection: process.env.NODE_ENV !== 'production', // Phase 1: Dev only
    enablePolygonEdgeGrips: process.env.NODE_ENV !== 'production', // Phase 2: Dev only
    enableGripBudget: true, // Phase 3: Always enabled for performance
    enableGripPerformanceMonitoring: process.env.NODE_ENV !== 'production', // Phase 3: Dev only
    enableSnapIndicator: true, // Phase 3: CAD-like visual feedback
  },
  performance: {
    pickThrottleInterval: 16, // 60fps
  },
  engineCapabilitiesMask: 0,

  setSnapEnabled: (enabled) => set((state) => ({ snap: { ...state.snap, enabled } })),
  setSnapOption: (option, value) => set((state) => ({ snap: { ...state.snap, [option]: value } })),
  setSnapTolerance: (tolerancePx) => set((state) => ({ snap: { ...state.snap, tolerancePx } })),
  setOrthoPersistentEnabled: (enabled) =>
    set((state) => ({ ortho: { ...state.ortho, persistentEnabled: enabled } })),
  toggleOrthoPersistent: () =>
    set((state) => ({ ortho: { ...state.ortho, persistentEnabled: !state.ortho.persistentEnabled } })),

  setGridSize: (size) => set((state) => ({ grid: { ...state.grid, size } })),
  setGridColor: (color) => set((state) => ({ grid: { ...state.grid, color } })),
  setGridShowDots: (show) => set((state) => ({ grid: { ...state.grid, showDots: show } })),
  setGridShowLines: (show) => set((state) => ({ grid: { ...state.grid, showLines: show } })),
  setGridShowSubdivisions: (show) =>
    set((state) => ({ grid: { ...state.grid, showSubdivisions: show } })),
  setGridSubdivisionCount: (count) =>
    set((state) => ({ grid: { ...state.grid, subdivisionCount: count } })),
  // opacity removed
  setGridLineWidth: (width) =>
    set((state) => ({ grid: { ...state.grid, lineWidth: Math.max(0.5, Math.min(5, width)) } })),
  setGridDotRadius: (radius) =>
    set((state) => ({ grid: { ...state.grid, dotRadius: Math.max(1, Math.min(8, radius)) } })),

  resetGridToDefaults: () =>
    set((state) => ({
      grid: {
        size: GRID.DEFAULT_SIZE_WU,
        color: DEFAULTS.DEFAULT_GRID_COLOR,
        showDots: false,
        showLines: false,
        showSubdivisions: true,
        subdivisionCount: 5,
        // opacity: 0.5 removed,
        lineWidth: 1,
        dotRadius: 2,
      },
    })),

  applyGridPreset: (preset) =>
    set((state) => {
      switch (preset) {
        case 'dots':
          return {
            grid: { ...state.grid, showDots: true, showLines: false, dotRadius: 2 },
          };
        case 'lines':
          return {
            grid: { ...state.grid, showDots: false, showLines: true, lineWidth: 1 },
          };
        case 'combined':
          return {
            grid: {
              ...state.grid,
              showDots: true,
              showLines: true,
              dotRadius: 1.5,
              lineWidth: 0.5,
              // opacity: 0.5 removed
            },
          };
        case 'minimal':
          return {
            grid: {
              ...state.grid,
              showDots: true,
              showLines: false,
              dotRadius: 1,
              // opacity: 0.25 removed
              showSubdivisions: false,
            },
          };
        default:
          return state;
      }
    }),

  setShowCenterAxes: (show) =>
    set((state) => ({
      display: { ...state.display, centerAxes: { ...state.display.centerAxes, show } },
    })),
  setAxisXColor: (color) =>
    set((state) => ({
      display: { ...state.display, centerAxes: { ...state.display.centerAxes, xColor: color } },
    })),
  setAxisYColor: (color) =>
    set((state) => ({
      display: { ...state.display, centerAxes: { ...state.display.centerAxes, yColor: color } },
    })),
  setAxisXDashed: (dashed) =>
    set((state) => ({
      display: { ...state.display, centerAxes: { ...state.display.centerAxes, xDashed: dashed } },
    })),
  setAxisYDashed: (dashed) =>
    set((state) => ({
      display: { ...state.display, centerAxes: { ...state.display.centerAxes, yDashed: dashed } },
    })),
  setShowCenterIcon: (show) =>
    set((state) => ({
      display: { ...state.display, centerIcon: { ...state.display.centerIcon, show } },
    })),
  setCenterIconColor: (color) =>
    set((state) => ({
      display: { ...state.display, centerIcon: { ...state.display.centerIcon, color } },
    })),
  setCanvasBackgroundColor: (color) =>
    set((state) => ({ display: { ...state.display, backgroundColor: color } })),
  setShowQuickAccess: (show) =>
    set((state) => ({ display: { ...state.display, showQuickAccess: show } })),
  setShowSidebarScrollIndicators: (show) =>
    set((state) => ({ display: { ...state.display, showSidebarScrollIndicators: show } })),

  setStrokeColor: (color) =>
    set((state) => ({ toolDefaults: { ...state.toolDefaults, strokeColor: color } })),
  setStrokeWidth: (width) =>
    set((state) => ({ toolDefaults: { ...state.toolDefaults, strokeWidth: width } })),
  setStrokeEnabled: (enabled) =>
    set((state) => ({ toolDefaults: { ...state.toolDefaults, strokeEnabled: enabled } })),
  setFillColor: (color) =>
    set((state) => ({ toolDefaults: { ...state.toolDefaults, fillColor: color } })),
  setFillEnabled: (enabled) =>
    set((state) => ({ toolDefaults: { ...state.toolDefaults, fillEnabled: enabled } })),
  setPolygonSides: (sides) =>
    set((state) => ({ toolDefaults: { ...state.toolDefaults, polygonSides: sides } })),

  setTextFontSize: (size) =>
    set((state) => ({
      toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, fontSize: size } },
    })),
  setTextFontFamily: (family) =>
    set((state) => ({
      toolDefaults: {
        ...state.toolDefaults,
        text: { ...state.toolDefaults.text, fontFamily: family },
      },
    })),
  setTextAlign: (align) =>
    set((state) => ({
      toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, align } },
    })),
  setTextBold: (bold) =>
    set((state) => ({
      toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, bold } },
    })),
  setTextItalic: (italic) =>
    set((state) => ({
      toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, italic } },
    })),
  setTextUnderline: (underline) =>
    set((state) => ({
      toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, underline } },
    })),
  setTextStrike: (strike) =>
    set((state) => ({
      toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, strike } },
    })),
  setTextColor: (color) =>
    set((state) => ({
      toolDefaults: {
        ...state.toolDefaults,
        text: { ...state.toolDefaults.text, textColor: color },
      },
    })),
  setTextBackgroundColor: (color) =>
    set((state) => ({
      toolDefaults: {
        ...state.toolDefaults,
        text: { ...state.toolDefaults.text, textBackgroundColor: color },
      },
    })),
  setTextBackgroundEnabled: (enabled) =>
    set((state) => ({
      toolDefaults: {
        ...state.toolDefaults,
        text: { ...state.toolDefaults.text, textBackgroundEnabled: enabled },
      },
    })),
  setRibbonV2Enabled: (enabled) =>
    set((state) => ({ featureFlags: { ...state.featureFlags, enableRibbonV2: enabled } })),
  setEngineResizeEnabled: (enabled) =>
    set((state) => {
      if (!enabled) {
        if (!state.featureFlags.enableEngineResize) return state;
        return { featureFlags: { ...state.featureFlags, enableEngineResize: false } };
      }
      if (!supportsEngineResize(state.engineCapabilitiesMask)) {
        if (import.meta.env.DEV) {
          console.warn('[Settings] enableEngineResize ignored: WASM lacks resize capabilities.');
        }
        return state;
      }
      if (state.featureFlags.enableEngineResize) return state;
      return { featureFlags: { ...state.featureFlags, enableEngineResize: true } };
    }),
  setEngineCapabilitiesMask: (mask) =>
    set((state) =>
      state.engineCapabilitiesMask === mask ? state : { engineCapabilitiesMask: mask },
    ),

  // Performance settings
  setPickProfilingEnabled: (enabled) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, enablePickProfiling: enabled },
    })),
  setPickThrottlingEnabled: (enabled) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, enablePickThrottling: enabled },
    })),
  setPickThrottleInterval: (interval) =>
    set((state) => ({
      performance: {
        ...state.performance,
        pickThrottleInterval: Math.max(8, Math.min(100, interval)),
      },
    })),

  // CAD Selection features
  setPolygonContourSelectionEnabled: (enabled) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, enablePolygonContourSelection: enabled },
    })),
  setPolygonEdgeGripsEnabled: (enabled) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, enablePolygonEdgeGrips: enabled },
    })),

  // Phase 3: Performance and visual features
  setGripBudgetEnabled: (enabled) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, enableGripBudget: enabled },
    })),
  setGripPerformanceMonitoringEnabled: (enabled) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, enableGripPerformanceMonitoring: enabled },
    })),
  setSnapIndicatorEnabled: (enabled) =>
    set((state) => ({
      featureFlags: { ...state.featureFlags, enableSnapIndicator: enabled },
    })),
}));
