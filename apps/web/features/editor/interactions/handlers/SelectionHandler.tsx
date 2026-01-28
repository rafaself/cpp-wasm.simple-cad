import { CommandOp, TransformMode, SelectionMode } from '@/engine/core/EngineRuntime';
import { isDrag } from '@/features/editor/utils/interactionHelpers';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';
import { startTiming, endTiming } from '@/utils/dev/hotPathTiming';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { buildModifierMask } from '../modifierMask';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';
import { SelectionCursorState } from './selection/SelectionCursorState';
import { ConnectedMarquee } from './selection/SelectionMarqueeOverlay';
import { updateResizeCursor, updateRotationCursor } from './selection/selectionCursorHelpers';
import { handleSelectionDoubleClick } from './selection/selectionDoubleClick';
import { SelectionCycleController } from './selection/SelectionCycleController';
import { SelectionTransformController } from './selection/SelectionTransformController';
import { handleSelectionCancel, handleSelectionKeyDown } from './selection/selectionKeyHandlers';
import { applySelectionHoverResult, handleSelectionHandleHover } from './selection/selectionHover';
import { handleMarqueePointerUp } from './selection/selectionMarquee';
import { SelectionInteractionState, SelectionPointerDown } from './selection/selectionTypes';

export class SelectionHandler extends BaseInteractionHandler {
  name = 'select';

  private state: SelectionInteractionState = { kind: 'none' };
  // We keep tracking 'down' event separately because sometimes we need original down point for drag detection
  private pointerDown: SelectionPointerDown = null;

  private runtime: EngineRuntime | null = null;

  // Track hover state for cursor updates
  private hoverSubTarget: number = PickSubTarget.None;
  private hoverSubIndex: number = -1;

  // Custom cursor state
  private cursorState = new SelectionCursorState();

  private setState = (state: SelectionInteractionState): void => {
    this.state = state;
  };

  private setHover = (subTarget: number, subIndex: number): void => {
    this.hoverSubTarget = subTarget;
    this.hoverSubIndex = subIndex;
  };

  private notifyChangeBound = (): void => {
    this.notifyChange();
  };

  private hoverDeps = {
    cursorState: this.cursorState,
    setHover: this.setHover,
    notifyChange: this.notifyChangeBound,
  };

  private cycleController = new SelectionCycleController();
  private transformController = new SelectionTransformController({
    setState: this.setState,
    setHover: this.setHover,
  });

  private getKeyContext() {
    return {
      runtime: this.runtime,
      state: this.state,
      setState: (state: SelectionInteractionState) => {
        this.state = state;
      },
      clearPointerDown: () => {
        this.pointerDown = null;
      },
      notifyChange: () => {
        this.notifyChange();
      },
    };
  }

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    const { runtime, screenPoint: screen, worldPoint: world, event } = ctx;
    if (!runtime || event.button !== 0) return;
    this.runtime = runtime;

    this.pointerDown = { x: event.clientX, y: event.clientY, world: { x: world.x, y: world.y } };
    if (isCadDebugEnabled('pointer')) {
      cadDebugLog('pointer', 'down', () => ({
        screen,
        world,
      }));
    }

    // Picking Logic (Hit Test)
    const tolerance = runtime.viewport.getPickingToleranceWithTransform(ctx.viewTransform);
    const handlePick = runtime.pickSelectionHandle(world.x, world.y, tolerance);
    const res = handlePick && handlePick.id !== 0
      ? handlePick
      : runtime.pickExSmart(world.x, world.y, tolerance, 0xff);
    cadDebugLog('selection', 'pick', () => ({
      id: res.id,
      kind: PickEntityKind[res.kind] ?? res.kind,
      subTarget: res.subTarget,
      subIndex: res.subIndex,
      distance: res.distance,
      x: world.x,
      y: world.y,
      tolerance,
    }));

    // Check modifiers
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey || event.metaKey;
    if (!ctrl) {
      this.cycleController.reset();
    }

    const isHandleTarget =
      res.subTarget === PickSubTarget.ResizeHandle || res.subTarget === PickSubTarget.RotateHandle;
    if (ctrl && res.id !== 0 && !isHandleTarget) {
      const cycled = this.cycleController.handleCtrlCycle(
        runtime,
        res,
        world.x,
        world.y,
        tolerance,
        shift,
      );
      if (cycled) {
        this.state = { kind: 'none' };
        this.pointerDown = null;
        this.notifyChange();
        return;
      }
    }

    // Side handles are now hit-tested in Atlas via pickSelectionHandle.
    if (res.id !== 0 && this.transformController.beginSideResize(ctx, res)) {
      return;
    }

    // Phase 1 & 2: Check for polygon vertex/edge grip hit
    const enablePolygonContour =
      useSettingsStore.getState().featureFlags.enablePolygonContourSelection;
    const enablePolygonEdges = useSettingsStore.getState().featureFlags.enablePolygonEdgeGrips;

    if (enablePolygonContour && res.id !== 0 && res.kind === PickEntityKind.Polygon) {
      const currentSelection = new Set(runtime.getSelectionIds());
      const selectionModeOnDrag = currentSelection.has(res.id) ? null : SelectionMode.Add;
      const startScreen = { x: screen.x, y: screen.y };
      // Phase 1: Polygon vertex grip hit
      if (res.subTarget === PickSubTarget.Vertex) {
        this.transformController.beginTransformWithPick(ctx, res, startScreen, selectionModeOnDrag);
        return;
      }

      // Phase 2: Polygon edge midpoint grip hit
      if (enablePolygonEdges && res.subTarget === PickSubTarget.Edge) {
        this.transformController.beginTransformWithPick(ctx, res, startScreen, selectionModeOnDrag);
        return;
      }
    }

    if (res.id !== 0) {
      const currentSelectionIds = runtime.getSelectionIds();
      const currentSelection = new Set(currentSelectionIds);
      const clickedSelected = currentSelection.has(res.id);
      const startScreen = { x: screen.x, y: screen.y };

      const selectionModeOnClick = shift
        ? SelectionMode.Toggle
        : clickedSelected
          ? null
          : SelectionMode.Add;
      const selectionModeOnDrag = clickedSelected ? null : SelectionMode.Add;

      const isBodyTarget =
        res.subTarget === PickSubTarget.Body ||
        res.subTarget === PickSubTarget.TextBody ||
        res.subTarget === PickSubTarget.None;

      if (isBodyTarget) {
        this.state = {
          kind: 'pending',
          pick: res,
          startScreen,
          selectionModeOnClick,
          selectionModeOnDrag,
        };
        return;
      }

      this.transformController.beginTransformWithPick(ctx, res, startScreen, selectionModeOnDrag);
      return;
    }

    // If we missed or failed to start session => Marquee
    const startWorld = this.pointerDown?.world ?? { x: world.x, y: world.y };
    this.state = {
      kind: 'marquee',
      box: {
        start: { x: startWorld.x, y: startWorld.y },
        current: { x: startWorld.x, y: startWorld.y },
        direction: 'LTR',
      },
      startScreen: { x: event.clientX, y: event.clientY },
    };
    cadDebugLog('selection', 'marquee-start', () => ({
      x: world.x,
      y: world.y,
    }));
    this.notifyChange(); // Render Overlay
  }

  onPointerMove(ctx: InputEventContext): void {
    const { runtime, screenPoint: screen, worldPoint: world, event } = ctx;
    if (!runtime) return;

    // Reset all custom cursor states by default
    this.cursorState.reset();

    if (this.state.kind === 'pending' && this.pointerDown) {
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (isDrag(dx, dy)) {
        this.transformController.beginTransformWithPick(
          ctx,
          this.state.pick,
          this.state.startScreen,
          this.state.selectionModeOnDrag,
        );
      }
      return;
    }

    // Check for hover on resize handles when not in active transform
    if (this.state.kind === 'none') {
      const handled = handleSelectionHandleHover(ctx, this.hoverDeps);
      if (handled) {
        return;
      }
    }

    if (this.state.kind === 'transform') {
      // Update Engine Transform
      if (runtime.updateTransform) {
        const modifiers = buildModifierMask(event);
        runtime.updateTransform(
          screen.x,
          screen.y,
          ctx.viewTransform.x,
          ctx.viewTransform.y,
          ctx.viewTransform.scale,
          ctx.canvasSize.width,
          ctx.canvasSize.height,
          modifiers,
        );
        if (isCadDebugEnabled('transform')) {
          cadDebugLog('transform', 'update', { x: screen.x, y: screen.y });
        }
      }

      // Show appropriate cursor during transform
      if (this.state.mode === TransformMode.Rotate) {
        updateRotationCursor(this.cursorState, this.hoverSubIndex, runtime, ctx);
      } else if (
        this.state.mode === TransformMode.Resize ||
        this.state.mode === TransformMode.SideResize
      ) {
        updateResizeCursor(this.cursorState, this.hoverSubIndex, runtime, ctx);
      } else if (
        this.state.mode === TransformMode.VertexDrag ||
        this.state.mode === TransformMode.EdgeDrag
      ) {
        // Vertex and edge drag: show move cursor
        this.cursorState.showMoveAt(ctx.screenPoint);
      }
      // Move mode uses default system cursor
      this.notifyChange();
    } else if (this.state.kind === 'marquee' && this.pointerDown) {
      // Update Marquee Box
      const downX = this.pointerDown.x;
      const currX = event.clientX;
      const direction = currX >= downX ? 'LTR' : 'RTL';
      const box = this.state.box;
      box.current.x = world.x;
      box.current.y = world.y;
      box.direction = direction;
      if (isCadDebugEnabled('selection')) {
        cadDebugLog('selection', 'marquee-update', {
          direction,
          x: world.x,
          y: world.y,
        });
      }
      this.notifyChange();
    } else if (this.state.kind === 'none') {
      // Update hover state for cursor feedback when not interacting
      const tolerance = runtime.viewport.getPickingToleranceWithTransform(ctx.viewTransform);
      startTiming('pick');
      const res = ctx.hoverPick(world.x, world.y, tolerance, 0xff);
      endTiming('pick');
      applySelectionHoverResult(ctx, this.hoverDeps, res);
    }
  }

  onPointerUp(ctx: InputEventContext): InteractionHandler | void {
    const { runtime, event } = ctx;
    if (!runtime) {
      this.state = { kind: 'none' };
      this.pointerDown = null;
      this.notifyChange();
      return;
    }

    if (this.state.kind === 'transform') {
      if (runtime.commitTransform) runtime.commitTransform();
      else runtime.apply([{ op: CommandOp.CommitDraft }]); // Fallback if needed, but commitTransform is correct
      cadDebugLog('transform', 'commit');

      this.state = { kind: 'none' };
      this.pointerDown = null;
      return;
    }

    if (this.state.kind === 'pending') {
      const { pick, selectionModeOnClick } = this.state;
      if (selectionModeOnClick !== null && pick.id !== 0) {
        runtime.setSelection([pick.id], selectionModeOnClick);
      }
      this.state = { kind: 'none' };
      this.pointerDown = null;
      this.notifyChange();
      return;
    }

    if (this.state.kind === 'marquee') {
      handleMarqueePointerUp(ctx, this.state, this.pointerDown);
      this.state = { kind: 'none' };
      this.pointerDown = null;
      this.notifyChange();
    }
  }

  onDoubleClick(ctx: InputEventContext): void {
    handleSelectionDoubleClick(ctx);
  }

  onKeyDown(e: KeyboardEvent): void {
    handleSelectionKeyDown(this.getKeyContext(), e);
  }

  onCancel(): void {
    handleSelectionCancel(this.getKeyContext());
  }

  getCursor(): string | null {
    // Hide native cursor when showing custom cursors
    if (this.cursorState.isVisible()) {
      return 'none';
    }

    // During other active interactions, use default cursor handling
    if (this.state.kind === 'transform' || this.state.kind === 'marquee') {
      return null;
    }

    return null;
  }

  renderOverlay(): React.ReactNode {
    if (this.state.kind === 'marquee') {
      return <ConnectedMarquee box={this.state.box} />;
    }
    const cursorOverlay = this.cursorState.renderOverlay();
    return cursorOverlay ? <>{cursorOverlay}</> : null;
  }
}
