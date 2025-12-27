import { useEffect } from 'react';
import type { ViewTransform } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { TextTool, createTextTool, type TextToolState, type TextToolCallbacks } from '@/engine/tools/TextTool';
import type { TextInputProxyRef } from '@/components/TextInputProxy';
import { useTextCaret } from '@/components/TextCaretOverlay';
import { TextAlign, TextStyleFlags, TextBoxMode, packColorRGBA } from '@/types/text';
import { registerTextTool, registerTextMapping, unregisterTextMappingByShapeId, setTextMeta } from '@/engine/core/textEngineSync';
import { SelectionMode } from '@/engine/core/protocol';

export type TextBoxMeta = {
  boxMode: TextBoxMode;
  constraintWidth: number;
  fixedHeight?: number;
  maxAutoWidth: number;
};

export function useTextEditHandler(params: {
  viewTransform: ViewTransform;
  runtime: any;
  textInputProxyRef: React.RefObject<TextInputProxyRef>;
  textBoxMetaRef: React.MutableRefObject<Map<number, TextBoxMeta>>;
  textToolRef: React.MutableRefObject<TextTool | null>;
}) {
  const { runtime, textInputProxyRef, textBoxMetaRef, textToolRef } = params;

  const { caret, selectionRects, anchor, rotation, setCaret: setCaretPosition, hideCaret, clearSelection, setSelection } = useTextCaret();
  const engineTextEditState = useUIStore((s) => s.engineTextEditState);
  const setEngineTextEditActive = useUIStore((s) => s.setEngineTextEditActive);
  const setEngineTextEditContent = useUIStore((s) => s.setEngineTextEditContent);
  const setEngineTextEditCaret = useUIStore((s) => s.setEngineTextEditCaret);
  const setEngineTextEditCaretPosition = useUIStore((s) => s.setEngineTextEditCaretPosition);
  const clearEngineTextEdit = useUIStore((s) => s.clearEngineTextEdit);
  const setEngineTextStyleSnapshot = useUIStore((s) => s.setEngineTextStyleSnapshot);
  const clearEngineTextStyleSnapshot = useUIStore((s) => s.clearEngineTextStyleSnapshot);
  const ribbonTextDefaults = useSettingsStore((s) => s.toolDefaults.text);

  // Initialize TextTool
  useEffect(() => {
    if (!runtime) return;

    const callbacks: TextToolCallbacks = {
      onStateChange: (state: TextToolState) => {
        setEngineTextEditActive(state.mode !== 'idle', state.activeTextId);
        setEngineTextEditContent(state.content);
        setEngineTextEditCaret(state.caretIndex, state.selectionStart, state.selectionEnd);
        if (state.mode === 'idle') {
          clearEngineTextStyleSnapshot();
        }
      },
      onCaretUpdate: (x: number, y: number, height: number, rotation: number, anchorX: number, anchorY: number) => {
        setCaretPosition(x, y, height, rotation, anchorX, anchorY);
        setEngineTextEditCaretPosition({ x, y, height });
      },
      onSelectionUpdate: (rects: import('@/types/text').TextSelectionRect[]) => {
        setSelection(rects);
      },
      onStyleSnapshot: (textId, snapshot) => {
        setEngineTextStyleSnapshot(textId, snapshot);
      },
      onEditEnd: () => {
        clearEngineTextEdit();
        clearEngineTextStyleSnapshot();
        hideCaret();
        clearSelection();
        useUIStore.getState().setTool('select');
      },
      onTextCreated: (shapeId: string, textId: number, _x: number, _y: number, boxMode: TextBoxMode, constraintWidth: number, initialWidth: number, initialHeight: number) => {
        registerTextMapping(textId, shapeId);
        setTextMeta(textId, boxMode, constraintWidth);

        textBoxMetaRef.current.set(textId, {
          boxMode,
          constraintWidth: boxMode === TextBoxMode.FixedWidth ? constraintWidth : 0,
          fixedHeight: boxMode === TextBoxMode.FixedWidth ? initialHeight : undefined,
          maxAutoWidth: Math.max(initialWidth, constraintWidth, 0),
        });

        if (runtime?.setSelection) {
          runtime.setSelection([textId], SelectionMode.Replace);
        }
      },
      onTextUpdated: (textId: number, _content: string, bounds: { width: number; height: number }, boxMode: TextBoxMode, constraintWidth: number) => {
        const freshMeta: TextBoxMeta = {
          boxMode,
          constraintWidth: boxMode === TextBoxMode.FixedWidth ? constraintWidth : 0,
          fixedHeight: boxMode === TextBoxMode.FixedWidth ? bounds.height : undefined,
          maxAutoWidth: bounds.width,
        };
        textBoxMetaRef.current.set(textId, freshMeta);
        setTextMeta(textId, boxMode, constraintWidth);
      },
      onTextDeleted: (textId: number) => {
        textBoxMetaRef.current.delete(textId);
        unregisterTextMappingByShapeId(`entity-${textId}`);
      },
    };

    const tool = createTextTool(callbacks);
    if (tool.initialize(runtime)) {
      textToolRef.current = tool;
      registerTextTool(tool);

      void (async () => {
        const loadFromUrl = async (fontId: number, url: string) => {
          try {
            const res = await fetch(url);
            if (!res.ok) {
              return;
            }
            const buf = await res.arrayBuffer();
            tool.loadFont(fontId, new Uint8Array(buf));
          } catch {
            // ignore
          }
        };

        const baseUrl = import.meta.env.BASE_URL || '/';
        const publicUrl = (path: string) => `${baseUrl}${path.replace(/^\//, '')}`;

        const sansTtf = publicUrl('/fonts/DejaVuSans.ttf');
        const serifTtf = publicUrl('/fonts/DejaVuSerif.ttf');

        await loadFromUrl(4, sansTtf);
        await loadFromUrl(1, sansTtf);
        await loadFromUrl(2, serifTtf);
        await loadFromUrl(3, sansTtf);
      })();
    }

    return () => {
      registerTextTool(null);
      textToolRef.current = null;
    };
  }, [runtime, setEngineTextEditActive, setEngineTextEditContent, setEngineTextEditCaret, setCaretPosition, setEngineTextEditCaretPosition, clearEngineTextEdit, hideCaret, clearSelection, clearEngineTextStyleSnapshot, setSelection, setEngineTextStyleSnapshot]);

  useEffect(() => {
    const tool = textToolRef.current;
    if (!tool) return;

    const fontIdByFamily: Record<string, number> = {
      Inter: 0,
      Arial: 1,
      Times: 2,
      Roboto: 3,
    };

    const flags =
      (ribbonTextDefaults.bold ? TextStyleFlags.Bold : 0) |
      (ribbonTextDefaults.italic ? TextStyleFlags.Italic : 0) |
      (ribbonTextDefaults.underline ? TextStyleFlags.Underline : 0) |
      (ribbonTextDefaults.strike ? TextStyleFlags.Strikethrough : 0);

    const align =
      ribbonTextDefaults.align === 'center'
        ? TextAlign.Center
        : ribbonTextDefaults.align === 'right'
          ? TextAlign.Right
          : TextAlign.Left;

    tool.setStyleDefaults({
      fontId: fontIdByFamily[ribbonTextDefaults.fontFamily] ?? 0,
      fontSize: ribbonTextDefaults.fontSize,
      flags,
      align,
      colorRGBA: packColorRGBA(1, 1, 1, 1),
    });
  }, [ribbonTextDefaults]);

  useEffect(() => {
    if (!engineTextEditState.active) return;
    requestAnimationFrame(() => {
      textInputProxyRef.current?.focus();
    });
  }, [engineTextEditState.active, textInputProxyRef]);

  return {
    caret,
    selectionRects,
    anchor,
    rotation,
    engineTextEditState,
  };
}
