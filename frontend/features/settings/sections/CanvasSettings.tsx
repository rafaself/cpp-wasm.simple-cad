import React, { useState } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import ColorPicker from '../../../components/ColorPicker';

const CanvasSettings: React.FC = () => {
  const uiStore = useUIStore();
  
  // Color picker state
  const [activeColorPicker, setActiveColorPicker] = useState<string | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });

  const openColorPicker = (e: React.MouseEvent, pickerId: string) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.bottom + 5, left: rect.left });
    setActiveColorPicker(pickerId);
  };

  const closeColorPicker = () => setActiveColorPicker(null);

  const ToggleField = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-sm text-slate-300 group-hover:text-white">{label}</span>
      <div 
        className={`w-10 h-5 rounded-full p-0.5 transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-600'}`}
        onClick={() => onChange(!checked)}
      >
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </label>
  );

  const ColorField = ({ label, color, pickerId }: { label: string; color: string; pickerId: string }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div 
        className="w-8 h-6 rounded border border-slate-600 cursor-pointer hover:border-slate-400"
        style={{ backgroundColor: color }}
        onClick={(e) => openColorPicker(e, pickerId)}
      />
    </div>
  );

  const SliderField = ({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) => (
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
        <span className="text-xs font-mono text-slate-400 w-8 text-right">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Grid Section */}
      <section>
        <h3 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wide">Grade</h3>
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
          <SliderField 
            label="Tamanho" 
            value={uiStore.gridSize} 
            min={10} 
            max={200} 
            step={10} 
            onChange={uiStore.setGridSize} 
          />
          <ColorField label="Cor da Grade" color={uiStore.gridColor} pickerId="grid" />
          <ToggleField label="Mostrar Pontos" checked={uiStore.gridShowDots} onChange={uiStore.setGridShowDots} />
          <ToggleField label="Mostrar Linhas" checked={uiStore.gridShowLines} onChange={uiStore.setGridShowLines} />
        </div>
      </section>

      {/* Center Axes Section */}
      <section>
        <h3 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wide">Eixos Centrais</h3>
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
          <ToggleField label="Mostrar Eixos" checked={uiStore.showCenterAxes} onChange={uiStore.setShowCenterAxes} />
          <ColorField label="Cor Eixo X" color={uiStore.axisXColor} pickerId="axisX" />
          <ToggleField label="Eixo X Tracejado" checked={uiStore.axisXDashed} onChange={uiStore.setAxisXDashed} />
          <ColorField label="Cor Eixo Y" color={uiStore.axisYColor} pickerId="axisY" />
          <ToggleField label="Eixo Y Tracejado" checked={uiStore.axisYDashed} onChange={uiStore.setAxisYDashed} />
        </div>
      </section>

      {/* Center Icon Section */}
      <section>
        <h3 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wide">Ícone Central</h3>
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
          <ToggleField label="Mostrar Ícone" checked={uiStore.showCenterIcon} onChange={uiStore.setShowCenterIcon} />
          <ColorField label="Cor do Ícone" color={uiStore.centerIconColor} pickerId="centerIcon" />
        </div>
      </section>

      {/* Color Picker Portal */}
      {activeColorPicker && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={closeColorPicker} />
          <ColorPicker 
            color={
              activeColorPicker === 'grid' ? uiStore.gridColor :
              activeColorPicker === 'axisX' ? uiStore.axisXColor :
              activeColorPicker === 'axisY' ? uiStore.axisYColor :
              uiStore.centerIconColor
            }
            onChange={(c) => {
              if (activeColorPicker === 'grid') uiStore.setGridColor(c);
              else if (activeColorPicker === 'axisX') uiStore.setAxisXColor(c);
              else if (activeColorPicker === 'axisY') uiStore.setAxisYColor(c);
              else if (activeColorPicker === 'centerIcon') uiStore.setCenterIconColor(c);
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
