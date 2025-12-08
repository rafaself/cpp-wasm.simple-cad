import React from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { X, Plus, Trash2, Check, Eye, EyeOff, Lock, Unlock } from 'lucide-react';

const LayerManagerModal: React.FC = () => {
  const store = useAppStore();

  if (!store.isLayerManagerOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm backdrop-enter">
       <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[600px] h-[500px] flex flex-col text-slate-100 dialog-enter">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900 rounded-t-lg">
             <h2 className="font-semibold text-sm uppercase tracking-wide flex items-center gap-2">
                <span className="text-blue-500">Gerenciador de Camadas</span>
             </h2>
             <button onClick={() => store.setLayerManagerOpen(false)} className="text-slate-400 hover:text-white"><X size={18}/></button>
          </div>
          
          {/* Toolbar */}
          <div className="p-2 border-b border-slate-700 bg-slate-800 flex gap-2">
             <button onClick={store.addLayer} className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs border border-slate-600 shadow-sm transition-colors">
                <Plus size={14} className="text-green-400" /> <span className="font-medium">Nova Camada</span>
             </button>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[40px_1fr_60px_60px_60px_40px] gap-1 px-4 py-2 bg-slate-900/50 text-[10px] uppercase text-slate-400 font-bold border-b border-slate-700 select-none">
              <div className="text-center" title="Camada Atual">Status</div>
              <div>Nome</div>
              <div className="text-center">Visível</div>
              <div className="text-center">Bloq.</div>
              <div className="text-center">Cor</div>
              <div className="text-center">Ação</div>
          </div>

          {/* List */}
          <div className="flex-grow overflow-y-auto p-0 bg-slate-800 custom-scrollbar">
             {store.layers.map(layer => (
                <div key={layer.id} 
                     className={`grid grid-cols-[40px_1fr_60px_60px_60px_40px] gap-1 px-4 py-2 border-b border-slate-700 items-center hover:bg-slate-700/50 transition-colors text-xs cursor-pointer ${layer.id === store.activeLayerId ? 'bg-blue-900/20' : ''}`}
                     onClick={() => store.setActiveLayerId(layer.id)}
                >
                    <div className="flex justify-center">
                        {layer.id === store.activeLayerId && <Check size={14} className="text-green-500" />}
                    </div>
                    
                    <div className="font-medium truncate flex items-center h-full">
                       {layer.name}
                    </div>
                    
                    <div className="flex justify-center">
                        <button onClick={(e) => { e.stopPropagation(); store.toggleLayerVisibility(layer.id); }} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700/50 transition-colors">
                           {layer.visible ? <Eye size={16} className="text-blue-400" /> : <EyeOff size={16} className="text-slate-600" />}
                        </button>
                    </div>
                    
                    <div className="flex justify-center">
                        <button onClick={(e) => { e.stopPropagation(); store.toggleLayerLock(layer.id); }} className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700/50 transition-colors">
                           {layer.locked ? <Lock size={16} className="text-yellow-500" /> : <Unlock size={16} className="text-slate-600" />}
                        </button>
                    </div>
                    
                    <div className="flex justify-center">
                        <div className="w-4 h-4 rounded-sm border border-slate-500 overflow-hidden relative cursor-pointer hover:scale-110 transition-transform shadow-sm">
                             <input 
                                type="color" 
                                value={layer.color} 
                                onChange={(e) => { e.stopPropagation(); store.setLayerColor(layer.id, e.target.value); }} 
                                className="absolute -top-2 -left-2 w-8 h-8 p-0 cursor-pointer" 
                                onClick={(e) => e.stopPropagation()}
                             />
                        </div>
                    </div>

                    <div className="flex justify-center">
                         {store.layers.length > 1 && layer.id !== store.activeLayerId && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); if(confirm('Tem certeza que deseja excluir esta camada e todos os objetos nela?')) store.deleteLayer(layer.id); }} 
                                className="text-slate-500 hover:text-red-500 p-1 rounded hover:bg-red-500/10 transition-colors"
                                title="Excluir Camada"
                            >
                                <Trash2 size={14} />
                            </button>
                         )}
                    </div>
                </div>
             ))}
          </div>
       </div>
    </div>
  )
}

export default LayerManagerModal;