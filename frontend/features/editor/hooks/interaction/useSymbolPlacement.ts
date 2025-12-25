/**
 * Hook for electrical symbol placement.
 * Extracted from EngineInteractionLayer for better modularity.
 */

import { useCallback } from 'react';
import type { Shape, ElectricalElement, Point } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { generateId } from '@/utils/uuid';
import { getDefaultColorMode } from '@/utils/shapeColors';
import { getDefaultMetadataForSymbol, getElectricalLayerConfig } from '@/features/library/electricalProperties';
import { clampTiny } from '@/features/editor/utils/interactionHelpers';

export function useSymbolPlacement() {
  const activeElectricalSymbolId = useUIStore((s) => s.activeElectricalSymbolId);
  const electricalRotation = useUIStore((s) => s.electricalRotation);
  const electricalFlipX = useUIStore((s) => s.electricalFlipX);
  const electricalFlipY = useUIStore((s) => s.electricalFlipY);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const setSelectedShapeIds = useUIStore((s) => s.setSelectedShapeIds);
  const toolDefaults = useSettingsStore((s) => s.toolDefaults);

  const commitElectricalSymbolAt = useCallback((world: Point) => {
    if (!activeElectricalSymbolId) return;
    
    const library = useLibraryStore.getState();
    const data = useDataStore.getState();

    const symbol = library.electricalSymbols[activeElectricalSymbolId];
    if (!symbol) return;

    const layerConfig = getElectricalLayerConfig(symbol.id, symbol.category);
    const targetLayerId = data.ensureLayer(layerConfig.name, {
      strokeColor: layerConfig.strokeColor,
      fillColor: layerConfig.fillColor ?? '#ffffff',
      fillEnabled: layerConfig.fillEnabled ?? false,
      strokeEnabled: true,
      isNative: true,
    });

    const width = symbol.viewBox.width * symbol.scale;
    const height = symbol.viewBox.height * symbol.scale;
    const shapeId = generateId();

    const shape: Shape = {
      id: shapeId,
      layerId: targetLayerId,
      type: 'rect',
      x: clampTiny(world.x - width / 2),
      y: clampTiny(world.y - height / 2),
      width: clampTiny(width),
      height: clampTiny(height),
      strokeColor: layerConfig.strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled: false,
      fillColor: '#ffffff',
      fillEnabled: false,
      colorMode: getDefaultColorMode(),
      points: [],
      rotation: electricalRotation,
      scaleX: electricalFlipX,
      scaleY: electricalFlipY,
      svgSymbolId: symbol.id,
      svgRaw: symbol.canvasSvg,
      svgViewBox: symbol.viewBox,
      symbolScale: symbol.scale,
      connectionPoint: symbol.defaultConnectionPoint,
      floorId: activeFloorId ?? undefined,
      discipline: activeDiscipline,
    };

    const metadata = getDefaultMetadataForSymbol(symbol.id);
    const electricalElement: ElectricalElement = {
      id: `el-${shapeId}`,
      shapeId,
      category: symbol.category,
      name: symbol.id,
      metadata,
    };

    data.addShape(shape, electricalElement);
    setSelectedShapeIds(new Set([shapeId]));
  }, [
    activeElectricalSymbolId,
    electricalRotation,
    electricalFlipX,
    electricalFlipY,
    activeFloorId,
    activeDiscipline,
    toolDefaults.strokeWidth,
    setSelectedShapeIds
  ]);

  return {
    commitElectricalSymbolAt,
    activeElectricalSymbolId
  };
}
