import { useSettingsStore } from '@/stores/useSettingsStore';
import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';

import { isLineOrArrow } from './selectionConstants';
import { updateResizeCursor, updateRotationCursor } from './selectionCursorHelpers';

import type { SelectionCursorState } from './SelectionCursorState';
import type { InputEventContext } from '../../types';

type HoverDeps = {
  cursorState: SelectionCursorState;
  setHover: (subTarget: number, subIndex: number) => void;
  notifyChange: () => void;
};

export function handleSelectionHandleHover(ctx: InputEventContext, deps: HoverDeps): boolean {
  const { runtime, worldPoint: world } = ctx;
  if (!runtime) return false;
  const tolerance = runtime.viewport.getPickingToleranceWithTransform(ctx.viewTransform);
  if (isCadDebugEnabled('pointer')) {
    cadDebugLog('pointer', 'move', { screen: ctx.screenPoint, world, tolerance });
  }

  const handleHit = runtime.pickSelectionHandle(world.x, world.y, tolerance);
  if (!handleHit || handleHit.id === 0) return false;

  deps.setHover(handleHit.subTarget, handleHit.subIndex);
  if (handleHit.subTarget === PickSubTarget.RotateHandle) {
    updateRotationCursor(deps.cursorState, handleHit.subIndex, runtime, ctx);
  } else if (handleHit.subTarget === PickSubTarget.ResizeHandle) {
    updateResizeCursor(deps.cursorState, handleHit.subIndex, runtime, ctx);
  }
  deps.notifyChange();
  return true;
}

export function applySelectionHoverResult(
  ctx: InputEventContext,
  deps: HoverDeps,
  res: PickResult,
): void {
  const { runtime, screenPoint: screen, worldPoint: world } = ctx;
  if (!runtime) return;

  deps.setHover(res.subTarget, res.subIndex);

  if (isCadDebugEnabled('pointer')) {
    const tolerance = runtime.viewport.getPickingToleranceWithTransform(ctx.viewTransform);
    cadDebugLog('pointer', 'hover-pick', {
      screen,
      world,
      tolerance,
      id: res.id,
      subTarget: res.subTarget,
      subIndex: res.subIndex,
      kind: res.kind,
    });
  }

  if (res.subTarget === PickSubTarget.RotateHandle) {
    updateRotationCursor(deps.cursorState, res.subIndex, runtime, ctx);
  } else if (res.subTarget === PickSubTarget.ResizeHandle) {
    updateResizeCursor(deps.cursorState, res.subIndex, runtime, ctx);
  } else if (res.subTarget === PickSubTarget.Vertex) {
    deps.cursorState.showMoveAt(ctx.screenPoint);
  } else if (res.subTarget === PickSubTarget.Edge) {
    const enablePolygonEdges = useSettingsStore.getState().featureFlags.enablePolygonEdgeGrips;
    if (enablePolygonEdges && res.kind === PickEntityKind.Polygon) {
      deps.cursorState.showMoveAt(ctx.screenPoint);
    } else if (isLineOrArrow(res.kind)) {
      // Lines and arrows: edge hover keeps default cursor.
    }
  }

  deps.notifyChange();
}

