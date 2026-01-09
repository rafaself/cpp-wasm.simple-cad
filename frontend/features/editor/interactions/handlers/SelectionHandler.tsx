import { CommandOp } from '@/engine/core/commandBuffer';
import { TransformMode } from '@/engine/core/interactionSession';
import { MarqueeMode, SelectionMode, SelectionModifier } from '@/engine/core/protocol';
import { MarqueeOverlay, SelectionBoxState } from '@/features/editor/components/MarqueeOverlay';
import { RotationCursor } from '@/features/editor/components/RotationCursor';
import { ResizeCursor } from '@/features/editor/components/ResizeCursor';
import {
  getRotationCursorAngle,
  getResizeCursorAngle,
} from '@/features/editor/config/cursor-config';
import { ensureTextToolReady } from '@/features/editor/text/textToolController';
import { isDrag } from '@/features/editor/utils/interactionHelpers';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { PickEntityKind, PickSubTarget } from '@/types/picking';
import { cadDebugLog } from '@/utils/dev/cadDebug';
import { worldToScreen } from '@/utils/viewportMath';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';
import { SideHandleType } from '../../interactions/sideHandles';
import { calculateSideResize, localToWorldShift } from './sideResizeGeometry';

import { normalizeAngle } from '@/features/editor/config/cursor-config';

// Helper to identify line-like entities that should use Move mode for Edge interactions
const isLineOrArrow = (kind: PickEntityKind): boolean =>
  kind === PickEntityKind.Line || kind === PickEntityKind.Arrow;

// Connected component to access store without prop drilling through handler
const ConnectedMarquee: React.FC<{ box: SelectionBoxState }> = ({ box }) => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  return (
    <MarqueeOverlay selectionBox={box} viewTransform={viewTransform} canvasSize={canvasSize} />
  );
};

const ConnectedClientRotationTooltip: React.FC<{
  angle: number;
  worldPos: { x: number; y: number };
}> = ({ angle, worldPos }) => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const screenPos = worldToScreen(worldPos, viewTransform);

  return (
    <div
      style={{
        position: 'absolute',
        left: screenPos.x,
        top: screenPos.y,
        pointerEvents: 'none',
        zIndex: 1000,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
        }}
      >
        {Math.round(angle)}°
      </div>
    </div>
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
  | { kind: 'transform'; startScreen: { x: number; y: number }; mode: TransformMode }
  | {
      kind: 'side-resize';
      handle: SideHandleType;
      startWorld: { x: number; y: number };
      startTransform: { x: number; y: number; width: number; height: number; rotation: number };
      entityId: number;
      flippedX: boolean;
      flippedY: boolean;
      originalHandle: SideHandleType;
      currentHandle: SideHandleType;
    }
  | {
      kind: 'client-rotate';
      entityId: number;
      startRotation: number;
      currentRotation: number;
      startMouseAngle: number;
      centerX: number;
      centerY: number;
    };

export class SelectionHandler extends BaseInteractionHandler {
  name = 'select';

  private state: InteractionState = { kind: 'none' };
  // We keep tracking 'down' event separately because sometimes we need original down point for drag detection
  private pointerDown: { x: number; y: number; world: { x: number; y: number } } | null = null;

  private runtime: EngineRuntime | null = null;

  // Track hover state for cursor updates
  private hoverSubTarget: number = PickSubTarget.None;
  private hoverSubIndex: number = -1;

  // Custom cursor state
  private cursorAngle: number = 0;
  private cursorScreenPos: { x: number; y: number } | null = null;
  private showRotationCursor: boolean = false;
  private showResizeCursor: boolean = false;

  private findSideHandle(
    runtime: EngineRuntime,
    worldPoint: { x: number; y: number },
    tolerance: number,
  ): { handle: SideHandleType; id: number } | null {
    const selection = runtime.getSelectionIds();
    if (selection.length !== 1) return null; // Only support single entity side-resize for now
    const id = selection[0];

    // Check if entity supports side resizing (not Line or Arrow)
    if (runtime.getEntityKind) {
      const kind = runtime.getEntityKind(id) as PickEntityKind;
      if (isLineOrArrow(kind)) return null;
    }

    // Get Entity Transform
    const transform = runtime.getEntityTransform(id);
    if (!transform.valid) return null;

    // Project World Point to Local Space
    const dx = worldPoint.x - transform.posX;
    const dy = worldPoint.y - transform.posY;
    const rad = -(transform.rotationDeg * Math.PI) / 180; // Negative to rotate point back
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

    const halfW = transform.width / 2;
    const halfH = transform.height / 2;

    // Hit tolerance in world units
    const hitDist = tolerance; // "Thickness" of the handle area
    const cornerExclusion = tolerance * 1.5; // Margin to avoid hitting corners (approx 15px)

    // Check edges
    // Top Edge (N): y approx -halfH, x within [-halfW, halfW]
    if (Math.abs(localY - -halfH) < hitDist) {
      if (localX > -halfW + cornerExclusion && localX < halfW - cornerExclusion) {
        return { handle: SideHandleType.N, id };
      }
    }

    // Bottom Edge (S): y approx halfH
    if (Math.abs(localY - halfH) < hitDist) {
      if (localX > -halfW + cornerExclusion && localX < halfW - cornerExclusion) {
        return { handle: SideHandleType.S, id };
      }
    }

    // Right Edge (E): x approx halfW
    if (Math.abs(localX - halfW) < hitDist) {
      if (localY > -halfH + cornerExclusion && localY < halfH - cornerExclusion) {
        return { handle: SideHandleType.E, id };
      }
    }

    // Left Edge (W): x approx -halfW
    if (Math.abs(localX - -halfW) < hitDist) {
      if (localY > -halfH + cornerExclusion && localY < halfH - cornerExclusion) {
        return { handle: SideHandleType.W, id };
      }
    }

    return null;
  }

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    const { runtime, screenPoint: screen, worldPoint: world, event } = ctx;
    if (!runtime || event.button !== 0) return;
    this.runtime = runtime;

    this.pointerDown = { x: event.clientX, y: event.clientY, world };

    // Picking Logic (Hit Test)
    const tolerance = 10 / (ctx.viewTransform.scale || 1); // 10px screen tolerance
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

    // Check for client-side side handles first (Priority: Handles > Geometry)
    // This allows hitting handles that extend outside the geometry (pick returns 0)
    // BUT skip for lines/arrows - they don't have side handles, only vertex endpoints
    const shouldCheckSideHandles = !isLineOrArrow(res.kind);
    if (shouldCheckSideHandles) {
      const sideHit = this.findSideHandle(runtime, world, tolerance);
      if (sideHit) {
        const transform = runtime.getEntityTransform(sideHit.id);
        if (transform.valid) {
          this.state = {
            kind: 'side-resize',
            handle: sideHit.handle,
            startWorld: world,
            startTransform: {
              x: transform.posX,
              y: transform.posY,
              width: transform.width,
              height: transform.height,
              rotation: transform.rotationDeg,
            },
            entityId: sideHit.id,
            flippedX: false,
            flippedY: false,
            originalHandle: sideHit.handle,
            currentHandle: sideHit.handle,
          };
          cadDebugLog('transform', 'side-resize-start', () => ({ handle: sideHit.handle }));
          return;
        }
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
          // Client-side rotation logic (hijack)
          // Only support single entity rotation for now to match prompt requirements on persistent angle
          if (activeIds.length === 1) {
            const id = activeIds[0];
            const transform = runtime.getEntityTransform(id);
            if (transform.valid) {
              const centerX = transform.posX;
              const centerY = transform.posY;

              // Calculate initial mouse angle relative to object center
              // Using atan2 to get -PI to PI
              const mouseAngleRad = Math.atan2(world.y - centerY, world.x - centerX);
              const mouseAngleDeg = (mouseAngleRad * 180) / Math.PI;

              this.state = {
                kind: 'client-rotate',
                entityId: id,
                startRotation: transform.rotationDeg,
                currentRotation: transform.rotationDeg,
                startMouseAngle: mouseAngleDeg,
                centerX,
                centerY,
              };
              cadDebugLog('transform', 'client-rotate-start', () => ({
                id,
                startRot: transform.rotationDeg,
                mouseAngle: mouseAngleDeg,
              }));
              return;
            }
          }
          mode = TransformMode.Rotate; // Fallback to engine if multi-select or invalid transform
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
    if (!runtime.getSelectionBounds) return;
    const bounds = runtime.getSelectionBounds();
    // Check for valid bounds (assuming valid property or non-zero dimensions)
    if (!bounds || (bounds as any).valid === 0) return;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const centerScreen = worldToScreen({ x: centerX, y: centerY }, ctx.viewTransform);

    // Use centralized cursor angle calculation
    this.cursorAngle = getRotationCursorAngle(centerScreen, ctx.screenPoint);
    this.cursorScreenPos = ctx.screenPoint;
    this.showRotationCursor = true;
  }

  private updateResizeCursor(ctx: InputEventContext) {
    // Calculate angle based on handle index
    // Note: hoverSubIndex contains the handle index from the pick result
    let angle = getResizeCursorAngle(this.hoverSubIndex);

    // Apply rotation for single selection to match side handles
    if (ctx.runtime) {
      const selection = ctx.runtime.getSelectionIds();
      if (selection.length === 1) {
        const transform = ctx.runtime.getEntityTransform(selection[0]);
        if (transform.valid) {
          angle -= transform.rotationDeg;
        }
      }
    }

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
    this.cursorScreenPos = null;

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
        cadDebugLog('transform', 'update', () => ({ x: screen.x, y: screen.y }));
      }

      // Show appropriate cursor during transform
      if (this.state.mode === TransformMode.Rotate) {
        this.updateRotationCursor(runtime, ctx);
      } else if (this.state.mode === TransformMode.Resize) {
        this.updateResizeCursor(ctx);
      }
      // Move mode uses default system cursor
      this.notifyChange();
    } else if (this.state.kind === 'side-resize') {
      // Side-handle resize with flip support
      // Uses pure geometry functions for testability and maintainability
      const { startWorld, startTransform, entityId, originalHandle } = this.state;

      // Calculate world delta and project to local space
      const dx = world.x - startWorld.x;
      const dy = world.y - startWorld.y;
      const rad = -(startTransform.rotation * Math.PI) / 180;
      const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);

      const isSymmetric = event.altKey;
      const MIN_SIZE = 1.0;

      // Calculate resize for horizontal handles (E, W)
      const isHorizontalHandle =
        originalHandle === SideHandleType.E || originalHandle === SideHandleType.W;
      const horizontalResult = isHorizontalHandle
        ? calculateSideResize({
            startDimension: startTransform.width,
            localDelta: localDx,
            isSymmetric,
            isPositiveSide: originalHandle === SideHandleType.E,
            minSize: MIN_SIZE,
          })
        : { newDimension: startTransform.width, scale: 1, centerShift: 0 };

      // Calculate resize for vertical handles (S, N)
      const isVerticalHandle =
        originalHandle === SideHandleType.S || originalHandle === SideHandleType.N;
      const verticalResult = isVerticalHandle
        ? calculateSideResize({
            startDimension: startTransform.height,
            localDelta: localDy,
            isSymmetric,
            isPositiveSide: originalHandle === SideHandleType.S,
            minSize: MIN_SIZE,
          })
        : { newDimension: startTransform.height, scale: 1, centerShift: 0 };

      // Apply dimensions and scales
      const newW = horizontalResult.newDimension;
      const newH = verticalResult.newDimension;
      const scaleX = horizontalResult.scale;
      const scaleY = verticalResult.scale;

      // Convert local space center shift to world coordinates
      const worldRad = (startTransform.rotation * Math.PI) / 180;
      const worldShift = localToWorldShift(
        { x: horizontalResult.centerShift, y: verticalResult.centerShift },
        worldRad,
      );

      const newCenterX = startTransform.x + worldShift.x;
      const newCenterY = startTransform.y + worldShift.y;

      // Update flip state for UI feedback
      const flippedX = scaleX < 0;
      const flippedY = scaleY < 0;
      this.state.flippedX = flippedX;
      this.state.flippedY = flippedY;

      // Update current handle based on flip (for cursor)
      if (originalHandle === SideHandleType.E) {
        this.state.currentHandle = flippedX ? SideHandleType.W : SideHandleType.E;
      } else if (originalHandle === SideHandleType.W) {
        this.state.currentHandle = flippedX ? SideHandleType.E : SideHandleType.W;
      } else if (originalHandle === SideHandleType.S) {
        this.state.currentHandle = flippedY ? SideHandleType.N : SideHandleType.S;
      } else if (originalHandle === SideHandleType.N) {
        this.state.currentHandle = flippedY ? SideHandleType.S : SideHandleType.N;
      }

      // Apply geometry updates to entity
      runtime.setEntitySize(entityId, newW, newH);
      runtime.setEntityPosition(entityId, newCenterX, newCenterY);

      // Apply scale transformation for visual flip
      if (runtime.setEntityScale) {
        runtime.setEntityScale(entityId, scaleX, scaleY);
      }

      // Update cursor during drag (use currentHandle, not original handle)
      let angle = getResizeCursorAngle(this.state.currentHandle) + 90;
      if (startTransform.rotation !== 0) {
        angle -= startTransform.rotation;
      }
      this.cursorAngle = angle;
      this.cursorScreenPos = ctx.screenPoint;
      this.showResizeCursor = true;

      this.notifyChange();
    } else if (this.state.kind === 'client-rotate') {
      const { entityId, startRotation, startMouseAngle, centerX, centerY } = this.state;

      // Calculate current mouse angle
      const mouseAngleRad = Math.atan2(world.y - centerY, world.x - centerX);
      const mouseAngleDeg = (mouseAngleRad * 180) / Math.PI;

      // Calculate Delta
      // Normalize delta to avoid jumps at -180/180 crossing
      // We use normalizeAngle on the difference
      const delta = normalizeAngle(mouseAngleDeg - startMouseAngle);

      // Apply snapping (Shift key)
      // Snapping usually applies to the Final Angle (increments of 15 or 45 degrees)
      // Or relative snapping? Prompt says "rotationNewSnapped = snap(rotationNew)"
      let newRotation = startRotation + delta;
      newRotation = normalizeAngle(newRotation); // Keep it normalized

      if (event.shiftKey) {
        const SNAP_INTERVAL = 15;
        newRotation = Math.round(newRotation / SNAP_INTERVAL) * SNAP_INTERVAL;
      }

      // Update state for tooltip
      this.state.currentRotation = newRotation;

      // Update Entity
      runtime.setEntityRotation(entityId, newRotation);

      // Update Cursor
      // We can show the rotation angle in tooltip? Or just the rotation cursor
      // Update rotation cursor angle to match new rotation
      // Note: Mouse position is 'world', we need screen for cursor helper?
      // Actually SelectionHandler has helper `updateRotationCursor` but it relies on engine picking.
      // We can just calculate it manually here.

      // The cursor icon should rotate with the object or with the mouse?
      // Usually with the mouse interaction.
      // Let's use getRotationCursorAngle from config
      const centerScreen = worldToScreen({ x: centerX, y: centerY }, ctx.viewTransform);
      const angleForCursor = getRotationCursorAngle(centerScreen, screen); // screen point

      this.cursorAngle = angleForCursor;
      this.cursorScreenPos = screen;
      this.showRotationCursor = true;

      this.notifyChange();
    } else if (this.state.kind === 'marquee' && this.pointerDown) {
      // Update Marquee Box
      const downX = this.pointerDown.x;
      const currX = event.clientX;
      const direction = currX >= downX ? 'LTR' : 'RTL';
      this.state.box = { start: this.pointerDown.world, current: world, direction };
      cadDebugLog('selection', 'marquee-update', () => ({
        direction,
        x: world.x,
        y: world.y,
      }));
      this.notifyChange();
    } else if (this.state.kind === 'none') {
      // Update hover state for cursor feedback when not interacting
      const tolerance = 10 / (ctx.viewTransform.scale || 1);
      const res = runtime.pickExSmart(world.x, world.y, tolerance, 0xff);
      this.hoverSubTarget = res.subTarget;
      this.hoverSubIndex = res.subIndex;

      // Show appropriate cursor based on hover target
      // Body and Edge (for lines/arrows) use default system cursor for move
      if (this.hoverSubTarget === PickSubTarget.RotateHandle) {
        this.updateRotationCursor(runtime, ctx);
      } else if (this.hoverSubTarget === PickSubTarget.ResizeHandle) {
        this.updateResizeCursor(ctx);
      } else if (this.hoverSubTarget === PickSubTarget.Body) {
        // Use default cursor for move
      } else if (this.hoverSubTarget === PickSubTarget.Edge && isLineOrArrow(res.kind)) {
        // Lines and arrows: Edge means "move the entire entity" - use default cursor
      } else if (!isLineOrArrow(res.kind)) {
        // Check for side handles hover (only for non-line entities like rectangles)
        const sideHit = this.findSideHandle(runtime, world, tolerance);
        if (sideHit) {
          // Use the centralized helper for side handles as well
          // Adding 90 degrees correction as requested by the user
          let angle = getResizeCursorAngle(sideHit.handle) + 90;

          // Add object rotation (Engine is CCW, CSS is CW, so subtract)
          const transform = runtime.getEntityTransform(sideHit.id);
          if (transform.valid) {
            angle -= transform.rotationDeg;
          }

          this.cursorAngle = angle;
          this.cursorScreenPos = ctx.screenPoint;
          this.showResizeCursor = true;
        }
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

    if (this.state.kind === 'side-resize') {
      // Commit?
      // Since we used setEntitySize (live), we might want to push a commit command if needed.
      // But for now, we just end the state.
      runtime.apply([{ op: CommandOp.CommitDraft }]); // Generic commit to ensure history sync if engine supports it
      cadDebugLog('transform', 'side-resize-end');
      this.state = { kind: 'none' };
      this.pointerDown = null;
      return;
    }

    if (this.state.kind === 'client-rotate') {
      runtime.apply([{ op: CommandOp.CommitDraft }]);
      cadDebugLog('transform', 'client-rotate-end');
      this.state = { kind: 'none' };
      this.pointerDown = null;
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

    const tolerance = 10 / (viewTransform.scale || 1);
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
    if (this.showRotationCursor || this.showResizeCursor) {
      return 'none';
    }

    // During other active interactions, use default cursor handling
    if (
      this.state.kind === 'transform' ||
      this.state.kind === 'marquee' ||
      this.state.kind === 'side-resize' ||
      this.state.kind === 'client-rotate'
    ) {
      return null;
    }

    return null;
  }

  renderOverlay(): React.ReactNode {
    if (this.state.kind === 'marquee') {
      return <ConnectedMarquee box={this.state.box} />;
    }

    const overlays: React.ReactNode[] = [];

    // Client-side rotation tooltip
    if (this.state.kind === 'client-rotate') {
      const { currentRotation, centerX, centerY } = this.state;
      overlays.push(
        <ConnectedClientRotationTooltip
          key="rot-tooltip"
          angle={currentRotation}
          worldPos={{ x: centerX, y: centerY }}
        />,
      );
    }

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
      }
    }

    if (overlays.length === 0) return null;
    return <>{overlays}</>;
  }
}
