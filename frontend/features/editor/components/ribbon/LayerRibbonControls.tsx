import React, { useMemo } from 'react';
import { Layers, Eye, EyeOff, Lock, Unlock, Plus } from 'lucide-react';
import CustomSelect from '@/components/CustomSelect';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { useUIStore } from '@/stores/useUIStore';
import { EngineLayerFlags, LayerPropMask } from '@/engine/core/protocol';
import { BUTTON_STYLES, INPUT_STYLES } from '@/design/tokens';

export const LayerRibbonControls: React.FC = () => {
  const runtime = useEngineRuntime();
  const layers = useEngineLayers();
  const activeLayerId = useUIStore((s) => s.activeLayerId);
  const setActiveLayerId = useUIStore((s) => s.setActiveLayerId);
  const setLayerManagerOpen = useUIStore((s) => s.setLayerManagerOpen);

  const activeLayer = useMemo(() => layers.find(l => l.id === activeLayerId), [layers, activeLayerId]);

  const layerOptions = useMemo(() => 
    layers.map(l => ({ value: String(l.id), label: l.name })), 
    [layers]
  );

  const handleLayerChange = (val: string) => {
    setActiveLayerId(Number(val));
  };

  const updateLayerFlags = (visible?: boolean, locked?: boolean) => {
    if (!runtime || !activeLayer) return;
    
    let mask = 0;
    let flags = 0;
    const nextVisible = visible ?? activeLayer.visible;
    const nextLocked = locked ?? activeLayer.locked;

    if (visible !== undefined) mask |= LayerPropMask.Visible;
    if (locked !== undefined) mask |= LayerPropMask.Locked;

    if (nextVisible) flags |= EngineLayerFlags.Visible;
    if (nextLocked) flags |= EngineLayerFlags.Locked;

    runtime.setLayerProps(activeLayer.id, mask, flags, activeLayer.name);
  };

  const handleAddLayer = () => {
    if (!runtime || !runtime.allocateLayerId) return;
    const nextId = runtime.allocateLayerId();
    const flags = EngineLayerFlags.Visible;
    runtime.setLayerProps(nextId, LayerPropMask.Name | LayerPropMask.Visible, flags, `Layer ${nextId}`);
    setActiveLayerId(nextId);
  };

  return (
    <div className="flex flex-col h-full justify-center px-0.5 gap-1">
      {/* Row 1: Layer Select and Add */}
      <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-6 gap-0.5 w-[220px]">
        <div className="flex-1 w-full relative">
             <CustomSelect 
                value={String(activeLayerId)} 
                onChange={handleLayerChange} 
                options={layerOptions} 
                className={`bg-transparent h-full text-xs w-full px-1 focus:ring-0 border-none hover:bg-slate-800/50 rounded transition-colors text-slate-200`}
                placeholder="Selecione a camada..."
            />
        </div>
        <div className="w-px bg-slate-700/50 my-0.5" />
        <button 
            onClick={handleAddLayer}
            className={`w-6 h-full ${BUTTON_STYLES.centered} text-slate-400 hover:text-green-400 hover:bg-slate-700`}
            title="Nova Camada"
        >
            <Plus size={14} />
        </button>
      </div>

      {/* Row 2: Layer Properties */}
      <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-6 gap-0.5 w-[220px]">
           {/* Open Manager */}
           <button 
              onClick={() => setLayerManagerOpen(true)}
              className={`flex-1 h-full flex items-center justify-start px-2 gap-2 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors`}
              title="Gerenciador de Camadas"
          >
              <Layers size={12} className="opacity-70" />
              <span className="text-[10px] font-medium tracking-wide">Propriedades</span>
          </button>
          
          <div className="w-px bg-slate-700/50 my-0.5" />

          {/* Visibility Toggle */}
          <button 
              onClick={() => updateLayerFlags(!activeLayer?.visible, undefined)}
              className={`w-8 h-full ${BUTTON_STYLES.centered} ${activeLayer?.visible ? 'text-blue-400 hover:text-blue-300' : 'text-slate-500 hover:text-slate-400'}`}
              title={activeLayer?.visible ? "Ocultar Camada" : "Mostrar Camada"}
              disabled={!activeLayer}
          >
              {activeLayer?.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          <div className="w-px bg-slate-700/50 my-0.5" />

          {/* Lock Toggle */}
           <button 
              onClick={() => updateLayerFlags(undefined, !activeLayer?.locked)}
              className={`w-8 h-full ${BUTTON_STYLES.centered} ${activeLayer?.locked ? 'text-amber-400 hover:text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
              title={activeLayer?.locked ? "Desbloquear Camada" : "Bloquear Camada"}
              disabled={!activeLayer}
          >
              {activeLayer?.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
      </div>
    </div>
  );
};
