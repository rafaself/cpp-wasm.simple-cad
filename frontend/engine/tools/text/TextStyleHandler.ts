/**
 * TextStyleHandler - Handles text style application.
 * 
 * Extracted from TextTool.ts to manage bold/italic/underline/strikethrough,
 * font size, font family, and text alignment.
 */

import type { TextBridge } from '@/engine/bridge/textBridge';
import type { ApplyTextStylePayload } from '@/engine/core/commandBuffer';
import type { TextStateManager } from './TextStateManager';
import { TextStyleFlags, TextAlign, TextBoxMode } from './types';
import { charIndexToByteIndex } from '@/types/text';
import { getTextMeta } from '@/engine/core/textEngineSync';

export interface StyleChangeCallback {
  onTextUpdated?: (
    textId: number,
    content: string,
    bounds: { width: number; height: number },
    boxMode: TextBoxMode,
    constraintWidth: number
  ) => void;
  onCaretUpdate?: () => void;
}

export class TextStyleHandler {
  constructor(
    private bridge: TextBridge,
    private stateManager: TextStateManager,
    private callbacks: StyleChangeCallback
  ) {}

  /**
   * Apply style flags to the current selection or caret position.
   */
  applyStyle(flagsMask: TextStyleFlags, intent: 'set' | 'clear' | 'toggle'): boolean {
    const state = this.stateManager.getState();
    if (state.activeTextId === null) {
      console.warn('[TextStyleHandler] applyStyle: No active text');
      return false;
    }

    const textId = state.activeTextId;
    const contentLength = state.content.length;

    let rangeStart = Math.min(state.selectionStart, state.selectionEnd);
    let rangeEnd = Math.max(state.selectionStart, state.selectionEnd);

    // Keep ranges in bounds
    rangeStart = Math.max(0, Math.min(rangeStart, contentLength));
    rangeEnd = Math.max(0, Math.min(rangeEnd, contentLength));

    // Handle collapsed selection: use caret for typing attributes
    if (rangeStart === rangeEnd) {
      const caret = Math.max(0, Math.min(state.caretIndex, contentLength));
      rangeStart = caret;
      rangeEnd = caret;
    }

    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: rangeStart,
      rangeEndLogical: rangeEnd,
      flagsMask,
      flagsValue: intent === 'set' ? flagsMask : 0,
      mode: intent === 'toggle' ? 2 : intent === 'set' ? 0 : 1,
      styleParamsVersion: 0,
      styleParams: new Uint8Array(),
    };

    this.bridge.applyTextStyle(textId, payload);

    // Sync caret to engine
    const caretByte = charIndexToByteIndex(state.content, state.caretIndex);
    this.bridge.setCaretByteIndex(textId, caretByte);

    // Update style defaults based on snapshot
    const snapshot = this.bridge.getTextStyleSnapshot(textId);
    if (snapshot) {
      const defaults = this.stateManager.getStyleDefaults();
      const updateDefault = (mask: TextStyleFlags, shift: number) => {
        const val = (snapshot.styleTriStateFlags >> shift) & 0b11;
        if (val === 1) {
          defaults.flags |= mask;
        } else if (val === 0) {
          defaults.flags &= ~mask;
        }
      };

      updateDefault(TextStyleFlags.Bold, 0);
      updateDefault(TextStyleFlags.Italic, 2);
      updateDefault(TextStyleFlags.Underline, 4);
      updateDefault(TextStyleFlags.Strikethrough, 6);
      
      this.stateManager.setStyleDefaults(defaults);
    }

    this.syncBoundsAndNotify(textId, state.content, state.boxMode, state.constraintWidth);
    this.callbacks.onCaretUpdate?.();
    return true;
  }

  /**
   * Apply font size to current selection.
   */
  applyFontSize(fontSize: number): boolean {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x03); // textStyleTagFontSize
    view.setFloat32(1, fontSize, true);
    return this.applyStyleWithParams(buf);
  }

  /**
   * Apply font ID to current selection.
   */
  applyFontId(fontId: number): boolean {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x04); // textStyleTagFontId
    view.setUint32(1, fontId, true);
    return this.applyStyleWithParams(buf);
  }

  /**
   * Apply text alignment.
   */
  applyTextAlign(align: TextAlign): boolean {
    const state = this.stateManager.getState();
    if (state.activeTextId === null) return false;

    const success = this.bridge.setTextAlign(state.activeTextId, align);
    if (success) {
      const defaults = this.stateManager.getStyleDefaults();
      defaults.align = align;
      this.stateManager.setStyleDefaults(defaults);
      this.callbacks.onCaretUpdate?.();
    }
    return success;
  }

  /**
   * Apply text alignment to an arbitrary text entity (object selection).
   */
  applyTextAlignToText(textId: number, align: TextAlign): boolean {
    return this.bridge.setTextAlign(textId, align);
  }

  /**
   * Apply style flags to an arbitrary text entity (object selection).
   */
  applyStyleToText(textId: number, flagsMask: TextStyleFlags, intent: 'set' | 'clear' | 'toggle'): boolean {
    const content = this.bridge.getTextContent(textId);
    if (content === null) return false;

    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: 0,
      rangeEndLogical: content.length,
      flagsMask,
      flagsValue: intent === 'set' ? flagsMask : 0,
      mode: intent === 'toggle' ? 2 : intent === 'set' ? 0 : 1,
      styleParamsVersion: 0,
      styleParams: new Uint8Array(),
    };

    this.bridge.applyTextStyle(textId, payload);
    this.syncTextToBounds(textId, content);
    return true;
  }

  /**
   * Apply font size to an arbitrary text entity.
   */
  applyFontSizeToText(textId: number, fontSize: number): boolean {
    const size = Math.max(4, Math.min(512, fontSize));

    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x03); // textStyleTagFontSize
    view.setFloat32(1, size, true);

    return this.applyStyleParamsToText(textId, buf);
  }

  /**
   * Apply font ID to an arbitrary text entity.
   */
  applyFontIdToText(textId: number, fontId: number): boolean {
    const buf = new Uint8Array(5);
    const view = new DataView(buf.buffer);
    view.setUint8(0, 0x04); // textStyleTagFontId
    view.setUint32(1, fontId, true);

    return this.applyStyleParamsToText(textId, buf);
  }

  applyStyleParamsToText(textId: number, params: Uint8Array): boolean {
    const content = this.bridge.getTextContent(textId);
    if (content === null) return false;

    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: 0,
      rangeEndLogical: content.length,
      flagsMask: 0,
      flagsValue: 0,
      mode: 0,
      styleParamsVersion: 1,
      styleParams: params,
    };

    this.bridge.applyTextStyle(textId, payload);
    this.syncTextToBounds(textId, content);
    return true;
  }

  private applyStyleWithParams(params: Uint8Array): boolean {
    const state = this.stateManager.getState();
    if (state.activeTextId === null) return false;

    const textId = state.activeTextId;
    const contentLength = state.content.length;
    let rangeStart = Math.min(state.selectionStart, state.selectionEnd);
    let rangeEnd = Math.max(state.selectionStart, state.selectionEnd);
    rangeStart = Math.max(0, Math.min(rangeStart, contentLength));
    rangeEnd = Math.max(0, Math.min(rangeEnd, contentLength));

    if (rangeStart === rangeEnd) {
      const caret = Math.max(0, Math.min(state.caretIndex, contentLength));
      rangeStart = caret;
      rangeEnd = caret;
    }

    const payload: ApplyTextStylePayload = {
      textId,
      rangeStartLogical: rangeStart,
      rangeEndLogical: rangeEnd,
      flagsMask: 0,
      flagsValue: 0,
      mode: 0,
      styleParamsVersion: 1,
      styleParams: params,
    };

    this.bridge.applyTextStyle(textId, payload);

    const caretByte = charIndexToByteIndex(state.content, state.caretIndex);
    this.bridge.setCaretByteIndex(textId, caretByte);

    return true;
  }

  private syncBoundsAndNotify(textId: number, content: string, boxMode: TextBoxMode, constraintWidth: number): void {
    const bounds = this.bridge.getTextBounds(textId);
    if (bounds && bounds.valid) {
      this.callbacks.onTextUpdated?.(
        textId,
        content,
        { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
        boxMode,
        constraintWidth
      );
    }
  }

  private syncTextToBounds(textId: number, content: string): void {
    const bounds = this.bridge.getTextBounds(textId);
    if (bounds && bounds.valid) {
      const meta = getTextMeta(textId);
      const boxMode = meta?.boxMode ?? TextBoxMode.AutoWidth;
      const constraint = meta?.constraintWidth ?? 0;

      this.callbacks.onTextUpdated?.(
        textId,
        content,
        { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY },
        boxMode,
        constraint
      );
    }
  }
}
