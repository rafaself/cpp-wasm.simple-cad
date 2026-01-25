import {
  CommandOp,
  TransformMode,
  MarqueeMode,
  SelectionMode,
  SelectionModifier,
} from '@/engine/core/EngineRuntime';
import { MarqueeOverlay, SelectionBoxState } from '@/features/editor/components/MarqueeOverlay';
import { MoveCursor } from '@/features/editor/components/MoveCursor';
import { ResizeCursor } from '@/features/editor/components/ResizeCursor';
import { RotationCursor } from '@/features/editor/components/RotationCursor';
import {
  getRotationCursorAngleForHandle,
  getResizeCursorAngleForHandle,
} from '@/features/editor/config/cursor-config';
import { ensureTextToolReady } from '@/features/editor/text/textToolController';
import { isDrag } from '@/features/editor/utils/interactionHelpers';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';
import { cadDebugLog, isCadDebugEnabled } from '@/utils/dev/cadDebug';
import { MouseThrottle } from '@/utils/mouseThrottle';
import { startTiming, endTiming } from '@/utils/dev/hotPathTiming';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';

// Helper to identify line-like entities that should use Move mode for Edge interactions
const isLineOrArrow = (kind: PickEntityKind): boolean =>
  kind === PickEntityKind.Line || kind === PickEntityKind.Arrow;

const supportsSideHandles = (kind: PickEntityKind): boolean =>
  kind !== PickEntityKind.Line &&
  kind !== PickEntityKind.Arrow &&
  kind !== PickEntityKind.Polyline &&
  kind !== PickEntityKind.Text;

const SIDE_SUBINDEX_TO_ENGINE_INDEX: Record<number, number> = {
  4: 2, // N
  5: 1, // E
  6: 0, // S
  7: 3, // W
};

const EMPTY_PICK_RESULT: PickResult = {
  id: 0,
  kind: PickEntityKind.Unknown,
  subTarget: PickSubTarget.None,
  subIndex: -1,
  distance: Infinity,
};

// Connected component to access store without prop drilling through handler
const ConnectedMarquee: React.FC<{ box: SelectionBoxState }> = ({ box }) => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  return (
    <MarqueeOverlay selectionBox={box} viewTransform={viewTransform} canvasSize={canvasSize} />
  );
};

const buildModifierMask = (event: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): number => {
  let mask = 0;
  if (event.shiftKey) mask |= SelectionModifier.Shift;
  if (event.ctrlKey) mask |= SelectionModifier.Ctrl;
  if (event.altKey) mask |= SelectionModifier.Alt;
  if (event.metaKey) mask |= SelectionModifier.Meta;
  return mask;
};

type InteractionState =
  | { kind: 'none' }
  | { kind: 'marquee'; box: SelectionBoxState; startScreen: { x: number; y: number } }
  | { kind: 'transform'; startScreen: { x: number; y: number }; mode: TransformMode };

export class SelectionHandler extends BaseInteractionHandler {
  name = 'select';

  private state: InteractionState = { kind: 'none' };
  // We keep tracking 'down' event separately because sometimes we need original down point for drag detection
  private pointerDown: { x: number; y: number; world: { x: number; y: number } } | null = null;

  private runtime: EngineRuntime | null = null;

  // Track hover state for cursor updates
  private hoverSubTarget: number = PickSubTarget.None;
  private hoverSubIndex: number = -1;
  private hoverPickThrottle: MouseThrottle | null = null;
  private hoverPickInterval: number = -1;
  private hoverPickResult: PickResult = EMPTY_PICK_RESULT;
  private hoverPickFn: ((x: number, y: number, tolerance: number, mask: number) => void) | null =
    null;

  // Custom cursor state
  private cursorAngle: number = 0;
  private cursorScreenPos: { x: number; y: number } | null = null;
  private showRotationCursor: boolean = false;
  private showResizeCursor: boolean = false;
  private showMoveCursor: boolean = false;

  private pickSideHandle(
    runtime: EngineRuntime,
    worldPoint: { x: number; y: number },
    tolerance: number,
  ): PickResult | null {
    const res = runtime.pickSideHandle(worldPoint.x, worldPoint.y, tolerance);
    if (!res || res.id === 0 || res.subTarget !== PickSubTarget.ResizeHandle) return null;
    if (!supportsSideHandles(res.kind)) return null;
    if (!(res.subIndex in SIDE_SUBINDEX_TO_ENGINE_INDEX)) return null;
    return res;
  }

  private ensureHoverPickThrottle(): void {
    const settings = useSettingsStore.getState();
    const enabled = settings.featureFlags.enablePickThrottling;
    const interval = settings.performance.pickThrottleInterval;
    if (!enabled) {
      this.hoverPickThrottle = null;
      this.hoverPickFn = null;
      this.hoverPickInterval = -1;
      return;
    }
    if (this.hoverPickThrottle && this.hoverPickInterval === interval && this.hoverPickFn) return;
    this.hoverPickThrottle = new MouseThrottle(interval, true);
    this.hoverPickInterval = interval;
    this.hoverPickFn = this.hoverPickThrottle.create(
      (x: number, y: number, tolerance: number, mask: number) => {
        if (!this.runtime) return;
        this.hoverPickResult = this.runtime.pickExSmart(x, y, tolerance, mask);
      },
      { leading: true, trailing: true },
    );
  }

  private getHoverPick(
    runtime: EngineRuntime,
    x: number,
    y: number,
    tolerance: number,
    mask: number,
  ): PickResult {
    const settings = useSettingsStore.getState();
    if (!settings.featureFlags.enablePickThrottling) {
      return runtime.pickExSmart(x, y, tolerance, mask);
    }
    this.runtime = runtime;
    this.ensureHoverPickThrottle();
    if (!this.hoverPickFn) return this.hoverPickResult;
    this.hoverPickFn(x, y, tolerance, mask);
    return this.hoverPickResult;
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
      const sideHit = this.pickSideHandle(runtime, world, tolerance);
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

  private updateRotationCursor(runtime: EngineRuntime, ctx: InputEventContext) {
    const selection = runtime.getSelectionIds();
    if (selection.length !== 1) return;

    // Get entity rotation for Figma-like cursor behavior
    const transform = runtime.getEntityTransform(selection[0]);
    const rotationDeg = transform.valid ? transform.rotationDeg : 0;

    // Use handle index for fixed angle per corner (no atan2 calculation)
    // hoverSubIndex contains the rotation handle index (0=BL, 1=BR, 2=TR, 3=TL)
    this.cursorAngle = getRotationCursorAngleForHandle(this.hoverSubIndex, rotationDeg);
    this.cursorScreenPos = ctx.screenPoint;
    this.showRotationCursor = true;
  }

  private updateResizeCursor(ctx: InputEventContext) {
    if (!ctx.runtime) return;

    const runtime = ctx.runtime;
    const selection = runtime.getSelectionIds();
    if (selection.length !== 1) return;

    // Get entity rotation
    const transform = runtime.getEntityTransform(selection[0]);
    const rotationDeg = transform.valid ? transform.rotationDeg : 0;

    // Calculate cursor angle using deterministic handle-to-center angles
    // This ensures perfectly horizontal/vertical cursors for non-rotated shapes
    const angle = getResizeCursorAngleForHandle(this.hoverSubIndex, rotationDeg);

    this.cursorAngle = angle;
    this.cursorScreenPos = ctx.screenPoint;
    this.showResizeCursor = true;
  }

  onPointerMove(ctx: InputEventContext): void {
    const { runtime, screenPoint: screen, worldPoint: world, event } = ctx;
    if (!runtime) return;

    // Reset all custom cursor states by default
    this.showRotationCursor = false;
    this.showResizeCursor = false;
    this.showMoveCursor = false;
    this.cursorScreenPos = null;

    // Check for hover on resize handles when not in active transform
    if (this.state.kind === 'none') {
      const tolerance = runtime.viewport.getPickingToleranceWithTransform(ctx.viewTransform);
      if (isCadDebugEnabled('pointer')) {
        cadDebugLog('pointer', 'move', { screen, world, tolerance });
      }
      const sideHandle = this.pickSideHandle(runtime, world, tolerance);
      if (sideHandle) {
        this.hoverSubTarget = PickSubTarget.ResizeHandle;
        this.hoverSubIndex = sideHandle.subIndex;
        this.updateResizeCursor(ctx);
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
        this.updateRotationCursor(runtime, ctx);
      } else if (
        this.state.mode === TransformMode.Resize ||
        this.state.mode === TransformMode.SideResize
      ) {
        this.updateResizeCursor(ctx);
      } else if (
        this.state.mode === TransformMode.VertexDrag ||
        this.state.mode === TransformMode.EdgeDrag
      ) {
        // Vertex and edge drag: show move cursor
        this.cursorScreenPos = ctx.screenPoint;
        this.showMoveCursor = true;
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
      const res = this.getHoverPick(runtime, world.x, world.y, tolerance, 0xff);
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
        this.updateRotationCursor(runtime, ctx);
      } else if (this.hoverSubTarget === PickSubTarget.ResizeHandle) {
        this.updateResizeCursor(ctx);
      } else if (this.hoverSubTarget === PickSubTarget.Vertex) {
        // Vertex handles (line/arrow endpoints, polyline vertices, polygon vertices) use move cursor
        this.cursorScreenPos = ctx.screenPoint;
        this.showMoveCursor = true;
      } else if (this.hoverSubTarget === PickSubTarget.Edge) {
        // Phase 2: Edge grips for polygons
        const enablePolygonEdges = useSettingsStore.getState().featureFlags.enablePolygonEdgeGrips;
        if (enablePolygonEdges && res.kind === PickEntityKind.Polygon) {
          // Polygon edge midpoint grip: show move cursor (perpendicular drag)
          this.cursorScreenPos = ctx.screenPoint;
          this.showMoveCursor = true;
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
      // Check if it was a drag or click
      if (
        this.pointerDown &&
        isDrag(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y)
      ) {
        // Commit Marquee
        const { start, current, direction } = this.state.box;
        const x1 = Math.min(start.x, current.x);
        const y1 = Math.min(start.y, current.y);
        const x2 = Math.max(start.x, current.x);
        const y2 = Math.max(start.y, current.y);

        const hitMode = direction === 'LTR' ? MarqueeMode.Window : MarqueeMode.Crossing;

        // Build Modifiers
        let mode = SelectionMode.Replace;
        if (event.ctrlKey || event.metaKey) mode = SelectionMode.Toggle;
        else if (event.shiftKey) mode = SelectionMode.Add;

        if (runtime.marqueeSelect) {
          runtime.marqueeSelect(x1, y1, x2, y2, mode, hitMode);
        } else {
          const selected = runtime.queryMarquee(x1, y1, x2, y2, hitMode);
          runtime.setSelection?.(selected, mode);
        }
        cadDebugLog('selection', 'marquee-commit', () => ({
          mode,
          hitMode,
          x1,
          y1,
          x2,
          y2,
          ids: Array.from(runtime.getSelectionIds()),
        }));
      } else {
        // Was a Click (No drag)
        // If we are here, we probably didn't hit an entity (handled in Down) OR we did hit but logic deferred.
        // If we hit nothing -> Deselect (unless Add mode).

        // Check Hit again (since Down might have missed due to logic?)
        // Actually, if we clicked an entity but didn't drag, `state` would be 'marquee' initialized in my simplistic logic?
        // Wait, in `onPointerDown`, I init `transform` if I hit something.
        // If I hit something and didn't drag, `state` is 'transform' but `updateTransform` was never called.
        // When Up happens in 'transform' state, I commit.
        // If movement was 0, it's a "Click on Entity".
        // Engine Session for 0 move is fine, or we can cancel it.
        // But if I clicked an entity to Select it only, `onPointerDown` did the selection.

        // What if I clicked on Void?
        // `onPointerDown` set state to `marquee`.
        // `onPointerUp` sees no drag.
        // Clear Selection (Replace with empty).
        if (!event.shiftKey && !event.ctrlKey) {
          runtime.clearSelection();
          cadDebugLog('selection', 'clear');
        }
      }

      this.state = { kind: 'none' };
      this.pointerDown = null;
      this.notifyChange();
    }
  }

  onDoubleClick(ctx: InputEventContext): void {
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
  }

  onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.state.kind === 'transform') {
        // Cancel Transform
        if (this.runtime?.cancelTransform) this.runtime.cancelTransform();
        else this.runtime?.apply([{ op: CommandOp.CancelDraft }]); // Fallback

        cadDebugLog('transform', 'cancel');
        this.state = { kind: 'none' };
        this.pointerDown = null;
      } else {
        // Deselect?
        if (this.runtime) {
          this.runtime.clearSelection();
        }
        cadDebugLog('selection', 'clear');
        this.state = { kind: 'none' }; // Also clear marquee
      }
      this.notifyChange();
      // e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.runtime) {
        const selection = this.runtime.getSelectionIds();
        // Batch delete if possible, or iterative apply
        const commands = Array.from(selection).map((id): any => ({
          op: CommandOp.DeleteEntity,
          id,
        }));

        if (commands.length > 0) {
          this.runtime.apply(commands as any[]);
        }

        this.runtime.clearSelection();
        cadDebugLog('selection', 'delete', () => ({ count: selection.length }));
      }
    }
  }

  onCancel(): void {
    // Esc closes marquee or cancels transform
    if (this.state.kind === 'transform' && this.runtime?.cancelTransform) {
      this.runtime.cancelTransform();
    }
    cadDebugLog('selection', 'cancel');
    this.state = { kind: 'none' };
    this.pointerDown = null;
    this.notifyChange();
  }

  getCursor(): string | null {
    // Hide native cursor when showing custom cursors
    if (this.showRotationCursor || this.showResizeCursor || this.showMoveCursor) {
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

    const overlays: React.ReactNode[] = [];

    // Render custom cursors
    if (this.cursorScreenPos) {
      if (this.showRotationCursor) {
        overlays.push(
          <RotationCursor
            key="cursor-rot"
            x={this.cursorScreenPos.x}
            y={this.cursorScreenPos.y}
            rotation={this.cursorAngle}
          />,
        );
      } else if (this.showResizeCursor) {
        overlays.push(
          <ResizeCursor
            key="cursor-res"
            x={this.cursorScreenPos.x}
            y={this.cursorScreenPos.y}
            rotation={this.cursorAngle}
          />,
        );
      } else if (this.showMoveCursor) {
        overlays.push(
          <MoveCursor key="cursor-move" x={this.cursorScreenPos.x} y={this.cursorScreenPos.y} />,
        );
      }
    }

    if (overlays.length === 0) return null;
    return <>{overlays}</>;
  }
}
