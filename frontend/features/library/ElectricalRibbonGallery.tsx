import React, { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useUIStore } from '../../stores/useUIStore';
import { ElectricalCategory } from '../../types';
import { LibrarySymbol } from './electricalLoader';

const CATEGORY_LABELS: Record<ElectricalCategory, string> = {
  [ElectricalCategory.POWER]: 'Potência',
  [ElectricalCategory.CONTROL]: 'Controle',
  [ElectricalCategory.SIGNAL]: 'Sinal',
  [ElectricalCategory.LIGHTING]: 'Iluminação',
};

const CATEGORY_COLORS: Record<ElectricalCategory, string> = {
  [ElectricalCategory.POWER]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  [ElectricalCategory.CONTROL]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  [ElectricalCategory.SIGNAL]: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  [ElectricalCategory.LIGHTING]: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
};

/**
 * Compact electrical symbols gallery designed for the ribbon.
 * Shows a horizontal scrollable list of symbol cards.
 */
const ElectricalRibbonGallery: React.FC = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const { electricalSymbols, isLoading } = useLibraryStore();
  const uiStore = useUIStore();

  const symbols = useMemo(() => Object.values(electricalSymbols), [electricalSymbols]);

  const handleSelect = (symbol: LibrarySymbol) => {
    uiStore.setElectricalSymbolId(symbol.id);
    uiStore.resetElectricalPreview();
    uiStore.setTool('electrical-symbol');
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 200;
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  return (
    <div className="flex items-center gap-1 h-full px-2">
      {/* Left Arrow */}
      <button
        onClick={() => scroll('left')}
        className="flex-none w-6 h-16 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition-colors"
      >
        <ChevronLeft size={16} />
      </button>

      {/* Symbols Gallery */}
      <div
        ref={scrollContainerRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide h-full py-1.5 flex-1 min-w-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 px-4">
            <div className="w-4 h-4 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
            Carregando...
          </div>
        )}
        
        {!isLoading && symbols.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500 px-4">
            <Zap size={14} className="text-slate-600" />
            Nenhum símbolo encontrado
          </div>
        )}

        {symbols.map((symbol) => (
          <button
            key={symbol.id}
            onClick={() => handleSelect(symbol)}
            className={`flex-none w-20 h-full flex flex-col rounded-lg border transition-all duration-150 overflow-hidden group ${
              uiStore.activeElectricalSymbolId === symbol.id
                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                : 'border-slate-700/50 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-700/40'
            }`}
          >
            {/* Symbol Preview */}
            <div className="flex-1 flex items-center justify-center p-1 min-h-0">
              <div
                className="w-full h-full flex items-center justify-center [&_svg]:w-full [&_svg]:h-full [&_svg]:max-w-[48px] [&_svg]:max-h-[48px]"
                dangerouslySetInnerHTML={{ __html: symbol.iconSvg }}
              />
            </div>
            
            {/* Symbol Info */}
            <div className="flex-none px-1.5 py-1 bg-slate-900/60 border-t border-slate-700/30">
              <div className="text-[9px] font-medium text-slate-300 truncate text-center leading-tight">
                {symbol.id}
              </div>
              <div className={`text-[8px] text-center mt-0.5 px-1 py-0.5 rounded-full ${CATEGORY_COLORS[symbol.category]}`}>
                {CATEGORY_LABELS[symbol.category]}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Right Arrow */}
      <button
        onClick={() => scroll('right')}
        className="flex-none w-6 h-16 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded transition-colors"
      >
        <ChevronRight size={16} />
      </button>

      {/* Info Badge */}
      <div className="flex-none flex flex-col items-center justify-center gap-1 px-2">
        <div className="text-[10px] text-slate-500 font-medium">
          {symbols.length} símbolo{symbols.length !== 1 ? 's' : ''}
        </div>
        <div className="text-[8px] text-slate-600 text-center leading-tight max-w-[60px]">
          R: girar<br/>F/V: espelhar
        </div>
      </div>
    </div>
  );
};

export default ElectricalRibbonGallery;
