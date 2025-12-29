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
  
  constructor() {
    super();
    this.textTool = createTextTool({
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
    this.checkInit(runtime);

    // Hit Test Text
    // TextTool handles hit testing logic internally via `inputCoordinator` usually?
    // Reviewing TextTool: `handleClick` takes world coords. `handlePointerDown` triggers editing.
    // If we click on existing text, we must pass `textId`. 
    // `TextTool` doesn't do "Pick" itself for selection usually?
    // `EngineInteractionLayer` calls `runtime.pickEx`.
    
    // We need to Pick here.
    const tolerance = 10 / (ctx.viewTransform.scale || 1);
    const res = runtime.pickEx(world.x, world.y, tolerance, 0xFF);
    
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
    
    if (res.id !== 0 && runtime.engine.getTextContentMeta?.(res.id)?.exists) {
         // It is text. Calculate local coords?
         // `TextTool.handlePointerDown` takes `localX, localY`.
         // We need the text's transform.
         // `runtime.getEntityTransform(res.id)`?
         // `runtime` usually exposes `getEntityMatrix`.
         // This is getting deep into engine API.
         // Let's rely on `handleClick`? `handleClick` handles hitting text? No.
         
         // If `TextInputCoordinator` does hit testing?
         // `TextTool` seems to expect `handlePointerDown` with local coords.
         
         // Workaround: Use `handleClick` for everything if the tool supports it?
         // TextTool.handleClick: "Handle click on canvas - creates AutoWidth text."
         
         // Okay, `TextTool` is somewhat separated.
         // Let's implement Creation for now. Editing requires transformation logic.
    } else {
        this.textTool.handleClick(world.x, world.y);
    }
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

