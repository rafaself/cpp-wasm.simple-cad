import { RotateCcw, Circle, Grid3x3, Layers, Minus } from 'lucide-react';
import React, { useState } from 'react';

import { LABELS } from '@/i18n/labels';
import * as DEFAULTS from '@/theme/defaults';

import ColorPicker from '../../../components/ColorPicker';
import { Section } from '../../../components/ui/Section';
import { Toggle } from '../../../components/ui/Toggle';
import { supportsEngineResize } from '../../../engine/core/capabilities';
import { useSettingsStore } from '../../../stores/useSettingsStore';

const CanvasSettings: React.FC = () => {
  const settings = useSettingsStore();
  const engineResizeSupported = supportsEngineResize(settings.engineCapabilitiesMask);
  const engineResizeEnabled = settings.featureFlags.enableEngineResize && engineResizeSupported;

  // Color picker state
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });

  const openColorPicker = (e: React.MouseEvent, pickerId: string) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.bottom + 5, left: rect.left });
    setActiveColorPicker(pickerId);
  };

  const closeColorPicker = () => setActiveColorPicker(null);

  const ColorField = ({
    label,
    color,
    pickerId,
    onReset,
  }: {
    label: string;
    color: string;
    pickerId: string;
    onReset?: () => void;
  }) => (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-muted">{label}</span>
        {onReset && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="p-1 rounded hover:bg-surface2 text-text-muted hover:text-text transition-colors"
            title="Restaurar cor padrão"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      <div
        className="w-8 h-6 rounded border border-border cursor-pointer hover:border-primary/50"
        style={{ backgroundColor: color }}
        onClick={(e) => openColorPicker(e, pickerId)}
      />
    </div>
  );

  const SelectField = ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
  }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface2 border border-border rounded px-2 py-1 text-sm text-text cursor-pointer hover:border-primary/50 focus:outline-none focus:border-primary"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );

  const SliderField = ({
    label,
    value,
    min,
    max,
    step,
    onChange,
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
  }) => (
    <div className="flex items-center justify-between py-2 gap-4">
      <span className="text-sm text-text-muted flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 h-1 bg-surface2 rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <span className="text-xs font-mono text-text-muted w-8 text-right">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      <Section title={LABELS.settings.grid}>
        {/* Presets de Estilo */}
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-text-muted">Estilo Rápido</span>
          <div className="flex gap-1">
            <button
              onClick={() => settings.applyGridPreset('dots')}
              className={`p-1.5 rounded border transition-colors ${
                settings.grid.showDots && !settings.grid.showLines
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-surface2 border-border text-text-muted hover:border-primary/50'
              }`}
              title="Apenas Pontos"
            >
              <Circle size={14} />
            </button>
            <button
              onClick={() => settings.applyGridPreset('lines')}
              className={`p-1.5 rounded border transition-colors ${
                !settings.grid.showDots && settings.grid.showLines
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-surface2 border-border text-text-muted hover:border-primary/50'
              }`}
              title="Apenas Linhas"
            >
              <Grid3x3 size={14} />
            </button>
            <button
              onClick={() => settings.applyGridPreset('combined')}
              className={`p-1.5 rounded border transition-colors ${
                settings.grid.showDots && settings.grid.showLines
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-surface2 border-border text-text-muted hover:border-primary/50'
              }`}
              title="Pontos + Linhas"
            >
              <Layers size={14} />
            </button>
            <button
              onClick={() => settings.applyGridPreset('minimal')}
              className={`p-1.5 rounded border transition-colors ${
                settings.grid.opacity < 0.3 && !settings.grid.showSubdivisions
                  ? 'bg-primary/20 border-primary text-primary'
                  : 'bg-surface2 border-border text-text-muted hover:border-primary/50'
              }`}
              title="Minimalista"
            >
              <Minus size={14} />
            </button>
            <div className="w-px bg-border mx-1" />
            <button
              onClick={settings.resetGridToDefaults}
              className="p-1.5 rounded border bg-surface2 border-border text-text-muted hover:border-primary/50 hover:text-text transition-colors"
              title="Restaurar Padrões"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        <SliderField
          label={LABELS.settings.gridSize}
          value={settings.grid.size}
          min={10}
          max={200}
          step={10}
          onChange={settings.setGridSize}
        />
        <ColorField label="Cor da Grade" color={settings.grid.color} pickerId="grid" />

        {/* Slider de Opacidade */}
        <div className="flex items-center justify-between py-2 gap-4">
          <span className="text-sm text-text-muted flex-shrink-0">Opacidade</span>
          <div className="flex items-center gap-2 flex-1">
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(settings.grid.opacity * 100)}
              onChange={(e) => settings.setGridOpacity(parseInt(e.target.value) / 100)}
              className="flex-1 h-1 bg-surface2 rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="text-xs font-mono text-text-muted w-10 text-right">
              {Math.round(settings.grid.opacity * 100)}%
            </span>
          </div>
        </div>

        <Toggle
          label="Mostrar Pontos"
          checked={settings.grid.showDots}
          onChange={settings.setGridShowDots}
        />
        {settings.grid.showDots && (
          <div className="flex items-center justify-between py-2 gap-4 ml-4">
            <span className="text-sm text-text-muted flex-shrink-0">Tamanho</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={settings.grid.dotRadius}
                onChange={(e) => settings.setGridDotRadius(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-surface2 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="text-xs font-mono text-text-muted w-8 text-right">
                {settings.grid.dotRadius}px
              </span>
            </div>
          </div>
        )}

        <Toggle
          label={LABELS.settings.showGrid}
          checked={settings.grid.showLines}
          onChange={settings.setGridShowLines}
        />
        {settings.grid.showLines && (
          <div className="flex items-center justify-between py-2 gap-4 ml-4">
            <span className="text-sm text-text-muted flex-shrink-0">Espessura</span>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="range"
                min={0.5}
                max={5}
                step={0.5}
                value={settings.grid.lineWidth}
                onChange={(e) => settings.setGridLineWidth(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-surface2 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="text-xs font-mono text-text-muted w-8 text-right">
                {settings.grid.lineWidth}px
              </span>
            </div>
          </div>
        )}

        <Toggle
          label="Subdivisões Adaptativas"
          checked={settings.grid.showSubdivisions}
          onChange={settings.setGridShowSubdivisions}
        />
        {settings.grid.showSubdivisions && (
          <SelectField
            label="Divisões"
            value={String(settings.grid.subdivisionCount)}
            options={[
              { value: '2', label: '÷2' },
              { value: '4', label: '÷4' },
              { value: '5', label: '÷5' },
              { value: '10', label: '÷10' },
            ]}
            onChange={(v) => settings.setGridSubdivisionCount(parseInt(v, 10))}
          />
        )}
      </Section>

      <Section title={LABELS.settings.showAxis}>
        <Toggle
          label={LABELS.settings.showAxis}
          checked={settings.display.centerAxes.show}
          onChange={settings.setShowCenterAxes}
        />
        <ColorField
          label="Cor Eixo X"
          color={settings.display.centerAxes.xColor}
          pickerId="axisX"
        />
        <ColorField
          label="Cor Eixo Y"
          color={settings.display.centerAxes.yColor}
          pickerId="axisY"
        />
        <SelectField
          label="Tipo Eixo X"
          value={settings.display.centerAxes.xDashed ? 'dashed' : 'solid'}
          options={[
            { value: 'solid', label: 'Contínuo' },
            { value: 'dashed', label: 'Tracejado' },
          ]}
          onChange={(v) => settings.setAxisXDashed(v === 'dashed')}
        />
        <SelectField
          label="Tipo Eixo Y"
          value={settings.display.centerAxes.yDashed ? 'dashed' : 'solid'}
          options={[
            { value: 'solid', label: 'Contínuo' },
            { value: 'dashed', label: 'Tracejado' },
          ]}
          onChange={(v) => settings.setAxisYDashed(v === 'dashed')}
        />
      </Section>

      <Section title="Ícone Central">
        <Toggle
          label="Mostrar Ícone"
          checked={settings.display.centerIcon.show}
          onChange={settings.setShowCenterIcon}
        />
        <ColorField
          label="Cor do Ícone"
          color={settings.display.centerIcon.color}
          pickerId="centerIcon"
        />
      </Section>

      <Section title="Interface">
        <ColorField
          label="Cor de Fundo"
          color={settings.display.backgroundColor}
          pickerId="canvasBackground"
          onReset={() => settings.setCanvasBackgroundColor(DEFAULTS.DEFAULT_CANVAS_BG)}
        />
      </Section>

      <Section title="Dev">
        <Toggle
          label={
            engineResizeSupported
              ? 'Enable Engine Resize (Dev)'
              : 'Enable Engine Resize (Dev) - requires WASM rebuild'
          }
          checked={engineResizeEnabled}
          onChange={settings.setEngineResizeEnabled}
        />
      </Section>

      {/* Color Picker Portal */}
      {activeColorPicker && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={closeColorPicker} />
          <ColorPicker
            color={
              activeColorPicker === 'grid'
                ? settings.grid.color
                : activeColorPicker === 'axisX'
                  ? settings.display.centerAxes.xColor
                  : activeColorPicker === 'axisY'
                    ? settings.display.centerAxes.yColor
                    : activeColorPicker === 'centerIcon'
                      ? settings.display.centerIcon.color
                      : settings.display.backgroundColor
            }
            onChange={(c) => {
              if (activeColorPicker === 'grid') settings.setGridColor(c);
              else if (activeColorPicker === 'axisX') settings.setAxisXColor(c);
              else if (activeColorPicker === 'axisY') settings.setAxisYColor(c);
              else if (activeColorPicker === 'centerIcon') settings.setCenterIconColor(c);
              else if (activeColorPicker === 'canvasBackground')
                settings.setCanvasBackgroundColor(c);
            }}
            onClose={closeColorPicker}
            initialPosition={colorPickerPos}
          />
        </>
      )}
    </div>
  );
};

export default CanvasSettings;
