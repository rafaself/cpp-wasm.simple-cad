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
import { SelectionHoverPick } from './selection/SelectionHoverPick';
import { ConnectedMarquee } from './selection/SelectionMarqueeOverlay';
import { updateResizeCursor, updateRotationCursor } from './selection/selectionCursorHelpers';
import { handleSelectionDoubleClick } from './selection/selectionDoubleClick';
import { handleSelectionCancel, handleSelectionKeyDown } from './selection/selectionKeyHandlers';
import { handleMarqueePointerUp } from './selection/selectionMarquee';
import { pickSideHandle } from './selection/selectionPickHelpers';
import {
  SIDE_SUBINDEX_TO_ENGINE_INDEX,
  isLineOrArrow,
  supportsSideHandles,
} from './selection/selectionConstants';
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
  private hoverPick = new SelectionHoverPick();

  // Custom cursor state
  private cursorState = new SelectionCursorState();

  private cycleState:
    | {
        key: string;
        baseSelection: Set<number>;
        lastAddedId: number | null;
        index: number;
      }
    | null = null;

  private resetCycleState(): void {
    this.cycleState = null;
  }

  private collectCycleCandidateIds(
    runtime: EngineRuntime,
    worldX: number,
    worldY: number,
    tolerance: number,
  ): number[] {
    const candidates = runtime.pickCandidates(worldX, worldY, tolerance, 0xff);
    if (candidates.length === 0) return [];

    const seen = new Set<number>();
    const ids: number[] = [];
    for (const candidate of candidates) {
      if (candidate.id === 0) continue;
      if (
        candidate.subTarget === PickSubTarget.ResizeHandle ||
        candidate.subTarget === PickSubTarget.RotateHandle
      ) {
        continue;
      }
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      ids.push(candidate.id);
    }
    return ids;
  }

  private handleCtrlCycle(
    runtime: EngineRuntime,
    pick: PickResult,
    worldX: number,
    worldY: number,
    tolerance: number,
    shiftKey: boolean,
  ): boolean {
    const candidateIds = this.collectCycleCandidateIds(runtime, worldX, worldY, tolerance);
    if (candidateIds.length < 2) {
      this.resetCycleState();
      return false;
    }

    const key = candidateIds.join(',');
    const selectionIds = runtime.getSelectionIds();
    if (!this.cycleState || this.cycleState.key !== key) {
      this.cycleState = {
        key,
        baseSelection: new Set(selectionIds),
        lastAddedId: null,
        index: 0,
      };
    } else {
      this.cycleState.index = (this.cycleState.index + 1) % candidateIds.length;
    }

    const chosenId = candidateIds[this.cycleState.index] ?? pick.id;
    const lastAddedId = this.cycleState.lastAddedId;
    if (
      lastAddedId !== null &&
      lastAddedId !== chosenId &&
      !this.cycleState.baseSelection.has(lastAddedId)
    ) {
      runtime.setSelection([lastAddedId], SelectionMode.Remove);
    }

    const mode = shiftKey ? SelectionMode.Toggle : SelectionMode.Add;
    runtime.setSelection([chosenId], mode);
    this.cycleState.lastAddedId = chosenId;

    cadDebugLog('selection', 'cycle', () => ({
      key,
      chosenId,
      index: this.cycleState?.index ?? 0,
      candidates: candidateIds,
    }));
    return true;
  }

  private beginTransformWithPick(
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

    this.hoverSubTarget = pick.subTarget;
    this.hoverSubIndex = pick.subIndex;
    this.state = { kind: 'transform', startScreen: { x: startScreen.x, y: startScreen.y }, mode };
  }

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
    const res = runtime.pickExSmart(world.x, world.y, tolerance, 0xff);
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
      this.resetCycleState();
    }

    const isHandleTarget =
      res.subTarget === PickSubTarget.ResizeHandle || res.subTarget === PickSubTarget.RotateHandle;
    if (ctrl && res.id !== 0 && !isHandleTarget) {
      const cycled = this.handleCtrlCycle(runtime, res, world.x, world.y, tolerance, shift);
      if (cycled) {
        this.state = { kind: 'none' };
        this.pointerDown = null;
        this.notifyChange();
        return;
      }
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
        this.beginTransformWithPick(ctx, res, startScreen, selectionModeOnDrag);
        return;
      }

      // Phase 2: Polygon edge midpoint grip hit
      if (enablePolygonEdges && res.subTarget === PickSubTarget.Edge) {
        this.beginTransformWithPick(ctx, res, startScreen, selectionModeOnDrag);
        return;
      }
    }

    // Check for side handles first (Priority: Handles > Geometry)
    // This allows hitting handles that extend outside the geometry (pick returns 0)
    // BUT skip for lines/arrows - they don't have side handles, only vertex endpoints
    const shouldCheckSideHandles = supportsSideHandles(res.kind);
    if (shouldCheckSideHandles) {
      const sideHit = pickSideHandle(runtime, world, tolerance);
      if (sideHit) {
        // Use engine-based SideResize instead of client-side calculation
        const sideIndex = SIDE_SUBINDEX_TO_ENGINE_INDEX[sideHit.subIndex];
        if (sideIndex === undefined) return;
        const modifiers = buildModifierMask(event);

        runtime.beginTransform(
          [sideHit.id],
          TransformMode.SideResize,
          sideHit.id,
          sideIndex, // Pass side index (0=S, 1=E, 2=N, 3=W)
          screen.x,
          screen.y,
          ctx.viewTransform.x,
          ctx.viewTransform.y,
          ctx.viewTransform.scale,
          ctx.canvasSize.width,
          ctx.canvasSize.height,
          modifiers,
        );

        this.state = {
          kind: 'transform',
          startScreen: { x: screen.x, y: screen.y },
          mode: TransformMode.SideResize,
        };

        // Store handle info for cursor updates (frontend indices 4-7)
        this.hoverSubTarget = PickSubTarget.ResizeHandle;
        this.hoverSubIndex = sideHit.subIndex;

        cadDebugLog('transform', 'side-resize-start', () => ({
          sideIndex,
          entityId: sideHit.id,
        }));
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

      this.beginTransformWithPick(ctx, res, startScreen, selectionModeOnDrag);
      return;
    }

    // If we missed or failed to start session => Marquee
    this.state = {
      kind: 'marquee',
      box: { start: world, current: world, direction: 'LTR' },
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
        this.beginTransformWithPick(
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
      const tolerance = runtime.viewport.getPickingToleranceWithTransform(ctx.viewTransform);
      if (isCadDebugEnabled('pointer')) {
        cadDebugLog('pointer', 'move', { screen, world, tolerance });
      }
      const sideHandle = pickSideHandle(runtime, world, tolerance);
      if (sideHandle) {
        this.hoverSubTarget = PickSubTarget.ResizeHandle;
        this.hoverSubIndex = sideHandle.subIndex;
        updateResizeCursor(this.cursorState, this.hoverSubIndex, runtime, ctx);
        this.notifyChange();
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
      this.state.box = { start: this.pointerDown.world, current: world, direction };
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
      const res = this.hoverPick.get(runtime, world.x, world.y, tolerance, 0xff);
      endTiming('pick');
      this.hoverSubTarget = res.subTarget;
      this.hoverSubIndex = res.subIndex;
      if (isCadDebugEnabled('pointer')) {
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
      // Show appropriate cursor based on hover target
      // Body and Edge (for lines/arrows) use default system cursor for move
      if (this.hoverSubTarget === PickSubTarget.RotateHandle) {
        updateRotationCursor(this.cursorState, this.hoverSubIndex, runtime, ctx);
      } else if (this.hoverSubTarget === PickSubTarget.ResizeHandle) {
        updateResizeCursor(this.cursorState, this.hoverSubIndex, runtime, ctx);
      } else if (this.hoverSubTarget === PickSubTarget.Vertex) {
        // Vertex handles (line/arrow endpoints, polyline vertices, polygon vertices) use move cursor
        this.cursorState.showMoveAt(ctx.screenPoint);
      } else if (this.hoverSubTarget === PickSubTarget.Edge) {
        // Phase 2: Edge grips for polygons
        const enablePolygonEdges = useSettingsStore.getState().featureFlags.enablePolygonEdgeGrips;
        if (enablePolygonEdges && res.kind === PickEntityKind.Polygon) {
          // Polygon edge midpoint grip: show move cursor (perpendicular drag)
          this.cursorState.showMoveAt(ctx.screenPoint);
        } else if (isLineOrArrow(res.kind)) {
          // Lines and arrows: Edge means "move the entire entity" - use default cursor
        }
      } else if (this.hoverSubTarget === PickSubTarget.Body) {
        // Use default cursor for move
      }
      this.notifyChange(); // Trigger cursor update
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
