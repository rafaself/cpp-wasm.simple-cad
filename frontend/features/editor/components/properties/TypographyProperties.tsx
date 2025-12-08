import React from 'react';
import { Shape } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import { Type, ChevronDown, Baseline, AlignLeft, AlignCenterHorizontal, AlignRight } from 'lucide-react';

interface TypographyPropertiesProps {
  selectedShape: Shape;
}

export const TypographyProperties: React.FC<TypographyPropertiesProps> = ({ selectedShape }) => {
  const store = useDataStore();
  const isText = selectedShape.type === 'text';

  if (!isText) return null;

  const updateProp = (prop: keyof Shape, value: any) => {
    store.updateShape(selectedShape.id, { [prop]: value });
  };

  return (
    <div className="p-3 border-b border-slate-100">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Tipografia</h3>
        <Type size={10} className="text-slate-400" />
      </div>

      {/* Font Family */}
      <div className="mb-2">
        <div className="relative">
            <select
                value={selectedShape.fontFamily || 'sans-serif'}
                onChange={(e) => updateProp('fontFamily', e.target.value)}
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-blue-500"
            >
                <option value="sans-serif">Inter</option>
                <option value="serif">Serif</option>
                <option value="monospace">Monospace</option>
                <option value="Arial">Arial</option>
            </select>
            <ChevronDown size={10} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Style & Size */}
      <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="relative">
            <select
                value={selectedShape.fontBold ? 'bold' : 'regular'}
                onChange={(e) => updateProp('fontBold', e.target.value === 'bold')}
                className="w-full appearance-none bg-slate-50 border border-slate-200 rounded px-2 h-6 text-[11px] text-slate-700 outline-none focus:border-blue-500"
            >
                <option value="regular">Regular</option>
                <option value="bold">Bold (Negrito)</option>
            </select>
            <ChevronDown size={10} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
        </div>
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500">
            <span className="text-[9px] text-slate-400 mr-1">Px</span>
            <input
                type="number"
                value={selectedShape.fontSize || 12}
                onChange={(e) => updateProp('fontSize', parseInt(e.target.value))}
                className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
            />
        </div>
      </div>

      {/* Line Height & Letter Spacing (Mocked UI) */}
      <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5" title="Altura da Linha">
            <Baseline size={10} className="text-slate-400 mr-1" />
            <span className="text-[9px] text-slate-500">Auto</span>
        </div>
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5" title="Espaçamento entre Letras">
            <span className="text-[9px] text-slate-400 mr-1 tracking-widest">A|A</span>
            <span className="text-[9px] text-slate-500 ml-auto">0%</span>
        </div>
      </div>

      {/* Text Alignment (Mocked UI actions) */}
      <div className="flex bg-slate-50 border border-slate-200 rounded p-0.5 justify-between">
          <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><AlignLeft size={12} /></button>
          <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><AlignCenterHorizontal size={12} /></button>
          <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><AlignRight size={12} /></button>
      </div>
    </div>
  );
};
