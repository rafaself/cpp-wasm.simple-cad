import React, { useMemo, useEffect } from 'react';
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

  useEffect(() => {
    if (layers.length > 0 && !activeLayer) {
        setActiveLayerId(layers[0].id);
    }
  }, [layers, activeLayer, setActiveLayerId]);

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
    <div className="ribbon-group-col px-1">
      {/* Row 1: Layer Select and Add */}
      <div className="ribbon-row min-w-[140px]">
        <div className="flex bg-ribbon-root/50 rounded-lg border border-ribbon-border/50 p-0.5 w-full h-full gap-0.5 items-center">
          <div className="flex-1 w-full relative h-full">
               <CustomSelect 
                  value={String(activeLayerId)} 
                  onChange={handleLayerChange} 
                  options={layerOptions} 
                  className={`bg-transparent ribbon-fill-h text-xs w-full px-1 focus:ring-0 border-none hover:bg-ribbon-hover/50 rounded transition-colors text-ribbon-text`}
                  placeholder="Selecione a camada..."
              />
          </div>
          <div className="w-px bg-ribbon-border/50 my-0.5 h-4/5" />
          <button 
              onClick={handleAddLayer}
              className={`w-6 h-full ${BUTTON_STYLES.centered} text-ribbon-muted hover:text-green-400 hover:bg-ribbon-hover`}
              title="Nova Camada"
          >
              <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Row 2: Layer Properties */}
      <div className="ribbon-row min-w-[140px]">
          <div className="flex bg-ribbon-root/50 rounded-lg border border-ribbon-border/50 p-0.5 h-full gap-0.5 shrink-0 items-center">
              {/* Visibility Toggle */}
              <button 
                  onClick={() => updateLayerFlags(!activeLayer?.visible, undefined)}
                  className={`w-7 h-full ${BUTTON_STYLES.centered} ${activeLayer?.visible ? 'text-blue-400 hover:text-blue-300' : 'text-ribbon-muted hover:text-ribbon-text'} rounded hover:bg-ribbon-hover transition-colors shrink-0`}
                  title={activeLayer?.visible ? "Ocultar Camada" : "Mostrar Camada"}
                  disabled={!activeLayer}
              >
                  {activeLayer?.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>

              <div className="w-px bg-ribbon-border/50 my-0.5 h-4/5" />

              {/* Lock Toggle */}
              <button 
                  onClick={() => updateLayerFlags(undefined, !activeLayer?.locked)}
                  className={`w-7 h-full ${BUTTON_STYLES.centered} ${activeLayer?.locked ? 'text-amber-400 hover:text-amber-300' : 'text-ribbon-muted hover:text-ribbon-text'} rounded hover:bg-ribbon-hover transition-colors shrink-0`}
                  title={activeLayer?.locked ? "Desbloquear Camada" : "Bloquear Camada"}
                  disabled={!activeLayer}
              >
                  {activeLayer?.locked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
          </div>

          <div className="flex-1" />

          {/* Open Manager (Properties) */}
          <div className="flex bg-ribbon-root/50 rounded-lg border border-ribbon-border/50 p-0.5 h-full w-8 shrink-0 items-center">
               <button 
                  onClick={() => setLayerManagerOpen(true)}
                  className={`w-full h-full ${BUTTON_STYLES.centered} rounded hover:bg-ribbon-hover text-ribbon-text hover:text-white transition-colors`}
                  title="Gerenciador de Camadas (Propriedades)"
              >
                  <Layers size={13} className="opacity-80" />
              </button>
          </div>
      </div>
    </div>
  );
};
