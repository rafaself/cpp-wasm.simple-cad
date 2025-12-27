import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, Lock, Unlock, Plus, Layers, Settings2 } from 'lucide-react';
import { Layer } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { BUTTON_STYLES, INPUT_STYLES } from '../../../../design/tokens';
import { getShapeId as getShapeIdFromRegistry } from '@/engine/core/IdRegistry';

interface LayerControlProps {
  activeLayer: Layer | undefined;
  isLayerDropdownOpen: boolean;
  setLayerDropdownOpen: (open: boolean) => void;
  openLayerDropdown: () => void;
  layerButtonRef: React.RefObject<HTMLButtonElement>;
  layerDropdownRef: React.RefObject<HTMLDivElement>;
  dropdownPos: { top: number; left: number };
}

const InputStyle = `${INPUT_STYLES.ribbon} justify-between cursor-pointer hover:bg-slate-800 hover:border-slate-600 w-full`;
const BaseButton = BUTTON_STYLES.centered;

const LayerControl: React.FC<LayerControlProps> = ({
  activeLayer,
  isLayerDropdownOpen,
  setLayerDropdownOpen,
  openLayerDropdown,
  layerButtonRef,
  layerDropdownRef,
  dropdownPos
}) => {
  const activeLayerId = useDataStore((s) => s.activeLayerId);
  const layers = useDataStore((s) => s.layers);
  const shapes = useDataStore((s) => s.shapes);
  const setActiveLayerId = useDataStore((s) => s.setActiveLayerId);
  const toggleLayerVisibility = useDataStore((s) => s.toggleLayerVisibility);
  const toggleLayerLock = useDataStore((s) => s.toggleLayerLock);
  const addLayer = useDataStore((s) => s.addLayer);
  const updateLayer = useDataStore((s) => s.updateLayer);
  const updateShape = useDataStore((s) => s.updateShape);
  const selectedEntityIds = useUIStore((s) => s.selectedEntityIds);
  const setLayerManagerOpen = useUIStore((s) => s.setLayerManagerOpen);
  const selectedShapeIds = useMemo(() => {
    const ids = new Set<string>();
    selectedEntityIds.forEach((entityId) => {
      const shapeId = getShapeIdFromRegistry(entityId);
      if (shapeId) ids.add(shapeId);
    });
    return ids;
  }, [selectedEntityIds]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isLayerDropdownOpen) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (layerButtonRef.current?.contains(target)) return;
      if (layerDropdownRef.current?.contains(target)) return;
      setLayerDropdownOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isLayerDropdownOpen, layerButtonRef, layerDropdownRef, setLayerDropdownOpen]);

  return (
    <div className="flex flex-col justify-center gap-1.5 h-full px-2 w-[180px]">
      <div className="w-full relative">
        <button
          ref={layerButtonRef}
          className={InputStyle}
          onClick={(e) => {
            e.stopPropagation();
            setLayerDropdownOpen(!isLayerDropdownOpen);
            if (!isLayerDropdownOpen) openLayerDropdown();
          }}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span
              className="w-3.5 h-3.5 rounded-full flex-none cursor-default"
              style={{ backgroundColor: activeLayer?.fillColor || '#ffffff', border: `2px solid ${activeLayer?.strokeColor || '#000000'}` }}
            />
            <Layers size={14} className="text-slate-400" />
            <span className="truncate">{activeLayer?.name || 'Selecione'}</span>
          </div>
          <Settings2 size={12} className={`text-slate-500 transition-transform duration-300 ease-in-out ${isLayerDropdownOpen ? '-rotate-180' : 'rotate-0'}`} />
        </button>
        {isLayerDropdownOpen && typeof document !== 'undefined' && createPortal(
          <div
            ref={layerDropdownRef}
            className="fixed w-64 bg-slate-800 border border-slate-600 shadow-xl rounded-lg z-[9999] max-h-64 overflow-y-auto menu-transition py-1"
            style={{ top: dropdownPos.top + 4, left: dropdownPos.left }}
          >
            {layers.map((layer) => (
              <div key={layer.id} className={`flex items-center p-2 hover:bg-slate-700/50 cursor-pointer ${layer.id === activeLayerId ? 'bg-slate-700' : ''}`} onClick={(e) => { e.stopPropagation(); setActiveLayerId(layer.id); setLayerDropdownOpen(false); }}>
                <div className="w-2 h-2 rounded-full mr-3 shadow-sm" style={{ backgroundColor: layer.fillColor, border: `1px solid ${layer.strokeColor}` }} />
                <span className="flex-grow text-xs text-slate-200">{layer.name}</span>
                <div className="flex gap-1">
                  <button className="p-1 hover:text-white text-slate-500 transition-colors" onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}>{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                  <button className="p-1 hover:text-white text-slate-500 transition-colors" onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id); }}>{layer.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
                </div>
              </div>
            ))}
            <div className="h-px bg-slate-700/50 my-1" />
            <div className="px-3 py-2 flex items-center gap-2 hover:bg-slate-700/50 cursor-pointer text-blue-400 transition-colors" onClick={(e) => { e.stopPropagation(); addLayer(); }}>
              <Plus size={14} /> <span className="text-xs font-medium">Nova Camada</span>
            </div>
          </div>,
          document.body
        )}
      </div>

      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-1">
          <button
            onClick={() => activeLayer && toggleLayerVisibility(activeLayer.id)}
            className={`h-7 w-7 ${BaseButton} ${!activeLayer?.visible ? 'text-red-400' : ''}`}
            title="Visibilidade"
          >
            {activeLayer?.visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            onClick={() => activeLayer && toggleLayerLock(activeLayer.id)}
            className={`h-7 w-7 ${BaseButton} ${activeLayer?.locked ? 'text-yellow-400' : ''}`}
            title="Bloqueio"
          >
            {activeLayer?.locked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button
            onClick={() => {
              const ids = Array.from(selectedShapeIds);
              if (ids.length === 0 || !activeLayer) return;
              ids.forEach(id => {
                const shape = shapes[id as string];
                if (!shape) return;
                const updates: any = { colorMode: { fill: 'layer', stroke: 'layer' } };
                if (shape.layerId !== activeLayer.id) {
                  updates.layerId = activeLayer.id;
                }
                updateShape(id, updates, true);
              });
            }}
            disabled={(() => {
              if (selectedShapeIds.size === 0) return true;
               const firstId = Array.from(selectedShapeIds)[0];
               if (!firstId) return true;
               const shape = shapes[firstId as string];
              if (!shape) return true;
              const hasCustomMode = shape.colorMode?.fill === 'custom' || shape.colorMode?.stroke === 'custom';
              const isDifferentLayer = activeLayer && shape.layerId !== activeLayer.id;
              return !hasCustomMode && !isDifferentLayer;
            })()}
            className={`h-7 w-7 ${BaseButton} ${(() => {
              if (selectedShapeIds.size === 0) return 'opacity-40 cursor-not-allowed';
               const firstId = Array.from(selectedShapeIds)[0];
               if (!firstId) return 'opacity-40 cursor-not-allowed';
               const shape = shapes[firstId as string];
              if (!shape) return 'opacity-40 cursor-not-allowed';
              const hasCustomMode = shape.colorMode?.fill === 'custom' || shape.colorMode?.stroke === 'custom';
              const isDifferentLayer = activeLayer && shape.layerId !== activeLayer.id;
              if (hasCustomMode || isDifferentLayer) {
                return 'text-green-400 hover:text-green-300';
              }
              return 'opacity-40 cursor-not-allowed';
            })()}`}
            title="Aplicar camada ao elemento selecionado (cor e associação)"
          >
            <Layers size={15} />
          </button>
        </div>

        <button
          onClick={() => setLayerManagerOpen(true)}
          className={`h-7 px-2 flex items-center gap-1.5 ${BUTTON_STYLES.base} text-[9px] uppercase font-bold tracking-wide`}
          title="Gerenciador de Camadas"
        >
          <Settings2 size={18} />
        </button>
      </div>
    </div>
  );
};

export default LayerControl;
