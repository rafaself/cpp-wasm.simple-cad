import React from 'react';
import { Eye, EyeOff, Lock, Unlock, Plus } from 'lucide-react';

import { useUIStore } from '../../../stores/useUIStore';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { EngineLayerFlags, LayerPropMask } from '@/engine/core/protocol';
import { LABELS } from '@/i18n/labels';

const EditorSidebar: React.FC = () => {
  const runtime = useEngineRuntime();
  const layers = useEngineLayers();
  const activeLayerId = useUIStore((s) => s.activeLayerId);
  const setActiveLayerId = useUIStore((s) => s.setActiveLayerId);

  const updateLayerFlags = (layerId: number, nextVisible?: boolean, nextLocked?: boolean) => {
    if (!runtime) return;
    const layer = layers.find((entry) => entry.id === layerId);
    if (!layer) return;

    let mask = 0;
    let flags = 0;

    const visible = nextVisible ?? layer.visible;
    const locked = nextLocked ?? layer.locked;

    if (nextVisible !== undefined) mask |= LayerPropMask.Visible;
    if (nextLocked !== undefined) mask |= LayerPropMask.Locked;

    if (visible) flags |= EngineLayerFlags.Visible;
    if (locked) flags |= EngineLayerFlags.Locked;

    runtime.setLayerProps(layerId, mask, flags, layer.name);
  };

  const handleAddLayer = () => {
    if (!runtime) return;
    const maxId = layers.reduce((max, layer) => Math.max(max, layer.id), 0);
    const nextId = maxId + 1;
    const flags = EngineLayerFlags.Visible;
    runtime.setLayerProps(nextId, LayerPropMask.Name | LayerPropMask.Visible, flags, `Layer ${nextId}`);
    setActiveLayerId(nextId);
  };

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 border-l border-slate-800 flex flex-col">
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-400">{LABELS.sidebar.layers}</span>
        <button
          onClick={handleAddLayer}
          className="h-6 w-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
          title={LABELS.sidebar.newLayer}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={`flex items-center justify-between px-3 py-2 text-xs border-b border-slate-800 cursor-pointer ${
              layer.id === activeLayerId ? 'bg-slate-800' : 'hover:bg-slate-800/60'
            }`}
            onClick={() => setActiveLayerId(layer.id)}
          >
            <div className="flex flex-col">
              <span className="font-semibold">{layer.name || `Layer ${layer.id}`}</span>
              <span className="text-[10px] text-slate-500">ID {layer.id}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayerFlags(layer.id, !layer.visible, undefined);
                }}
                className="p-1 text-slate-400 hover:text-white"
                title={layer.visible ? LABELS.sidebar.hideLayer : LABELS.sidebar.showLayer}
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayerFlags(layer.id, undefined, !layer.locked);
                }}
                className="p-1 text-slate-400 hover:text-white"
                title={layer.locked ? LABELS.sidebar.unlockLayer : LABELS.sidebar.lockLayer}
              >
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>
          </div>
        ))}
        {layers.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-500">{LABELS.common.none}</div>
        )}
      </div>
    </aside>
  );
};

export default EditorSidebar;
