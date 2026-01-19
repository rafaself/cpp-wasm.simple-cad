import { Eye, EyeOff, MoreHorizontal, Undo2 } from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';

import ColorPicker from '@/components/ColorPicker';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { useDocumentSignal } from '@/engine/core/engineDocumentSignals';
import {
  StyleState,
  StyleTarget,
  TriState,
  type EntityId,
  type SelectionStyleSummary,
  type StyleTargetSummary,
} from '@/engine/core/protocol';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';
import { LABELS } from '@/i18n/labels';
import { useSettingsStore } from '@/stores/useSettingsStore';
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
import {
  type ColorTargetMode,
  type ToolKind,
  useColorTargetResolver,
} from './useColorTargetResolver';
import { useSelectionStyleSummary } from './useSelectionStyleSummary';
import { useRibbonLayout } from '../components/ribbon/ribbonLayout';
import { isTierAtLeast } from '../ui/ribbonLayoutV2';

/**
 * Locked context captured when color picker opens.
 * Ensures color changes apply to the original target even if selection changes.
 */
type LockedColorContext = {
  mode: ColorTargetMode;
  toolKind: ToolKind;
  selectionIds: EntityId[];
  strokeApplyTargets: StyleTarget[];
  fillApplyTargets: StyleTarget[];
};

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
    className={`relative w-5 h-5 max-h-4 mx-1 rounded border transition-colors ${
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
      <span className="absolute inset-0 flex items-center justify-center bg-surface-2/50 text-[10px] font-medium text-text-muted">
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
  const { tier } = useRibbonLayout();
  const [isStrokeMenuOpen, setIsStrokeMenuOpen] = useState(false);
  const [isFillMenuOpen, setIsFillMenuOpen] = useState(false);
  const runtime = useEngineRuntime();
  const selectionSummary = useSelectionStyleSummary();
  const selectionIds = useEngineSelectionIds();
  const { mode, toolKind } = useColorTargetResolver(selectionSummary.selectionCount);
  void useDocumentSignal('style'); // Subscribe to style changes

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

  // Context locking: when picker is open, use locked context for color changes
  const lockedContextRef = useRef<LockedColorContext | null>(null);

  // Check if controls should be disabled (mode === 'none')
  const isDisabled = mode === 'none';

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
      // Se a cor é null, significa ByLayer - mostrar como Layer state
      // Se a cor tem valor, é override
      const isByLayer = color === null;
      return {
        color: color ?? DEFAULTS.DEFAULT_STROKE_COLOR,
        state: isByLayer ? StyleState.Layer : StyleState.Override,
        enabledState: TriState.On,
        supportedState: TriState.On,
        layerId: 0,
        applyTargets: [],
      };
    }

    // Mode 'none': controls disabled, show placeholder state
    return {
      color: DEFAULTS.DEFAULT_STROKE_COLOR,
      state: StyleState.None,
      enabledState: TriState.Off,
      supportedState: TriState.Off,
      layerId: 0,
      applyTargets: [],
    };
  }, [mode, selectionSummary, toolDefaults, toolKind]);

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
      // Se a cor é null, significa ByLayer - mostrar como Layer state (se enabled)
      const isByLayer = color === null;
      return {
        color: color ?? DEFAULTS.DEFAULT_FILL_COLOR,
        state: !enabled ? StyleState.None : isByLayer ? StyleState.Layer : StyleState.Override,
        enabledState: enabled ? TriState.On : TriState.Off,
        supportedState: TriState.On,
        layerId: 0,
        applyTargets: [],
      };
    }

    // Mode 'none': controls disabled, show placeholder state
    return {
      color: DEFAULTS.DEFAULT_FILL_COLOR,
      state: StyleState.None,
      enabledState: TriState.Off,
      supportedState: TriState.Off,
      layerId: 0,
      applyTargets: [],
    };
  }, [mode, selectionSummary, toolDefaults, toolKind]);

  const [activePicker, setActivePicker] = useState<ColorControlTarget | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });

  const openColorPicker = (
    event: React.MouseEvent<HTMLButtonElement>,
    target: ColorControlTarget,
  ) => {
    if (isDisabled) return;
    if (target === 'fill' && fillState.supportedState === TriState.Off) return;
    if (target === 'stroke' && strokeState.supportedState === TriState.Off) return;

    // Lock context: capture current state when picker opens
    lockedContextRef.current = {
      mode,
      toolKind,
      selectionIds: [...selectionIds], // Copy to avoid reference issues
      strokeApplyTargets: [...strokeState.applyTargets],
      fillApplyTargets: [...fillState.applyTargets],
    };

    const rect = event.currentTarget.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 6, left: rect.left });
    setActivePicker(target);
  };

  const closeColorPicker = () => {
    setActivePicker(null);
    lockedContextRef.current = null; // Release lock
  };

  const handleColorChange = (target: ColorControlTarget, color: string) => {
    const ctx = lockedContextRef.current;

    // If we have a locked context, validate that it's still applicable
    if (ctx) {
      // For 'selection' mode: only apply if CURRENT selection is non-empty
      // This prevents applying to elements that were deselected
      if (ctx.mode === 'selection' && selectionIds.length === 0) {
        return; // Selection was lost, don't apply changes
      }

      // For 'tool' mode: only apply if CURRENT mode is still 'tool'
      if (ctx.mode === 'tool' && mode !== 'tool') {
        return; // Tool was deactivated, don't apply changes
      }
    }

    // Determine effective values (prefer locked context, fallback to current)
    const effectiveMode = ctx?.mode ?? mode;
    const effectiveToolKind = ctx?.toolKind ?? toolKind;
    const effectiveSelectionIds = ctx?.selectionIds ?? selectionIds;
    const effectiveTargets =
      target === 'stroke'
        ? (ctx?.strokeApplyTargets ?? strokeState.applyTargets)
        : (ctx?.fillApplyTargets ?? fillState.applyTargets);

    // Don't apply if mode is 'none'
    if (effectiveMode === 'none') return;

    applyColorAction({
      runtime,
      mode: effectiveMode,
      toolKind: effectiveToolKind,
      selectionIds: effectiveSelectionIds,
      selectionTargets: effectiveTargets,
      target,
      color,
      toolActions,
    });
  };

  const handleToggleStroke = () => {
    if (isDisabled) return;
    const isEnabled = strokeState.enabledState === TriState.On;
    const nextEnabled = strokeState.enabledState === TriState.Mixed ? true : !isEnabled;
    applyEnabledAction({
      runtime,
      mode,
      toolKind,
      selectionIds,
      selectionTargets: strokeState.applyTargets,
      target: 'stroke',
      enabled: nextEnabled,
      toolActions,
    });
  };

  const handleToggleFill = () => {
    if (isDisabled) return;
    const isEnabled = fillState.enabledState === TriState.On;
    const nextEnabled = fillState.enabledState === TriState.Mixed ? true : !isEnabled;
    applyEnabledAction({
      runtime,
      mode,
      toolKind,
      selectionIds,
      selectionTargets: fillState.applyTargets,
      target: 'fill',
      enabled: nextEnabled,
      toolActions,
    });
  };

  const handleRestore = (target: ColorControlTarget) => {
    if (isDisabled) return;
    applyRestoreAction({
      runtime,
      mode,
      toolKind,
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
  const collapseRestores = isTierAtLeast(tier, 'tier2');

  const strokeTooltip = isDisabled
    ? LABELS.colors.disabledHint
    : noStroke
      ? 'Sem traço'
      : strokeState.state === StyleState.Layer
        ? formatInheritedTooltip(layerNameById.get(strokeState.layerId) || 'Desconhecida')
        : LABELS.colors.overrideTooltip;

  const fillTooltip = isDisabled
    ? LABELS.colors.disabledHint
    : noFill
      ? LABELS.colors.noneTooltip
      : fillState.state === StyleState.Layer
        ? formatInheritedTooltip(layerNameById.get(fillState.layerId) || 'Desconhecida')
        : LABELS.colors.overrideTooltip;

  // Restore button tooltip - only show when override is active
  const restoreStrokeTooltip = isStrokeOverride
    ? LABELS.colors.restoreTooltip.replace(
        '{layer}',
        layerNameById.get(strokeState.layerId) || 'Desconhecida',
      )
    : '';
  const restoreFillTooltip = isFillOverride
    ? LABELS.colors.restoreTooltip.replace(
        '{layer}',
        layerNameById.get(fillState.layerId) || 'Desconhecida',
      )
    : '';

  return (
    <div
      className={`ribbon-group-col gap-2 px-1 ${isDisabled ? 'opacity-50' : ''}`}
      title={isDisabled ? LABELS.colors.disabledHint : undefined}
    >
      {/* Stroke Row */}
      <div className="ribbon-row h-7 items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-label font-semibold uppercase tracking-wide text-text-muted"
            title={LABELS.colors.stroke}
          >
            {LABELS.colors.stroke}
          </span>
          <div className="flex items-center gap-1">
            <ColorSwatchButton
              color={strokeState.color}
              onClick={(event) => openColorPicker(event, 'stroke')}
              disabled={isDisabled || strokeState.supportedState === TriState.Off}
              state={strokeState.state}
              title={strokeTooltip}
              showNone={noStroke}
            />
            <RibbonIconButton
              icon={noStroke ? <EyeOff size={ICON_SIZE} /> : <Eye size={ICON_SIZE} />}
              onClick={handleToggleStroke}
              title={noStroke ? 'Mostrar Traço' : 'Ocultar Traço'}
              isActive={noStroke}
              variant={noStroke ? 'danger' : 'default'}
              size="sm"
              disabled={isDisabled || strokeState.supportedState === TriState.Off}
            />
            {collapseRestores ? (
              isStrokeOverride ? (
                <Popover
                  isOpen={isStrokeMenuOpen}
                  onOpenChange={setIsStrokeMenuOpen}
                  placement="bottom"
                  offset={6}
                  className="ribbon-inline-popover"
                  zIndex="z-dropdown"
                  content={
                    <div className="ribbon-inline-menu">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ribbon-inline-menu-item"
                        onClick={() => {
                          handleRestore('stroke');
                          setIsStrokeMenuOpen(false);
                        }}
                      >
                        <Undo2 size={ICON_SIZE} />
                        <span>Restaurar Traço</span>
                      </Button>
                    </div>
                  }
                >
                  <RibbonIconButton
                    icon={<MoreHorizontal size={ICON_SIZE} />}
                    onClick={() => undefined}
                    title="Mais opções de traço"
                    size="sm"
                    disabled={isDisabled}
                  />
                </Popover>
              ) : null
            ) : (
              <RibbonIconButton
                icon={<Undo2 size={ICON_SIZE} />}
                onClick={() => handleRestore('stroke')}
                title={restoreStrokeTooltip}
                size="sm"
                disabled={
                  isDisabled || !isStrokeOverride || strokeState.supportedState === TriState.Off
                }
                className={!isStrokeOverride ? 'pointer-events-none opacity-0' : ''}
              />
            )}
          </div>
        </div>
      </div>

      {/* Fill Row */}
      <div className="ribbon-row h-7 items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-label font-semibold uppercase tracking-wide text-text-muted"
            title={LABELS.colors.fill}
          >
            {LABELS.colors.fill}
          </span>
          <div className="flex items-center gap-1">
            <ColorSwatchButton
              color={fillState.color}
              onClick={(event) => openColorPicker(event, 'fill')}
              disabled={isDisabled || fillState.supportedState === TriState.Off}
              showNone={noFill}
              title={fillTooltip}
              state={fillState.state}
            />
            <RibbonIconButton
              icon={noFill ? <EyeOff size={ICON_SIZE} /> : <Eye size={ICON_SIZE} />}
              onClick={handleToggleFill}
              title={noFill ? 'Mostrar Preenchimento' : 'Ocultar Preenchimento'}
              isActive={noFill}
              variant={noFill ? 'danger' : 'default'}
              size="sm"
              disabled={isDisabled || fillState.supportedState === TriState.Off}
            />
            {collapseRestores ? (
              isFillOverride ? (
                <Popover
                  isOpen={isFillMenuOpen}
                  onOpenChange={setIsFillMenuOpen}
                  placement="bottom"
                  offset={6}
                  className="ribbon-inline-popover"
                  zIndex="z-dropdown"
                  content={
                    <div className="ribbon-inline-menu">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ribbon-inline-menu-item"
                        onClick={() => {
                          handleRestore('fill');
                          setIsFillMenuOpen(false);
                        }}
                      >
                        <Undo2 size={ICON_SIZE} />
                        <span>Restaurar Preenchimento</span>
                      </Button>
                    </div>
                  }
                >
                  <RibbonIconButton
                    icon={<MoreHorizontal size={ICON_SIZE} />}
                    onClick={() => undefined}
                    title="Mais opções de preenchimento"
                    size="sm"
                    disabled={isDisabled}
                  />
                </Popover>
              ) : null
            ) : (
              <RibbonIconButton
                icon={<Undo2 size={ICON_SIZE} />}
                onClick={() => handleRestore('fill')}
                title={restoreFillTooltip}
                size="sm"
                disabled={
                  isDisabled || !isFillOverride || fillState.supportedState === TriState.Off
                }
                className={!isFillOverride ? 'pointer-events-none opacity-0' : ''}
              />
            )}
          </div>
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
