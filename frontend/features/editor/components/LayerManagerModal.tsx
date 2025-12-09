import React, { useState } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { X, Plus, Trash2, Check, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import ColorPicker from '../../../components/ColorPicker';

const LayerManagerModal: React.FC = () => {
  const uiStore = useUIStore();
  const dataStore = useDataStore();
  const [colorPickerLayerId, setColorPickerLayerId] = useState<string | null>(null);
  const [colorPickerType, setColorPickerType] = useState<'stroke' | 'fill' | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const openColorPicker = (e: React.MouseEvent, layerId: string, type: 'stroke' | 'fill') => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.bottom + 5, left: rect.left - 100 });
    setColorPickerLayerId(layerId);
    setColorPickerType(type);
  };

  const handleColorChange = (newColor: string) => {
    if (colorPickerLayerId && colorPickerType) {
      if (colorPickerType === 'stroke') {
        dataStore.setLayerStrokeColor(colorPickerLayerId, newColor);
      } else {
        dataStore.setLayerFillColor(colorPickerLayerId, newColor);
      }
    }
  };

  if (!uiStore.isLayerManagerOpen) return null;

  const activeLayer = colorPickerLayerId ? dataStore.layers.find(l => l.id === colorPickerLayerId) : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm backdrop-enter">
       <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[600px] h-[500px] flex flex-col text-slate-100 dialog-enter">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900 rounded-t-lg">
             <h2 className="font-semibold text-sm uppercase tracking-wide flex items-center gap-2">
                <span className="text-blue-500">Gerenciador de Camadas</span>
             </h2>
             <button onClick={() => uiStore.setLayerManagerOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
          </div>
          
          {/* Toolbar */}
          <div className="p-2 border-b border-slate-700 bg-slate-800 flex gap-2">
             <button onClick={dataStore.addLayer} className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs border border-slate-600 shadow-sm transition-colors">
                <Plus size={14} className="text-green-400" /> <span className="font-medium">Nova Camada</span>
             </button>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[40px_1fr_60px_60px_60px_60px_40px] gap-1 px-4 py-2 bg-slate-900/50 text-[10px] uppercase text-slate-400 font-bold border-b border-slate-700 select-none">
              <div className="text-center" title="Camada Atual">Status</div>
              <div>Nome</div>
              <div className="text-center">Visível</div>
              <div className="text-center">Bloq.</div>
              <div className="text-center">Traço</div>
              <div className="text-center">Fundo</div>
              <div className="text-center">Ação</div>
          </div>

          {/* List */}
          <div className="flex-grow overflow-y-auto p-0 bg-slate-800 custom-scrollbar">
             {dataStore.layers.map(layer => {
                const visibleColor = !layer.visible ? 'text-red-400' : 'text-blue-400';
                const lockColor = layer.locked ? 'text-red-400' : 'text-slate-600';

                return (
                <div key={layer.id} 
                     className={`grid grid-cols-[40px_1fr_60px_60px_60px_60px_40px] gap-1 px-4 py-2 border-b border-slate-700 items-center hover:bg-slate-700/50 transition-colors text-xs cursor-pointer ${layer.id === dataStore.activeLayerId ? 'bg-blue-900/20' : ''}`}
                     onClick={() => dataStore.setActiveLayerId(layer.id)}
                >
                    <div className="flex justify-center">
                        {layer.id === dataStore.activeLayerId ? <Check size={14} className="text-green-500" /> : <div className="w-3 h-3 rounded-full" style={{backgroundColor: layer.fillColor, border: `1px solid ${layer.strokeColor}`, opacity: 0.8}}></div>}
                    </div>
                    
                    <div className="font-medium truncate flex items-center h-full text-slate-200">
                       {editingLayerId === layer.id ? (
                           <input 
                                autoFocus
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={() => {
                                    if (editingName.trim()) dataStore.updateLayer(layer.id, { name: editingName.trim() });
                                    setEditingLayerId(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        if (editingName.trim()) dataStore.updateLayer(layer.id, { name: editingName.trim() });
                                        setEditingLayerId(null);
                                    }
                                    if (e.key === 'Escape') setEditingLayerId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-slate-900 border border-blue-500 rounded px-1 py-0.5 text-xs text-white outline-none"
                           />
                       ) : (
                           <span 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingLayerId(layer.id);
                                    setEditingName(layer.name);
                                }}
                                className="truncate w-full cursor-text hover:text-blue-300 transition-colors"
                                title="Clique para renomear"
                           >
                               {layer.name}
                           </span>
                       )}
                    </div>
                    
                    <div className="flex justify-center">
                        <button onClick={(e) => { e.stopPropagation(); dataStore.toggleLayerVisibility(layer.id); }} className={`hover:text-white p-1 rounded hover:bg-slate-700/50 transition-colors ${visibleColor}`}>
                           {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                    </div>
                    
                    <div className="flex justify-center">
                        <button onClick={(e) => { e.stopPropagation(); dataStore.toggleLayerLock(layer.id); }} className={`hover:text-white p-1 rounded hover:bg-slate-700/50 transition-colors ${lockColor}`}>
                           {layer.locked ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                    </div>
                    
                    <div className="flex justify-center">
                        <div 
                            className="w-5 h-5 rounded-sm border border-slate-500 cursor-pointer hover:scale-110 transition-transform shadow-sm"
                            style={{ backgroundColor: layer.strokeColor, opacity: Math.max(0.05, 1) }}
                            onClick={(e) => openColorPicker(e, layer.id, 'stroke')}
                            title="Cor do Traço"
                        />
                    </div>

                    <div className="flex justify-center">
                        <div 
                            className="w-5 h-5 rounded-sm border border-slate-500 cursor-pointer hover:scale-110 transition-transform shadow-sm"
                            style={{ backgroundColor: layer.fillColor, opacity: Math.max(0.05, 1) }}
                            onClick={(e) => openColorPicker(e, layer.id, 'fill')}
                            title="Cor do Fundo"
                        />
                    </div>

                    <div className="flex justify-center">
                         {dataStore.layers.length > 1 && layer.id !== dataStore.activeLayerId && !layer.isNative && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); if(confirm('Tem certeza que deseja excluir esta camada e todos os objetos nela?')) dataStore.deleteLayer(layer.id); }}
                                className="text-slate-500 hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors"
                                title="Excluir Camada"
                            >
                                <Trash2 size={14} />
                            </button>
                         )}
                    </div>
                </div>
             );
            })}
          </div>
       </div>

       {/* Color Picker Popup */}
       {colorPickerLayerId && (
         <>
           <div className="fixed inset-0 z-[110]" onClick={() => setColorPickerLayerId(null)} />
           <ColorPicker 
             color={activeLayer ? (colorPickerType === 'stroke' ? activeLayer.strokeColor : activeLayer.fillColor) : '#FFFFFF'}
             onChange={handleColorChange}
             onClose={() => setColorPickerLayerId(null)}
             initialPosition={colorPickerPos}
           />
         </>
       )}
    </div>
  )
}

export default LayerManagerModal;
