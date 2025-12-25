import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ColorInheritanceMode, Shape, ShapeColorMode } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
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
import { hexToCssRgba, parseCssColorToHexAlpha } from '../../../../utils/cssColor';

interface StylePropertiesProps {
  selectedShape: Shape;
}

export const StyleProperties: React.FC<StylePropertiesProps> = ({ selectedShape }) => {
  const store = useDataStore();
  const setIsEditingAppearance = useUIStore((s) => s.setIsEditingAppearance);
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
  
  // Display colors: store never uses 'transparent'; disabled fill/stroke is represented via `*Enabled: false`.
  const displayFillColor = fillMode === 'layer' 
    ? (layer?.fillColor || '#ffffff')
    : (selectedShape.fillColor || '#ffffff');
  
  const displayStrokeColor = strokeMode === 'layer'
    ? (layer?.strokeColor || '#000000')
    : (selectedShape.strokeColor || '#000000');

  const updateProp = (prop: keyof Shape, value: any) => {
    store.updateShape(selectedShape.id, { [prop]: value });
  };

  const pointerEditCleanupRef = useRef<(() => void) | null>(null);

  const beginPointerEdit = useCallback(() => {
    setIsEditingAppearance(true);
    if (pointerEditCleanupRef.current) return;

    const end = () => {
      pointerEditCleanupRef.current?.();
      pointerEditCleanupRef.current = null;
      setIsEditingAppearance(false);
    };

    const cleanup = () => {
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      window.removeEventListener('blur', end, true);
    };

    pointerEditCleanupRef.current = cleanup;
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', end, true);
  }, [setIsEditingAppearance]);

  useEffect(() => {
    return () => {
      pointerEditCleanupRef.current?.();
      pointerEditCleanupRef.current = null;
      setIsEditingAppearance(false);
    };
  }, [setIsEditingAppearance]);

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
   * - If mode === 'layer': layer state is managed only via Layer Manager (read-only here)
   * - If mode === 'custom': toggle affects shape.strokeEnabled/fillEnabled
   */
  const handleToggleFill = () => {
    if (fillMode === 'layer') return;
    const currentEnabled = selectedShape.fillEnabled !== false;
    updateProp('fillEnabled', !currentEnabled);
  };

  const handleToggleStroke = () => {
    if (strokeMode === 'layer') return;
    const currentEnabled = selectedShape.strokeEnabled !== false;
    updateProp('strokeEnabled', !currentEnabled);
  };

  const colorModeToggle = (target: 'fill' | 'stroke', active: ColorInheritanceMode) => (
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

  const getSwatchStyle = (color: string) => ({ backgroundColor: color });

  const openSidebarColorPicker = (e: React.MouseEvent, target: 'fill' | 'stroke') => {
    e.stopPropagation();
    if ((target === 'fill' && fillMode === 'layer') || (target === 'stroke' && strokeMode === 'layer')) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.top, left: rect.left - 270 });
    setColorPickerTarget(target);
  };

  const handleSidebarColorChange = (newColor: string) => {
    const parsed = parseCssColorToHexAlpha(newColor);
    if (!parsed) return;

    if (colorPickerTarget === 'fill') {
      const nextMode = buildColorModeUpdate(selectedShape, { fill: 'custom' });
      store.updateShape(selectedShape.id, { fillColor: parsed.hex, fillOpacity: Math.round(parsed.alpha * 100), colorMode: nextMode });
    }
    if (colorPickerTarget === 'stroke') {
      const nextMode = buildColorModeUpdate(selectedShape, { stroke: 'custom' });
      store.updateShape(selectedShape.id, { strokeColor: parsed.hex, strokeOpacity: Math.round(parsed.alpha * 100), colorMode: nextMode });
    }
  };

  // Determine toggle button appearance based on effective state
  const getToggleButtonClass = (isEnabled: boolean, mode: ColorInheritanceMode) => {
    const baseClass = 'p-1 rounded transition-colors cursor-pointer';
    if (mode === 'layer') {
      return `${baseClass} cursor-not-allowed text-slate-300 hover:text-slate-300`;
    }
    if (isEnabled) {
      return `${baseClass} text-blue-600 hover:text-blue-700`;
    }
    return `${baseClass} text-slate-400 hover:text-slate-600`;
  };

  return (
    <div
      onFocusCapture={() => setIsEditingAppearance(true)}
      onBlurCapture={() => setIsEditingAppearance(false)}
      onPointerDownCapture={beginPointerEdit}
    >
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
              disabled={fillMode === 'layer'}
              title={
                fillMode === 'layer'
                  ? 'Gerencie o estado da camada no Gerenciador de Camadas'
                  : (fillEffectivelyEnabled ? 'Desativar preenchimento' : 'Ativar preenchimento')
              }
            >
              <CircleDot size={14} className={!fillEffectivelyEnabled ? 'opacity-50' : ''} />
            </button>
          </div>
        </div>

        {colorModeToggle('fill', fillMode)}

        {fillEffectivelyEnabled && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 transition-transform ${fillMode === 'layer' ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
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
              disabled={strokeMode === 'layer'}
              title={
                strokeMode === 'layer'
                  ? 'Gerencie o estado da camada no Gerenciador de Camadas'
                  : (strokeEffectivelyEnabled ? 'Desativar traço' : 'Ativar traço')
              }
            >
              <CircleDot size={14} className={!strokeEffectivelyEnabled ? 'opacity-50' : ''} />
            </button>
          </div>
        </div>

        {colorModeToggle('stroke', strokeMode)}

        {strokeEffectivelyEnabled && (
          <div className="flex flex-col gap-2">
            {/* Color row */}
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 transition-transform ${strokeMode === 'layer' ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-105'}`}
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
            color={
              colorPickerTarget === 'fill'
                ? hexToCssRgba(displayFillColor, (selectedShape.fillOpacity ?? 100) / 100)
                : hexToCssRgba(displayStrokeColor, (selectedShape.strokeOpacity ?? 100) / 100)
            }
            onChange={handleSidebarColorChange}
            onClose={() => setColorPickerTarget(null)}
            initialPosition={colorPickerPos}
          />
        </>
      )}
    </div>
  );
};
