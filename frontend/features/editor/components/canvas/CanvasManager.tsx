import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUIStore } from '../../../../stores/useUIStore';
import { useDataStore } from '../../../../stores/useDataStore';
import { worldToScreen, getWrappedLines } from '../../../../utils/geometry';
import StaticCanvas from './StaticCanvas';
import DynamicOverlay from './DynamicOverlay';
import UserHint from '../UserHint';
import { Shape } from '../../../../types';

interface TextEntryState {
    id?: string;
    x: number;
    y: number;
    rotation: number;
    boxWidth?: number; // If set, acts as fixed width
    text: string;

    // Style Snapshot for creating new text
    fontSize: number;
    fontFamily: string;
    strokeColor: string; // Text Color
    fillColor: string; // Background Color
    fontBold: boolean;
    fontItalic: boolean;
    fontUnderline: boolean;
    fontStrike: boolean;
}

const CanvasManager: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const measureCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const uiStore = useUIStore();
    const dataStore = useDataStore();

    const [dims, setDims] = useState({ width: 800, height: 600 });
    const [textEntry, setTextEntry] = useState<TextEntryState | null>(null);
    const [hintDismissed, setHintDismissed] = useState(false);
    const [textAreaValue, setTextAreaValue] = useState("");

    // Resize Observer
    useEffect(() => {
        const handleResize = () => {
          if (containerRef.current) {
              const width = containerRef.current.clientWidth;
              const height = containerRef.current.clientHeight;
              if (width !== dims.width || height !== dims.height) {
                  setDims({ width, height });
                  uiStore.setCanvasSize({ width, height });
              }
          }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [uiStore, dims.width, dims.height]);

    // Handle Text Entry Start (From DynamicOverlay)
    const handleTextEntryStart = useCallback((data: {
        id?: string,
        x: number,
        y: number,
        rotation: number,
        boxWidth?: number,
        initialText?: string
    }) => {
        // Resolve styles: Existing shape or current UI defaults
        let styles = {
            fontSize: uiStore.textSize,
            fontFamily: uiStore.fontFamily,
            strokeColor: uiStore.strokeColor,
            fillColor: uiStore.fillColor,
            fontBold: uiStore.fontBold,
            fontItalic: uiStore.fontItalic,
            fontUnderline: uiStore.fontUnderline,
            fontStrike: uiStore.fontStrike
        };

        if (data.id) {
            const shape = dataStore.shapes[data.id];
            if (shape) {
                styles = {
                    fontSize: shape.fontSize || 20,
                    fontFamily: shape.fontFamily || 'sans-serif',
                    strokeColor: shape.strokeColor,
                    fillColor: shape.fillColor,
                    fontBold: !!shape.fontBold,
                    fontItalic: !!shape.fontItalic,
                    fontUnderline: !!shape.fontUnderline,
                    fontStrike: !!shape.fontStrike
                };
            }
        }

        setTextEntry({
            id: data.id,
            x: data.x,
            y: data.y,
            rotation: data.rotation,
            boxWidth: data.boxWidth,
            text: data.initialText || "",
            ...styles
        });
        setTextAreaValue(data.initialText || "");

        // Focus next tick
        setTimeout(() => {
            if (textAreaRef.current) {
                textAreaRef.current.focus();
                textAreaRef.current.select();
            }
        }, 0);
    }, [uiStore, dataStore]);

    const commitTextEntry = useCallback(() => {
        if (textEntry) {
            const rawText = textAreaValue;

            if (!rawText.trim()) {
                if (textEntry.id) dataStore.deleteShape(textEntry.id);
                setTextEntry(null);
                return;
            }

            // Measure Text to determine strict bounds for Spatial Index
            const ctx = measureCanvasRef.current.getContext('2d');
            if (ctx) {
                const fontSize = textEntry.fontSize;
                const lineHeight = fontSize * 1.2;
                ctx.font = `${textEntry.fontItalic ? 'italic' : 'normal'} ${textEntry.fontBold ? 'bold' : 'normal'} ${fontSize}px "${textEntry.fontFamily}"`;

                let width = 0;
                let height = 0;

                const lines = rawText.split('\n'); // Simple wrap logic, explicit newlines only for now if auto-width
                // If boxWidth is set, we must simulate wrapping to get height?
                // For simplified Text Tool:
                // 1. If Box Width (Drag): Text wraps at width. Height grows.
                // 2. If No Box Width (Click): Width grows with text (max line width). Height grows.

                let processedLines = lines;
                if (textEntry.boxWidth) {
                     processedLines = getWrappedLines(ctx, rawText, textEntry.boxWidth);
                     width = textEntry.boxWidth;
                } else {
                     let maxWidth = 0;
                     lines.forEach(l => {
                         const w = ctx.measureText(l).width;
                         if (w > maxWidth) maxWidth = w;
                     });
                     width = Math.ceil(maxWidth);
                }

                height = Math.ceil(processedLines.length * lineHeight);

                // Add padding to match visual
                // width += 4;
                // height += 4;

                // IMPORTANT: Ensure valid numbers to prevent "Disappearing" bug
                width = Math.max(1, width || 10);
                height = Math.max(1, height || 10);

                const shapeData: Partial<Shape> = {
                    text: rawText,
                    width: width,
                    height: height,
                    fontSize: textEntry.fontSize,
                    fontFamily: textEntry.fontFamily,
                    strokeColor: textEntry.strokeColor,
                    fillColor: textEntry.fillColor,
                    fontBold: textEntry.fontBold,
                    fontItalic: textEntry.fontItalic,
                    fontUnderline: textEntry.fontUnderline,
                    fontStrike: textEntry.fontStrike,
                    rotation: textEntry.rotation
                };

                if (textEntry.id) {
                    dataStore.updateShape(textEntry.id, shapeData);
                } else {
                    dataStore.addShape({
                       id: Date.now().toString(),
                       layerId: dataStore.activeLayerId,
                       type: 'text',
                       x: textEntry.x,
                       y: textEntry.y,
                       points: [],
                       ...shapeData as any
                    });
                    uiStore.setSidebarTab('desenho');
                }
            }
        }
        setTextEntry(null);
    }, [textEntry, textAreaValue, uiStore, dataStore]);

    // Hint Logic
    useEffect(() => { setHintDismissed(false); }, [uiStore.activeTool]);

    let hintMessage = "";
    if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size > 0) hintMessage = "Arraste para mover/rotacionar";
    else if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size === 0) hintMessage = "Selecione objetos primeiro";
    else if (uiStore.activeTool === 'text' && !textEntry) hintMessage = "Clique para digitar ou arraste para criar área";
    else if (uiStore.activeTool === 'text' && textEntry) hintMessage = "Digite o texto. Clique fora para finalizar.";

    // Calculate TextArea Styles
    const getTextAreaStyle = (): React.CSSProperties => {
        if (!textEntry) return {};

        const screenPos = worldToScreen({x: textEntry.x, y: textEntry.y}, uiStore.viewTransform);
        const scale = uiStore.viewTransform.scale;

        return {
            position: 'absolute',
            left: screenPos.x,
            top: screenPos.y,
            transform: `rotate(${textEntry.rotation}rad)`,
            transformOrigin: 'top left',

            // Box Sizing
            minWidth: '50px',
            width: textEntry.boxWidth ? textEntry.boxWidth * scale : 'auto',
            height: 'auto',

            // Visuals
            outline: 'none',
            border: '1px dashed #3b82f6',
            padding: '0px', // Match Canvas rendering offset
            margin: '0',
            resize: 'none',
            overflow: 'hidden',

            // Typography
            fontFamily: textEntry.fontFamily,
            fontSize: `${textEntry.fontSize * scale}px`,
            lineHeight: '1.2',
            fontWeight: textEntry.fontBold ? 'bold' : 'normal',
            fontStyle: textEntry.fontItalic ? 'italic' : 'normal',
            textDecoration: [
                textEntry.fontUnderline ? 'underline' : '',
                textEntry.fontStrike ? 'line-through' : ''
            ].join(' ').trim(),

            // Colors
            color: textEntry.strokeColor,
            backgroundColor: textEntry.fillColor === 'transparent' ? 'transparent' : textEntry.fillColor,

            whiteSpace: 'pre', // Important for matching canvas
        };
    };

    // Auto-resize textarea height
    useEffect(() => {
        if (textAreaRef.current) {
            textAreaRef.current.style.height = '0px';
            textAreaRef.current.style.height = textAreaRef.current.scrollHeight + 'px';
        }
    }, [textAreaValue, textEntry]);

    return (
        <div ref={containerRef} className="relative w-full h-full bg-gray-50 overflow-hidden">
            <StaticCanvas width={dims.width} height={dims.height} />
            <DynamicOverlay
                width={dims.width}
                height={dims.height}
                onTextEntryStart={handleTextEntryStart}
                isTextEditing={!!textEntry}
            />

            {textEntry && (
                <textarea
                    ref={textAreaRef}
                    className="absolute z-[60]"
                    style={getTextAreaStyle()}
                    value={textAreaValue}
                    onChange={(e) => setTextAreaValue(e.target.value)}
                    onBlur={commitTextEntry}
                    onKeyDown={(e) => {
                        if(e.key === 'Escape') { 
                            commitTextEntry();
                        }
                        e.stopPropagation(); // Prevent hotkeys
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                />
            )}

            <UserHint visible={!!hintMessage && !hintDismissed} message={hintMessage} onClose={() => setHintDismissed(true)} />
        </div>
    );
}

export default CanvasManager;
