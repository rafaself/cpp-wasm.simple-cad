import { Eye, EyeOff, Link, Square } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import ColorPicker from '@/components/ColorPicker';
import { useDocumentSignal } from '@/engine/core/engineDocumentSignals';
import {
  StyleState,
  StyleTarget,
  TriState,
  type SelectionStyleSummary,
  type StyleTargetSummary,
} from '@/engine/core/protocol';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';
import { LABELS } from '@/i18n/labels';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import * as DEFAULTS from '@/theme/defaults';
import { unpackColorRGBA } from '@/types/text';
import { hexToCssRgba, rgbToHex } from '@/utils/cssColor';

import { RibbonIconButton } from '../components/ribbon/RibbonIconButton';

import {
  applyColorAction,
  applyEnabledAction,
  applyRestoreAction,
  type ColorControlTarget,
} from './applyColorAction';
import { formatInheritedTooltip } from './colorState';
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

const ICON_SIZE = 16;

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
  state: StyleState;
};

const ColorSwatchButton: React.FC<ColorSwatchButtonProps> = ({
  color,
  disabled,
  showNone,
  onClick,
  title,
  state,
}) => (
  <button
    type="button"
    onClick={onClick}
    onMouseDown={(e) => e.preventDefault()}
    className={`relative w-9 h-6 mx-1 rounded border transition-colors ${
      disabled
        ? 'opacity-50 cursor-not-allowed border-border/50'
        : state === StyleState.Mixed
          ? 'border-dashed border-primary/50'
          : 'border-border/70 hover:border-primary/50'
    }`}
    style={state === StyleState.Mixed ? undefined : { backgroundColor: color }}
    title={title}
    aria-label={title}
    disabled={disabled}
  >
    {state === StyleState.Mixed && (
      <span className="absolute inset-0 flex items-center justify-center bg-surface2/50 text-[10px] font-medium text-text-muted">
        ?
      </span>
    )}
    {showNone && (
      <span className="absolute inset-0 pointer-events-none">
        <span className="absolute inset-0 bg-gradient-to-br from-transparent via-red-500/70 to-transparent" />
      </span>
    )}
  </button>
);

export const ColorRibbonControls: React.FC = () => {
  const runtime = useEngineRuntime();
  const selectionSummary = useSelectionStyleSummary();
  const selectionIds = useEngineSelectionIds();
  const { mode, toolKind } = useColorTargetResolver(selectionSummary.selectionCount);
  const activeLayerId = useUIStore((s) => s.activeLayerId);
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

  const layers = useEngineLayers();
  const layerNameById = useMemo(
    () => new Map(layers.map((layer) => [layer.id, layer.name])),
    [layers],
  );

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
      const color = toolKind === 'text' ? toolDefaults.text.textColor : toolDefaults.strokeColor;
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
        toolKind === 'text' ? toolDefaults.text.textBackgroundColor : toolDefaults.fillColor;
      const enabled =
        toolKind === 'text' ? toolDefaults.text.textBackgroundEnabled : toolDefaults.fillEnabled;
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

  const handleToggleStroke = () => {
    const isEnabled = strokeState.enabledState === TriState.On;
    const nextEnabled = strokeState.enabledState === TriState.Mixed ? true : !isEnabled;
    applyEnabledAction({
      runtime,
      mode,
      toolKind,
      activeLayerId,
      selectionIds,
      selectionTargets: strokeState.applyTargets,
      target: 'stroke',
      enabled: nextEnabled,
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

  const handleRestore = (target: ColorControlTarget) => {
    applyRestoreAction({
      runtime,
      mode,
      toolKind,
      activeLayerId,
      selectionIds,
      selectionTargets: target === 'stroke' ? strokeState.applyTargets : fillState.applyTargets,
      target,
      toolActions,
    });
  };

  const strokeMixed =
    strokeState.state === StyleState.Mixed || strokeState.enabledState === TriState.Mixed;
  const strokeEnabled = strokeState.enabledState === TriState.On;
  const noStroke = !strokeEnabled && !strokeMixed;

  const fillMixed =
    fillState.state === StyleState.Mixed || fillState.enabledState === TriState.Mixed;
  const fillEnabled = fillState.enabledState === TriState.On;
  const noFill = !fillEnabled && !fillMixed;

  const isStrokeOverride =
    strokeState.state === StyleState.Override || strokeState.state === StyleState.Mixed;
  const isFillOverride =
    fillState.state === StyleState.Override || fillState.state === StyleState.Mixed;

  const strokeTooltip = noStroke
    ? 'Sem traço'
    : strokeState.state === StyleState.Layer
      ? formatInheritedTooltip(layerNameById.get(strokeState.layerId) || 'Desconhecida')
      : LABELS.colors.overrideTooltip;

  const fillTooltip = noFill
    ? LABELS.colors.noneTooltip
    : fillState.state === StyleState.Layer
      ? formatInheritedTooltip(layerNameById.get(fillState.layerId) || 'Desconhecida')
      : LABELS.colors.overrideTooltip;

  return (
    <div className="ribbon-group-col min-w-[140px] px-1">
      {/* Stroke Row */}
      <div className="ribbon-row h-7 items-center justify-between">
        <div className="flex items-center">
          <div className="flex w-5 justify-center text-text-muted" title={LABELS.colors.stroke}>
            <Square size={ICON_SIZE} />
          </div>
          <ColorSwatchButton
            color={strokeState.color}
            onClick={(event) => openColorPicker(event, 'stroke')}
            disabled={strokeState.supportedState === TriState.Off}
            state={strokeState.state}
            title={strokeTooltip}
            showNone={noStroke}
          />
        </div>
        <div className="flex gap-0.5">
          <RibbonIconButton
            icon={noStroke ? <EyeOff size={ICON_SIZE} /> : <Eye size={ICON_SIZE} />}
            onClick={handleToggleStroke}
            title={noStroke ? 'Mostrar Traço' : 'Ocultar Traço'}
            isActive={noStroke}
            variant={noStroke ? 'danger' : 'default'}
            size="sm"
            disabled={strokeState.supportedState === TriState.Off}
          />
          <RibbonIconButton
            icon={<Link size={ICON_SIZE} />}
            onClick={() => handleRestore('stroke')}
            title={formatInheritedTooltip(layerNameById.get(strokeState.layerId) || 'Desconhecida')}
            size="sm"
            disabled={!isStrokeOverride || strokeState.supportedState === TriState.Off}
            className={!isStrokeOverride ? 'pointer-events-none opacity-0' : ''}
          />
        </div>
      </div>

      {/* Fill Row */}
      <div className="ribbon-row mt-0.5 h-7 items-center justify-between">
        <div className="flex items-center">
          <div className="flex w-5 justify-center text-text-muted" title={LABELS.colors.fill}>
            <Square size={ICON_SIZE} fill="currentColor" />
          </div>
          <ColorSwatchButton
            color={fillState.color}
            onClick={(event) => openColorPicker(event, 'fill')}
            disabled={fillState.supportedState === TriState.Off}
            showNone={noFill}
            title={fillTooltip}
            state={fillState.state}
          />
        </div>
        <div className="flex gap-0.5">
          <RibbonIconButton
            icon={noFill ? <EyeOff size={ICON_SIZE} /> : <Eye size={ICON_SIZE} />}
            onClick={handleToggleFill}
            title={noFill ? 'Mostrar Preenchimento' : 'Ocultar Preenchimento'}
            isActive={noFill}
            variant={noFill ? 'danger' : 'default'}
            size="sm"
            disabled={fillState.supportedState === TriState.Off}
          />
          <RibbonIconButton
            icon={<Link size={ICON_SIZE} />}
            onClick={() => handleRestore('fill')}
            title={formatInheritedTooltip(layerNameById.get(fillState.layerId) || 'Desconhecida')}
            size="sm"
            disabled={!isFillOverride || fillState.supportedState === TriState.Off}
            className={!isFillOverride ? 'pointer-events-none opacity-0' : ''}
          />
        </div>
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
