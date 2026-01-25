import React from 'react';

import { TextCaretOverlay } from '@/components/TextCaretOverlay';
import { TextInputProxy, TextInputProxyRef } from '@/components/TextInputProxy';
import { CommandOp, SelectionMode, StyleTarget } from '@/engine/core/EngineRuntime';
import { getEngineRuntime } from '@/engine/core/singleton';
import { TextTool, TextToolState } from '@/engine/tools/TextTool';
import {
  addTextToolListener,
  applyTextDefaultsFromSettings,
  ensureTextToolReady,
  getSharedTextTool,
} from '@/features/editor/text/textToolController';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { PickEntityKind } from '@/types/picking';
import { packColorRGBA } from '@/types/text';
import { parseCssColorToHexAlpha } from '@/utils/cssColor';
import { worldToScreen } from '@/engine/core/viewportMath';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler } from '../types';

import type { EngineCommand } from '@/engine/core/commandTypes';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { TextToolCallbacks } from '@/engine/tools/TextTool';

// We need to define the Overlay component that connects to the handler state
// Since TextInputProxy needs the tool instance, we pass it.

export class TextHandler extends BaseInteractionHandler {
  name = 'text';

  public textTool: TextTool;
  public state: TextToolState | null = null;
  public content: string = '';
  public caretState = { x: 0, y: 0, height: 0, rotation: 0, anchorX: 0, anchorY: 0 };
  public selectionRects: any[] = [];
  public editingBounds: { width: number; height: number } | null = null;
  public inputRef = React.createRef<TextInputProxyRef>();

  private engineTextSessionActive = false;
  private engineTextId: number | null = null;
  private removeListener: (() => void) | null = null;
  private runtime: EngineRuntime | null = null;
  private usingSharedTool = false;

  private focusInputProxy(): void {
    // Focus after the current frame to avoid being overridden by pointer capture focus.
    requestAnimationFrame(() => {
      this.inputRef.current?.focus();
    });
  }

  private refreshEditingBounds(): void {
    const activeId = this.state?.activeTextId ?? null;
    if (!activeId || !this.runtime || !this.runtime.text) {
      this.editingBounds = null;
      return;
    }

    const bounds = this.runtime.text.getTextBounds(activeId);
    if (bounds && bounds.valid) {
      this.editingBounds = {
        width: bounds.maxX - bounds.minX,
        height: bounds.maxY - bounds.minY,
      };
    } else {
      this.editingBounds = null;
    }
  }

  private applyTextStyleDefaults(textId: number): void {
    const runtime = this.runtime;
    if (!runtime) return;
    const { textColor, textBackgroundColor, textBackgroundEnabled } =
      useSettingsStore.getState().toolDefaults.text;
    const parseColor = (input: string | null): number | null => {
      // null means ByLayer - don't apply override
      if (input === null) return null;
      const parsed = parseCssColorToHexAlpha(input);
      if (!parsed) return null;
      return packColorRGBA(
        Number.parseInt(parsed.hex.slice(1, 3), 16) / 255,
        Number.parseInt(parsed.hex.slice(3, 5), 16) / 255,
        Number.parseInt(parsed.hex.slice(5, 7), 16) / 255,
        parsed.alpha,
      );
    };
    const textColorRGBA = parseColor(textColor);
    const backgroundRGBA = parseColor(textBackgroundColor);
    const commands: EngineCommand[] = [];
    if (textColorRGBA !== null) {
      commands.push({
        op: CommandOp.SetEntityStyleOverride,
        style: { target: StyleTarget.TextColor, colorRGBA: textColorRGBA, ids: [textId] },
      });
    }
    if (backgroundRGBA !== null) {
      commands.push({
        op: CommandOp.SetEntityStyleOverride,
        style: { target: StyleTarget.TextBackground, colorRGBA: backgroundRGBA, ids: [textId] },
      });
    }
    commands.push({
      op: CommandOp.SetEntityStyleEnabled,
      enabled: {
        target: StyleTarget.TextBackground,
        enabled: textBackgroundEnabled,
        ids: [textId],
      },
    });
    if (commands.length) {
      runtime.apply(commands);
    }
  }

  private createListenerCallbacks(): TextToolCallbacks {
    return {
      onStateChange: (s) => {
        this.state = s;
        this.content = this.textTool.getContent();
        this.syncEngineTextState();
        if (this.state && (this.state.mode === 'creating' || this.state.mode === 'editing')) {
          this.focusInputProxy();
        }
        this.refreshEditingBounds();
        this.notifyChange();
      },
      onCaretUpdate: (x, y, h, rot, ax, ay) => {
        this.caretState = { x, y, height: h, rotation: rot, anchorX: ax, anchorY: ay };
        this.syncEngineCaretState();
        this.notifyChange(); // Update Overlay
      },
      onSelectionUpdate: (rects) => {
        this.selectionRects = rects;
        this.notifyChange();
      },
      onEditEnd: () => {
        this.syncEngineTextState(true);
        this.editingBounds = null;
        this.notifyChange();
      },
      onTextCreated: (_shapeId, _textId, _x, _y, _boxMode, _constraintWidth) => {
        // IdRegistry sync is handled by engine events; no-op here.
        if (_textId !== null && _textId !== undefined) {
          this.applyTextStyleDefaults(_textId);
        }
      },
      onTextUpdated: (_textId, bounds) => {
        if (bounds && typeof bounds.width === 'number' && typeof bounds.height === 'number') {
          this.editingBounds = bounds;
        } else {
          this.refreshEditingBounds();
        }
        this.notifyChange();
      },
      onStyleSnapshot: (_tid, _snap) => {
        // Style snapshot is broadcast via controller for ribbon consumers.
      },
      onTextDeleted: () => {},
    };
  }

  constructor(textTool?: TextTool) {
    super();
    this.textTool = textTool ?? getSharedTextTool();
    this.usingSharedTool = !textTool;
    const listener = this.createListenerCallbacks();

    if (textTool && typeof (textTool as any).setCallbacks === 'function') {
      (textTool as any).setCallbacks(listener);
    } else if (!textTool) {
      this.removeListener = addTextToolListener(listener);
      applyTextDefaultsFromSettings();
    }

    if (this.usingSharedTool) {
      void getEngineRuntime().then((rt) => {
        if (!this.runtime) {
          this.runtime = rt;
          this.refreshEditingBounds();
        }
      });
    }
  }

  onEnter(): void {
    // We need runtime to initialize text tool.
    // But onEnter doesn't provide it in base interface.
    // We'll init lazily in onPointerDown or if we can get runtime.
    // Limitation of current `onEnter` signature.
    // We'll rely on `checkInit(runtime)` pattern in events.
  }

  private checkInit(runtime: any) {
    if (!runtime) return;
    this.runtime = runtime;

    if (!this.textTool.isReady()) {
      this.textTool.initialize(runtime);
      if (this.usingSharedTool) {
        applyTextDefaultsFromSettings();
      }
    }

    if (this.usingSharedTool) {
      const { fontFamily } = useSettingsStore.getState().toolDefaults.text;
      void ensureTextToolReady(runtime, fontFamily);
    }
  }

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    const { runtime, worldPoint: world, event } = ctx;
    if (!runtime || event.button !== 0) return;
    this.runtime = runtime;
    this.textTool.resyncFromEngine();
    this.checkInit(runtime);

    const tolerance = runtime.viewport.getPickingToleranceWithTransform(ctx.viewTransform);
    const pick = runtime.pickExSmart(world.x, world.y, tolerance, 0xff);
    const state = this.state;
    const activeId = state?.activeTextId ?? null;
    const editing = state?.mode === 'creating' || state?.mode === 'editing';
    const hitAnyText = pick.id !== 0 && pick.kind === PickEntityKind.Text;
    const hitActiveText = hitAnyText && activeId !== null && pick.id === activeId;

    if (editing && !hitActiveText) {
      const selectionTarget = pick.id !== 0 ? pick.id : activeId;
      this.textTool.commitAndExit();
      if (selectionTarget !== null) {
        runtime.setSelection([selectionTarget], SelectionMode.Replace);
      }
      useUIStore.getState().setTool('select');
      return;
    }

    if (hitAnyText) {
      const meta = runtime.getTextEntityMeta(pick.id);
      const bounds = runtime.text.getTextBounds(pick.id);
      const anchorX = bounds && bounds.valid ? bounds.minX : world.x;
      const anchorY = bounds && bounds.valid ? bounds.maxY : world.y;
      const localX = (pick.hitX ?? world.x) - anchorX;
      const localY = (pick.hitY ?? world.y) - anchorY;

      this.textTool.handlePointerDown(
        pick.id,
        localX,
        localY,
        event.shiftKey,
        anchorX,
        anchorY,
        meta?.rotation ?? 0,
        meta?.boxMode,
        meta?.constraintWidth ?? 0,
        ctx.viewTransform.scale,
        true,
      );
    } else {
      this.textTool.handleClick(world.x, world.y);
    }

    this.focusInputProxy();
  }

  onKeyDown(e: KeyboardEvent): void {
    const undoCombo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z');
    const redoCombo =
      (e.ctrlKey || e.metaKey) &&
      (e.key === 'y' || (e.shiftKey && (e.key === 'Z' || e.key === 'z')));
    if (undoCombo) {
      this.textTool.resetEditingState('undo');
    } else if (redoCombo) {
      this.textTool.resetEditingState('redo');
    }
  }

  onLeave(): void {
    const isEditing = this.state?.mode === 'creating' || this.state?.mode === 'editing';
    if (isEditing) {
      this.textTool.commitAndExit();
    } else {
      this.textTool.resetEditingState('tool-switch');
    }
    if (this.removeListener) {
      this.removeListener();
      this.removeListener = null;
    }
  }

  onPointerMove(ctx: InputEventContext): void {
    const { worldPoint: world, runtime } = ctx;
    if (!runtime) return;

    // Handle drag text selection
    if (
      (this.state?.mode === 'editing' || this.state?.mode === 'creating') &&
      this.state?.activeTextId !== null
    ) {
      const textId = this.state.activeTextId;
      const bounds = runtime.text.getTextBounds(textId);
      if (bounds && bounds.valid) {
        // Compute local coordinates relative to text anchor (top-left in Y-up world)
        const anchorX = bounds.minX;
        const anchorY = bounds.maxY;
        const localX = world.x - anchorX;
        const localY = world.y - anchorY;
        this.textTool.handlePointerMove(textId, localX, localY);
      }
    }
  }

  onPointerUp(ctx: InputEventContext): void {
    this.textTool.handlePointerUp();
  }

  private syncEngineTextState(forceClear = false): void {
    const store = useUIStore.getState();
    const active =
      !forceClear &&
      this.state !== null &&
      (this.state.mode === 'creating' || this.state.mode === 'editing') &&
      this.state.activeTextId !== null;

    const nextId = active ? (this.state?.activeTextId ?? null) : null;

    if (active) {
      if (!this.engineTextSessionActive || this.engineTextId !== nextId) {
        store.setEngineTextEditActive(true, nextId);
      }
      this.engineTextSessionActive = true;
      this.engineTextId = nextId;
      // Proactively focus the proxy if it is mounted.
      this.focusInputProxy();
    } else if (this.engineTextSessionActive) {
      store.clearEngineTextEdit();
      this.engineTextSessionActive = false;
      this.engineTextId = null;
      this.inputRef.current?.blur();
    }
  }

  private syncEngineCaretState(): void {
    if (!this.engineTextSessionActive || this.state === null || this.state.activeTextId === null) {
      return;
    }

    const store = useUIStore.getState();
    // Convert caret from local to world space (Y-Up).
    const { rotation } = this.caretState;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const worldX = this.state.anchorX + this.caretState.x * cosR - this.caretState.y * sinR;
    const worldY = this.state.anchorY + this.caretState.x * sinR + this.caretState.y * cosR;

    store.setEngineTextEditCaretPosition({
      x: worldX,
      y: worldY,
      height: this.caretState.height,
    });
  }

  renderOverlay(): React.ReactNode {
    // Return connected components
    return <TextHandlerOverlay handler={this} />;
  }
}

const TextHandlerOverlay: React.FC<{ handler: TextHandler }> = ({ handler }) => {
  const viewTransform = useUIStore((s) => s.viewTransform);

  const state = handler.state;
  const hasState = !!state && state.mode !== 'idle';
  const caretState = hasState
    ? handler.caretState
    : { x: 0, y: 0, height: 0, rotation: 0, anchorX: 0, anchorY: 0 };
  const selectionRects = hasState ? handler.selectionRects || [] : [];
  const content = hasState ? handler.content || '' : '';
  const isEditing = hasState && (state!.mode === 'creating' || state!.mode === 'editing');
  const editingBounds = isEditing ? handler.editingBounds : null;

  const caretWorld = hasState
    ? {
        x:
          state!.anchorX +
          caretState.x * Math.cos(caretState.rotation) -
          caretState.y * Math.sin(caretState.rotation),
        y:
          state!.anchorY +
          caretState.x * Math.sin(caretState.rotation) +
          caretState.y * Math.cos(caretState.rotation),
      }
    : { x: 0, y: 0 };

  const caretScreen = worldToScreen(caretWorld, viewTransform);

  React.useEffect(() => {
    if (isEditing) {
      handler.inputRef.current?.focus();
    }
  }, [isEditing, handler]);

  if (!hasState) return null;

  return (
    <>
      <TextCaretOverlay
        caret={{
          x: caretState.x,
          y: caretState.y,
          height: caretState.height,
          visible: true, // We can track visibility or let overlay handle blinking
        }}
        selectionRects={selectionRects}
        viewTransform={viewTransform}
        anchor={{ x: state.anchorX, y: state.anchorY }}
        rotation={state.rotation}
        editingBounds={editingBounds}
      />

      <TextInputProxy
        ref={handler.inputRef}
        active={isEditing}
        content={content}
        caretIndex={state.caretIndex}
        selectionStart={state.selectionStart}
        selectionEnd={state.selectionEnd}
        positionHint={caretScreen}
        onInput={(d) => handler.textTool.handleInputDelta(d)}
        onSelectionChange={(s, e) => handler.textTool.handleSelectionChange(s, e)}
        onCompositionChange={(c) => handler.textTool.handleComposition(c)}
        onSpecialKey={(k, e) => handler.textTool.handleSpecialKey(k, e as any)}
      />
    </>
  );
};
