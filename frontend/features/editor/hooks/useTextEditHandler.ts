import { useRef, useEffect } from 'react';
import type { Shape, ViewTransform } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { TextTool, createTextTool, type TextToolState, type TextToolCallbacks } from '@/engine/tools/TextTool';
import { TextInputProxy, type TextInputProxyRef } from '@/components/TextInputProxy';
import { TextCaretOverlay, useTextCaret } from '@/components/TextCaretOverlay';
import type { TextInputDelta } from '@/types/text';
import { TextAlign, TextStyleFlags, TextBoxMode, packColorRGBA } from '@/types/text';
import { registerTextTool, registerTextMapping, getTextIdForShape, getShapeIdForText, getTextMappings, unregisterTextMappingByShapeId, setTextMeta, getTextMeta } from '@/engine/core/textEngineSync';
import { getDefaultColorMode } from '@/utils/shapeColors';
import { SelectionMode } from '@/engine/core/protocol';
import { syncSelectionFromEngine } from '@/engine/core/engineStateSync';

export type TextBoxMeta = {
  boxMode: TextBoxMode;
  constraintWidth: number;
  fixedHeight?: number;
  maxAutoWidth: number;
};

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

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
    const activeFloorId = useUIStore((s) => s.activeFloorId);
    const activeDiscipline = useUIStore((s) => s.activeDiscipline);
    const syncSelection = () => (runtime ? syncSelectionFromEngine(runtime) : new Set());

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
            onTextCreated: (shapeId: string, textId: number, x: number, y: number, boxMode: TextBoxMode, constraintWidth: number, initialWidth: number, initialHeight: number) => {
                const data = useDataStore.getState();
                // shapeId is provided by TextTool (which got it from IdRegistry generation)
                
                registerTextMapping(textId, shapeId);
                setTextMeta(textId, boxMode, constraintWidth);

                textBoxMetaRef.current.set(textId, {
                  boxMode,
                  constraintWidth: boxMode === TextBoxMode.FixedWidth ? constraintWidth : 0,
                  fixedHeight: boxMode === TextBoxMode.FixedWidth ? initialHeight : undefined,
                  maxAutoWidth: Math.max(initialWidth, constraintWidth, 0),
                });

              const ribbonDefaults = useSettingsStore.getState().toolDefaults.text;

              const s: Shape = {
                id: shapeId,
                layerId: data.activeLayerId,
                type: 'text',
                points: [],
                x: clampTiny(x),
                y: clampTiny(y - initialHeight),
                width: initialWidth,
                height: initialHeight,
                strokeColor: '#FFFFFF',
                strokeEnabled: false,
                fillColor: 'transparent',
                fillEnabled: false,
                colorMode: getDefaultColorMode(),
                floorId: activeFloorId,
                discipline: activeDiscipline,
                textContent: '',
                fontSize: ribbonDefaults.fontSize,
                fontFamily: ribbonDefaults.fontFamily,
                align: ribbonDefaults.align ?? 'left',
                bold: ribbonDefaults.bold,
                italic: ribbonDefaults.italic,
                underline: ribbonDefaults.underline,
                strike: ribbonDefaults.strike,
              };

              data.addShape(s);
              if (runtime?.setSelection) {
                runtime.setSelection([textId], SelectionMode.Replace);
                syncSelection();
              }
            },
            onTextUpdated: (textId: number, content: string, bounds: { width: number; height: number }, boxMode: TextBoxMode, constraintWidth: number, x?: number, y?: number) => {
                const shapeId = getShapeIdForText(textId);
                if (!shapeId) return;

                const data = useDataStore.getState();
                const shape = data.shapes[shapeId];
                if (!shape) return;

                const freshMeta: TextBoxMeta = {
                  boxMode,
                  constraintWidth: boxMode === TextBoxMode.FixedWidth ? constraintWidth : 0,
                  fixedHeight: boxMode === TextBoxMode.FixedWidth ? (shape.height ?? bounds.height) : undefined,
                  maxAutoWidth: bounds.width,
                };

                let nextWidth = bounds.width;
                let nextHeight = bounds.height;

                if (freshMeta.boxMode === TextBoxMode.FixedWidth) {
                  nextWidth = Math.max(freshMeta.constraintWidth, 0);
                  const fixedHeight = freshMeta.fixedHeight ?? shape.height ?? bounds.height;
                  freshMeta.fixedHeight = fixedHeight;
                  nextHeight = fixedHeight;
                } else {
                  nextWidth = bounds.width;
                  freshMeta.fixedHeight = undefined;
                  freshMeta.maxAutoWidth = nextWidth;
                }

                textBoxMetaRef.current.set(textId, freshMeta);

                let nextY = 0;
                let nextX = shape.x ?? 0;

                if (y !== undefined && x !== undefined) {
                   nextY = y;
                   nextX = x;
                } else {
                   const oldAnchorY = (shape.y ?? 0) + (shape.height ?? 0);
                   nextY = oldAnchorY - nextHeight;
                }

                const updates: Partial<Shape> = {
                  textContent: content,
                  width: nextWidth,
                  height: nextHeight,
                  x: clampTiny(nextX),
                  y: clampTiny(nextY),
                };

                data.updateShape(shapeId, updates, { skipConnectionSync: true, recordHistory: false });
            },
            onTextDeleted: (textId: number) => {
                const shapeId = getShapeIdForText(textId);
                if (!shapeId) return;
                textBoxMetaRef.current.delete(textId);

                unregisterTextMappingByShapeId(shapeId);

                const data = useDataStore.getState();
                data.deleteShape(shapeId);
                syncSelection();
            },
        };

        const tool = createTextTool(callbacks);
        if (tool.initialize(runtime)) {
            textToolRef.current = tool;
            registerTextTool(tool);

            void (async () => {
                const loadFromUrl = async (fontId: number, url: string, label: string) => {
                  try {
                    const res = await fetch(url);
                    if (!res.ok) {
                      return;
                    }
                    const buf = await res.arrayBuffer();
                    const ok = tool.loadFont(fontId, new Uint8Array(buf));
                  } catch (e) {
                     // ignore
                  }
                };

                const baseUrl = import.meta.env.BASE_URL || '/';
                const publicUrl = (path: string) => `${baseUrl}${path.replace(/^\//, '')}`;

                const sansTtf = publicUrl('/fonts/DejaVuSans.ttf');
                const serifTtf = publicUrl('/fonts/DejaVuSerif.ttf');

                await loadFromUrl(4, sansTtf, 'Inter');
                await loadFromUrl(1, sansTtf, 'Arial');
                await loadFromUrl(2, serifTtf, 'Times');
                await loadFromUrl(3, sansTtf, 'Roboto');
            })();
        }

        return () => {
            registerTextTool(null);
            textToolRef.current = null;
        };
    }, [runtime, setEngineTextEditActive, setEngineTextEditContent, setEngineTextEditCaret, setCaretPosition, setEngineTextEditCaretPosition, clearEngineTextEdit, hideCaret, clearSelection]);

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
    }, [engineTextEditState.active]);

    return {
        caret,
        selectionRects,
        anchor,
        rotation,
        engineTextEditState
    };
}
