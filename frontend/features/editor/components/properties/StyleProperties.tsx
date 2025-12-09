import React, { useState } from 'react';
import { ColorInheritanceMode, Shape, ShapeColorMode } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import { CircleDot } from 'lucide-react';
import ColorPicker from '../../../../components/ColorPicker';
import { getEffectiveFillColor, getEffectiveStrokeColor, getShapeColorMode, buildColorModeUpdate } from '../../../../utils/shapeColors';

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

  const renderModeToggle = (target: 'fill' | 'stroke', active: ColorInheritanceMode) => (
    <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">
      <span>Fonte</span>
      <div className="flex gap-1.5">
        {(['layer', 'custom'] as ColorInheritanceMode[]).map(mode => (
          <button
            key={`${target}-${mode}`}
            onClick={() => setColorMode(target, mode)}
            className={`px-2 py-1 rounded border text-[9px] font-semibold transition-colors ${
              active === mode
                ? 'bg-blue-100 text-blue-600 border-blue-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700'
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

  return (
    <>
      {/* --- FILL --- */}
      <div className={`p-3 border-b border-slate-100 ${selectedShape.fillColor === 'transparent' && fillMode === 'custom' ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Preenchimento</h3>
          <button
              onClick={() => {
                if (fillMode === 'layer') return;
                setFillColorCustom(selectedShape.fillColor === 'transparent' ? '#CCCCCC' : 'transparent');
              }}
              disabled={fillMode === 'layer'}
              className={`p-1 rounded transition-colors ${
                selectedShape.fillColor === 'transparent'
                  ? 'text-slate-400 hover:text-slate-600'
                  : 'text-blue-600 hover:text-blue-700'
              } ${fillMode === 'layer' ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={
                fillMode === 'layer'
                  ? 'Controle disponível apenas no modo "Elemento"'
                  : selectedShape.fillColor === 'transparent'
                    ? 'Ativar preenchimento'
                    : 'Desativar preenchimento'
              }
          >
              {selectedShape.fillColor === 'transparent' ? (
                  <CircleDot size={14} className="opacity-50" />
              ) : (
                  <CircleDot size={14} />
              )}
          </button>
        </div>

        {renderModeToggle('fill', fillMode)}

        {(fillMode === 'layer' || selectedShape.fillColor !== 'transparent') && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div
                  className={`w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 transition-transform ${fillMode === 'layer' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}`}
                  style={getSwatchStyle(effectiveFillColor)}
                  onClick={(e) => openSidebarColorPicker(e, 'fill')}
              />

              <div className="flex-grow">
                  <input
                      type="text"
                      disabled={fillMode === 'layer'}
                      value={fillMode === 'layer' ? effectiveFillColor : selectedShape.fillColor}
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
                      className={`w-full border rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none ${fillMode === 'layer' ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-slate-50 border-slate-200 focus:border-blue-500'}`}
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
                      className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 focus:outline-none font-mono"
                    />
                    <span className="text-[10px] text-slate-400 ml-0.5">%</span>
              </div>
            </div>
            {fillMode === 'layer' && (
              <p className="text-[10px] text-slate-500">
                Herdando da camada <span className="font-semibold">{layer?.name ?? 'Atual'}</span>.
              </p>
            )}
          </div>
        )}
      </div>

      {/* --- STROKE --- */}
      <div className={`p-3 border-b border-slate-100 ${selectedShape.strokeEnabled === false ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Traço</h3>
          <button
              onClick={() => updateProp('strokeEnabled', selectedShape.strokeEnabled === false ? true : false)}
              className={`p-1 rounded transition-colors ${
                selectedShape.strokeEnabled === false
                  ? 'text-slate-400 hover:text-slate-600'
                  : 'text-blue-600 hover:text-blue-700'
              }`}
              title={selectedShape.strokeEnabled === false ? 'Ativar traço' : 'Desativar traço'}
          >
              {selectedShape.strokeEnabled === false ? (
                  <CircleDot size={14} className="opacity-50" />
              ) : (
                  <CircleDot size={14} />
              )}
          </button>
        </div>

        {renderModeToggle('stroke', strokeMode)}

        {selectedShape.strokeEnabled !== false && (
          <div className="flex flex-col gap-2">
            {/* Color row */}
            <div className="flex items-center gap-2">
                <div
                    className={`w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 transition-transform ${strokeMode === 'layer' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}`}
                    style={getSwatchStyle(effectiveStrokeColor)}
                    onClick={(e) => openSidebarColorPicker(e, 'stroke')}
                />

                {/* HEX Input */}
                <div className="flex-grow">
                    <input
                        type="text"
                        disabled={strokeMode === 'layer'}
                        value={strokeMode === 'layer' ? effectiveStrokeColor : selectedShape.strokeColor}
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
                        className={`w-full border rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none ${strokeMode === 'layer' ? 'bg-slate-100 border-slate-200 cursor-not-allowed' : 'bg-slate-50 border-slate-200 focus:border-blue-500'}`}
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
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 focus:outline-none font-mono"
                    />
                    <span className="text-[10px] text-slate-400 ml-0.5">%</span>
                </div>
            </div>
            {strokeMode === 'layer' && (
              <p className="text-[10px] text-slate-500">
                Herdando da camada <span className="font-semibold">{layer?.name ?? 'Atual'}</span>.
              </p>
            )}

            {/* Stroke Width */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 w-14 shrink-0">Espessura</span>
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
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono"
                    />
                    <span className="text-[10px] text-slate-400 ml-1">px</span>
                </div>
            </div>
          </div>
        )}
      </div>

      {colorPickerTarget && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setColorPickerTarget(null)} />
          <ColorPicker
            color={colorPickerTarget === 'fill'
              ? (fillMode === 'layer'
                  ? effectiveFillColor
                  : (selectedShape.fillColor === 'transparent' ? '#FFFFFF' : selectedShape.fillColor))
              : (strokeMode === 'layer' ? effectiveStrokeColor : selectedShape.strokeColor)
            }
            onChange={handleSidebarColorChange}
            onClose={() => setColorPickerTarget(null)}
            initialPosition={colorPickerPos}
          />
        </>
      )}
    </>
  );
};
