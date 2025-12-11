import React, { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useUIStore } from '../../stores/useUIStore';
import { LibrarySymbol } from './electricalLoader';

/**
 * Electrical symbols grid component designed for the ribbon.
 * Follows the same visual pattern as other ribbon tool buttons.
 */
const ElectricalRibbonGallery: React.FC = () => {
  const { electricalSymbols, isLoading } = useLibraryStore();
  const uiStore = useUIStore();

  const symbols = useMemo(() => Object.values(electricalSymbols), [electricalSymbols]);

  const handleSelect = (symbol: LibrarySymbol) => {
    uiStore.setElectricalSymbolId(symbol.id);
    uiStore.resetElectricalPreview();
    uiStore.setTool('electrical-symbol');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 px-4 h-full">
        <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
        Carregando...
      </div>
    );
  }

  if (symbols.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 px-4 h-full">
        <Zap size={14} className="text-slate-600" />
        Nenhum símbolo
      </div>
    );
  }

  // Base button style matching ribbon pattern
  const BASE_BUTTON = 'hover:bg-slate-700/50 active:bg-slate-700';
  const ACTIVE_BUTTON = 'bg-blue-600/30 border-blue-500 ring-1 ring-blue-500/50';

  return (
    <div className="grid grid-rows-2 grid-flow-col gap-1 auto-cols-max py-1 h-full">
      {symbols.map((symbol) => {
        const isActive = uiStore.activeElectricalSymbolId === symbol.id && uiStore.activeTool === 'electrical-symbol';
        
        return (
          <button
            key={symbol.id}
            onClick={() => handleSelect(symbol)}
            className={`flex flex-col items-center justify-center px-1 py-1 gap-0.5 rounded w-full min-w-[48px] transition-all duration-150 border border-transparent
              ${isActive ? ACTIVE_BUTTON : BASE_BUTTON}
            `}
            title={symbol.id.replace(/_/g, ' ')}
          >
            {/* Symbol Icon */}
            <div 
              className="w-6 h-6 flex items-center justify-center [&_svg]:w-full [&_svg]:h-full"
              dangerouslySetInnerHTML={{ __html: symbol.iconSvg }}
            />
            {/* Label */}
            <span className={`text-[9px] text-center whitespace-nowrap leading-none truncate max-w-[44px] ${isActive ? 'text-blue-300' : 'text-slate-400'}`}>
              {symbol.id.split('_')[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ElectricalRibbonGallery;
