import React, { useState } from "react";
import ColorPicker from "../../../components/ColorPicker";
import { useSettingsStore } from "../../../stores/useSettingsStore";
import { Section } from "../../../components/ui/Section";
import { Toggle } from "../../../components/ui/Toggle";

const CanvasSettings: React.FC = () => {
  const settings = useSettingsStore();

  // Color picker state
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(
    null
  );
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
  }: {
    label: string;
    color: string;
    pickerId: string;
  }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div
        className="w-8 h-6 rounded border border-slate-600 cursor-pointer hover:border-slate-400"
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
      <span className="text-sm text-slate-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 cursor-pointer hover:border-slate-400 focus:outline-none focus:border-blue-500"
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
      <span className="text-sm text-slate-300 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <span className="text-xs font-mono text-slate-400 w-8 text-right">
          {value}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      <Section title="Grade">
          <SliderField
            label="Tamanho"
            value={settings.grid.size}
            min={10}
            max={200}
            step={10}
            onChange={settings.setGridSize}
          />
          <ColorField
            label="Cor da Grade"
            color={settings.grid.color}
            pickerId="grid"
          />
          <Toggle
            label="Mostrar Pontos"
            checked={settings.grid.showDots}
            onChange={settings.setGridShowDots}
          />
          <Toggle
            label="Mostrar Linhas"
            checked={settings.grid.showLines}
            onChange={settings.setGridShowLines}
          />
      </Section>

      <Section title="Eixos Centrais">
          <Toggle label="Mostrar Eixos" checked={settings.display.centerAxes.show} onChange={settings.setShowCenterAxes} />
          <ColorField label="Cor Eixo X" color={settings.display.centerAxes.xColor} pickerId="axisX" />
          <ColorField label="Cor Eixo Y" color={settings.display.centerAxes.yColor} pickerId="axisY" />
          <SelectField 
            label="Tipo Eixo X" 
            value={settings.display.centerAxes.xDashed ? 'dashed' : 'solid'} 
            options={[
              { value: 'solid', label: 'Contínuo' },
              { value: 'dashed', label: 'Tracejado' }
            ]}
            onChange={(v) => settings.setAxisXDashed(v === 'dashed')}
          />
          <SelectField 
            label="Tipo Eixo Y" 
            value={settings.display.centerAxes.yDashed ? 'dashed' : 'solid'} 
            options={[
              { value: 'solid', label: 'Contínuo' },
              { value: 'dashed', label: 'Tracejado' }
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

      {/* Color Picker Portal */}
      {activeColorPicker && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={closeColorPicker} />
          <ColorPicker
            color={
              activeColorPicker === "grid"
                ? settings.grid.color
                : activeColorPicker === "axisX"
                ? settings.display.centerAxes.xColor
                : activeColorPicker === "axisY"
                ? settings.display.centerAxes.yColor
                : settings.display.centerIcon.color
            }
            onChange={(c) => {
              if (activeColorPicker === "grid") settings.setGridColor(c);
              else if (activeColorPicker === "axisX") settings.setAxisXColor(c);
              else if (activeColorPicker === "axisY") settings.setAxisYColor(c);
              else if (activeColorPicker === "centerIcon")
                settings.setCenterIconColor(c);
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
