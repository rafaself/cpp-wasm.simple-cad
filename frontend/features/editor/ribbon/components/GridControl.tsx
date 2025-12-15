import React from 'react';
import EditableNumber from '../../../../components/EditableNumber';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { GridControlProps } from '../../types/ribbon';

const GridControl: React.FC<GridControlProps> = ({ openColorPicker }) => {
  const settingsStore = useSettingsStore();

  return (
    <div className="flex flex-col gap-1.5 px-3 h-full justify-center">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => settingsStore.setGridShowDots(!settingsStore.grid.showDots)}
          aria-pressed={settingsStore.grid.showDots}
          className={`h-6 px-2.5 rounded text-[10px] font-semibold transition-all border ${
            settingsStore.grid.showDots
              ? 'bg-blue-500 text-white border-blue-600 shadow-md'
              : 'bg-slate-700/80 text-slate-300 border-slate-600 hover:bg-slate-600/80'
          }`}
        >
          Pontos
        </button>
        <button
          type="button"
          onClick={() => settingsStore.setGridShowLines(!settingsStore.grid.showLines)}
          aria-pressed={settingsStore.grid.showLines}
          className={`h-6 px-2.5 rounded text-[10px] font-semibold transition-all border ${
            settingsStore.grid.showLines
              ? 'bg-blue-500 text-white border-blue-600 shadow-md'
              : 'bg-slate-700/80 text-slate-300 border-slate-600 hover:bg-slate-600/80'
          }`}
        >
          Linhas
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-5 h-5 rounded border-2 border-slate-500 cursor-pointer hover:scale-110 transition-transform"
          style={{ backgroundColor: settingsStore.grid.color }}
          onClick={(e) => openColorPicker(e, { type: 'grid' })}
          title="Cor do Grid"
          aria-label="Cor do Grid"
        />
        <div className="flex items-center gap-0.5">
          <EditableNumber
            value={settingsStore.grid.size}
            onChange={settingsStore.setGridSize}
            min={10}
            max={500}
            className="w-[38px] h-5"
            displayClassName="text-[10px] font-mono"
          />
          <span className="text-[9px] text-slate-400">px</span>
        </div>
      </div>
    </div>
  );
};

export default GridControl;
