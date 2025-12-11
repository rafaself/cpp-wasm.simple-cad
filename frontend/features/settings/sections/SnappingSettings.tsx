import React from 'react';
import { useUIStore } from '../../../stores/useUIStore';

const SnappingSettings: React.FC = () => {
  const snapOptions = useUIStore(s => s.snapOptions);
  const setSnapOptions = useUIStore(s => s.setSnapOptions);

  const updateOption = (key: keyof typeof snapOptions, value: boolean) => {
    setSnapOptions(prev => ({ ...prev, [key]: value }));
  };

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

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wide">Snapping</h3>
        <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700">
          <ToggleField 
            label="Snap Ativo" 
            checked={snapOptions.enabled} 
            onChange={(v) => updateOption('enabled', v)} 
          />
          <ToggleField 
            label="Snap em Extremidades" 
            checked={snapOptions.endpoint} 
            onChange={(v) => updateOption('endpoint', v)} 
          />
          <ToggleField 
            label="Snap em Pontos Médios" 
            checked={snapOptions.midpoint} 
            onChange={(v) => updateOption('midpoint', v)} 
          />
          <ToggleField 
            label="Snap em Centros" 
            checked={snapOptions.center} 
            onChange={(v) => updateOption('center', v)} 
          />
          <ToggleField 
            label="Snap na Grade" 
            checked={snapOptions.grid} 
            onChange={(v) => updateOption('grid', v)} 
          />
        </div>
      </section>
    </div>
  );
};

export default SnappingSettings;
