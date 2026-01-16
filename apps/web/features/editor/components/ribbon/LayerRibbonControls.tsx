import { Layers, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import React, { useMemo, useEffect } from 'react';

import { Select } from '@/components/ui/Select';
import { EngineLayerFlags, LayerPropMask } from '@/engine/core/EngineRuntime';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { INPUT_STYLES } from '@/src/styles/recipes';
import { useUIStore } from '@/stores/useUIStore';

import { RibbonDivider } from './RibbonDivider';
import { RibbonIconButton } from './RibbonIconButton';
import { RibbonToggleGroup } from './RibbonToggleGroup';
import { RIBBON_ICON_SIZES } from './ribbonUtils';

export const LayerRibbonControls: React.FC = () => {
  const runtime = useEngineRuntime();
  const layers = useEngineLayers();
  const activeLayerId = useUIStore((s) => s.activeLayerId);
  const setActiveLayerId = useUIStore((s) => s.setActiveLayerId);
  const setLayerManagerOpen = useUIStore((s) => s.setLayerManagerOpen);

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === activeLayerId),
    [layers, activeLayerId],
  );

  useEffect(() => {
    if (layers.length > 0 && !activeLayer) {
      setActiveLayerId(layers[0].id);
    }
  }, [layers, activeLayer, setActiveLayerId]);

  const layerOptions = useMemo(
    () => layers.map((l) => ({ value: String(l.id), label: l.name })),
    [layers],
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

  return (
    <div className="ribbon-group-col px-1">
      {/* Row 1: Layer Select */}
      <div className="ribbon-row min-w-[140px]">
        <Select
          value={String(activeLayerId)}
          onChange={handleLayerChange}
          options={layerOptions}
          className={`${INPUT_STYLES.ribbon} ribbon-fill-h text-xs`}
          placeholder="Selecione a camada..."
        />
      </div>

      {/* Row 2: Layer Properties */}
      <div className="ribbon-row min-w-[140px]">
        <RibbonToggleGroup>
          {/* Visibility Toggle */}
          <RibbonIconButton
            icon={
              activeLayer?.visible ? (
                <Eye size={RIBBON_ICON_SIZES.sm} />
              ) : (
                <EyeOff size={RIBBON_ICON_SIZES.sm} />
              )
            }
            onClick={() => updateLayerFlags(!activeLayer?.visible, undefined)}
            isActive={activeLayer?.visible ?? false}
            variant={activeLayer?.visible ? 'primary' : 'default'}
            title={activeLayer?.visible ? 'Ocultar Camada' : 'Mostrar Camada'}
            disabled={!activeLayer}
            size="sm"
          />

          <RibbonDivider />

          {/* Lock Toggle */}
          <RibbonIconButton
            icon={activeLayer?.locked ? <Lock size={12} /> : <Unlock size={12} />}
            onClick={() => updateLayerFlags(undefined, !activeLayer?.locked)}
            isActive={activeLayer?.locked ?? false}
            variant={activeLayer?.locked ? 'warning' : 'default'}
            title={activeLayer?.locked ? 'Desbloquear Camada' : 'Bloquear Camada'}
            disabled={!activeLayer}
            size="sm"
          />
        </RibbonToggleGroup>

        <div className="flex-1" />

        {/* Open Manager (Properties) */}
        <RibbonToggleGroup width="fit">
          <RibbonIconButton
            icon={<Layers size={RIBBON_ICON_SIZES.sm} />}
            onClick={() => setLayerManagerOpen(true)}
            title="Gerenciador de Camadas (Propriedades)"
            size="sm"
          />
        </RibbonToggleGroup>
      </div>
    </div>
  );
};