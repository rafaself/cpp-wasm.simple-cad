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

export function useTextEditHandler(params: {
  viewTransform: ViewTransform;
  runtime: any;
  textInputProxyRef: React.RefObject<TextInputProxyRef>;
  textToolRef: React.MutableRefObject<TextTool | null>;
}) {
  const { runtime, textToolRef, textInputProxyRef } = params;

  const { caret, selectionRects, anchor, rotation, setCaret: setCaretPosition, hideCaret, clearSelection, setSelection } = useTextCaret();
  
  const engineTextEditState = useUIStore((s) => s.engineTextEditState);
  const setEngineTextEditActive = useUIStore((s) => s.setEngineTextEditActive);
  const bumpEngineTextEditGeneration = useUIStore((s) => s.bumpEngineTextEditGeneration);
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
        
        // Signal content update to consumers (e.g. TextInputProxy)
        bumpEngineTextEditGeneration();

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
      onTextCreated: (shapeId: string, textId: number, _x: number, _y: number, boxMode: TextBoxMode, constraintWidth: number, _initialWidth: number, _initialHeight: number) => {
        registerTextMapping(textId, shapeId);
        setTextMeta(textId, boxMode, constraintWidth);

        const currentLayerId = useUIStore.getState().activeLayerId;
        if (currentLayerId !== null && runtime?.engine?.setEntityLayer) {
          runtime.engine.setEntityLayer(textId, currentLayerId);
        }

        if (runtime?.setSelection) {
          runtime.setSelection([textId], SelectionMode.Replace);
        }
      },
      onTextUpdated: (textId: number, bounds: { width: number; height: number }, boxMode: TextBoxMode, constraintWidth: number) => {
        setTextMeta(textId, boxMode, constraintWidth);
      },
      onTextDeleted: (textId: number) => {
        unregisterTextMappingByShapeId(`entity-${textId}`);
      },
    };

    const tool = createTextTool(callbacks);
    if (tool.initialize(runtime)) {
      textToolRef.current = tool;
      registerTextTool(tool);

      // Load fonts
      void (async () => {
        const loadFromUrl = async (fontId: number, url: string) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return;
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
  }, [
    runtime, 
    setEngineTextEditActive, 
    bumpEngineTextEditGeneration, 
    setCaretPosition, 
    setEngineTextEditCaretPosition, 
    clearEngineTextEdit, 
    hideCaret, 
    clearSelection, 
    clearEngineTextStyleSnapshot, 
    setSelection, 
    setEngineTextStyleSnapshot,
    textToolRef
  ]);

  // Sync tool defaults
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
  }, [ribbonTextDefaults, textToolRef]);

  // Focus helper
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
