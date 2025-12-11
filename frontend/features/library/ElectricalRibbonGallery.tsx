import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, Zap, Filter } from 'lucide-react';
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
 * Shows a horizontal scrollable list of symbol cards with search and category filter.
 */
const ElectricalRibbonGallery: React.FC = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { electricalSymbols, isLoading } = useLibraryStore();
  const uiStore = useUIStore();

  const symbols = useMemo(() => Object.values(electricalSymbols), [electricalSymbols]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return symbols.filter((symbol) => {
      const matchesCategory = category === 'all' || symbol.category === category;
      const matchesSearch =
        term.length === 0 ||
        symbol.id.toLowerCase().includes(term) ||
        symbol.tags.some((tag) => tag.toLowerCase().includes(term));
      return matchesCategory && matchesSearch;
    });
  }, [symbols, search, category]);

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

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!showCategoryDropdown) return;
      const target = e.target as Node;
      if (categoryButtonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setShowCategoryDropdown(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [showCategoryDropdown]);

  const categoryOptions = [
    { value: 'all', label: 'Todas', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
      value,
      label,
      color: CATEGORY_COLORS[value as ElectricalCategory]
    }))
  ];

  const currentCategory = categoryOptions.find(c => c.value === category) || categoryOptions[0];

  return (
    <div className="flex items-center gap-2 h-full px-2">
      {/* Left Section: Search + Filter */}
      <div className="flex flex-col gap-1.5 h-full justify-center w-[160px] flex-none">
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-700/50 rounded-md px-2 py-1 h-7">
          <Search size={12} className="text-slate-500 flex-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar símbolo..."
            className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
          />
        </div>
        
        {/* Category Filter */}
        <div className="relative">
          <button
            ref={categoryButtonRef}
            onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
            className={`flex items-center justify-between w-full gap-1.5 px-2 py-1 h-7 rounded-md border text-xs font-medium transition-all ${currentCategory.color}`}
          >
            <div className="flex items-center gap-1.5">
              <Filter size={11} />
              <span>{currentCategory.label}</span>
            </div>
            <ChevronRight size={12} className={`transition-transform ${showCategoryDropdown ? 'rotate-90' : ''}`} />
          </button>
          
          {showCategoryDropdown && (
            <div 
              ref={dropdownRef}
              className="absolute top-full left-0 mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 py-1 overflow-hidden"
            >
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setCategory(opt.value);
                    setShowCategoryDropdown(false);
                  }}
                  className={`w-full px-2 py-1.5 text-left text-xs hover:bg-slate-700/50 transition-colors flex items-center gap-2 ${
                    category === opt.value ? 'bg-slate-700/80' : ''
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${opt.color.split(' ')[0]}`} />
                  <span className="text-slate-200">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-16 bg-slate-700/50 flex-none" />

      {/* Scroll Controls + Gallery */}
      <div className="flex items-center gap-1 flex-1 min-w-0 h-full">
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
          
          {!isLoading && filtered.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500 px-4">
              <Zap size={14} className="text-slate-600" />
              Nenhum símbolo encontrado
            </div>
          )}

          {filtered.map((symbol) => (
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
                  dangerouslySetInnerHTML={{ __html: symbol.svg }}
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
      </div>

      {/* Info Badge */}
      <div className="flex-none flex flex-col items-center justify-center gap-1 px-2">
        <div className="text-[10px] text-slate-500 font-medium">
          {filtered.length} símbolo{filtered.length !== 1 ? 's' : ''}
        </div>
        <div className="text-[8px] text-slate-600 text-center leading-tight max-w-[60px]">
          R: girar<br/>F/V: espelhar
        </div>
      </div>
    </div>
  );
};

export default ElectricalRibbonGallery;
