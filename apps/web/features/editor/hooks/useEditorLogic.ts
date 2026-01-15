import { CommandOp } from '@/engine/core/commandBuffer';
import { getEngineRuntime } from '@/engine/core/singleton';

import { useUIStore } from '../../../stores/useUIStore';

import type { EntityId } from '@/engine/core/protocol';

export const useEditorLogic = () => {
  const deleteSelected = () => {
    void getEngineRuntime().then((runtime) => {
      const ids = Array.from(runtime.getSelectionIds());
      if (ids.length === 0) return;
      const commands: import('@/engine/core/commandBuffer').EngineCommand[] = [];
      for (const id of ids) {
        const textMeta = runtime.getTextEntityMeta(id);
        if (textMeta) {
          commands.push({ op: CommandOp.DeleteText, id });
        } else {
          commands.push({ op: CommandOp.DeleteEntity, id });
        }
      }
      runtime.apply(commands);
      runtime.clearSelection();
    });
  };

  const deleteLayer = (layerId: number) => {
    void getEngineRuntime().then((runtime) => {
      runtime.deleteLayer(layerId);
    });
  };

  const zoomToFit = () => {
    void getEngineRuntime().then((runtime) => {
      const ids = Array.from(runtime.getDrawOrderSnapshot());
      const { canvasSize } = useUIStore.getState();
      if (canvasSize.width <= 0 || canvasSize.height <= 0) return;

      if (ids.length === 0) {
        useUIStore.getState().setViewTransform({
          x: canvasSize.width / 2,
          y: canvasSize.height / 2,
          scale: 1,
        });
        return;
      }

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const id of ids) {
        const aabb = runtime.getEntityAabb(id);
        if (!aabb.valid) continue;
        minX = Math.min(minX, aabb.minX);
        minY = Math.min(minY, aabb.minY);
        maxX = Math.max(maxX, aabb.maxX);
        maxY = Math.max(maxY, aabb.maxY);
      }

      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY)
      ) {
        return;
      }

      const width = maxX - minX;
      const height = maxY - minY;
      if (width <= 0 || height <= 0) return;

      const padding = 50;
      const availableW = canvasSize.width - padding * 2;
      const availableH = canvasSize.height - padding * 2;
      const scale = Math.min(availableW / width, availableH / height, 5);
      const centerX = minX + width / 2;
      const centerY = minY + height / 2;
      const newX = canvasSize.width / 2 - centerX * scale;
      const newY = canvasSize.height / 2 + centerY * scale;

      useUIStore.getState().setViewTransform({ x: newX, y: newY, scale });
    });
  };

  const joinSelected = () => {
    // Engine-first: join not implemented without geometry queries.
  };

  const explodeSelected = () => {
    // Engine-first: explode not implemented without geometry queries.
  };

  return {
    deleteSelected,
    deleteLayer,
    zoomToFit,
    joinSelected,
    explodeSelected,
  };
};
