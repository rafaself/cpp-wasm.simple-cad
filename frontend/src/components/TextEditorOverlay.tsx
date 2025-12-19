import React, { useEffect, useRef } from 'react';
import { TEXT_PADDING, getWrappedLines, worldToScreen } from '@/utils/geometry';
import type { ViewTransform } from '@/types';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useDataStore } from '@/stores/useDataStore';
import { getDefaultColorMode, getEffectiveStrokeColor } from '@/utils/shapeColors';
import { generateId } from '@/utils/uuid';
import type { Shape } from '@/types';

export type TextEditState = {
  id?: string;
  x: number;
  y: number;
  content: string;
  width?: number;
  height?: number;
};

type Props = {
  textEditState: TextEditState;
  setTextEditState: (state: TextEditState | null) => void;
  viewTransform: ViewTransform;
};

const TextEditorOverlay: React.FC<Props> = ({ textEditState, setTextEditState, viewTransform }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const positionedSelectionFor = useRef<string | null>(null);

  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const dataStore = useDataStore();

  useEffect(() => {
    const sessionKey = textEditState.id ?? `new-${textEditState.x}-${textEditState.y}`;
    if (positionedSelectionFor.current === sessionKey) return;

    const el = textareaRef.current;
    if (!el) return;

    positionedSelectionFor.current = sessionKey;
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(0, 0);
      } catch {
        // ignore
      }
      el.focus();
    });
  }, [textEditState]);

  const handleBlur = () => {
    const nextContent = textEditState.content;

    if (nextContent.trim()) {
      const existingShape = textEditState.id ? dataStore.shapes[textEditState.id] : null;
      const fontSize = existingShape?.fontSize ?? settingsStore.toolDefaults.text.fontSize;
      const bold = existingShape?.bold ?? settingsStore.toolDefaults.text.bold;
      const italic = existingShape?.italic ?? settingsStore.toolDefaults.text.italic;
      const underline = existingShape?.underline ?? settingsStore.toolDefaults.text.underline;
      const strike = existingShape?.strike ?? settingsStore.toolDefaults.text.strike;

      const lineHeight = (fontSize || 16) * 1.2;
      const lines = nextContent.split('\n');
      const measuredContentWidth = Math.max(...lines.map((line) => (line.length || 1) * (fontSize || 16) * 0.6), (fontSize || 16) * 0.6);
      const baseWidth = existingShape?.width && existingShape.width > 0 ? existingShape.width : measuredContentWidth + TEXT_PADDING * 2;
      const wrapped = getWrappedLines(nextContent, Math.max(baseWidth - TEXT_PADDING * 2, 1), fontSize || 16);
      const finalHeight = Math.max(existingShape?.height ?? 0, wrapped.length * lineHeight + TEXT_PADDING * 2);
      const finalWidth = baseWidth;

      if (textEditState.id) {
        dataStore.updateShape(
          textEditState.id,
          {
            textContent: nextContent,
            width: finalWidth,
            height: finalHeight,
            bold,
            italic,
            underline,
            strike,
          },
          true,
        );
        uiStore.setEditingTextId(null);
      } else {
        const textLayerId = dataStore.ensureLayer('Texto');
        const adjustedY = textEditState.y - finalHeight; // store y as bottom-left; click is visual top
        const id = generateId();

        const n: Shape = {
          id,
          layerId: textLayerId,
          type: 'text',
          x: textEditState.x,
          y: adjustedY,
          width: finalWidth,
          height: finalHeight,
          textContent: nextContent,
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
          fillEnabled: false,
          colorMode: getDefaultColorMode(),
          points: [],
          floorId: uiStore.activeFloorId,
          discipline: uiStore.activeDiscipline,
        };

        dataStore.addShape(n);
        uiStore.setSelectedShapeIds(new Set([id]));
      }
    } else if (textEditState.id) {
      dataStore.deleteShapes([textEditState.id]);
      uiStore.setEditingTextId(null);
    }

    setTimeout(() => {
      setTextEditState(null);
      uiStore.setTool('select');
    }, 0);
  };

  const editingShape = textEditState.id ? dataStore.shapes[textEditState.id] : undefined;
  const editingLayer = editingShape ? dataStore.layers.find((l) => l.id === editingShape.layerId) : undefined;
  const editingStrokeColor = editingShape
    ? getEffectiveStrokeColor(editingShape, editingLayer)
    : settingsStore.toolDefaults.strokeColor;

  const fontSize = (editingShape?.fontSize ?? settingsStore.toolDefaults.text.fontSize) || 16;
  const isBold = editingShape?.bold ?? settingsStore.toolDefaults.text.bold;
  const isItalic = editingShape?.italic ?? settingsStore.toolDefaults.text.italic;
  const isUnderline = editingShape?.underline ?? settingsStore.toolDefaults.text.underline;
  const isStrike = editingShape?.strike ?? settingsStore.toolDefaults.text.strike;
  const align = editingShape?.align ?? settingsStore.toolDefaults.text.align;
  const fontFamily = editingShape?.fontFamily ?? settingsStore.toolDefaults.text.fontFamily;

  const visualTopY = textEditState.id && textEditState.height ? textEditState.y + textEditState.height : textEditState.y;
  const topLeft = worldToScreen({ x: textEditState.x, y: visualTopY }, viewTransform);

  return (
    <textarea
      autoFocus
      ref={textareaRef}
      className="absolute z-50 bg-transparent border border-blue-500 rounded resize-none outline-none overflow-hidden"
      style={{
        left: topLeft.x,
        top: topLeft.y,
        width: textEditState.width ? `${textEditState.width * viewTransform.scale}px` : `${(200 + TEXT_PADDING * 2) * viewTransform.scale}px`,
        height: textEditState.height ? `${textEditState.height * viewTransform.scale}px` : 'auto',
        transformOrigin: 'top left',
        fontSize: `${fontSize * viewTransform.scale}px`,
        fontFamily,
        fontWeight: isBold ? '700' : '400',
        fontStyle: isItalic ? 'italic' : 'normal',
        color: editingStrokeColor,
        textAlign: align,
        textDecoration: `${isUnderline ? 'underline ' : ''}${isStrike ? 'line-through' : ''}`.trim(),
        padding: `${TEXT_PADDING * viewTransform.scale}px`,
        lineHeight: `${fontSize * 1.2 * viewTransform.scale}px`,
        boxSizing: 'border-box',
        direction: 'ltr',
      }}
      value={textEditState.content}
      onChange={(e) => setTextEditState({ ...textEditState, content: e.target.value })}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
          e.preventDefault();
          (e.currentTarget as HTMLTextAreaElement).blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setTextEditState(null);
          uiStore.setEditingTextId(null);
          uiStore.setTool('select');
        }
      }}
    />
  );
};

export default TextEditorOverlay;

