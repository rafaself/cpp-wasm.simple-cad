import { X, Plus, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import React, { useState } from 'react';

import ColorPicker from '@/components/ColorPicker';
import { Dialog, Button } from '@/components/ui';
import { useDocumentSignal } from '@/engine/core/engineDocumentSignals';
import { EngineLayerFlags, LayerPropMask } from '@/engine/core/EngineRuntime';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { useUIStore } from '@/stores/useUIStore';
import * as DEFAULTS from '@/theme/defaults';
import { unpackColorRGBA } from '@/types/text';
import { hexToCssRgba, rgbToHex } from '@/utils/cssColor';

import { applyLayerColorAction } from '../colors/applyColorAction';

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
        isActive ? 'bg-primary/20' : 'hover:bg-surface-2/40'
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
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateFlags(layer.id, !layer.visible, undefined);
          }}
          title={layer.visible ? 'Ocultar camada' : 'Mostrar camada'}
        >
          {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </Button>
      </div>
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateFlags(layer.id, undefined, !layer.locked);
          }}
          title={layer.locked ? 'Desbloquear camada' : 'Bloquear camada'}
        >
          {layer.locked ? <Lock size={16} /> : <Unlock size={16} />}
        </Button>
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

  // Subscribe to style changes so swatches update on undo/redo or external style commands
  void useDocumentSignal('style');

  // Color Picker State
  const [activePicker, setActivePicker] = useState<{
    layerId: number;
    target: 'stroke' | 'fill';
  } | null>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [pickerColor, setPickerColor] = useState('#000000');
  const modalRef = React.useRef<HTMLDivElement>(null); // For picker positioning context if needed

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

    const maxId = layers.reduce((acc, l) => Math.max(acc, l.id), 0);
    let nextId = runtime.allocateLayerId();

    if (nextId <= maxId) {
      nextId = maxId + 1;
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

  const close = () => {
    setOpen(false);
  };

  const handlePickColor = (
    e: React.MouseEvent,
    layerId: number,
    target: 'stroke' | 'fill',
    currentColor: string,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Position relatively or absolutely?
    // Since we are inside a fixed dialog, but we want the picker to be on top.
    // If we use fixed positioning for picker (which it likely uses or we set style),
    // we should use screen coordinates.
    // NOTE: Previous implementation used offset relative to dialog top/left.
    // But standard ColorPicker might expect something else.
    // Here we store viewport coordinates.
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

  // We need a ref to the dialog content to subtract offset IF using absolute positioning relative to dialog.
  // But standard is fixed positioning for overlays.
  // Let's assume ColorPicker needs absolute positioning relative to nearest positioned ancestor?
  // Actually, the previous implementation did:
  // style={{ top: pickerPos.top - dialogRef.current.rect.top, ... }}
  // We don't have easy access to Dialog's internal ref.
  // However, we can just use a fixed container for the color picker inside the portal (or standard Popover).
  // For now, let's keep it simple: Render it inside the content flow but with fixed coords?
  // Or better, use a Portaled Popover if we had one ready for this custom logic.
  // I will assume fixed positioning works best here.

  return (
    <Dialog
      modelValue={isOpen}
      onUpdate={setOpen}
      maxWidth="520px"
      showCloseButton={false} // Custom header
      className="bg-surface-2 h-[450px] p-0 flex flex-col overflow-hidden" // Override default padding/bg
      ariaLabel="Gerenciador de Camadas"
    >
      <div className="flex flex-col h-full relative" ref={modalRef}>
        <div className="flex items-center justify-between p-3 border-b border-border bg-surface-2">
          <h2 className="font-semibold text-sm uppercase tracking-wide">Gerenciador de Camadas</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary" // primary/20 looks like secondary-ish or specific
              size="sm"
              className="h-7 text-xs border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
              onClick={handleAddLayer}
              leftIcon={<Plus size={14} />}
            >
              Nova Camada
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-text-muted hover:text-text"
              onClick={close}
              title="Fechar"
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_40px_40px_40px_40px] gap-1 px-4 py-2 bg-surface-2/50 text-[10px] uppercase text-text-muted font-bold border-b border-border">
          <div className="pl-1">Nome</div>
          <div className="text-center">Traço</div>
          <div className="text-center">Preenc</div>
          <div className="text-center">Vis</div>
          <div className="text-center">Bloq</div>
        </div>

        <div className="flex-grow overflow-y-auto">
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
            className="fixed z-50" // Use fixed to escape the dialog clipping if any
            style={{
              top: pickerPos.top,
              left: pickerPos.left,
            }}
          >
            <ColorPicker
              color={pickerColor}
              onChange={handleColorChange}
              onClose={() => setActivePicker(null)}
              initialPosition={pickerPos} // It might ignore this if we position the wrapper
            />
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default LayerManagerModal;
