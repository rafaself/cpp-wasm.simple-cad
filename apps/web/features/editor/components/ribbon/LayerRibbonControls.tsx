import { Layers, Eye, EyeOff, Lock, MoreHorizontal, Unlock } from 'lucide-react';
import React, { useMemo, useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { Select } from '@/components/ui/Select';
import { EngineLayerFlags, LayerPropMask } from '@/engine/core/EngineRuntime';
import { useEngineLayers } from '@/engine/core/useEngineLayers';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { INPUT_STYLES } from '@/src/styles/recipes';
import { useUIStore } from '@/stores/useUIStore';

import { isTierAtLeast } from '../../ui/ribbonLayoutV2';

import { RibbonIconButton } from './RibbonIconButton';
import { useRibbonLayout } from './ribbonLayout';
import { RibbonToggleGroup } from './RibbonToggleGroup';
import { RIBBON_ICON_SIZES } from './ribbonUtils';

export const LayerRibbonControls: React.FC = () => {
  const runtime = useEngineRuntime();
  const layers = useEngineLayers();
  const activeLayerId = useUIStore((s) => s.activeLayerId);
  const setActiveLayerId = useUIStore((s) => s.setActiveLayerId);
  const setLayerManagerOpen = useUIStore((s) => s.setLayerManagerOpen);
  const { tier } = useRibbonLayout();
  const [isManagerMenuOpen, setIsManagerMenuOpen] = React.useState(false);
  const collapseManager = isTierAtLeast(tier, 'tier2');

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
          className={`${INPUT_STYLES.ribbon} ribbon-control ribbon-fill-h text-xs`}
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
                <Eye size={RIBBON_ICON_SIZES.md} />
              ) : (
                <EyeOff size={RIBBON_ICON_SIZES.md} />
              )
            }
            onClick={() => updateLayerFlags(!activeLayer?.visible, undefined)}
            isActive={activeLayer?.visible ?? false}
            title={activeLayer?.visible ? 'Ocultar Camada' : 'Mostrar Camada'}
            disabled={!activeLayer}
            size="md"
          />

          {/* Lock Toggle */}
          <RibbonIconButton
            icon={
              activeLayer?.locked ? (
                <Lock size={RIBBON_ICON_SIZES.md} />
              ) : (
                <Unlock size={RIBBON_ICON_SIZES.md} />
              )
            }
            onClick={() => updateLayerFlags(undefined, !activeLayer?.locked)}
            isActive={activeLayer?.locked ?? false}
            title={activeLayer?.locked ? 'Desbloquear Camada' : 'Bloquear Camada'}
            disabled={!activeLayer}
            size="md"
          />
        </RibbonToggleGroup>

        <div className="flex-1" />

        {/* Open Manager (Properties) */}
        <RibbonToggleGroup width="fit">
          {collapseManager ? (
            <Popover
              isOpen={isManagerMenuOpen}
              onOpenChange={setIsManagerMenuOpen}
              placement="bottom"
              offset={6}
              className="ribbon-inline-popover"
              zIndex="z-dropdown"
              content={
                <div className="ribbon-inline-menu">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ribbon-inline-menu-item"
                    onClick={() => {
                      setLayerManagerOpen(true);
                      setIsManagerMenuOpen(false);
                    }}
                  >
                    <Layers size={RIBBON_ICON_SIZES.sm} />
                    <span>Gerenciador de Camadas</span>
                  </Button>
                </div>
              }
            >
              <RibbonIconButton
                icon={<MoreHorizontal size={RIBBON_ICON_SIZES.sm} />}
                onClick={() => undefined}
                title="Mais opções de camada"
                size="sm"
              />
            </Popover>
          ) : (
            <RibbonIconButton
              icon={<Layers size={RIBBON_ICON_SIZES.md} />}
              onClick={() => setLayerManagerOpen(true)}
              title="Gerenciador de Camadas (Propriedades)"
              size="md"
            />
          )}
        </RibbonToggleGroup>
      </div>
    </div>
  );
};
