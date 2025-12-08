import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUIStore } from '../../../../stores/useUIStore';
import { useDataStore } from '../../../../stores/useDataStore';
import { worldToScreen, getWrappedLines } from '../../../../utils/geometry';
import StaticCanvas from './StaticCanvas';
import DynamicOverlay from './DynamicOverlay';
import UserHint from '../UserHint';

const CanvasManager: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textInputRef = useRef<HTMLTextAreaElement>(null);
    const uiStore = useUIStore();
    const dataStore = useDataStore();

    const [dims, setDims] = useState({ width: 800, height: 600 });

    // Text Entry State (Local)
    const [textEntry, setTextEntry] = useState<{ id?: string; x: number; y: number; rotation: number; boxWidth?: number; } | null>(null);
    const [textInputValue, setTextInputValue] = useState("");
    const [textAreaSize, setTextAreaSize] = useState({ width: 50, height: 24 });
    const [hintDismissed, setHintDismissed] = useState(false);

    // Resize Observer
    useEffect(() => {
        const handleResize = () => {
          if (containerRef.current) {
              const width = containerRef.current.clientWidth; const height = containerRef.current.clientHeight;
              // Prevent unnecessary state updates if dimensions match
              if (width !== dims.width || height !== dims.height) {
                  setDims({ width, height });
                  uiStore.setCanvasSize({ width, height });
              }
          }
        };
        // Initial measurement
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [uiStore, dims.width, dims.height]);

    // Text Entry logic
    const handleTextEntryStart = useCallback((data: { id?: string, x: number, y: number, rotation: number, boxWidth?: number, initialText?: string }) => {
        setTextEntry(data);
        setTextInputValue(data.initialText || "");
    }, []);

    const commitTextEntry = useCallback(() => {
        if (textEntry) {
            if (textInputValue.trim()) {
                const text = textInputValue;
                if (textEntry.id) {
                    dataStore.updateShape(textEntry.id, { text, width: textEntry.boxWidth });
                } else {
                    dataStore.addShape({
                       id: Date.now().toString(), layerId: dataStore.activeLayerId, type: 'text', x: textEntry.x, y: textEntry.y, text: text,
                       width: textEntry.boxWidth, fontSize: uiStore.textSize, fontFamily: uiStore.fontFamily, fontBold: uiStore.fontBold, fontItalic: uiStore.fontItalic,
                       fontUnderline: uiStore.fontUnderline, fontStrike: uiStore.fontStrike, strokeColor: uiStore.strokeColor, strokeEnabled: uiStore.strokeEnabled, fillColor: 'transparent', points: [], rotation: textEntry.rotation
                    });
                    uiStore.setSidebarTab('desenho');
                }
            }
        }
        setTextEntry(null); setTextInputValue("");
     }, [textEntry, textInputValue, uiStore, dataStore]);

    // Hint Logic
    useEffect(() => { setHintDismissed(false); }, [uiStore.activeTool]);

    let hintMessage = "";
    if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size > 0) hintMessage = "Arraste para mover/rotacionar";
    else if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size === 0) hintMessage = "Selecione objetos primeiro";
    else if (uiStore.activeTool === 'text' && !textEntry) hintMessage = "Clique para digitar ou arraste para criar área";
    else if (uiStore.activeTool === 'text' && textEntry) hintMessage = "Digite o texto. Clique fora para finalizar.";


    // Text Area Sizing Effect
    useEffect(() => {
        if (textEntry && containerRef.current) {
            // Need a temp context to measure text
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
               let fontSize = uiStore.textSize; let fontFamily = uiStore.fontFamily; let fontBold = uiStore.fontBold; let fontItalic = uiStore.fontItalic;
               if (textEntry.id) {
                   const s = dataStore.shapes[textEntry.id];
                   if (s && s.type === 'text') { fontSize = s.fontSize || fontSize; fontFamily = s.fontFamily || fontFamily; fontBold = s.fontBold || fontBold; fontItalic = s.fontItalic || fontItalic; }
               }
               const style = fontItalic ? 'italic' : 'normal'; const weight = fontBold ? 'bold' : 'normal'; const family = fontFamily ? `"${fontFamily}"` : 'sans-serif';
               ctx.font = `${style} ${weight} ${fontSize * uiStore.viewTransform.scale}px ${family}`;
               let w = 0; let h = 0; const lineHeight = fontSize * uiStore.viewTransform.scale * 1.2;
               if (textEntry.boxWidth) {
                   w = textEntry.boxWidth * uiStore.viewTransform.scale; const wrappedLines = getWrappedLines(ctx, textInputValue || " ", w); h = Math.max(lineHeight, wrappedLines.length * lineHeight + 10);
               } else {
                   const lines = (textInputValue || " ").split('\n'); let maxLineW = 0;
                   lines.forEach(line => { const mw = ctx.measureText(line).width; if(mw > maxLineW) maxLineW = mw; });
                   w = Math.max(50, maxLineW + 20); h = Math.max(lineHeight, lines.length * lineHeight + 10);
               }
               setTextAreaSize({ width: w, height: h });
            }
        }
    }, [textInputValue, textEntry, uiStore.textSize, uiStore.fontFamily, uiStore.fontBold, uiStore.fontItalic, uiStore.viewTransform.scale, dataStore.shapes]);

    const textAreaStyle: React.CSSProperties = textEntry ? {
        left: worldToScreen({x: textEntry.x, y: textEntry.y}, uiStore.viewTransform).x,
        top: worldToScreen({x: textEntry.x, y: textEntry.y}, uiStore.viewTransform).y,
        transform: `rotate(${textEntry.rotation}rad)`, transformOrigin: 'top left',
        font: `${uiStore.fontItalic ? 'italic' : 'normal'} ${uiStore.fontBold ? 'bold' : 'normal'} ${uiStore.textSize * uiStore.viewTransform.scale}px "${uiStore.fontFamily}"`,
        color: uiStore.strokeColor, minWidth: '50px', width: textAreaSize.width, height: textAreaSize.height,
        whiteSpace: textEntry.boxWidth ? 'pre-wrap' : 'pre'
    } : {};

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
                    ref={textInputRef} autoFocus placeholder="Digite..." value={textInputValue} onChange={(e) => setTextInputValue(e.target.value)}
                    className="absolute z-[60] bg-transparent border border-blue-500 outline-none resize-none overflow-hidden p-0 m-0 leading-snug cursor-text"
                    style={textAreaStyle} onBlur={commitTextEntry}
                    onKeyDown={(e) => { if(e.key === 'Escape') { setTextEntry(null); setTextInputValue(""); } }}
                />
            )}

            <UserHint visible={!!hintMessage && !hintDismissed} message={hintMessage} onClose={() => setHintDismissed(true)} />
        </div>
    );
}

export default CanvasManager;
