import { useRef, useCallback, useEffect } from 'react';
import type { Shape, Point, ViewTransform } from '@/types';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import { GpuPicker } from '@/engine/picking/gpuPicker';
import { isShapeInteractable } from '@/utils/visibility';
import { isSymbolInstanceHitAtWorldPoint } from '@/features/library/symbolPicking';
import { getSymbolAlphaAtUv, primeSymbolAlphaMask } from '@/features/library/symbolAlphaMaskCache';
import { isPointInShape } from '@/utils/geometry';

export function useShapePicker() {
  const gpuPickerRef = useRef<GpuPicker | null>(null);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);

  useEffect(() => {
    if (!gpuPickerRef.current) gpuPickerRef.current = new GpuPicker();
    return () => {
      gpuPickerRef.current?.dispose();
      gpuPickerRef.current = null;
    };
  }, []);

  const pickShapeAtGeometry = useCallback((
    worldPoint: Point,
    toleranceWorld: number,
  ): string | null => {
    const data = useDataStore.getState();
    const ui = useUIStore.getState();

    const queryRect = {
      x: worldPoint.x - toleranceWorld,
      y: worldPoint.y - toleranceWorld,
      width: toleranceWorld * 2,
      height: toleranceWorld * 2,
    };

    const candidates = data.spatialIndex
      .query(queryRect)
      .map((c: any) => data.shapes[c.id])
      .filter(Boolean) as Shape[];

    for (const shape of candidates) {
      const layer = data.layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) continue;
      if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
      
      if (shape.svgSymbolId) {
        if (!isSymbolInstanceHitAtWorldPoint(shape, worldPoint, getSymbolAlphaAtUv, { toleranceWorld })) continue;
        return shape.id;
      }
      
      if (shape.type === 'rect' && shape.svgRaw) {
        void primeSymbolAlphaMask(shape.id, shape.svgRaw, 256);
        if (!isSymbolInstanceHitAtWorldPoint(shape, worldPoint, getSymbolAlphaAtUv, { toleranceWorld, symbolIdOverride: shape.id })) continue;
        return shape.id;
      }
      
      if (isPointInShape(worldPoint, shape, ui.viewTransform.scale || 1, layer)) return shape.id;
    }

    return null;
  }, []);

  const pickShape = useCallback((world: Point, screen: Point, tolerance: number): string | null => {
      // 1. Try SVGs / Symbols via Alpha Mask (CPU)
      {
        const data = useDataStore.getState();
        const ui = useUIStore.getState();
        const queryRect = { x: world.x - tolerance, y: world.y - tolerance, width: tolerance * 2, height: tolerance * 2 };
        
        // Plan/SVG candidates first
        const svgCandidates = data.spatialIndex
          .query(queryRect)
          .map((c: any) => data.shapes[c.id])
          .filter((s): s is Shape => !!s && s.type === 'rect' && !!s.svgRaw && (!s.svgSymbolId || s.svgSymbolId.startsWith('plan:')));

        if (svgCandidates.length) {
           const orderIndex = new Map<string, number>();
           for (let i = 0; i < data.shapeOrder.length; i++) orderIndex.set(data.shapeOrder[i]!, i);
           svgCandidates.sort((a, b) => (orderIndex.get(b.id) ?? -1) - (orderIndex.get(a.id) ?? -1));

           for (const shape of svgCandidates) {
              const layer = data.layers.find((l) => l.id === shape.layerId);
              if (layer && (!layer.visible || layer.locked)) continue;
              if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
              void primeSymbolAlphaMask(shape.id, shape.svgRaw ?? '', 256);
              if (isSymbolInstanceHitAtWorldPoint(shape, world, getSymbolAlphaAtUv, { toleranceWorld: tolerance, symbolIdOverride: shape.id })) return shape.id;
           }
        }

        // Symbol candidates
        const symbolCandidates = data.spatialIndex
          .query(queryRect)
          .map((c: any) => data.shapes[c.id])
          .filter((s): s is Shape => !!s && !!s.svgSymbolId);

        if (symbolCandidates.length) {
            const orderIndex = new Map<string, number>();
            for (let i = 0; i < data.shapeOrder.length; i++) orderIndex.set(data.shapeOrder[i]!, i);
            symbolCandidates.sort((a, b) => (orderIndex.get(b.id) ?? -1) - (orderIndex.get(a.id) ?? -1));

            for (const shape of symbolCandidates) {
              const layer = data.layers.find((l) => l.id === shape.layerId);
              if (layer && (!layer.visible || layer.locked)) continue;
              if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
              if (isSymbolInstanceHitAtWorldPoint(shape, world, getSymbolAlphaAtUv, { toleranceWorld: tolerance })) return shape.id;
            }
        }
      }

      // 2. Try GPU Pixel Picking
      if (gpuPickerRef.current) {
        const data = useDataStore.getState();
        const gpuHit = gpuPickerRef.current.pick({
          screen,
          world,
          toleranceWorld: tolerance,
          viewTransform,
          canvasSize,
          shapes: data.shapes,
          shapeOrder: data.shapeOrder,
          layers: data.layers,
          spatialIndex: data.spatialIndex,
          activeFloorId: activeFloorId ?? 'terreo',
          activeDiscipline,
        });
        if (gpuHit) return gpuHit;
      }

      // 3. Fallback to Geometry (CPU)
      return pickShapeAtGeometry(world, tolerance);
  }, [pickShapeAtGeometry, activeFloorId, activeDiscipline, viewTransform, canvasSize]);

  return {
    pickShape
  };
}
