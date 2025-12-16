import React from 'react';
import { Layer } from '../../../../types';
import { ColorPickerTarget } from '../../types/ribbon';
import { useUIStore } from '../../../../stores/useUIStore';
import { useDataStore } from '../../../../stores/useDataStore';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { getEffectiveFillColor, getEffectiveStrokeColor, getShapeColorMode, isFillEffectivelyEnabled, isStrokeEffectivelyEnabled } from '../../../../utils/shapeColors';
import EditableNumber from '../../../../components/EditableNumber';

interface ColorControlProps {
  activeLayer: Layer | undefined;
  openColorPicker: (e: React.MouseEvent, target: ColorPickerTarget) => void;
}

const LABEL_STYLE = 'text-[9px] text-slate-400 uppercase tracking-wider font-semibold';

const ColorControl: React.FC<ColorControlProps> = ({
  activeLayer,
  openColorPicker
}) => {
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const selectedIds = React.useMemo(() => Array.from(selectedShapeIds), [selectedShapeIds]);
  const shapes = useDataStore((s) => s.shapes);
  const updateShape = useDataStore((s) => s.updateShape);
  const updateLayer = useDataStore((s) => s.updateLayer);
  const strokeEnabledDefault = useSettingsStore((s) => s.toolDefaults.strokeEnabled);
  const fillDefault = useSettingsStore((s) => s.toolDefaults.fillColor);
  const strokeWidthDefault = useSettingsStore((s) => s.toolDefaults.strokeWidth);
  const setStrokeEnabled = useSettingsStore((s) => s.setStrokeEnabled);
  const setFillColor = useSettingsStore((s) => s.setFillColor);
  const setStrokeWidth = useSettingsStore((s) => s.setStrokeWidth);

  const firstSelectedId = selectedIds[0];
  const firstSelectedShape = firstSelectedId ? shapes[firstSelectedId] : null;

  const effectiveStroke = firstSelectedShape
      ? getEffectiveStrokeColor(firstSelectedShape, activeLayer)
      : (activeLayer?.strokeColor || '#000000');
  const effectiveFill = firstSelectedShape
      ? getEffectiveFillColor(firstSelectedShape, activeLayer)
      : (activeLayer?.fillColor || '#ffffff');

  const displayStrokeColor = effectiveStroke;
  const displayFillColor = effectiveFill === 'transparent'
      ? (activeLayer?.fillColor || '#ffffff')
      : effectiveFill;

  const strokeEnabled = firstSelectedShape
      ? isStrokeEffectivelyEnabled(firstSelectedShape, activeLayer)
      : (activeLayer?.strokeEnabled !== false && strokeEnabledDefault !== false);
  const fillEnabled = firstSelectedShape
      ? isFillEffectivelyEnabled(firstSelectedShape, activeLayer)
      : (activeLayer?.fillEnabled !== false && fillDefault !== 'transparent');

  const displayStrokeWidth = firstSelectedShape?.strokeWidth ?? strokeWidthDefault;

  const handleStrokeEnabledChange = (checked: boolean) => {
    setStrokeEnabled(checked);
    if (selectedIds.length === 0) return;
      selectedIds.forEach(id => {
      const shape = shapes[id];
      if (!shape) return;
      const mode = getShapeColorMode(shape).stroke;
      if (mode === 'layer' && activeLayer) {
        updateLayer(activeLayer.id, { strokeEnabled: checked });
      } else {
        updateShape(id, { strokeEnabled: checked }, true);
      }
    });
  };

  const handleFillEnabledChange = (checked: boolean) => {
    setFillColor(checked ? '#eeeeee' : 'transparent');
    if (selectedIds.length === 0) return;
      selectedIds.forEach(id => {
      const shape = shapes[id];
      if (!shape) return;
      const mode = getShapeColorMode(shape).fill;
      if (mode === 'layer' && activeLayer) {
        updateLayer(activeLayer.id, { fillEnabled: checked });
      } else {
        updateShape(id, { fillEnabled: checked }, true);
      }
    });
  };

  const handleStrokeWidthChange = (value: number) => {
    setStrokeWidth(value);
    selectedIds.forEach(id => {
      const shape = shapes[id];
      if (shape) {
        updateShape(id, { strokeWidth: value }, true);
      }
    });
  };

  return (
    <div className="flex flex-col gap-1.5 px-2 h-full justify-center w-[160px]">
      <div className="grid grid-cols-2 gap-2 w-full">
        <div className="flex flex-col items-center gap-0.5">
          <span className={LABEL_STYLE} style={{ marginBottom: 0 }}>Traço</span>
          <div className={`flex items-center justify-between w-full bg-slate-800/40 rounded border border-slate-700/30 px-1.5 py-1 ${!strokeEnabled ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              aria-label="Habilitar traço"
              checked={strokeEnabled}
              onChange={(e) => handleStrokeEnabledChange(e.target.checked)}
              className="w-3 h-3 rounded-sm border-slate-600 bg-slate-900/50 accent-blue-500 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            />
            <button
              type="button"
              className="w-5 h-5 rounded border border-slate-400 shadow-sm hover:scale-105 transition-transform focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed cursor-pointer"
              style={{ backgroundColor: displayStrokeColor }}
              onClick={(e) => openColorPicker(e, { type: 'stroke' })}
              disabled={!strokeEnabled}
              aria-label="Alterar cor do traço"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className={LABEL_STYLE} style={{ marginBottom: 0 }}>Fundo</span>
          <div className={`flex items-center justify-between w-full bg-slate-800/40 rounded border border-slate-700/30 px-1.5 py-1 ${!fillEnabled ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              aria-label="Habilitar fundo"
              checked={fillEnabled}
              onChange={(e) => handleFillEnabledChange(e.target.checked)}
              className="w-3 h-3 rounded-sm border-slate-600 bg-slate-900/50 accent-blue-500 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            />
            <button
              type="button"
              className="w-5 h-5 rounded border border-slate-400 shadow-sm hover:scale-105 transition-transform focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed cursor-pointer"
              style={{
                backgroundColor: displayFillColor === 'transparent' ? 'transparent' : displayFillColor,
                backgroundImage: displayFillColor === 'transparent'
                  ? 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)'
                  : 'none',
                backgroundSize: '4px 4px'
              }}
              onClick={(e) => openColorPicker(e, { type: 'fill' })}
              disabled={!fillEnabled}
              aria-label="Alterar cor do fundo"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col w-full gap-0.5 mt-0.5">
        <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider px-0.5">Espessura</span>
        <div className="flex items-center gap-1.5 w-full">
          <EditableNumber
            value={displayStrokeWidth}
            onChange={handleStrokeWidthChange}
            min={0}
            max={50}
            className="w-[32px] h-6 flex-none"
            displayClassName="text-[10px] font-mono"
          />
          <div className="flex-1 bg-slate-800/40 rounded-full h-4 flex items-center px-1 border border-slate-700/30">
            <input
              type="range"
              aria-label="Espessura do traço"
              min="0"
              max="50"
              step="1"
              value={displayStrokeWidth}
              onChange={(e) => handleStrokeWidthChange(parseInt(e.target.value))}
              className="w-full h-0.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 hover:[&::-webkit-slider-thumb]:bg-blue-400 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorControl;
