import React from 'react';
import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler } from '../types';
import { TextTool, TextToolState, createTextTool } from '@/engine/tools/TextTool';
import { TextBoxMode } from '@/types/text';
import { TextCaretOverlay } from '@/components/TextCaretOverlay';
import { TextInputProxy } from '@/components/TextInputProxy';
import { useUIStore } from '@/stores/useUIStore';

// We need to define the Overlay component that connects to the handler state
// Since TextInputProxy needs the tool instance, we pass it.

export class TextHandler extends BaseInteractionHandler {
  name = 'text';
  
  public textTool: TextTool;
  public state: TextToolState | null = null;
  public content: string = '';
  public caretState = { x: 0, y: 0, height: 0, rotation: 0, anchorX: 0, anchorY: 0 };
  public selectionRects: any[] = [];
  
  constructor(textTool?: TextTool) {
    super();
    this.textTool = textTool ?? createTextTool({
      onStateChange: (s) => {
        this.state = s;
        this.content = this.textTool.getContent();
        this.notifyChange();
      },
      onCaretUpdate: (x, y, h, rot, ax, ay) => {
        this.caretState = { x, y, height: h, rotation: rot, anchorX: ax, anchorY: ay };
        this.notifyChange(); // Update Overlay
      },
      onSelectionUpdate: (rects) => {
        this.selectionRects = rects;
        this.notifyChange();
      },
      onEditEnd: () => {
         // Logic to exit tool? Or just update state?
         // Usually we stay in Text Tool but go to Idle mode.
         this.notifyChange();
      },
      onTextCreated: (shapeId, textId, x, y, boxMode, constraintWidth) => {
          // Sync Logic if needed. Often handled by IdRegistry syncing automatically via engine events.
      },
      onTextUpdated: () => {},
      onStyleSnapshot: (tid, snap) => {
          // Notify UI about style changes (bold/italic)
          // We might need to expose this state to toolbar.
      }
    });
  }

  onEnter(): void {
     // We need runtime to initialize text tool.
     // But onEnter doesn't provide it in base interface.
     // We'll init lazily in onPointerDown or if we can get runtime.
     // Limitation of current `onEnter` signature. 
     // We'll rely on `checkInit(runtime)` pattern in events.
  }

  private checkInit(runtime: any) {
      if (!this.textTool.isReady() && runtime) {
          this.textTool.initialize(runtime);
      }
  }

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    const { runtime, worldPoint: world, event } = ctx;
    if (!runtime || event.button !== 0) return;
    this.textTool.resyncFromEngine();
    this.checkInit(runtime);

    // Hit Test Text
    // TextTool handles hit testing logic internally via `inputCoordinator` usually?
    // Reviewing TextTool: `handleClick` takes world coords. `handlePointerDown` triggers editing.
    // If we click on existing text, we must pass `textId`. 
    // `TextTool` doesn't do "Pick" itself for selection usually?
    
    // Use optimized pick with bounds checking
    const tolerance = 10 / (ctx.viewTransform.scale || 1);
    const res = runtime.pickExSmart(world.x, world.y, tolerance, 0xFF);
    
    // If Picked Text?
    // How do we know it is text?
    // `res.kind` ? 
    // Or check `runtime.getEntityFlags(res.id)`?
    
    // Assuming we treat it as Text Creator if nothing hit, or Text Editor if text hit.
    // Logic:
    /*
      if (res.id !== 0 && isText(res.id)) {
          textTool.handlePointerDown(res.id, ...localCoords...)
      } else {
          textTool.handleClick(world.x, world.y);
      }
    */
    
    // Currently `TextTool` has `handleClick` (Create) and `handlePointerDown` (Edit existing).
    // We need to know if `res.id` is text.
    // `EngineRuntime` might not expose `getType(id)`.
    // But `TextTool` has access to `getAllTextMetas`. 
    // Efficient check: `textTool.bridge.hasText(id)`?
    
    // Simplification: Always try passing to tool if we clicked something?
    // Actually `TextTool` logic in `EngineInteractionLayer` was:
    // User clicks -> If hit text, edit. If not, create.
    
    // Hack: Try to start edit.
    // We need `localX, localY`. `runtime.transformPoint(world, invMatrix)`?
    // `TextTool` calculates this?
    
    // For now, I'll assume Creation Mode if unrelated entity or void.
    // Implementation Detail: We need strict check.
    // Check `runtime.getTextContentMeta(id)`. If exists, it's text.
    
    // Check if we clicked on existing text
    // We use the raw engine binding if available, or our wrapper
    const engine = (runtime as any).engine;
    const textMeta = engine && engine.getTextContentMeta ? engine.getTextContentMeta(res.id) : null;
    
    // Note: getTextContentMeta returns { exists, ptr, byteCount }
    if (res.id !== 0 && textMeta && textMeta.exists) {
         // It is text. 
         // TODO: Implement local coordinate calculation and start editing.
         // For now, we fallback to create new text at click location if we can't edit yet.
         // But to prevent creating text ON TOP of text, we should probably do nothing or select it?
         // If we are in 'Refactoring' mode, we might just log "Edit Text Not Implemented".
         
         // Assuming we want to create new text for now as fail-safe for this step.
         this.textTool.handleClick(world.x, world.y);
    } else {
        this.textTool.handleClick(world.x, world.y);
    }
  }

  onKeyDown(e: KeyboardEvent): void {
    const undoCombo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z');
    const redoCombo = (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && (e.key === 'Z' || e.key === 'z')));
    if (undoCombo) {
      this.textTool.resetEditingState('undo');
    } else if (redoCombo) {
      this.textTool.resetEditingState('redo');
    }
  }

  onLeave(): void {
    this.textTool.resetEditingState('tool-switch');
  }

  onPointerMove(ctx: InputEventContext): void {
      // Pass move to TextTool?
      // `handlePointerMove` used for drag select text.
      if (this.state?.mode === 'editing' || this.state?.mode === 'creating') {
          // We need local coords.
      }
  }
  
  renderOverlay(): React.ReactNode {
     // Return connected components
     return <TextHandlerOverlay handler={this} />;
  }
}

const TextHandlerOverlay: React.FC<{ handler: TextHandler }> = ({ handler }) => {
    const viewTransform = useUIStore(s => s.viewTransform);
    const canvasSize = useUIStore(s => s.canvasSize);
    
    // We assume handler.state is up to date (triggered notifyChange)
    const state = handler.state;
    if (!state || state.mode === 'idle') return null;

    const caretState = handler.caretState;
    const selectionRects = handler.selectionRects || [];
    const content = handler.content || '';

    return (
        <>
            <TextCaretOverlay
                caret={{
                    x: caretState.x,
                    y: caretState.y,
                    height: caretState.height,
                    visible: true // We can track visibility or let overlay handle blinking
                }}
                selectionRects={selectionRects}
                viewTransform={viewTransform}
                anchor={{ x: state.anchorX, y: state.anchorY }}
                rotation={state.rotation}
            />
            
            <TextInputProxy 
                active={true}
                content={content}
                caretIndex={state.caretIndex}
                selectionStart={state.selectionStart}
                selectionEnd={state.selectionEnd}
                onInput={(d) => handler.textTool.handleInputDelta(d)}
                onSelectionChange={(s, e) => handler.textTool.handleSelectionChange(s, e)}
                onCompositionChange={(c) => { /* Optional: handler.textTool.handleComposition(c) */ }}
                onSpecialKey={(k, e) => handler.textTool.handleSpecialKey(k, e as any)}
            />
        </>
    );
}
