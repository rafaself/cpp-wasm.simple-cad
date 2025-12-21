import React, { useMemo, useState } from 'react';
import { Layers, Search, Zap } from 'lucide-react';
import { useLibraryStore } from '../../stores/useLibraryStore';
import { useUIStore } from '../../stores/useUIStore';
import { useDataStore } from '../../stores/useDataStore';
import { ElectricalCategory } from '../../types';
import { LibrarySymbol } from './electricalLoader';

interface ElectricalLibraryPanelProps {
  compact?: boolean;
}

const CATEGORY_LABELS: Record<ElectricalCategory, string> = {
  [ElectricalCategory.POWER]: 'Potencia',
  [ElectricalCategory.CONTROL]: 'Controle',
  [ElectricalCategory.SIGNAL]: 'Sinal',
  [ElectricalCategory.LIGHTING]: 'Iluminacao',
  [ElectricalCategory.CONDUIT]: 'Eletroduto',
};

const categoryOptions = [
  { value: 'all', label: 'Todas as categorias' },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
];

const ElectricalLibraryPanel: React.FC<ElectricalLibraryPanelProps> = ({ compact = false }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const { electricalSymbols, isLoading } = useLibraryStore();
  const uiStore = useUIStore();
  const dataStore = useDataStore();

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

  return (
    <div className="flex flex-col gap-3 text-slate-800 h-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
          <Zap size={14} className="text-amber-500" />
          <span>Simbolos eletricos</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Layers size={14} />
          <select
            value={dataStore.activeLayerId}
            onChange={(e) => dataStore.setActiveLayerId(e.target.value)}
            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {dataStore.layers.map((layer) => (
              <option key={layer.id} value={layer.id}>
                {layer.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`flex ${compact ? 'flex-col gap-2' : 'items-center gap-3'}`}>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1 w-full shadow-sm">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou tag"
            className="w-full text-sm text-slate-700 outline-none"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-white border border-slate-200 rounded px-2 py-1 text-xs shadow-sm"
        >
          {categoryOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading && <div className="text-xs text-slate-500">Carregando biblioteca...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="text-xs text-slate-500">Nenhum simbolo encontrado.</div>
        )}
        <div className="grid grid-cols-2 gap-2 mt-1">
          {filtered.map((symbol) => (
            <button
              key={symbol.id}
              onClick={() => handleSelect(symbol)}
              className={`group border rounded-lg p-2 text-left hover:border-blue-400 hover:shadow transition-colors bg-white shadow-sm flex flex-col gap-2 ${
                uiStore.activeElectricalSymbolId === symbol.id ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800 truncate">{symbol.id}</span>
                <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-medium text-slate-600">
                  {CATEGORY_LABELS[symbol.category]}
                </span>
              </div>
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-md h-20 flex items-center justify-center overflow-hidden">
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ transform: 'scale(0.9)' }}
                  dangerouslySetInnerHTML={{ __html: symbol.iconSvg }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{symbol.tags.slice(0, 2).join(', ')}</span>
                <span className="font-mono text-[10px] text-slate-400">{symbol.nominalSizeMm}mm</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-slate-500 bg-blue-50 border border-blue-100 rounded-md px-2 py-1">
        Clique em um item para iniciar a insercao. Use R para girar, F/V para espelhar e continue clicando para duplicar.
        SVGs do catalogo sao internos e passam por sanitizacao de tags/atributos antes de renderizar.
      </div>
    </div>
  );
};

export default ElectricalLibraryPanel;
