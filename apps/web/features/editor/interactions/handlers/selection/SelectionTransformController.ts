import { TransformMode, type SelectionMode } from '@/engine/core/EngineRuntime';
import { PickSubTarget, type PickResult } from '@/types/picking';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import { buildModifierMask } from '../../modifierMask';
import { isLineOrArrow } from './selectionConstants';
import { SIDE_SUBINDEX_TO_ENGINE_INDEX } from './selectionConstants';

import type { InputEventContext } from '../../types';
import type { SelectionInteractionState } from './selectionTypes';

type TransformControllerDeps = {
  setState: (state: SelectionInteractionState) => void;
  setHover: (subTarget: number, subIndex: number) => void;
};

export class SelectionTransformController {
  constructor(private readonly deps: TransformControllerDeps) {}

  beginTransformWithPick(
    ctx: InputEventContext,
    pick: PickResult,
    startScreen: { x: number; y: number },
    selectionModeOnDrag: SelectionMode | null,
  ): void {
    const { runtime, event } = ctx;
    if (!runtime || pick.id === 0) return;

    if (selectionModeOnDrag !== null) {
      runtime.setSelection([pick.id], selectionModeOnDrag);
    }

    const activeIds = runtime.getSelectionIds();
    if (activeIds.length === 0) return;

    const modifiers = buildModifierMask(event);
    let mode = TransformMode.Move;
    if (pick.subTarget === PickSubTarget.ResizeHandle) {
      mode = TransformMode.Resize;
    } else if (pick.subTarget === PickSubTarget.RotateHandle) {
      mode = TransformMode.Rotate;
    } else if (pick.subTarget === PickSubTarget.Vertex) {
      mode = TransformMode.VertexDrag;
    } else if (pick.subTarget === PickSubTarget.Edge) {
      mode = isLineOrArrow(pick.kind) ? TransformMode.Move : TransformMode.EdgeDrag;
    }

    runtime.beginTransform(
      activeIds,
      mode,
      pick.id,
      pick.subIndex,
      startScreen.x,
      startScreen.y,
      ctx.viewTransform.x,
      ctx.viewTransform.y,
      ctx.viewTransform.scale,
      ctx.canvasSize.width,
      ctx.canvasSize.height,
      modifiers,
    );
    cadDebugLog('transform', 'begin', () => ({
      ids: activeIds,
      mode,
      specificId: pick.id,
      subIndex: pick.subIndex,
      x: startScreen.x,
      y: startScreen.y,
    }));

    this.deps.setHover(pick.subTarget, pick.subIndex);
    this.deps.setState({
      kind: 'transform',
      startScreen: { x: startScreen.x, y: startScreen.y },
      mode,
    });
  }

  beginSideResize(ctx: InputEventContext, pick: PickResult): boolean {
    const { runtime, screenPoint: screen, event } = ctx;
    if (!runtime || pick.id === 0) return false;
    if (pick.subTarget !== PickSubTarget.ResizeHandle) return false;
    if (!(pick.subIndex in SIDE_SUBINDEX_TO_ENGINE_INDEX)) return false;

    const sideIndex = SIDE_SUBINDEX_TO_ENGINE_INDEX[pick.subIndex];
    if (sideIndex === undefined) return false;

    const modifiers = buildModifierMask(event);
    const selectionIds = runtime.getSelectionIds();

    runtime.beginTransform(
      selectionIds,
      TransformMode.SideResize,
      pick.id,
      sideIndex,
      screen.x,
      screen.y,
      ctx.viewTransform.x,
      ctx.viewTransform.y,
      ctx.viewTransform.scale,
      ctx.canvasSize.width,
      ctx.canvasSize.height,
      modifiers,
    );

    this.deps.setState({
      kind: 'transform',
      startScreen: { x: screen.x, y: screen.y },
      mode: TransformMode.SideResize,
    });
    this.deps.setHover(PickSubTarget.ResizeHandle, pick.subIndex);

    cadDebugLog('transform', 'side-resize-start', () => ({
      sideIndex,
      entityId: pick.id,
      selectionCount: selectionIds.length,
    }));
    return true;
  }
}

