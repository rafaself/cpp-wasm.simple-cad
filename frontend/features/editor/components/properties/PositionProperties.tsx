import React from 'react';
import { Shape } from '../../../../types';
import { RotateCw } from 'lucide-react';
import { useDataStore } from '../../../../stores/useDataStore';

interface PositionPropertiesProps {
  selectedShape: Shape;
}

export const PositionProperties: React.FC<PositionPropertiesProps> = ({ selectedShape }) => {
  const store = useDataStore();

  const updateDimension = (prop: 'x' | 'y', value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      store.updateShape(selectedShape.id, { [prop]: num });
    }
  };

  const updateRotation = (deg: number) => {
      store.updateShape(selectedShape.id, { rotation: deg * (Math.PI / 180) });
  };

  return (
    <div className="p-3 border-b border-slate-100">
      <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2">Posição</h3>

      {/* X / Y Grid */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
          <span className="text-slate-400 text-[10px] w-3 font-medium">X</span>
          <input
            type="number"
            value={selectedShape.x !== undefined ? Math.round(selectedShape.x) : 0}
            onChange={(e) => updateDimension('x', e.target.value)}
            className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
          />
        </div>
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
          <span className="text-slate-400 text-[10px] w-3 font-medium">Y</span>
          <input
            type="number"
            value={selectedShape.y !== undefined ? Math.round(selectedShape.y) : 0}
            onChange={(e) => updateDimension('y', e.target.value)}
            className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
          />
        </div>
      </div>

      {/* Rotation */}
      <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
        <RotateCw size={10} className="text-slate-400 mr-2" />
        <input
          type="number"
          value={Math.round((selectedShape.rotation || 0) * (180 / Math.PI))}
          onChange={(e) => {
            const deg = parseFloat(e.target.value);
            if (!isNaN(deg)) updateRotation(deg);
          }}
          className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
        />
        <span className="text-slate-400 text-[10px] ml-1">°</span>
      </div>
    </div>
  );
};
