import React, { useMemo, useState } from 'react';

import ColorPicker from '@/components/ColorPicker';
import {
  StyleState,
  StyleTarget,
  TriState,
  type SelectionStyleSummary,
  type StyleTargetSummary,
} from '@/engine/core/protocol';
import { useDocumentSignal } from '@/engine/core/engineDocumentSignals';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { LABELS } from '@/i18n/labels';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import * as DEFAULTS from '@/theme/defaults';
import { unpackColorRGBA } from '@/types/text';
import { hexToCssRgba, rgbToHex } from '@/utils/cssColor';

import { applyColorAction, applyEnabledAction, type ColorControlTarget } from './applyColorAction';
import { ColorStateBadge } from './ColorStateBadge';
import { getStateIndicator } from './colorState';
import { useColorTargetResolver } from './useColorTargetResolver';
import { useSelectionStyleSummary } from './useSelectionStyleSummary';

type ResolvedControlState = {
  color: string;
  state: StyleState;
  enabledState: TriState;
  supportedState: TriState;
  layerId: number;
  applyTargets: StyleTarget[];
};

const packedToCssColor = (packed: number, fallback: string): string => {
  if (packed === 0) return fallback;
  const { r, g, b, a } = unpackColorRGBA(packed);
  const hex = rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  return a < 1 ? hexToCssRgba(hex, a) : hex;
};

const resolveSelectionControl = (
  summary: SelectionStyleSummary,
  target: ColorControlTarget,
): { display: StyleTargetSummary; applyTargets: StyleTarget[] } => {
  // Mixed selections (text + shapes) apply to all supported targets while showing Mixed state.
  const hasStroke = summary.stroke.supportedState !== TriState.Off;
  const hasFill = summary.fill.supportedState !== TriState.Off;
  const hasTextColor = summary.textColor.supportedState !== TriState.Off;
  const hasTextBackground = summary.textBackground.supportedState !== TriState.Off;

  if (target === 'stroke') {
    const applyTargets: StyleTarget[] = [];
    if (hasStroke) applyTargets.push(StyleTarget.Stroke);
    if (hasTextColor) applyTargets.push(StyleTarget.TextColor);
    const display = hasStroke ? summary.stroke : summary.textColor;
    return { display, applyTargets };
  }

  const applyTargets: StyleTarget[] = [];
  if (hasFill) applyTargets.push(StyleTarget.Fill);
  if (hasTextBackground) applyTargets.push(StyleTarget.TextBackground);
  const display = hasFill ? summary.fill : summary.textBackground;
  return { display, applyTargets };
};

type ColorSwatchButtonProps = {
  color: string;
  disabled?: boolean;
  showNone?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
};

const ColorSwatchButton: React.FC<ColorSwatchButtonProps> = ({
  color,
  disabled,
  showNone,
  onClick,
  title,
}) => (
  <button
    type="button"
    onClick={onClick}
    onMouseDown={(e) => e.preventDefault()}
    className={`relative w-7 h-full rounded border border-border/70 hover:border-primary/50 transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : ''
    }`}
    style={{ backgroundColor: color }}
    title={title}
    aria-label={title}
    disabled={disabled}
  >
    {showNone && (
      <span className="absolute inset-0 pointer-events-none">
        <span className="absolute inset-0 bg-gradient-to-br from-transparent via-red-500/70 to-transparent" />
      </span>
    )}
  </button>
);

const NoFillToggle: React.FC<{
  enabled: boolean;
  mixed: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ enabled, mixed, disabled, onToggle }) => {
  const isActive = !enabled || mixed;
  const mixedClass = mixed ? 'bg-primary/10 text-primary border border-primary/20' : '';
  const activeClass = !mixed && !enabled ? 'bg-primary/20 text-primary border border-primary/30' : '';

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseDown={(e) => e.preventDefault()}
      className={`px-2 h-full rounded text-[10px] font-semibold transition-colors border ${
        isActive ? activeClass : 'border-border/60 text-text-muted hover:text-text'
      } ${mixedClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`.trim()}
      aria-pressed={!enabled}
      disabled={disabled}
      title={LABELS.colors.noFill}
    >
      {LABELS.colors.noFill}
    </button>
  );
};

export const ColorRibbonControls: React.FC = () => {
  const runtime = useEngineRuntime();
  const selectionSummary = useSelectionStyleSummary();
  const selectionIds = useEngineSelectionIds();
  const { mode, toolKind } = useColorTargetResolver(selectionSummary.selectionCount);
  const activeLayerId = useUIStore((s) => s.activeLayerId);
  const layers = useEngineLayers();
  const styleGeneration = useDocumentSignal('style');

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);
  const setStrokeColor = useSettingsStore((s) => s.setStrokeColor);
  const setFillColor = useSettingsStore((s) => s.setFillColor);
  const setFillEnabled = useSettingsStore((s) => s.setFillEnabled);
  const setTextColor = useSettingsStore((s) => s.setTextColor);
  const setTextBackgroundColor = useSettingsStore((s) => s.setTextBackgroundColor);
  const setTextBackgroundEnabled = useSettingsStore((s) => s.setTextBackgroundEnabled);

  const toolActions = useMemo(
    () => ({
      setStrokeColor,
      setFillColor,
      setFillEnabled,
      setTextColor,
      setTextBackgroundColor,
      setTextBackgroundEnabled,
    }),
    [
      setStrokeColor,
      setFillColor,
      setFillEnabled,
      setTextColor,
      setTextBackgroundColor,
      setTextBackgroundEnabled,
    ],
  );

  const layerNameById = useMemo(() => new Map(layers.map((layer) => [layer.id, layer.name])), [
    layers,
  ]);

  const layerStyle = useMemo(() => {
    void styleGeneration;
    if (!runtime || activeLayerId === null) return null;
    return runtime.style.getLayerStyle(activeLayerId);
  }, [runtime, activeLayerId, styleGeneration]);

  const strokeState: ResolvedControlState = useMemo(() => {
    if (mode === 'selection') {
      const { display, applyTargets } = resolveSelectionControl(selectionSummary, 'stroke');
      return {
        color: packedToCssColor(display.colorRGBA, DEFAULTS.DEFAULT_STROKE_COLOR),
        state: display.state as StyleState,
        enabledState: display.enabledState as TriState,
        supportedState: display.supportedState as TriState,
        layerId: display.layerId,
        applyTargets,
      };
    }

    if (mode === 'tool') {
      const color =
        toolKind === 'text' ? toolDefaults.text.textColor : toolDefaults.strokeColor;
      return {
        color: color ?? DEFAULTS.DEFAULT_STROKE_COLOR,
        state: StyleState.Override,
        enabledState: TriState.On,
        supportedState: TriState.On,
        layerId: 0,
        applyTargets: [],
      };
    }

    const color = layerStyle
      ? packedToCssColor(layerStyle.strokeRGBA, DEFAULTS.DEFAULT_STROKE_COLOR)
      : DEFAULTS.DEFAULT_STROKE_COLOR;
    return {
      color,
      state: StyleState.Layer,
      enabledState: layerStyle?.strokeEnabled ? TriState.On : TriState.Off,
      supportedState: TriState.On,
      layerId: activeLayerId ?? 0,
      applyTargets: [],
    };
  }, [mode, selectionSummary, toolDefaults, toolKind, layerStyle, activeLayerId]);

  const fillState: ResolvedControlState = useMemo(() => {
    if (mode === 'selection') {
      const { display, applyTargets } = resolveSelectionControl(selectionSummary, 'fill');
      return {
        color: packedToCssColor(display.colorRGBA, DEFAULTS.DEFAULT_FILL_COLOR),
        state: display.state as StyleState,
        enabledState: display.enabledState as TriState,
        supportedState: display.supportedState as TriState,
        layerId: display.layerId,
        applyTargets,
      };
    }

    if (mode === 'tool') {
      const color =
        toolKind === 'text'
          ? toolDefaults.text.textBackgroundColor
          : toolDefaults.fillColor;
      const enabled =
        toolKind === 'text'
          ? toolDefaults.text.textBackgroundEnabled
          : toolDefaults.fillEnabled;
      return {
        color: color ?? DEFAULTS.DEFAULT_FILL_COLOR,
        state: enabled ? StyleState.Override : StyleState.None,
        enabledState: enabled ? TriState.On : TriState.Off,
        supportedState: TriState.On,
        layerId: 0,
        applyTargets: [],
      };
    }

    const color = layerStyle
      ? packedToCssColor(layerStyle.fillRGBA, DEFAULTS.DEFAULT_FILL_COLOR)
      : DEFAULTS.DEFAULT_FILL_COLOR;
    const enabled = layerStyle?.fillEnabled ?? 1;
    return {
      color,
      state: enabled ? StyleState.Layer : StyleState.None,
      enabledState: enabled ? TriState.On : TriState.Off,
      supportedState: TriState.On,
      layerId: activeLayerId ?? 0,
      applyTargets: [],
    };
  }, [mode, selectionSummary, toolDefaults, toolKind, layerStyle, activeLayerId]);

  const [activePicker, setActivePicker] = useState<ColorControlTarget | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

  const openColorPicker = (
    event: React.MouseEvent<HTMLButtonElement>,
    target: ColorControlTarget,
  ) => {
    if (target === 'fill' && fillState.supportedState === TriState.Off) return;
    if (target === 'stroke' && strokeState.supportedState === TriState.Off) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 6, left: rect.left });
    setActivePicker(target);
  };

  const closeColorPicker = () => setActivePicker(null);

  const handleColorChange = (target: ColorControlTarget, color: string) => {
    applyColorAction({
      runtime,
      mode,
      toolKind,
      activeLayerId,
      selectionIds,
      selectionTargets: target === 'stroke' ? strokeState.applyTargets : fillState.applyTargets,
      target,
      color,
      toolActions,
    });
  };

  const handleToggleFill = () => {
    const isEnabled = fillState.enabledState === TriState.On;
    const nextEnabled = fillState.enabledState === TriState.Mixed ? true : !isEnabled;
    applyEnabledAction({
      runtime,
      mode,
      toolKind,
      activeLayerId,
      selectionIds,
      selectionTargets: fillState.applyTargets,
      target: 'fill',
      enabled: nextEnabled,
      toolActions,
    });
  };

  const strokeIndicator =
    mode === 'selection'
      ? getStateIndicator(strokeState.state, layerNameById.get(strokeState.layerId))
      : null;
  const fillIndicator =
    mode === 'selection'
      ? getStateIndicator(fillState.state, layerNameById.get(fillState.layerId))
      : null;

  const fillMixed = fillState.state === StyleState.Mixed || fillState.enabledState === TriState.Mixed;
  const fillEnabled = fillState.enabledState === TriState.On;

  return (
    <div className="ribbon-group-col px-1 min-w-[200px]">
      <div className="ribbon-row">
        <div className="flex items-center gap-2 w-[110px]">
          <span className="text-[11px] text-text-muted font-semibold">{LABELS.colors.stroke}</span>
          <ColorStateBadge indicator={strokeIndicator} />
        </div>
        <ColorSwatchButton
          color={strokeState.color}
          onClick={(event) => openColorPicker(event, 'stroke')}
          disabled={strokeState.supportedState === TriState.Off}
        />
      </div>
      <div className="ribbon-row">
        <div className="flex items-center gap-2 w-[110px]">
          <span className="text-[11px] text-text-muted font-semibold">{LABELS.colors.fill}</span>
          <ColorStateBadge indicator={fillIndicator} />
        </div>
        <ColorSwatchButton
          color={fillState.color}
          onClick={(event) => openColorPicker(event, 'fill')}
          disabled={fillState.supportedState === TriState.Off}
          showNone={!fillEnabled && !fillMixed}
          title={!fillEnabled ? LABELS.colors.noneTooltip : undefined}
        />
        <NoFillToggle
          enabled={fillEnabled}
          mixed={fillMixed}
          disabled={fillState.supportedState === TriState.Off}
          onToggle={handleToggleFill}
        />
      </div>

      {activePicker && (
        <ColorPicker
          color={activePicker === 'stroke' ? strokeState.color : fillState.color}
          onChange={(color) => handleColorChange(activePicker, color)}
          onClose={closeColorPicker}
          initialPosition={pickerPos}
        />
      )}
    </div>
  );
};
