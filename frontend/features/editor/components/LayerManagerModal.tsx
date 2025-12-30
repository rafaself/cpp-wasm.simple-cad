import { X, Plus, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import React from 'react';

import { EngineLayerFlags, LayerPropMask } from '@/engine/core/protocol';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';

import { useUIStore } from '../../../stores/useUIStore';

const focusableSelectors =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const LayerManagerModal: React.FC = () => {
  const isOpen = useUIStore((s) => s.isLayerManagerOpen);
  const setOpen = useUIStore((s) => s.setLayerManagerOpen);
  const activeLayerId = useUIStore((s) => s.activeLayerId);
  const setActiveLayerId = useUIStore((s) => s.setActiveLayerId);
  const runtime = useEngineRuntime();
  const layers = useEngineLayers();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const lastFocusRef = React.useRef<HTMLElement | null>(null);

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
    if (!runtime || !runtime.allocateLayerId) return;
    const nextId = runtime.allocateLayerId();
    const flags = EngineLayerFlags.Visible;
    runtime.setLayerProps(
      nextId,
      LayerPropMask.Name | LayerPropMask.Visible,
      flags,
      `Layer ${nextId}`,
    );
    setActiveLayerId(nextId);
  };

  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const close = () => {
    setOpen(false);
    if (lastFocusRef.current) {
      lastFocusRef.current.focus();
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelectors);
      first?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="layer-manager-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-[520px] h-[420px] flex flex-col text-slate-100"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900 rounded-t-lg">
          <h2 id="layer-manager-title" className="font-semibold text-sm uppercase tracking-wide">
            Gerenciador de Camadas
          </h2>
          <button
            onClick={close}
            className="text-slate-400 hover:text-white focus-outline"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-2 border-b border-slate-700 bg-slate-800 flex gap-2">
          <button
            onClick={handleAddLayer}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs border border-slate-600 focus-outline"
            aria-label="Nova Camada"
          >
            <Plus size={14} className="text-green-400" />{' '}
            <span className="font-medium">Nova Camada</span>
          </button>
        </div>

        <div className="grid grid-cols-[1fr_70px_70px] gap-1 px-4 py-2 bg-slate-900/50 text-[10px] uppercase text-slate-400 font-bold border-b border-slate-700">
          <div>Nome</div>
          <div className="text-center">Visivel</div>
          <div className="text-center">Bloq.</div>
        </div>

        <div className="flex-grow overflow-y-auto">
          {layers.map((layer) => (
            <div
              key={layer.id}
              className={`grid grid-cols-[1fr_70px_70px] gap-1 px-4 py-2 border-b border-slate-700 items-center text-xs cursor-pointer ${
                layer.id === activeLayerId ? 'bg-blue-900/20' : 'hover:bg-slate-700/40'
              }`}
              onClick={() => setActiveLayerId(layer.id)}
              tabIndex={0}
              role="row"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveLayerId(layer.id);
                }
              }}
            >
              <div className="font-medium truncate">{layer.name || `Layer ${layer.id}`}</div>
              <div className="flex justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayerFlags(layer.id, !layer.visible, undefined);
                  }}
                  className="hover:text-white p-1 rounded hover:bg-slate-700/50 focus-outline"
                  aria-label={layer.visible ? 'Ocultar camada' : 'Mostrar camada'}
                >
                  {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayerFlags(layer.id, undefined, !layer.locked);
                  }}
                  className="hover:text-white p-1 rounded hover:bg-slate-700/50 focus-outline"
                  aria-label={layer.locked ? 'Desbloquear camada' : 'Bloquear camada'}
                >
                  {layer.locked ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
              </div>
            </div>
          ))}
          {layers.length === 0 && (
            <div className="px-4 py-6 text-xs text-slate-500">Nenhuma camada encontrada.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LayerManagerModal;
