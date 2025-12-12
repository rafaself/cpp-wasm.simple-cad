import React from 'react';
import { TextControlProps } from '../../../types/ribbon';

const ElectricalShortcuts: React.FC = () => (
  <div className="flex flex-col justify-center gap-1 h-full px-3 text-center">
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono text-slate-300 border border-slate-600">R</kbd>
        <span className="text-[10px] text-slate-400">Girar 90 graus</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono text-slate-300 border border-slate-600">F</kbd>
        <span className="text-[10px] text-slate-400">Espelhar H</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono text-slate-300 border border-slate-600">V</kbd>
        <span className="text-[10px] text-slate-400">Espelhar V</span>
      </div>
    </div>
  </div>
);

export default ElectricalShortcuts;
