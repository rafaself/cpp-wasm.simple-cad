import { Dot, Grid3x3, RotateCcw } from 'lucide-react';
import React, { useState } from 'react';

import { LABELS } from '@/i18n/labels';
import * as DEFAULTS from '@/theme/defaults';

import ColorPicker from '../../../components/ColorPicker';
import { NumericComboField } from '../../../components/NumericComboField';
import { Section } from '../../../components/ui/Section';
import { Toggle } from '../../../components/ui/Toggle';
import { useSettingsStore } from '../../../stores/useSettingsStore';

const CanvasSettings: React.FC = () => {
  const settings = useSettingsStore();

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

  return (
    <div className="flex flex-col">
      <Section title={LABELS.settings.grid}>
        {/* Toggle Mostrar Grade - primeiro item */}
        <Toggle
          label={LABELS.settings.showGrid}
          checked={settings.grid.showDots || settings.grid.showLines}
          onChange={(show) => {
            if (show) {
              // Ativar com estilo padrão (pontos)
              settings.setGridShowDots(true);
            } else {
              // Desativar ambos
              settings.setGridShowDots(false);
              settings.setGridShowLines(false);
            }
          }}
        />

        {/* Demais controles só aparecem quando a grade está visível */}
        {(settings.grid.showDots || settings.grid.showLines) && (
          <>
            {/* Estilo da Grade - apenas 2 opções: Pontos e Linhas */}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-text-muted">Estilo</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    settings.setGridShowDots(true);
                    settings.setGridShowLines(false);
                  }}
                  className={`p-1.5 rounded border transition-colors ${
                    settings.grid.showDots && !settings.grid.showLines
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-surface2 border-border text-text-muted hover:border-primary/50'
                  }`}
                  title="Pontos"
                >
                  <Dot size={24} className="-m-1" />
                </button>
                <button
                  onClick={() => {
                    settings.setGridShowDots(false);
                    settings.setGridShowLines(true);
                  }}
                  className={`p-1.5 rounded border transition-colors ${
                    !settings.grid.showDots && settings.grid.showLines
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-surface2 border-border text-text-muted hover:border-primary/50'
                  }`}
                  title="Linhas"
                >
                  <Grid3x3 size={14} />
                </button>
              </div>
            </div>

            {/* Tamanho da Grade */}
            <div className="flex items-center justify-between py-2 gap-4">
              <span className="text-sm text-text-muted flex-shrink-0">
                {LABELS.settings.gridSize}
              </span>
              <div className="w-[75px]">
                <NumericComboField
                  value={settings.grid.size}
                  onCommit={settings.setGridSize}
                  presets={[10, 20, 25, 50, 100, 150, 200]}
                  min={10}
                  max={500}
                  step={10}
                  stepLarge={50}
                  ariaLabel="Tamanho da Grade"
                  size="small"
                  className="w-full"
                  allowScrollWheel={true}
                />
              </div>
            </div>

            {/* Cor da Grade (já inclui opacidade) */}
            <ColorField label="Cor da Grade" color={settings.grid.color} pickerId="grid" />

            {/* Subdivisões Adaptativas */}
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
          </>
        )}
      </Section>

      <Section title={LABELS.settings.showAxis}>
        <Toggle
          label={LABELS.settings.showAxis}
          checked={settings.display.centerAxes.show}
          onChange={settings.setShowCenterAxes}
        />
        {settings.display.centerAxes.show && (
          <>
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
          </>
        )}
      </Section>

      <Section title="Ícone Central">
        <Toggle
          label="Mostrar Ícone"
          checked={settings.display.centerIcon.show}
          onChange={settings.setShowCenterIcon}
        />
        {settings.display.centerIcon.show && (
          <ColorField
            label="Cor do Ícone"
            color={settings.display.centerIcon.color}
            pickerId="centerIcon"
          />
        )}
      </Section>

      <Section title="Fundo">
        <ColorField
          label="Cor de Fundo"
          color={settings.display.backgroundColor}
          pickerId="canvasBackground"
          onReset={() => settings.setCanvasBackgroundColor(DEFAULTS.DEFAULT_CANVAS_BG)}
        />
      </Section>

      {/* Color Picker Portal */}
      {activeColorPicker && (
        <>
          <div className="fixed inset-0 z-modal" onClick={closeColorPicker} />
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
