import React, { useState } from 'react';
import { Shape } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import { CircleDot } from 'lucide-react';
import ColorPicker from '../../../../components/ColorPicker';

interface StylePropertiesProps {
  selectedShape: Shape;
}

export const StyleProperties: React.FC<StylePropertiesProps> = ({ selectedShape }) => {
  const store = useDataStore();
  const [colorPickerTarget, setColorPickerTarget] = useState<'fill' | 'stroke' | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });

  const updateProp = (prop: keyof Shape, value: any) => {
    store.updateShape(selectedShape.id, { [prop]: value });
  };

  const openSidebarColorPicker = (e: React.MouseEvent, target: 'fill' | 'stroke') => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.top, left: rect.left - 270 });
    setColorPickerTarget(target);
  };

  const handleSidebarColorChange = (newColor: string) => {
    if (colorPickerTarget === 'fill') updateProp('fillColor', newColor);
    if (colorPickerTarget === 'stroke') updateProp('strokeColor', newColor);
  };

  return (
    <>
      {/* --- FILL --- */}
      <div className={`p-3 border-b border-slate-100 ${selectedShape.fillColor === 'transparent' ? 'opacity-60' : ''}`}>
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Preenchimento</h3>
          <button
              onClick={() => updateProp('fillColor', selectedShape.fillColor === 'transparent' ? '#CCCCCC' : 'transparent')}
              className={`p-1 rounded transition-colors ${
                selectedShape.fillColor === 'transparent'
                  ? 'text-slate-400 hover:text-slate-600'
                  : 'text-blue-600 hover:text-blue-700'
              }`}
              title={selectedShape.fillColor === 'transparent' ? 'Ativar preenchimento' : 'Desativar preenchimento'}
          >
              {selectedShape.fillColor === 'transparent' ? (
                  <CircleDot size={14} className="opacity-50" />
              ) : (
                  <CircleDot size={14} />
              )}
          </button>
        </div>

        {selectedShape.fillColor !== 'transparent' && (
          <div className="flex items-center gap-2">
            {/* Color swatch */}
            <div
                className="w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                style={{backgroundColor: selectedShape.fillColor}}
                onClick={(e) => openSidebarColorPicker(e, 'fill')}
            />

            {/* HEX Input */}
            <div className="flex-grow">
                <input
                    type="text"
                    value={selectedShape.fillColor}
                    onChange={(e) => {
                        let val = e.target.value.toUpperCase();
                        val = val.replace(/#/g, '');
                        val = val.replace(/[^0-9A-F]/g, '');
                        val = val.slice(0, 6);
                        if (val.length > 0) {
                            updateProp('fillColor', '#' + val);
                        }
                    }}
                    onBlur={(e) => {
                        let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                        if (val.length === 3) {
                            val = val.split('').map(c => c + c).join('');
                        }
                        if (val.length === 6) {
                            updateProp('fillColor', '#' + val);
                        }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none focus:border-blue-500"
                />
            </div>

            {/* Opacity */}
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

        {selectedShape.strokeEnabled !== false && (
          <div className="flex flex-col gap-2">
            {/* Color row */}
            <div className="flex items-center gap-2">
                <div
                    className="w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                    style={{backgroundColor: selectedShape.strokeColor}}
                    onClick={(e) => openSidebarColorPicker(e, 'stroke')}
                />

                {/* HEX Input */}
                <div className="flex-grow">
                    <input
                        type="text"
                        value={selectedShape.strokeColor}
                        onChange={(e) => {
                            let val = e.target.value.toUpperCase();
                            val = val.replace(/#/g, '');
                            val = val.replace(/[^0-9A-F]/g, '');
                            val = val.slice(0, 6);
                            if (val.length > 0) {
                                updateProp('strokeColor', '#' + val);
                            }
                        }}
                        onBlur={(e) => {
                            let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                            if (val.length === 3) {
                                val = val.split('').map(c => c + c).join('');
                            }
                            if (val.length === 6) {
                                updateProp('strokeColor', '#' + val);
                            }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none focus:border-blue-500"
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
              ? (selectedShape.fillColor === 'transparent' ? '#FFFFFF' : selectedShape.fillColor)
              : selectedShape.strokeColor
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
