import React, { useRef, useEffect } from 'react';
import { TEXT_PADDING, worldToScreen, getWrappedLines } from '../../../../../utils/geometry';
import { ViewTransform } from '../../../../../types';
import { useUIStore } from '../../../../../stores/useUIStore';
import { useSettingsStore } from '../../../../../stores/useSettingsStore';
import { useDataStore } from '../../../../../stores/useDataStore';
import { getDefaultColorMode, getEffectiveStrokeColor } from '../../../../../utils/shapeColors';

export interface TextEditState {
    id?: string;
    x: number;
    y: number;
    content: string;
    width?: number;
    height?: number;
}

interface TextEditorOverlayProps {
    textEditState: TextEditState;
    setTextEditState: (state: TextEditState | null) => void;
    viewTransform: ViewTransform;
}

const TextEditorOverlay: React.FC<TextEditorOverlayProps> = ({ textEditState, setTextEditState, viewTransform }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const positionedSelectionFor = useRef<string | null>(null);
    const uiStore = useUIStore();
    const settingsStore = useSettingsStore();
    const dataStore = useDataStore();
    const setEditingTextId = uiStore.setEditingTextId;

    useEffect(() => {
        if (!textEditState) {
          positionedSelectionFor.current = null;
          return;
        }
        if (textareaRef.current) {
          const sessionKey = (textEditState.id ?? `new-${textEditState.x}-${textEditState.y}`);
          if (positionedSelectionFor.current === sessionKey) return;
          const el = textareaRef.current;
          requestAnimationFrame(() => {
            try { el.setSelectionRange(0, 0); } catch (e) { /* ignore */ }
            el.focus();
          });
          positionedSelectionFor.current = sessionKey;
        }
      }, [textEditState]);

    const handleBlur = () => {
        if (textEditState.content.trim()) {
            const fontSize = textEditState.id && dataStore.shapes[textEditState.id] ? dataStore.shapes[textEditState.id].fontSize || settingsStore.toolDefaults.text.fontSize : settingsStore.toolDefaults.text.fontSize;
            const bold = textEditState.id && dataStore.shapes[textEditState.id] ? dataStore.shapes[textEditState.id].bold ?? settingsStore.toolDefaults.text.bold : settingsStore.toolDefaults.text.bold;
            const italic = textEditState.id && dataStore.shapes[textEditState.id] ? dataStore.shapes[textEditState.id].italic ?? settingsStore.toolDefaults.text.italic : settingsStore.toolDefaults.text.italic;
            const underline = textEditState.id && dataStore.shapes[textEditState.id] ? dataStore.shapes[textEditState.id].underline ?? settingsStore.toolDefaults.text.underline : settingsStore.toolDefaults.text.underline;
            const strike = textEditState.id && dataStore.shapes[textEditState.id] ? dataStore.shapes[textEditState.id].strike ?? settingsStore.toolDefaults.text.strike : settingsStore.toolDefaults.text.strike;
            const lineHeight = (fontSize || 16) * 1.2;
            const lines = textEditState.content.split('\n');
            const measuredContentWidth = Math.max(...lines.map(line => (line.length || 1) * (fontSize || 16) * 0.6), (fontSize || 16) * 0.6);
            const existingShape = textEditState.id ? dataStore.shapes[textEditState.id] : null;
            const baseWidth = existingShape?.width && existingShape.width > 0 ? existingShape.width : measuredContentWidth + TEXT_PADDING * 2;
            const wrapped = getWrappedLines(textEditState.content, Math.max(baseWidth - TEXT_PADDING * 2, 1), fontSize || 16);
            const finalHeight = Math.max(existingShape?.height ?? 0, wrapped.length * lineHeight + TEXT_PADDING * 2);
            const finalWidth = baseWidth;

            if (textEditState.id) {
                 dataStore.updateShape(textEditState.id, {
                    textContent: textEditState.content,
                    width: finalWidth,
                    height: finalHeight,
                    bold,
                    italic,
                    underline,
                    strike
                 }, true);
                 setEditingTextId(null);
            } else {
                const textLayerId = dataStore.ensureLayer('Texto');
                dataStore.addShape({
                    id: Date.now().toString(),
                    layerId: textLayerId,
                    type: 'text',
                    x: textEditState.x,
                    y: textEditState.y,
                    width: finalWidth,
                    height: finalHeight,
                    textContent: textEditState.content,
                    fontSize: settingsStore.toolDefaults.text.fontSize,
                    fontFamily: settingsStore.toolDefaults.text.fontFamily,
                    align: settingsStore.toolDefaults.text.align,
                    bold: settingsStore.toolDefaults.text.bold,
                    italic: settingsStore.toolDefaults.text.italic,
                    underline: settingsStore.toolDefaults.text.underline,
                    strike: settingsStore.toolDefaults.text.strike,
                    strokeColor: settingsStore.toolDefaults.strokeColor,
                    strokeWidth: settingsStore.toolDefaults.strokeWidth,
                    strokeEnabled: settingsStore.toolDefaults.strokeEnabled,
                    fillColor: 'transparent',
                    colorMode: getDefaultColorMode(),
                    points: []
                });
            }
            setEditingTextId(null);
        } else if (textEditState.id) {
            dataStore.deleteSelected([textEditState.id]);
            setEditingTextId(null);
        }

        // Commit complete. Now clear state and change tool.
        // We use setTimeout to ensure this happens after the event loop clears, preventing conflicts.
        setTimeout(() => {
            setTextEditState(null);
            uiStore.setTool('select');
        }, 0);
    };

    const editingShape = textEditState.id ? dataStore.shapes[textEditState.id] : undefined;
    const editingLayer = editingShape ? dataStore.layers.find(l => l.id === editingShape.layerId) : undefined;
    const editingStrokeColor = editingShape ? getEffectiveStrokeColor(editingShape, editingLayer) : settingsStore.toolDefaults.strokeColor;

    return (
        <textarea
            autoFocus
            ref={textareaRef}
            className="absolute z-50 bg-transparent border border-blue-500 rounded resize-none outline-none overflow-hidden"
            style={{
                 left: worldToScreen({x: textEditState.x, y: textEditState.y}, viewTransform).x,
                 top: worldToScreen({x: textEditState.x, y: textEditState.y}, viewTransform).y,
                 width: textEditState.width ? (textEditState.width * viewTransform.scale) : (200 + TEXT_PADDING * 2) + 'px',
                 height: textEditState.height ? (textEditState.height * viewTransform.scale) : 'auto',
                 transformOrigin: 'top left',
                 fontSize: (dataStore.shapes[textEditState.id || '']?.fontSize || settingsStore.toolDefaults.text.fontSize) * viewTransform.scale + 'px',
                 fontFamily: dataStore.shapes[textEditState.id || '']?.fontFamily || settingsStore.toolDefaults.text.fontFamily,
                 fontWeight: (dataStore.shapes[textEditState.id || '']?.bold ?? settingsStore.toolDefaults.text.bold) ? '700' : '400',
                 fontStyle: (dataStore.shapes[textEditState.id || '']?.italic ?? settingsStore.toolDefaults.text.italic) ? 'italic' : 'normal',
                 color: editingStrokeColor,
                 textAlign: dataStore.shapes[textEditState.id || '']?.align || settingsStore.toolDefaults.text.align,
                 textDecoration: `${(dataStore.shapes[textEditState.id || '']?.underline ?? settingsStore.toolDefaults.text.underline) ? 'underline ' : ''}${(dataStore.shapes[textEditState.id || '']?.strike ?? settingsStore.toolDefaults.text.strike) ? 'line-through' : ''}`.trim(),
                 padding: `${TEXT_PADDING * viewTransform.scale}px`,
                 lineHeight: ((dataStore.shapes[textEditState.id || '']?.fontSize || settingsStore.toolDefaults.text.fontSize) * 1.2 * viewTransform.scale) + 'px',
                 boxSizing: 'border-box',
                 direction: 'ltr'
            }}
            value={textEditState.content}
            onChange={(e) => setTextEditState({ ...textEditState, content: e.target.value })}
            onBlur={handleBlur}
            onKeyDown={(e) => {
                if((e.key === 'Enter' && e.ctrlKey)) {
                    e.preventDefault();
                    e.currentTarget.blur();
                }
                if(e.key === 'Escape') {
                    e.preventDefault();
                    setTextEditState(null);
                    setEditingTextId(null);
                    uiStore.setTool('select');
                }
            }}
        />
    );
};

export default TextEditorOverlay;
