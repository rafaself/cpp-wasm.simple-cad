import { Eye, EyeOff, Lock, Unlock, Plus } from 'lucide-react';
import React from 'react';

import { EngineLayerFlags, LayerPropMask } from '@/engine/core/protocol';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { LABELS } from '@/i18n/labels';

import { useUIStore } from '../../../stores/useUIStore';

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
    runtime.setLayerProps(
      nextId,
      LayerPropMask.Name | LayerPropMask.Visible,
      flags,
      `Layer ${nextId}`,
    );
    setActiveLayerId(nextId);
  };

  return (
    <aside className="w-64 bg-surface1 text-text border-l border-border flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-text-muted">
          {LABELS.sidebar.layers}
        </span>
        <button
          onClick={handleAddLayer}
          className="h-6 w-6 rounded bg-surface2 hover:bg-surface1 text-text flex items-center justify-center focus-outline"
          title={LABELS.sidebar.newLayer}
          aria-label={LABELS.sidebar.newLayer}
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {layers.map((layer) => (
          <div
            key={layer.id}
            className={`flex items-center justify-between px-3 py-2 text-xs border-b border-border cursor-pointer ${
              layer.id === activeLayerId ? 'bg-surface2' : 'hover:bg-surface2/70'
            }`}
            onClick={() => setActiveLayerId(layer.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveLayerId(layer.id);
              }
            }}
          >
            <div className="flex flex-col">
              <span className="font-semibold">{layer.name || `Layer ${layer.id}`}</span>
              <span className="text-[10px] text-text-muted">ID {layer.id}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayerFlags(layer.id, !layer.visible, undefined);
                }}
                className="p-1 text-text-muted hover:text-text focus-outline"
                title={layer.visible ? LABELS.sidebar.hideLayer : LABELS.sidebar.showLayer}
                aria-label={layer.visible ? LABELS.sidebar.hideLayer : LABELS.sidebar.showLayer}
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayerFlags(layer.id, undefined, !layer.locked);
                }}
                className="p-1 text-text-muted hover:text-text focus-outline"
                title={layer.locked ? LABELS.sidebar.unlockLayer : LABELS.sidebar.lockLayer}
                aria-label={layer.locked ? LABELS.sidebar.unlockLayer : LABELS.sidebar.lockLayer}
              >
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>
            </div>
          </div>
        ))}
        {layers.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-muted">{LABELS.common.none}</div>
        )}
      </div>
    </aside>
  );
};

export default EditorSidebar;
