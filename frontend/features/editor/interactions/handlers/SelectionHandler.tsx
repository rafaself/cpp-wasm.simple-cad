import { CommandOp } from '@/engine/core/commandBuffer';
import { TransformMode } from '@/engine/core/interactionSession';
import { MarqueeMode, SelectionMode, SelectionModifier } from '@/engine/core/protocol';
import { MarqueeOverlay, SelectionBoxState } from '@/features/editor/components/MarqueeOverlay';
import { isDrag } from '@/features/editor/utils/interactionHelpers';
import { ensureTextToolReady } from '@/features/editor/text/textToolController';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { PickEntityKind, PickSubTarget } from '@/types/picking';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';

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
        if (res.subTarget === PickSubTarget.ResizeHandle) {
          mode = TransformMode.Resize;
        } else if (res.subTarget === PickSubTarget.Vertex) {
          mode = TransformMode.VertexDrag;
        } else if (res.subTarget === PickSubTarget.Edge) {
          mode = TransformMode.EdgeDrag;
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
        0,
        meta?.boxMode,
        meta?.constraintWidth ?? 0,
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

  renderOverlay(): React.ReactNode {
    if (this.state.kind === 'marquee') {
      return <ConnectedMarquee box={this.state.box} />;
    }
    return null;
  }
}
