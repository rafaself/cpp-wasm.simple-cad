import React, { useState } from 'react';
import { ColorInheritanceMode, Shape, ShapeColorMode } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import { CircleDot, Link, Unlink } from 'lucide-react';
import ColorPicker from '../../../../components/ColorPicker';
import { 
  getEffectiveFillColor, 
  getEffectiveStrokeColor, 
  getShapeColorMode, 
  buildColorModeUpdate,
  isStrokeEffectivelyEnabled,
  isFillEffectivelyEnabled 
} from '../../../../utils/shapeColors';

interface StylePropertiesProps {
  selectedShape: Shape;
}

export const StyleProperties: React.FC<StylePropertiesProps> = ({ selectedShape }) => {
  const store = useDataStore();
  const [colorPickerTarget, setColorPickerTarget] = useState<'fill' | 'stroke' | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });
  const layer = store.layers.find(l => l.id === selectedShape.layerId);
  const colorMode = getShapeColorMode(selectedShape);
  const fillMode = colorMode.fill;
  const strokeMode = colorMode.stroke;
  const effectiveFillColor = getEffectiveFillColor(selectedShape, layer);
  const effectiveStrokeColor = getEffectiveStrokeColor(selectedShape, layer);
  
  // Use new effective enabled functions
  const strokeEffectivelyEnabled = isStrokeEffectivelyEnabled(selectedShape, layer);
  const fillEffectivelyEnabled = isFillEffectivelyEnabled(selectedShape, layer);
  
  // Display colors: never show 'transparent' - show the stored color so user knows what color will be used when re-enabled
  // For layer mode: show layer color
  // For custom mode: show shape's stored color (not transparent)
  const displayFillColor = fillMode === 'layer' 
    ? (layer?.fillColor || '#ffffff')
    : (selectedShape.fillColor === 'transparent' ? '#ffffff' : selectedShape.fillColor);
  
  const displayStrokeColor = strokeMode === 'layer'
    ? (layer?.strokeColor || '#000000')
    : selectedShape.strokeColor;

  const updateProp = (prop: keyof Shape, value: any) => {
    store.updateShape(selectedShape.id, { [prop]: value });
  };

  const setColorMode = (target: 'fill' | 'stroke', mode: ColorInheritanceMode) => {
    const current = target === 'fill' ? fillMode : strokeMode;
    if (current === mode) return;
    const nextMode = buildColorModeUpdate(
      selectedShape,
      { [target]: mode } as Partial<ShapeColorMode>
    );
    store.updateShape(selectedShape.id, { colorMode: nextMode });
  };

  const setFillColorCustom = (color: string) => {
    const nextMode = buildColorModeUpdate(selectedShape, { fill: 'custom' });
    store.updateShape(selectedShape.id, { fillColor: color, colorMode: nextMode });
  };

  const setStrokeColorCustom = (color: string) => {
    const nextMode = buildColorModeUpdate(selectedShape, { stroke: 'custom' });
    store.updateShape(selectedShape.id, { strokeColor: color, colorMode: nextMode });
  };

  /**
   * UNIFIED TOGGLE BEHAVIOR:
   * - If mode === 'layer': toggle affects layer.strokeEnabled/fillEnabled
   * - If mode === 'custom': toggle affects shape.strokeEnabled/fillEnabled
   * This prevents accidental mode changes and keeps behavior consistent.
   */
  const handleToggleFill = () => {
    if (fillMode === 'layer' && layer) {
      // Toggle on layer level - affects all elements inheriting from this layer
      store.updateLayer(layer.id, { fillEnabled: !layer.fillEnabled });
    } else {
      // Toggle on element level
      const currentEnabled = selectedShape.fillEnabled !== false;
      updateProp('fillEnabled', !currentEnabled);
    }
  };

  const handleToggleStroke = () => {
    if (strokeMode === 'layer' && layer) {
      // Toggle on layer level - affects all elements inheriting from this layer
      store.updateLayer(layer.id, { strokeEnabled: !layer.strokeEnabled });
    } else {
      // Toggle on element level
      const currentEnabled = selectedShape.strokeEnabled !== false;
      updateProp('strokeEnabled', !currentEnabled);
    }
  };

  const renderModeToggle = (target: 'fill' | 'stroke', active: ColorInheritanceMode) => (
    <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2 select-none">
      <span className="cursor-default">Fonte</span>
      <div className="flex gap-1.5">
        {(['layer', 'custom'] as ColorInheritanceMode[]).map(mode => (
          <button
            key={`${target}-${mode}`}
            onClick={() => setColorMode(target, mode)}
            className={`px-2 py-1 rounded border text-[9px] font-semibold transition-colors cursor-pointer ${
              active === mode
                ? 'bg-blue-100 text-blue-600 border-blue-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {mode === 'layer' ? 'Camada' : 'Elemento'}
          </button>
        ))}
      </div>
    </div>
  );

  const getSwatchStyle = (color: string) => ({
    backgroundColor: color === 'transparent' ? 'transparent' : color,
    backgroundImage:
      color === 'transparent'
        ? 'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)'
        : 'none',
    backgroundSize: '4px 4px'
  });

  const openSidebarColorPicker = (e: React.MouseEvent, target: 'fill' | 'stroke') => {
    e.stopPropagation();
    if ((target === 'fill' && fillMode === 'layer') || (target === 'stroke' && strokeMode === 'layer')) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.top, left: rect.left - 270 });
    setColorPickerTarget(target);
  };

  const handleSidebarColorChange = (newColor: string) => {
    if (colorPickerTarget === 'fill') setFillColorCustom(newColor);
    if (colorPickerTarget === 'stroke') setStrokeColorCustom(newColor);
  };

  // Determine toggle button appearance based on effective state
  const getToggleButtonClass = (isEnabled: boolean, mode: ColorInheritanceMode) => {
    const baseClass = 'p-1 rounded transition-colors cursor-pointer';
    if (isEnabled) {
      return `${baseClass} text-blue-600 hover:text-blue-700`;
    }
    return `${baseClass} text-slate-400 hover:text-slate-600`;
  };

  return (
    <>
      {/* --- LAYER INFO --- */}
      <div className="p-3 border-b border-slate-100">
        <div className="flex justify-between items-center">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide cursor-default select-none">
            Camada
          </h3>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-sm border border-slate-300 flex-shrink-0"
            style={{ 
              backgroundColor: layer?.fillColor || '#ffffff',
              borderColor: layer?.strokeColor || '#000000',
              borderWidth: 2
            }}
            title="Cor da camada"
          />
          <span className="text-xs text-slate-700 font-medium">
            {layer?.name || 'Sem camada'}
          </span>
          {(fillMode === 'layer' || strokeMode === 'layer') && (
            <span className="text-[8px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full font-semibold ml-auto">
              Herdando cores
            </span>
          )}
        </div>
        <p className="text-[9px] text-slate-400 mt-1.5 cursor-default select-none">
          Elemento será afetado por visibilidade/bloqueio desta camada.
        </p>
      </div>

      {/* --- FILL --- */}
      <div className={`p-3 border-b border-slate-100 ${!fillEffectivelyEnabled ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide cursor-default select-none">
            Preenchimento
          </h3>
          <div className="flex items-center gap-1">
            {/* Mode indicator badge */}
            {fillMode === 'layer' && (
              <span className="text-[8px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full font-semibold flex items-center gap-0.5" title="Herdando da camada">
                <Link size={8} />
              </span>
            )}
            <button
              onClick={handleToggleFill}
              className={getToggleButtonClass(fillEffectivelyEnabled, fillMode)}
              title={
                fillMode === 'layer'
                  ? (fillEffectivelyEnabled ? 'Desativar preenchimento na camada' : 'Ativar preenchimento na camada')
                  : (fillEffectivelyEnabled ? 'Desativar preenchimento' : 'Ativar preenchimento')
              }
            >
              <CircleDot size={14} className={!fillEffectivelyEnabled ? 'opacity-50' : ''} />
            </button>
          </div>
        </div>

        {renderModeToggle('fill', fillMode)}

        {fillEffectivelyEnabled && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 transition-transform ${fillMode === 'layer' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}`}
                style={getSwatchStyle(displayFillColor)}
                onClick={(e) => openSidebarColorPicker(e, 'fill')}
              />

              <div className="flex-grow">
                <input
                  type="text"
                  disabled={fillMode === 'layer'}
                  value={displayFillColor}
                  onChange={(e) => {
                    if (fillMode === 'layer') return;
                    let val = e.target.value.toUpperCase();
                    val = val.replace(/#/g, '');
                    val = val.replace(/[^0-9A-F]/g, '');
                    val = val.slice(0, 6);
                    if (val.length > 0) {
                      setFillColorCustom('#' + val);
                    }
                  }}
                  onBlur={(e) => {
                    if (fillMode === 'layer') return;
                    let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                    if (val.length === 3) {
                      val = val.split('').map(c => c + c).join('');
                    }
                    if (val.length === 6) {
                      setFillColorCustom('#' + val);
                    }
                  }}
                  className={`w-full border rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none cursor-text ${fillMode === 'layer' ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-slate-50 border-slate-200 focus:border-blue-500'}`}
                />
              </div>

              <div className="w-14 flex items-center bg-slate-50 border border-slate-200 rounded h-7 px-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedShape.fillOpacity ?? 100}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= 100) {
                      updateProp('fillOpacity', val);
                    }
                  }}
                  className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 focus:outline-none font-mono cursor-text"
                />
                <span className="text-[10px] text-slate-400 ml-0.5 cursor-default select-none">%</span>
              </div>
            </div>
            {fillMode === 'layer' && (
              <p className="text-[10px] text-slate-500 cursor-default select-none">
                Herdando da camada <span className="font-semibold">{layer?.name ?? 'Atual'}</span>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* --- STROKE --- */}
      <div className={`p-3 border-b border-slate-100 ${!strokeEffectivelyEnabled ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide cursor-default select-none">
            Traço
          </h3>
          <div className="flex items-center gap-1">
            {/* Mode indicator badge */}
            {strokeMode === 'layer' && (
              <span className="text-[8px] px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded-full font-semibold flex items-center gap-0.5" title="Herdando da camada">
                <Link size={8} />
              </span>
            )}
            <button
              onClick={handleToggleStroke}
              className={getToggleButtonClass(strokeEffectivelyEnabled, strokeMode)}
              title={
                strokeMode === 'layer'
                  ? (strokeEffectivelyEnabled ? 'Desativar traço na camada' : 'Ativar traço na camada')
                  : (strokeEffectivelyEnabled ? 'Desativar traço' : 'Ativar traço')
              }
            >
              <CircleDot size={14} className={!strokeEffectivelyEnabled ? 'opacity-50' : ''} />
            </button>
          </div>
        </div>

        {renderModeToggle('stroke', strokeMode)}

        {strokeEffectivelyEnabled && (
          <div className="flex flex-col gap-2">
            {/* Color row */}
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 transition-transform ${strokeMode === 'layer' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}`}
                style={getSwatchStyle(displayStrokeColor)}
                onClick={(e) => openSidebarColorPicker(e, 'stroke')}
              />

              {/* HEX Input */}
              <div className="flex-grow">
                <input
                  type="text"
                  disabled={strokeMode === 'layer'}
                  value={displayStrokeColor}
                  onChange={(e) => {
                    if (strokeMode === 'layer') return;
                    let val = e.target.value.toUpperCase();
                    val = val.replace(/#/g, '');
                    val = val.replace(/[^0-9A-F]/g, '');
                    val = val.slice(0, 6);
                    if (val.length > 0) {
                      setStrokeColorCustom('#' + val);
                    }
                  }}
                  onBlur={(e) => {
                    if (strokeMode === 'layer') return;
                    let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                    if (val.length === 3) {
                      val = val.split('').map(c => c + c).join('');
                    }
                    if (val.length === 6) {
                      setStrokeColorCustom('#' + val);
                    }
                  }}
                  className={`w-full border rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none cursor-text ${strokeMode === 'layer' ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-slate-50 border-slate-200 focus:border-blue-500'}`}
                />
              </div>

              {/* Opacity */}
              <div className="w-14 flex items-center bg-slate-50 border border-slate-200 rounded h-7 px-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selectedShape.strokeOpacity ?? 100}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= 100) {
                      updateProp('strokeOpacity', val);
                    }
                  }}
                  className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 focus:outline-none font-mono cursor-text"
                />
                <span className="text-[10px] text-slate-400 ml-0.5 cursor-default select-none">%</span>
              </div>
            </div>
            {strokeMode === 'layer' && (
              <p className="text-[10px] text-slate-500 cursor-default select-none">
                Herdando da camada <span className="font-semibold">{layer?.name ?? 'Atual'}</span>.
              </p>
            )}

            {/* Stroke Width */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-14 shrink-0 cursor-default select-none">Espessura</span>
              <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7 focus-within:border-blue-500">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={selectedShape.strokeWidth || 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= 100) {
                      updateProp('strokeWidth', val);
                    }
                  }}
                  className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono cursor-text"
                />
                <span className="text-[10px] text-slate-400 ml-1 cursor-default select-none">px</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {colorPickerTarget && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setColorPickerTarget(null)} />
          <ColorPicker
            color={colorPickerTarget === 'fill' ? displayFillColor : displayStrokeColor}
            onChange={handleSidebarColorChange}
            onClose={() => setColorPickerTarget(null)}
            initialPosition={colorPickerPos}
          />
        </>
      )}
    </>
  );
};
