import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useUIStore } from '../../../../stores/useUIStore';
import { useDataStore } from '../../../../stores/useDataStore';
import { worldToScreen, getWrappedLines } from '../../../../utils/geometry';
import StaticCanvas from './StaticCanvas';
import DynamicOverlay from './DynamicOverlay';
import UserHint from '../UserHint';
import { TextSpan } from '../../../../types';

const CanvasManager: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textInputRef = useRef<HTMLDivElement>(null);
    const uiStore = useUIStore();
    const dataStore = useDataStore();

    const [dims, setDims] = useState({ width: 800, height: 600 });

    // Text Entry State (Local)
    const [textEntry, setTextEntry] = useState<{ id?: string; x: number; y: number; rotation: number; boxWidth?: number; segments?: TextSpan[] } | null>(null);
    const [hintDismissed, setHintDismissed] = useState(false);

    // Resize Observer
    useEffect(() => {
        const handleResize = () => {
          if (containerRef.current) {
              const width = containerRef.current.clientWidth; const height = containerRef.current.clientHeight;
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

    // Apply Style to Selection
    // This effect listens to UI Store changes (Bold, Italic, Color) and applies them to the current selection in the ContentEditable
    // if we are in text editing mode.
    useEffect(() => {
        if (!textEntry || !textInputRef.current) return;

        // This is a simplified "Rich Text" applicator.
        // Real implementations use document.execCommand (deprecated) or complex Range manipulation.
        // Since we are simulating a "Figma" like experience, we might want to capture the selection
        // and when the user clicks "Bold" in the ribbon, we apply it.
        // However, the Ribbon buttons toggle the global UI Store state.
        // We should watch that state and apply to current selection?
        // Or should the Ribbon buttons call a method here?
        // The Ribbon updates `uiStore`. We can listen to `uiStore.fontBold` etc changes?
        // But `uiStore` holds the "current tool default".
        // It's tricky to sync "Ribbon Toggle" with "Text Selection Style".
        // For this MVP, we will rely on the user selecting text in the contenteditable,
        // and if they press Ctrl+B or use a toolbar that we might hook up later.
        // BUT the requirements say: "WYSIWYG: Application of styles (bold...) must be visualized in real time."
        // And "User must be able to select fragment and apply distinct styles".

        // We need a way to intercept the Ribbon actions if text is editing.
        // Actually, `document.execCommand` works on contenteditable naturally for basic things!
        // Let's try to map our custom UI state to execCommand?
        // Or just let the user use browser shortcuts (Ctrl+B) and maybe we can trigger execCommand programmatically?

    }, [textEntry, uiStore.fontBold, uiStore.fontItalic, uiStore.fontUnderline, uiStore.strokeColor]);

    // We need to parse the ContentEditable back to `segments` on commit.
    // Helper to parse HTML to Segments
    const parseContentEditable = (el: HTMLElement): TextSpan[] => {
        const segments: TextSpan[] = [];

        const traverse = (node: Node, currentStyle: Partial<TextSpan>) => {
            if (node.nodeType === Node.TEXT_NODE) {
                if (node.textContent && node.textContent.length > 0) {
                    segments.push({
                        text: node.textContent,
                        ...currentStyle
                    });
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                const newStyle = { ...currentStyle };

                if (element.tagName === 'B' || element.tagName === 'STRONG' || element.style.fontWeight === 'bold') newStyle.fontBold = true;
                if (element.tagName === 'I' || element.tagName === 'EM' || element.style.fontStyle === 'italic') newStyle.fontItalic = true;
                if (element.tagName === 'U' || element.style.textDecoration.includes('underline')) newStyle.fontUnderline = true;
                if (element.tagName === 'S' || element.tagName === 'STRIKE' || element.style.textDecoration.includes('line-through')) newStyle.fontStrike = true;
                if (element.style.color) newStyle.fillColor = element.style.color; // Conversion needed if rgb()?
                if (element.style.fontFamily) newStyle.fontFamily = element.style.fontFamily.replace(/"/g, '');
                if (element.style.fontSize) newStyle.fontSize = parseInt(element.style.fontSize);

                element.childNodes.forEach(child => traverse(child, newStyle));

                // Handle block elements (div, p) adding newlines if needed?
                // For now, assume linear or <br>
                if (element.tagName === 'BR') segments.push({ text: '\n', ...currentStyle });
                if (element.tagName === 'DIV' || element.tagName === 'P') {
                     // Block breaks might need handling, usually simple rich text uses <div> for lines.
                     // We might just treat them as newlines between traversals?
                }
            }
        };

        traverse(el, {
            fontSize: uiStore.textSize,
            fontFamily: uiStore.fontFamily,
            fillColor: uiStore.strokeColor,
            fontBold: uiStore.fontBold,
            fontItalic: uiStore.fontItalic,
            fontUnderline: uiStore.fontUnderline
        });

        return segments;
    };

    // Helper to render Segments to HTML for initialization
    const renderSegmentsToHtml = (segments: TextSpan[]): string => {
        return segments.map(s => {
            let style = `color:${s.fillColor || uiStore.strokeColor}; font-size:${s.fontSize || uiStore.textSize}px; font-family:${s.fontFamily || uiStore.fontFamily};`;
            if (s.fontBold) style += 'font-weight:bold;';
            if (s.fontItalic) style += 'font-style:italic;';
            let deco = '';
            if (s.fontUnderline) deco += 'underline ';
            if (s.fontStrike) deco += 'line-through ';
            if (deco) style += `text-decoration:${deco};`;

            // Replace newlines with <br> for HTML display
            const txt = s.text.replace(/\n/g, '<br>');
            return `<span style="${style}">${txt}</span>`;
        }).join('');
    };

    const handleTextEntryStart = useCallback((data: { id?: string, x: number, y: number, rotation: number, boxWidth?: number, initialText?: string, segments?: TextSpan[] }) => {
        setTextEntry(data);
        // Wait for render then set content
        setTimeout(() => {
            if (textInputRef.current) {
                if (data.segments) {
                    textInputRef.current.innerHTML = renderSegmentsToHtml(data.segments);
                } else {
                    textInputRef.current.innerText = data.initialText || "";
                }

                // Focus and move cursor to end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(textInputRef.current);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
                textInputRef.current.focus();
            }
        }, 0);
    }, []);

    const commitTextEntry = useCallback(() => {
        if (textEntry && textInputRef.current) {
            const rawText = textInputRef.current.innerText; // Fallback or searchable text
            const htmlContent = textInputRef.current.innerHTML;

            // Parse HTML to Spans
            const segments = parseContentEditable(textInputRef.current);

            if (segments.length > 0) {
                if (textEntry.id) {
                    dataStore.updateShape(textEntry.id, { text: rawText, segments, width: textEntry.boxWidth });
                } else {
                    dataStore.addShape({
                       id: Date.now().toString(),
                       layerId: dataStore.activeLayerId,
                       type: 'text',
                       x: textEntry.x,
                       y: textEntry.y,
                       text: rawText,
                       segments: segments,
                       width: textEntry.boxWidth,
                       fontSize: uiStore.textSize, // Base Default
                       fontFamily: uiStore.fontFamily,
                       strokeColor: uiStore.strokeColor,
                       fillColor: uiStore.fillColor, // Background color from appearance section
                       fontBold: uiStore.fontBold,
                       fontItalic: uiStore.fontItalic,
                       fontUnderline: uiStore.fontUnderline,
                       fontStrike: uiStore.fontStrike,
                       points: [],
                       rotation: textEntry.rotation
                    });
                    uiStore.setSidebarTab('desenho');
                }
            }
        }
        setTextEntry(null);
     }, [textEntry, uiStore, dataStore]);

    // Hint Logic
    useEffect(() => { setHintDismissed(false); }, [uiStore.activeTool]);

    let hintMessage = "";
    if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size > 0) hintMessage = "Arraste para mover/rotacionar";
    else if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && uiStore.selectedShapeIds.size === 0) hintMessage = "Selecione objetos primeiro";
    else if (uiStore.activeTool === 'text' && !textEntry) hintMessage = "Clique para digitar ou arraste para criar área";
    else if (uiStore.activeTool === 'text' && textEntry) hintMessage = "Digite o texto. Clique fora para finalizar.";

    const textAreaStyle: React.CSSProperties = textEntry ? {
        left: worldToScreen({x: textEntry.x, y: textEntry.y}, uiStore.viewTransform).x,
        top: worldToScreen({x: textEntry.x, y: textEntry.y}, uiStore.viewTransform).y,
        transform: `rotate(${textEntry.rotation}rad)`, transformOrigin: 'top left',
        minWidth: '50px',
        width: textEntry.boxWidth ? textEntry.boxWidth * uiStore.viewTransform.scale : 'auto',
        outline: 'none',
        border: '1px dashed #3b82f6',
        padding: '2px 4px',
        margin: '0',
        lineHeight: '1.2',
        whiteSpace: textEntry.boxWidth ? 'pre-wrap' : 'pre',
        overflow: 'hidden', // Hide scrollbars
        color: uiStore.strokeColor,
        backgroundColor: uiStore.fillColor === 'transparent' ? 'transparent' : uiStore.fillColor,
        fontSize: `${uiStore.textSize * uiStore.viewTransform.scale}px`,
        fontFamily: uiStore.fontFamily,
        fontWeight: uiStore.fontBold ? 'bold' : 'normal',
        fontStyle: uiStore.fontItalic ? 'italic' : 'normal',
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
                <div
                    ref={textInputRef}
                    contentEditable
                    className="absolute z-[60] cursor-text"
                    style={textAreaStyle}
                    onBlur={commitTextEntry}
                    onKeyDown={(e) => {
                        if(e.key === 'Escape') { 
                            commitTextEntry(); // Save text on ESC instead of discarding
                        }
                        // Stop propagation of delete so we don't delete shape
                        e.stopPropagation();
                    }}
                    onMouseDown={(e) => e.stopPropagation()} // Allow selecting text inside
                />
            )}

            <UserHint visible={!!hintMessage && !hintDismissed} message={hintMessage} onClose={() => setHintDismissed(true)} />
        </div>
    );
}

export default CanvasManager;
