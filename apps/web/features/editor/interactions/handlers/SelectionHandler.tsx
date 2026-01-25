import { CommandOp, TransformMode, SelectionMode } from '@/engine/core/EngineRuntime';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { PickEntityKind, PickSubTarget } from '@/types/picking';
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

    // Phase 1 & 2: Check for polygon vertex/edge grip hit
    const enablePolygonContour =
      useSettingsStore.getState().featureFlags.enablePolygonContourSelection;
    const enablePolygonEdges = useSettingsStore.getState().featureFlags.enablePolygonEdgeGrips;

    if (enablePolygonContour && res.id !== 0 && res.kind === PickEntityKind.Polygon) {
      // Phase 1: Polygon vertex grip hit
      if (res.subTarget === PickSubTarget.Vertex) {
        const currentSelection = new Set(runtime.getSelectionIds());
        if (!currentSelection.has(res.id) && !shift && !ctrl) {
          runtime.setSelection([res.id], SelectionMode.Replace);
        }

        const activeIds = Array.from(runtime.getSelectionIds());
        if (activeIds.length > 0) {
          const modifiers = buildModifierMask(event);
          runtime.beginTransform(
            activeIds,
            TransformMode.VertexDrag,
            res.id,
            res.subIndex, // Vertex index
            screen.x,
            screen.y,
            ctx.viewTransform.x,
            ctx.viewTransform.y,
            ctx.viewTransform.scale,
            ctx.canvasSize.width,
            ctx.canvasSize.height,
            modifiers,
          );

          cadDebugLog('transform', 'polygon-vertex-drag-begin', () => ({
            entityId: res.id,
            vertexIndex: res.subIndex,
            ids: activeIds,
          }));

          this.state = {
            kind: 'transform',
            startScreen: screen,
            mode: TransformMode.VertexDrag,
          };
          return;
        }
      }

      // Phase 2: Polygon edge midpoint grip hit
      if (enablePolygonEdges && res.subTarget === PickSubTarget.Edge) {
        const currentSelection = new Set(runtime.getSelectionIds());
        if (!currentSelection.has(res.id) && !shift && !ctrl) {
          runtime.setSelection([res.id], SelectionMode.Replace);
        }

        const activeIds = Array.from(runtime.getSelectionIds());
        if (activeIds.length > 0) {
          const modifiers = buildModifierMask(event);
          runtime.beginTransform(
            activeIds,
            TransformMode.EdgeDrag,
            res.id,
            res.subIndex, // Edge index
            screen.x,
            screen.y,
            ctx.viewTransform.x,
            ctx.viewTransform.y,
            ctx.viewTransform.scale,
            ctx.canvasSize.width,
            ctx.canvasSize.height,
            modifiers,
          );

          cadDebugLog('transform', 'polygon-edge-drag-begin', () => ({
            entityId: res.id,
            edgeIndex: res.subIndex,
            ids: activeIds,
            shiftHeld: shift,
          }));

          this.state = {
            kind: 'transform',
            startScreen: screen,
            mode: TransformMode.EdgeDrag,
          };
          return;
        }
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
          startScreen: screen,
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
      // Hit something!
      const currentSelection = new Set(runtime.getSelectionIds());
      const clickedSelected = currentSelection.has(res.id);

      if (!clickedSelected && !shift && !ctrl) {
        runtime.setSelection([res.id], SelectionMode.Replace);
        cadDebugLog('selection', 'replace', () => ({
          ids: Array.from(runtime.getSelectionIds()),
        }));
      } else if (ctrl) {
        // Cycle/Toggle? Logic handled on Up usually for toggles to avoid deselecting on drag start.
      }

      const activeIds = Array.from(runtime.getSelectionIds());
      if (activeIds.length > 0) {
        const modifiers = buildModifierMask(event);
        let mode = TransformMode.Move;

        // Custom Side Handle Logic
        // If we hit the body or nothing specific (but inside selection), check if we hit a side handle
        // We prioritize explicit handles (corners) from engine. If engine returns Body, we check side handles.
        if (res.subTarget === PickSubTarget.ResizeHandle) {
          mode = TransformMode.Resize;
        } else if (res.subTarget === PickSubTarget.RotateHandle) {
          // Use engine-based rotation (supports continuous rotation past ±180°)
          mode = TransformMode.Rotate;
        } else if (res.subTarget === PickSubTarget.Vertex) {
          mode = TransformMode.VertexDrag;
        } else if (res.subTarget === PickSubTarget.Edge) {
          // Lines and arrows: Edge means "move the entire entity"
          // Polylines: Edge means "move a segment" (EdgeDrag)
          if (isLineOrArrow(res.kind)) {
            mode = TransformMode.Move;
          } else {
            mode = TransformMode.EdgeDrag;
          }
        }

        if (res.subTarget === PickSubTarget.ResizeHandle && activeIds.length === 1) {
          const transform = runtime.getEntityTransform(activeIds[0]);
          const bounds = runtime.getSelectionBounds();
          cadDebugLog('transform', 'resize-start-snapshot', () => ({
            id: activeIds[0],
            handleIndex: res.subIndex,
            screen,
            world,
            transform,
            bounds,
          }));
        }

        // Use beginTransform instead of beginSession
        runtime.beginTransform(
          activeIds,
          mode,
          res.id,
          res.subIndex, // Pass subIndex (vertex/handle index)
          screen.x,
          screen.y,
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
          specificId: res.id,
          subIndex: res.subIndex,
          x: screen.x,
          y: screen.y,
        }));
        this.state = { kind: 'transform', startScreen: screen, mode };
        return;
      }
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
