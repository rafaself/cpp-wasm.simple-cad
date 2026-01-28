import { PickSubTarget, type PickResult } from '@/types/picking';

import { SIDE_SUBINDEX_TO_ENGINE_INDEX, supportsSideHandles } from './selectionConstants';

import type { EngineRuntime } from '../../types';

export const pickSideHandle = (
  runtime: EngineRuntime,
  worldPoint: { x: number; y: number },
  tolerance: number,
): PickResult | null => {
  const res = runtime.pickSideHandle(worldPoint.x, worldPoint.y, tolerance);
  if (!res || res.id === 0 || res.subTarget !== PickSubTarget.ResizeHandle) return null;
  if (!supportsSideHandles(res.kind)) return null;
  if (!(res.subIndex in SIDE_SUBINDEX_TO_ENGINE_INDEX)) return null;
  return res;
};
