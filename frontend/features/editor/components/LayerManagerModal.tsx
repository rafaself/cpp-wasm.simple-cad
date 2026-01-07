import { X, Plus, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import React, { useState, useMemo } from 'react';

import ColorPicker from '@/components/ColorPicker';
import { CommandOp } from '@/engine/core/commandBuffer';
import { EngineLayerFlags, LayerPropMask, StyleTarget } from '@/engine/core/protocol';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { useDocumentSignal } from '@/engine/core/engineDocumentSignals';
import { useUIStore } from '@/stores/useUIStore';
import { hexToCssRgba, rgbToHex } from '@/utils/cssColor';
import { unpackColorRGBA } from '@/types/text';
import * as DEFAULTS from '@/theme/defaults';

import { applyLayerColorAction, type ColorControlTarget } from '../colors/applyColorAction';

const focusableSelectors =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const packedToCssColor = (packed: number, fallback: string): string => {
  if (packed === 0) return fallback;
  const { r, g, b, a } = unpackColorRGBA(packed);
  const hex = rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  return a < 1 ? hexToCssRgba(hex, a) : hex;
};

// Swatch component for list items
const LayerSwatch: React.FC<{
  color: string;
  enabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}> = ({ color, enabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-5 h-5 rounded border border-border/50 hover:border-text/50 transition-colors ${
      !enabled ? 'opacity-50' : ''
    }`}
    style={{ backgroundColor: color }}
    aria-label="Alterar cor"
  >
    {!enabled && (
      <div className="w-full h-full relative overflow-hidden">
        <div className="absolute inset-0 border-t border-red-500/50 rotate-45 transform origin-center translate-y-2"></div>
      </div>
    )}
  </button>
);

const LayerRow: React.FC<{
  layer: { id: number; name: string; visible: boolean; locked: boolean };
  isActive: boolean;
  runtime: any;
  onSelect: () => void;
  onUpdateFlags: (id: number, visible?: boolean, locked?: boolean) => void;
  onPickColor: (
    e: React.MouseEvent,
    layerId: number,
    target: 'stroke' | 'fill',
    currentColor: string,
  ) => void;
}> = ({ layer, isActive, runtime, onSelect, onUpdateFlags, onPickColor }) => {
  const style = runtime?.style.getLayerStyle(layer.id);

  const strokeColor = style
    ? packedToCssColor(style.strokeRGBA, DEFAULTS.DEFAULT_STROKE_COLOR)
    : DEFAULTS.DEFAULT_STROKE_COLOR;
  const fillColor = style
    ? packedToCssColor(style.fillRGBA, DEFAULTS.DEFAULT_FILL_COLOR)
    : DEFAULTS.DEFAULT_FILL_COLOR;

  return (
    <div
      className={`grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-4 py-2 border-b border-border items-center text-xs cursor-pointer ${
        isActive ? 'bg-primary/20' : 'hover:bg-surface2/40'
      }`}
      onClick={onSelect}
      tabIndex={0}
      role="row"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="font-medium truncate pl-1">{layer.name || `Layer ${layer.id}`}</div>

      {/* Stroke Color */}
      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
        <LayerSwatch
          color={strokeColor}
          enabled={style?.strokeEnabled}
          onClick={(e) => onPickColor(e, layer.id, 'stroke', strokeColor)}
        />
      </div>

      {/* Fill Color */}
      <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
        <LayerSwatch
          color={fillColor}
          enabled={style?.fillEnabled}
          onClick={(e) => onPickColor(e, layer.id, 'fill', fillColor)}
        />
      </div>

      <div className="flex justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateFlags(layer.id, !layer.visible, undefined);
          }}
          className="hover:text-text p-1 rounded hover:bg-surface2/50 focus-outline text-text-muted hover:text-text"
          aria-label={layer.visible ? 'Ocultar camada' : 'Mostrar camada'}
        >
          {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>
      <div className="flex justify-center">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUpdateFlags(layer.id, undefined, !layer.locked);
          }}
          className="hover:text-text p-1 rounded hover:bg-surface2/50 focus-outline text-text-muted hover:text-text"
          aria-label={layer.locked ? 'Desbloquear camada' : 'Bloquear camada'}
        >
          {layer.locked ? <Lock size={16} /> : <Unlock size={16} />}
        </button>
      </div>
    </div>
  );
};

const LayerManagerModal: React.FC = () => {
  const isOpen = useUIStore((s) => s.isLayerManagerOpen);
  const setOpen = useUIStore((s) => s.setLayerManagerOpen);
  const activeLayerId = useUIStore((s) => s.activeLayerId);
  const setActiveLayerId = useUIStore((s) => s.setActiveLayerId);
  const runtime = useEngineRuntime();
  const layers = useEngineLayers();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const lastFocusRef = React.useRef<HTMLElement | null>(null);
  const styleGeneration = useDocumentSignal('style'); // Force re-render on style changes

  // Color Picker State
  const [activePicker, setActivePicker] = useState<{
    layerId: number;
    target: 'stroke' | 'fill';
  } | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [pickerColor, setPickerColor] = useState('#000000');

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

    // Fix for "Default layer disappears" bug:
    // Ensure we don't accidentally reuse an existing ID if the engine's counter is out of sync.
    const maxId = layers.reduce((acc, l) => Math.max(acc, l.id), 0);
    let nextId = runtime.allocateLayerId();

    if (nextId <= maxId) {
      // Collision detected! The engine's nextId is lagging behind existing layers.
      // This happens if "Default" layer (id=1) was created but engine's nextId stayed at 1.
      nextId = maxId + 1;
      // Optionally, call allocateLayerId specifically to bump the counter if possible,
      // but we can't easily force it without potentially creating dummy layers.
      // Since we are setting props manually, just using a new ID is safe.
    }

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

  const handlePickColor = (
    e: React.MouseEvent,
    layerId: number,
    target: 'stroke' | 'fill',
    currentColor: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPickerPos({ top: rect.bottom + 6, left: rect.left });
    setActivePicker({ layerId, target });
    setPickerColor(currentColor);
  };

  const handleColorChange = (newColor: string) => {
    if (!activePicker || !runtime) return;

    applyLayerColorAction({
      runtime,
      layerId: activePicker.layerId,
      target: activePicker.target,
      color: newColor,
    });
    setPickerColor(newColor);
  };

  React.useEffect(() => {
    if (isOpen) {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      const first = dialogRef.current?.querySelector<HTMLElement>(focusableSelectors);
      first?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Header Actions
  // "New Layer" Moved to header right

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
        className="bg-surface-strong border border-border rounded-lg shadow-2xl w-[520px] h-[450px] flex flex-col text-text relative"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="flex items-center justify-between p-3 border-b border-border bg-surface2 rounded-t-lg">
          <h2 id="layer-manager-title" className="font-semibold text-sm uppercase tracking-wide">
            Gerenciador de Camadas
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAddLayer}
              className="flex items-center gap-1 px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs border border-primary/20 transition-colors focus-outline"
              aria-label="Nova Camada"
            >
              <Plus size={14} />
              <span className="font-medium">Nova Camada</span>
            </button>
            <button
              onClick={close}
              className="text-text-muted hover:text-text focus-outline ml-2"
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-4 py-2 bg-surface2/50 text-[10px] uppercase text-text-muted font-bold border-b border-border">
          <div className="pl-1">Nome</div>
          <div className="text-center">Traço</div>
          <div className="text-center">Preenc</div>
          <div className="text-center">Vis</div>
          <div className="text-center">Bloq</div>
        </div>

        <div className="flex-grow overflow-y-auto">
          {/* Force re-render when styleGeneration changes by passing it to key or relying on hook usage inside Row */}
          {/* But LayerRow uses runtime.getLayerStyle, which is not reactive itself unless we force update. */}
          {/* The parent 'styleGeneration' constant usage forces this component to re-render. */}
          {/* We map layers to LayerRow */}

          {layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              isActive={layer.id === activeLayerId}
              runtime={runtime}
              onSelect={() => setActiveLayerId(layer.id)}
              onUpdateFlags={updateLayerFlags}
              onPickColor={handlePickColor}
            />
          ))}

          {layers.length === 0 && (
            <div className="px-4 py-6 text-xs text-text-muted">Nenhuma camada encontrada.</div>
          )}
        </div>

        {activePicker && (
          <div
            className="absolute z-50"
            style={{
              top: pickerPos.top - dialogRef.current!.getBoundingClientRect().top,
              left: pickerPos.left - dialogRef.current!.getBoundingClientRect().left,
            }}
          >
            {/* We need to position relative to modal or use portal. 
                    Simple approach: Use fixed positioning for ColorPicker if it supports it, 
                    OR adjust coordinates to be relative to this container if overflow allowed.
                    'overflow-y-auto' is on the list container, but modal is flex-col.
                    The ColorPicker in ColorRibbon uses fixed strategy often.
                    Let's try standard ColorPicker usage.
                */}
            <ColorPicker
              color={pickerColor}
              onChange={handleColorChange}
              onClose={() => setActivePicker(null)}
              initialPosition={pickerPos}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default LayerManagerModal;
