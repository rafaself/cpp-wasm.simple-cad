import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';
import { MarqueeOverlay, SelectionBoxState } from '@/features/editor/components/MarqueeOverlay';
import { isDrag } from '@/features/editor/utils/interactionHelpers';
import { MarqueeMode, SelectionMode, SelectionModifier } from '@/engine/core/protocol';
import { TransformMode } from '@/engine/core/interactionSession';
import { PickEntityKind } from '@/types/picking';
import { useUIStore } from '@/stores/useUIStore';
import { CommandOp } from '@/engine/core/commandBuffer';

// Connected component to access store without prop drilling through handler
const ConnectedMarquee: React.FC<{ box: SelectionBoxState }> = ({ box }) => {
    const viewTransform = useUIStore(s => s.viewTransform);
    const canvasSize = useUIStore(s => s.canvasSize);
    return <MarqueeOverlay selectionBox={box} viewTransform={viewTransform} canvasSize={canvasSize} />;
};

type InteractionState = 
  | { kind: 'none' }
  | { kind: 'marquee'; box: SelectionBoxState; startScreen: { x: number, y: number } }
  | { kind: 'transform'; startWorld: { x: number, y: number }; mode: TransformMode };

export class SelectionHandler extends BaseInteractionHandler {
  name = 'select';
  
  private state: InteractionState = { kind: 'none' };
  // We keep tracking 'down' event separately because sometimes we need original down point for drag detection
  private pointerDown: { x: number; y: number; world: { x: number; y: number } } | null = null;
  
  private runtime: EngineRuntime | null = null;

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    const { runtime, snappedPoint: snapped, worldPoint: world, event } = ctx;
    if (!runtime || event.button !== 0) return;
    this.runtime = runtime;

    this.pointerDown = { x: event.clientX, y: event.clientY, world };

    // Picking Logic (Hit Test) - Use optimized pick with early exit
    // We throttle exact picking or just do it on down.
    // PickEx: (x, y, tolerance, mask)
    // Mask 0xFF is fine.
    const tolerance = 10 / (ctx.viewTransform.scale || 1); // 10px screen tolerance
    const res = runtime.pickExSmart(world.x, world.y, tolerance, 0xFF);

    // Check modifiers
    const shift = event.shiftKey;
    const ctrl = event.ctrlKey || event.metaKey;

    if (res.id !== 0) {
      // Hit something!
      const currentSelection = new Set(runtime.getSelectionIds());
      const clickedSelected = currentSelection.has(res.id);

      if (!clickedSelected && !shift && !ctrl) {
         runtime.setSelection([res.id], SelectionMode.Replace);
      } else if (ctrl) {
         // Cycle/Toggle? Logic handled on Up usually for toggles to avoid deselecting on drag start.
      }

      const activeIds = Array.from(runtime.getSelectionIds());
      if (activeIds.length > 0) {
          // Use beginTransform instead of beginSession
          runtime.beginTransform(
               activeIds,
               TransformMode.Move, 
               res.id, 
               res.subIndex, // Pass subIndex (vertex/handle index) 
               snapped.x, 
               snapped.y
          );
          // Assuming it returns void or we assume success. 
          this.state = { kind: 'transform', startWorld: snapped, mode: TransformMode.Move };
          return;
      }
    }

    // If we missed or failed to start session => Marquee
    this.state = { 
        kind: 'marquee', 
        box: { start: world, current: world, direction: 'LTR' },
        startScreen: { x: event.clientX, y: event.clientY } 
    };
    this.notifyChange(); // Render Overlay
  }

  onPointerMove(ctx: InputEventContext): void {
    const { runtime, snappedPoint: snapped, worldPoint: world, event } = ctx;
    if (!runtime) return;

    if (this.state.kind === 'transform') {
        // Update Engine Transform
        if (runtime.updateTransform) {
            runtime.updateTransform(snapped.x, snapped.y);
        }
    } else if (this.state.kind === 'marquee' && this.pointerDown) {
        // Update Marquee Box
        const downX = this.pointerDown.x;
        const currX = event.clientX;
        const direction = currX >= downX ? 'LTR' : 'RTL';
        this.state.box = { start: this.pointerDown.world, current: world, direction };
        this.notifyChange();
    }
  }

  onPointerUp(ctx: InputEventContext): InteractionHandler | void {
    const { runtime, snappedPoint: snapped, event } = ctx;
    if (!runtime) {
        this.state = { kind: 'none' };
        this.pointerDown = null;
        this.notifyChange();
        return;
    }

    if (this.state.kind === 'transform') {
        if (runtime.commitTransform) runtime.commitTransform();
        else runtime.apply([{ op: CommandOp.CommitDraft }]); // Fallback if needed, but commitTransform is correct

        this.state = { kind: 'none' };
        this.pointerDown = null;
        return;
    }

    if (this.state.kind === 'marquee') {
        // Check if it was a drag or click
        if (this.pointerDown && isDrag(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y)) {
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
            } else if (runtime.engine?.queryMarquee) {
                // Fallback manual query
                 const selectedU32 = runtime.engine.queryMarquee(x1, y1, x2, y2, hitMode);
                 const selected: number[] = [];
                 const count = selectedU32.size();
                 for (let i = 0; i < count; ++i) selected.push(selectedU32.get(i));
                 selectedU32.delete();
                 runtime.setSelection?.(selected, mode);
            }
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
            }
        }
        
        this.state = { kind: 'none' };
        this.pointerDown = null;
        this.notifyChange();
    }
  }

  onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
          if (this.state.kind === 'transform') {
              // Cancel Transform
              if (this.runtime?.cancelTransform) this.runtime.cancelTransform();
              else this.runtime?.apply([{ op: CommandOp.CancelDraft }]); // Fallback
              
              this.state = { kind: 'none' };
              this.pointerDown = null;
          } else {
             // Deselect?
             if (this.runtime) {
                 this.runtime.clearSelection();
             }
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
                  id
              }));
              
              if (commands.length > 0) {
                  this.runtime.apply(commands as any[]);
              }

              this.runtime.clearSelection();
          }
      }
  }

  onCancel(): void {
    // Esc closes marquee or cancels transform
    if (this.state.kind === 'transform' && this.runtime?.cancelTransform) {
        this.runtime.cancelTransform();
    }
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
