import { SelectionMode } from '@/engine/core/EngineRuntime';
import { ensureTextToolReady } from '@/features/editor/text/textToolController';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { PickEntityKind } from '@/types/picking';

import type { InputEventContext } from '../../types';

export const handleSelectionDoubleClick = (ctx: InputEventContext): void => {
  const { runtime, worldPoint: world, viewTransform } = ctx;
  if (!runtime) return;
  if (typeof (runtime as any).getTextEntityMeta !== 'function' || !(runtime as any).text) return;

  const tolerance = runtime.viewport.getPickingToleranceWithTransform(viewTransform);
  const pick = runtime.pickExSmart(world.x, world.y, tolerance, 0xff);
  if (pick.id === 0 || pick.kind !== PickEntityKind.Text) return;

  const meta = runtime.getTextEntityMeta(pick.id);
  const bounds = runtime.text.getTextBounds(pick.id);
  const anchorX = bounds && bounds.valid ? bounds.minX : world.x;
  const anchorY = bounds && bounds.valid ? bounds.maxY : world.y;
  const localX = (pick.hitX ?? world.x) - anchorX;
  const localY = (pick.hitY ?? world.y) - anchorY;
  const { fontFamily } = useSettingsStore.getState().toolDefaults.text;

  void ensureTextToolReady(runtime, fontFamily).then((tool) => {
    tool.resyncFromEngine();
    runtime.setSelection([pick.id], SelectionMode.Replace);
    tool.handlePointerDown(
      pick.id,
      localX,
      localY,
      false,
      anchorX,
      anchorY,
      meta?.rotation ?? 0,
      meta?.boxMode,
      meta?.constraintWidth ?? 0,
      viewTransform.scale,
      false,
    );
    useUIStore.getState().setEngineTextEditActive(true, pick.id);
    useUIStore.getState().setTool('text');
  });
};
