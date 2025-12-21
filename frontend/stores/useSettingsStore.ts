import { create } from 'zustand';
import { SnapOptions } from '../types';
import { UI } from '../design/tokens';

export type SnapSettings = SnapOptions & { tolerancePx: number };

export interface GridSettings {
  size: number;
  color: string;
  showDots: boolean;
  showLines: boolean;
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
}

export interface ToolDefaults {
  strokeColor: string;
  strokeWidth: number;
  strokeEnabled: boolean;
  fillColor: string;
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
  };
}

export type RenderMode = 'legacy' | 'webgl2' | 'webgpu';

interface SettingsState {
  grid: GridSettings;
  snap: SnapSettings;
  display: DisplaySettings;
  toolDefaults: ToolDefaults;
  featureFlags: {
    gpuPicking: boolean;
    renderMode: RenderMode;
  };

  setSnapEnabled: (enabled: boolean) => void;
  setSnapOption: (option: keyof SnapOptions, value: boolean) => void;
  setSnapTolerance: (tolerancePx: number) => void;

  setGridSize: (size: number) => void;
  setGridColor: (color: string) => void;
  setGridShowDots: (show: boolean) => void;
  setGridShowLines: (show: boolean) => void;

  setShowCenterAxes: (show: boolean) => void;
  setAxisXColor: (color: string) => void;
  setAxisYColor: (color: string) => void;
  setAxisXDashed: (dashed: boolean) => void;
  setAxisYDashed: (dashed: boolean) => void;
  setShowCenterIcon: (show: boolean) => void;
  setCenterIconColor: (color: string) => void;
  setCanvasBackgroundColor: (color: string) => void;

  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeEnabled: (enabled: boolean) => void;
  setFillColor: (color: string) => void;
  setFillEnabled: (enabled: boolean) => void;
  setPolygonSides: (sides: number) => void;

  setTextFontSize: (size: number) => void;
  setTextFontFamily: (family: string) => void;
  setTextAlign: (align: 'left' | 'center' | 'right') => void;
  setTextBold: (bold: boolean) => void;
  setTextItalic: (italic: boolean) => void;
  setTextUnderline: (underline: boolean) => void;
  setTextStrike: (strike: boolean) => void;

  setGpuPicking: (enabled: boolean) => void;
  setRenderMode: (mode: RenderMode) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  grid: {
    size: 100,
    color: '#313943',
    showDots: true,
    showLines: false,
  },
  snap: {
    enabled: true,
    endpoint: true,
    midpoint: true,
    center: true,
    nearest: false,
    grid: false,
    tolerancePx: 20,
  },
  display: {
    centerAxes: {
      show: true,
      xColor: 'rgba(239, 68, 68, 0.4)',
      yColor: 'rgba(34, 197, 94, 0.4)',
      xDashed: true,
      yDashed: true,
    },
    centerIcon: {
      show: true,
      color: 'rgba(100, 116, 139, 0.5)',
    },
    backgroundColor: UI.BACKGROUND_DEFAULT,
  },
  toolDefaults: {
    strokeColor: '#FFFFFF',
    strokeWidth: 1,
    strokeEnabled: true,
    fillColor: '#D9D9D9',
    fillEnabled: true,
    polygonSides: 3,
    text: {
      fontSize: 16,
      fontFamily: 'Inter',
      align: 'left',
      bold: false,
      italic: false,
      underline: false,
      strike: false,
    },
  },
  featureFlags: {
    gpuPicking: false,
    renderMode: 'legacy',
  },

  setSnapEnabled: (enabled) => set((state) => ({ snap: { ...state.snap, enabled } })),
  setSnapOption: (option, value) => set((state) => ({ snap: { ...state.snap, [option]: value } })),
  setSnapTolerance: (tolerancePx) => set((state) => ({ snap: { ...state.snap, tolerancePx } })),

  setGridSize: (size) => set((state) => ({ grid: { ...state.grid, size } })),
  setGridColor: (color) => set((state) => ({ grid: { ...state.grid, color } })),
  setGridShowDots: (show) => set((state) => ({ grid: { ...state.grid, showDots: show } })),
  setGridShowLines: (show) => set((state) => ({ grid: { ...state.grid, showLines: show } })),

  setShowCenterAxes: (show) => set((state) => ({ display: { ...state.display, centerAxes: { ...state.display.centerAxes, show } } })),
  setAxisXColor: (color) => set((state) => ({ display: { ...state.display, centerAxes: { ...state.display.centerAxes, xColor: color } } })),
  setAxisYColor: (color) => set((state) => ({ display: { ...state.display, centerAxes: { ...state.display.centerAxes, yColor: color } } })),
  setAxisXDashed: (dashed) => set((state) => ({ display: { ...state.display, centerAxes: { ...state.display.centerAxes, xDashed: dashed } } })),
  setAxisYDashed: (dashed) => set((state) => ({ display: { ...state.display, centerAxes: { ...state.display.centerAxes, yDashed: dashed } } })),
  setShowCenterIcon: (show) => set((state) => ({ display: { ...state.display, centerIcon: { ...state.display.centerIcon, show } } })),
  setCenterIconColor: (color) => set((state) => ({ display: { ...state.display, centerIcon: { ...state.display.centerIcon, color } } })),
  setCanvasBackgroundColor: (color) => set((state) => ({ display: { ...state.display, backgroundColor: color } })),

  setStrokeColor: (color) => set((state) => ({ toolDefaults: { ...state.toolDefaults, strokeColor: color } })),
  setStrokeWidth: (width) => set((state) => ({ toolDefaults: { ...state.toolDefaults, strokeWidth: width } })),
  setStrokeEnabled: (enabled) => set((state) => ({ toolDefaults: { ...state.toolDefaults, strokeEnabled: enabled } })),
  setFillColor: (color) => set((state) => ({ toolDefaults: { ...state.toolDefaults, fillColor: color } })),
  setFillEnabled: (enabled) => set((state) => ({ toolDefaults: { ...state.toolDefaults, fillEnabled: enabled } })),
  setPolygonSides: (sides) => set((state) => ({ toolDefaults: { ...state.toolDefaults, polygonSides: sides } })),

  setTextFontSize: (size) => set((state) => ({ toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, fontSize: size } } })),
  setTextFontFamily: (family) => set((state) => ({ toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, fontFamily: family } } })),
  setTextAlign: (align) => set((state) => ({ toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, align } } })),
  setTextBold: (bold) => set((state) => ({ toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, bold } } })),
  setTextItalic: (italic) => set((state) => ({ toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, italic } } })),
  setTextUnderline: (underline) => set((state) => ({ toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, underline } } })),
  setTextStrike: (strike) => set((state) => ({ toolDefaults: { ...state.toolDefaults, text: { ...state.toolDefaults.text, strike } } })),
  setGpuPicking: (enabled) => set((state) => ({ featureFlags: { ...state.featureFlags, gpuPicking: enabled } })),
  setRenderMode: (renderMode) => set((state) => ({ featureFlags: { ...state.featureFlags, renderMode } })),
}));
