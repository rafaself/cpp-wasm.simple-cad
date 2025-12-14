import React from 'react';
import { Shape } from '../../../../types';
import { useUIStore } from '../../../../stores/useUIStore';
import { Scale, Ruler } from 'lucide-react';

interface PlanPropertiesProps {
  selectedShape: Shape;
}

export const PlanProperties: React.FC<PlanPropertiesProps> = ({ selectedShape }) => {
  const setTool = useUIStore(s => s.setTool);

  // Only show for shapes that look like plans (rect with svgRaw or discipline=architecture)
  const isPlan = selectedShape.svgRaw || selectedShape.discipline === 'architecture';

  if (!isPlan) return null;

  return (
    <div className="p-3 border-b border-slate-100">
      <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2 flex items-center gap-2">
        <Scale size={12} />
        Planta / Referência
      </h3>

      <div className="flex flex-col gap-2">
        <div className="text-xs text-slate-500">
            Dimensões atuais: 
            <span className="font-mono ml-1">
                {Math.round(selectedShape.width || 0)} x {Math.round(selectedShape.height || 0)}
            </span>
        </div>

        <button
          onClick={() => setTool('calibrate')}
          className="w-full flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-md transition-colors text-xs font-medium"
        >
          <Ruler size={14} />
          Calibrar Escala
        </button>
        
        <p className="text-[10px] text-slate-400 leading-tight">
            Clique em dois pontos conhecidos na planta para definir a escala real.
        </p>
      </div>
    </div>
  );
};
