import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { Shape, Point, Rect } from '../../../types';
import { screenToWorld, worldToScreen, getDistance, isPointInShape, getSnapPoint, getSelectionRect, isShapeInSelection, rotatePoint, getShapeHandles, Handle } from '../../../utils/geometry';
import UserHint from './UserHint';
import { CURSOR_SVG } from './assets/cursors';

const getWrappedLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
    const paragraphs = text.split('\n');
    const lines: string[] = [];
    paragraphs.forEach(para => {
        if (!para) { lines.push(''); return; }
        const words = para.split(' ');
        let currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) currentLine += " " + word;
            else { lines.push(currentLine); currentLine = word; }
        }
        lines.push(currentLine);
    });
    return lines;
};

const DEFAULT_CURSOR = `url('data:image/svg+xml;base64,${btoa(CURSOR_SVG)}') 6 4, default`;
const GRAB_CURSOR = 'grab';
const GRABBING_CURSOR = 'grabbing';

const EditorCanvas: React.FC = () => {


  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const store = useAppStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [isSelectionBox, setIsSelectionBox] = useState(false);
  const [snapMarker, setSnapMarker] = useState<Point | null>(null);
  const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [lineStart, setLineStart] = useState<Point | null>(null);
  const [isMouseOver, setIsMouseOver] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [activeHandle, setActiveHandle] = useState<{ shapeId: string, handle: Handle } | null>(null);
  const [textEntry, setTextEntry] = useState<{ id?: string; x: number; y: number; rotation: number; boxWidth?: number; } | null>(null);
  const [textInputValue, setTextInputValue] = useState("");
  const [textAreaSize, setTextAreaSize] = useState({ width: 50, height: 24 });
  const [transformationBase, setTransformationBase] = useState<Point | null>(null);
  const hasSavedHistoryRef = useRef(false);

  const getMousePos = (e: React.MouseEvent): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    setLineStart(null); setMeasureStart(null); setPolylinePoints([]); setStartPoint(null);
    setIsDragging(false); setIsSelectionBox(false); setSnapMarker(null); setTransformationBase(null);
    setTextEntry(null); setTextInputValue(""); setActiveHandle(null); setHintDismissed(false); 
  }, [store.activeTool]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); setIsDragging(false); }
      if (isDragging && store.activeTool === 'pan') { setIsDragging(false); setStartPoint(null); }
      if (activeHandle) { setActiveHandle(null); setIsDragging(false); }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isMiddlePanning, isDragging, store.activeTool, activeHandle]);


  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape, isSelected: boolean, isGhost: boolean = false) => {
    if (textEntry?.id === shape.id) return;
    const layer = store.layers.find(l => l.id === shape.layerId);
    if (layer && !layer.visible) return;

    ctx.save();
    if (shape.rotation && shape.x !== undefined && shape.y !== undefined) {
        let pivotX = shape.x; let pivotY = shape.y;
        ctx.translate(pivotX, pivotY); ctx.rotate(shape.rotation); ctx.translate(-pivotX, -pivotY);
    }

    if (isGhost) { ctx.strokeStyle = '#9ca3af'; ctx.setLineDash([5, 5]); ctx.fillStyle = 'transparent'; } 
    else { 
      const effectiveStroke = (shape.strokeEnabled === false) ? 'transparent' : shape.strokeColor;
      ctx.strokeStyle = isSelected ? '#3b82f6' : effectiveStroke; 
      ctx.fillStyle = (shape.fillColor && shape.fillColor !== 'transparent') ? shape.fillColor : 'transparent'; 
      ctx.setLineDash([]); 
    }

    const baseWidth = shape.strokeWidth || 2;
    ctx.lineWidth = isSelected ? (baseWidth + 2) / store.viewTransform.scale : baseWidth / store.viewTransform.scale;
    ctx.beginPath();
    
    if (shape.type === 'line' || shape.type === 'measure') {
      if (shape.points.length >= 2) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y); ctx.lineTo(shape.points[1].x, shape.points[1].y); ctx.stroke();
        if (shape.type === 'measure' && shape.label && !isGhost) {
          const midX = (shape.points[0].x + shape.points[1].x) / 2;
          const midY = (shape.points[0].y + shape.points[1].y) / 2;
          ctx.save();
          ctx.font = `bold ${14 / store.viewTransform.scale}px sans-serif`;
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.translate(midX, midY);
          const tm = ctx.measureText(shape.label);
          ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(-tm.width/2 - 4, -18 / store.viewTransform.scale, tm.width + 8, 20 / store.viewTransform.scale);
          ctx.fillStyle = '#fff'; ctx.fillText(shape.label, 0, -2 / store.viewTransform.scale);
          ctx.restore();
        }
      }
    } else if (shape.type === 'arrow') {
      if (shape.points.length >= 2) {
        const p1 = shape.points[0]; const p2 = shape.points[1];
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        // Draw arrowhead
        const headSize = shape.arrowHeadSize || 15;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headSize * Math.cos(angle - Math.PI / 6), p2.y - headSize * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headSize * Math.cos(angle + Math.PI / 6), p2.y - headSize * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    } else if (shape.type === 'circle') {
       ctx.arc(shape.x!, shape.y!, shape.radius!, 0, Math.PI * 2); if (!isGhost && shape.fillColor !== 'transparent') ctx.fill(); ctx.stroke();
    } else if (shape.type === 'rect') {
       ctx.rect(shape.x!, shape.y!, shape.width!, shape.height!); if (!isGhost && shape.fillColor !== 'transparent') ctx.fill(); ctx.stroke();
    } else if (shape.type === 'polyline') {
       if (shape.points.length > 0) {
         ctx.moveTo(shape.points[0].x, shape.points[0].y); for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y); ctx.stroke();
       }
    } else if (shape.type === 'polygon') {
        const angleStep = (Math.PI * 2) / shape.sides!; const startAngle = -Math.PI / 2; 
        ctx.moveTo(shape.x! + shape.radius! * Math.cos(startAngle), shape.y! + shape.radius! * Math.sin(startAngle));
        for (let i = 1; i <= shape.sides!; i++) ctx.lineTo(shape.x! + shape.radius! * Math.cos(startAngle + i * angleStep), shape.y! + shape.radius! * Math.sin(startAngle + i * angleStep));
        ctx.closePath(); if (!isGhost && shape.fillColor !== 'transparent') ctx.fill(); ctx.stroke();
    } else if (shape.type === 'arc') {
        if (shape.points.length >= 2) {
          const p1 = shape.points[0]; const p2 = shape.points[1]; const d = getDistance(p1, p2);
          let r = shape.radius || d; if (r < d / 2) r = d / 2;
          const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
          const dx = p2.x - p1.x; const dy = p2.y - p1.y; const midX = (p1.x + p2.x) / 2; const midY = (p1.y + p2.y) / 2;
          const dist = Math.sqrt(dx*dx + dy*dy); const udx = -dy / dist; const udy = dx / dist;
          const cx = midX + udx * h; const cy = midY + udy * h;
          const startAngle = Math.atan2(p1.y - cy, p1.x - cx); const endAngle = Math.atan2(p2.y - cy, p2.x - cx);
          ctx.beginPath(); ctx.arc(cx, cy, r, startAngle, endAngle, false); ctx.stroke();
       }
    } else if (shape.type === 'text') {
        if (shape.text && shape.fontSize && shape.x !== undefined && shape.y !== undefined) {
            ctx.fillStyle = isGhost ? '#9ca3af' : shape.strokeColor; 
            const style = shape.fontItalic ? 'italic' : 'normal'; const weight = shape.fontBold ? 'bold' : 'normal';
            const family = shape.fontFamily ? `"${shape.fontFamily}"` : 'sans-serif';
            ctx.font = `${style} ${weight} ${shape.fontSize}px ${family}`; ctx.textBaseline = 'top'; 
            let lines: string[] = [];
            const hasFixedWidth = shape.width && shape.width > 0;
            if (hasFixedWidth) lines = getWrappedLines(ctx, shape.text, shape.width!); else lines = shape.text.split('\n');
            const lineHeight = shape.fontSize * 1.2;
            lines.forEach((line, index) => ctx.fillText(line, shape.x!, shape.y! + (index * lineHeight)));
            let maxWidth = 0;
            if (hasFixedWidth) maxWidth = shape.width!; else lines.forEach(line => { const w = ctx.measureText(line).width; if (w > maxWidth) maxWidth = w; });
            const totalHeight = lines.length * lineHeight;
            if (shape.fontUnderline) {
                 lines.forEach((line, index) => {
                    const w = ctx.measureText(line).width; const ly = shape.y! + (index * lineHeight) + shape.fontSize! + 2;
                    ctx.beginPath(); ctx.lineWidth = Math.max(1, shape.fontSize! / 15); ctx.moveTo(shape.x!, ly); ctx.lineTo(shape.x! + w, ly); ctx.stroke();
                 });
            }
            if (shape.fontStrike) {
                 lines.forEach((line, index) => {
                    const w = ctx.measureText(line).width; const ly = shape.y! + (index * lineHeight) + (shape.fontSize! / 2);
                    ctx.beginPath(); ctx.lineWidth = Math.max(1, shape.fontSize! / 15); ctx.moveTo(shape.x!, ly); ctx.lineTo(shape.x! + w, ly); ctx.stroke();
                 });
            }
            if (isSelected && !isGhost) {
                ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1 / store.viewTransform.scale;
                ctx.strokeRect(shape.x! - 4, shape.y! - 4, maxWidth + 8, totalHeight + 4);
            }
        }
    }
    ctx.restore();
  };

  const drawHandles = (ctx: CanvasRenderingContext2D, shape: Shape) => {
      if (textEntry?.id === shape.id) return;
      const handles = getShapeHandles(shape);
      const handleSize = 6 / store.viewTransform.scale;
      ctx.save(); ctx.lineWidth = 1 / store.viewTransform.scale;
      if (shape.rotation && shape.x !== undefined && shape.y !== undefined) {
          ctx.translate(shape.x, shape.y); ctx.rotate(shape.rotation); ctx.translate(-shape.x, -shape.y);
      }
      handles.forEach(h => {
          ctx.beginPath(); ctx.rect(h.x - handleSize/2, h.y - handleSize/2, handleSize, handleSize);
          ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#2563eb'; ctx.stroke();
      });
      ctx.restore();
  }

  const finishPolyline = useCallback(() => {
    if (polylinePoints.length > 1) {
      store.addShape({
        id: Date.now().toString(), layerId: store.activeLayerId, type: 'polyline',
        strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, strokeEnabled: store.strokeEnabled, fillColor: 'transparent', points: [...polylinePoints]
      });
      store.setSidebarTab('desenho'); setPolylinePoints([]);
    }
  }, [polylinePoints, store]);

  const commitTextEntry = useCallback(() => {
     if (textEntry) {
         if (textInputValue.trim()) {
             const text = textInputValue; 
             if (textEntry.id) {
                 store.updateShape(textEntry.id, { text, width: textEntry.boxWidth });
             } else {
                 store.addShape({
                    id: Date.now().toString(), layerId: store.activeLayerId, type: 'text', x: textEntry.x, y: textEntry.y, text: text,
                    width: textEntry.boxWidth, fontSize: store.textSize, fontFamily: store.fontFamily, fontBold: store.fontBold, fontItalic: store.fontItalic,
                    fontUnderline: store.fontUnderline, fontStrike: store.fontStrike, strokeColor: store.strokeColor, strokeEnabled: store.strokeEnabled, fillColor: 'transparent', points: [], rotation: textEntry.rotation
                 });
                 store.setSidebarTab('desenho');
             }
         }
     }
     setTextEntry(null); setTextInputValue("");
  }, [textEntry, textInputValue, store]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (textEntry) { e.stopPropagation(); return; }
      if (e.key === 'Enter') { if (store.activeTool === 'polyline') finishPolyline(); }
      if (e.key === 'Escape') {
        setLineStart(null); setMeasureStart(null); setPolylinePoints([]); 
        setIsDragging(false); setIsSelectionBox(false); setStartPoint(null); setTransformationBase(null); setActiveHandle(null);
        if (store.activeTool === 'move' || store.activeTool === 'rotate') store.setTool('select');
        // Deselect all when in select mode
        if (store.activeTool === 'select' && store.selectedShapeIds.size > 0) {
          store.setSelectedShapeIds(new Set());
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [store.activeTool, finishPolyline, store, textEntry]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(store.viewTransform.x, store.viewTransform.y);
    ctx.scale(store.viewTransform.scale, store.viewTransform.scale);

    const gridSize = store.gridSize;
    const startX = Math.floor(-store.viewTransform.x / store.viewTransform.scale / gridSize) * gridSize;
    const startY = Math.floor(-store.viewTransform.y / store.viewTransform.scale / gridSize) * gridSize;
    const endX = startX + (canvas.width / store.viewTransform.scale) + gridSize;
    const endY = startY + (canvas.height / store.viewTransform.scale) + gridSize;
    
    ctx.fillStyle = store.gridColor;
    for(let x = startX; x < endX; x += gridSize) { for(let y = startY; y < endY; y += gridSize) ctx.fillRect(x, y, 2 / store.viewTransform.scale, 2 / store.viewTransform.scale); }

    // Optimization: Use Spatial Index to query visible shapes candidates
    const viewRect: Rect = {
        x: -store.viewTransform.x / store.viewTransform.scale,
        y: -store.viewTransform.y / store.viewTransform.scale,
        width: canvas.width / store.viewTransform.scale,
        height: canvas.height / store.viewTransform.scale
    };
    
    // CRITICAL FIX: The QuadTree might hold stale shape references. 
    // We must use the IDs from the QuadTree to fetch the *latest* shape state from the store.shapes map.
    const visibleCandidates = store.spatialIndex.query(viewRect);
    
    const visibleShapes = visibleCandidates
        .map(candidate => store.shapes[candidate.id])
        .filter(s => !!s); // Filter out any that might have been deleted

    visibleShapes.forEach(shape => {
        const isSelected = store.selectedShapeIds.has(shape.id);
        drawShape(ctx, shape, isSelected);
        if (isSelected && store.activeTool === 'select') drawHandles(ctx, shape);
    });

    if ((store.activeTool === 'move' || store.activeTool === 'rotate') && transformationBase && currentPoint && store.selectedShapeIds.size > 0) {
        const wm = screenToWorld(currentPoint, store.viewTransform);
        store.selectedShapeIds.forEach(id => {
            const shape = store.shapes[id];
            if(!shape) return;
            const ghost = { ...shape, id: 'ghost-' + shape.id };
            if (store.activeTool === 'move') {
                const dx = wm.x - transformationBase.x; const dy = wm.y - transformationBase.y;
                if (ghost.x !== undefined) ghost.x += dx; if (ghost.y !== undefined) ghost.y += dy;
                if (ghost.points) ghost.points = ghost.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            } else if (store.activeTool === 'rotate') {
                const dx = wm.x - transformationBase.x; const dy = wm.y - transformationBase.y;
                const angle = Math.atan2(dy, dx);
                ctx.beginPath(); ctx.moveTo(transformationBase.x, transformationBase.y); ctx.lineTo(wm.x, wm.y); ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([2, 2]); ctx.stroke();
                if (ghost.points) ghost.points = ghost.points.map(p => rotatePoint(p, transformationBase, angle));
                if (ghost.x !== undefined && ghost.y !== undefined) { const np = rotatePoint({x: ghost.x, y: ghost.y}, transformationBase, angle); ghost.x = np.x; ghost.y = np.y; }
                if (ghost.type === 'rect' || ghost.type === 'text') ghost.rotation = (ghost.rotation || 0) + angle;
            }
            drawShape(ctx, ghost, false, true);
        });
    }

    if (store.activeTool === 'polyline' && polylinePoints.length > 0) {
      ctx.beginPath(); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = (store.strokeWidth || 2) / store.viewTransform.scale;
      ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y); for(let p of polylinePoints) ctx.lineTo(p.x, p.y);
      if (currentPoint) { const wm = screenToWorld(currentPoint, store.viewTransform); ctx.lineTo(wm.x, wm.y); } ctx.stroke();
    }

    if ((store.activeTool === 'line' && lineStart) || (store.activeTool === 'measure' && measureStart)) {
        const start = store.activeTool === 'line' ? lineStart : measureStart;
        if (start && currentPoint) {
            const wm = screenToWorld(currentPoint, store.viewTransform);
            ctx.beginPath(); ctx.strokeStyle = store.activeTool === 'measure' ? '#ef4444' : store.strokeColor;
            ctx.lineWidth = (store.strokeWidth || 2) / store.viewTransform.scale;
            ctx.moveTo(start.x, start.y); ctx.lineTo(wm.x, wm.y); ctx.stroke();
        }
    }

    if (isDragging && startPoint && currentPoint && !activeHandle && !isMiddlePanning && !isSelectionBox && !['select','pan','polyline','line','measure','text', 'move', 'rotate'].includes(store.activeTool)) {
      const ws = screenToWorld(startPoint, store.viewTransform); const wc = screenToWorld(currentPoint, store.viewTransform);
      const temp: Shape = { id: 'temp', layerId: store.activeLayerId, type: store.activeTool, strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, strokeEnabled: store.strokeEnabled, fillColor: store.fillColor, points: [] };
      if (store.activeTool === 'arc') { temp.points = [ws, wc]; temp.radius = getDistance(ws, wc); }
      else if (store.activeTool === 'circle') { temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); }
      else if (store.activeTool === 'rect') { temp.x = Math.min(ws.x, wc.x); temp.y = Math.min(ws.y, wc.y); temp.width = Math.abs(wc.x - ws.x); temp.height = Math.abs(wc.y - ws.y); }
      else if (store.activeTool === 'polygon') { temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); temp.sides = store.polygonSides; }
      else if (store.activeTool === 'arrow') { temp.points = [ws, wc]; temp.arrowHeadSize = 15; }
      drawShape(ctx, temp, false);
    }
    
    if (isDragging && store.activeTool === 'text' && startPoint && currentPoint) {
        const w = currentPoint.x - startPoint.x; const h = currentPoint.y - startPoint.y;
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1 / store.viewTransform.scale; ctx.setLineDash([4, 2]);
        const ws = screenToWorld(startPoint, store.viewTransform); ctx.strokeRect(ws.x, ws.y, w / store.viewTransform.scale, h / store.viewTransform.scale); ctx.setLineDash([]);
    }

    if (snapMarker) {
        const ws = screenToWorld(snapMarker, store.viewTransform);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 / store.viewTransform.scale; ctx.beginPath();
        const s = 6 / store.viewTransform.scale;
        ctx.moveTo(ws.x - s, ws.y - s); ctx.lineTo(ws.x + s, ws.y + s); ctx.moveTo(ws.x + s, ws.y - s); ctx.lineTo(ws.x - s, ws.y + s);
        ctx.rect(ws.x - s, ws.y - s, s * 2, s * 2); ctx.stroke();
    }

    ctx.restore();

    if (isSelectionBox && startPoint && currentPoint) {
        const w = currentPoint.x - startPoint.x; const h = currentPoint.y - startPoint.y;
        ctx.save(); ctx.beginPath(); ctx.rect(startPoint.x, startPoint.y, w, h);
        if (w < 0) { ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'; ctx.strokeStyle = 'rgba(34, 197, 94, 1)'; ctx.setLineDash([5, 5]); } 
        else { ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; ctx.strokeStyle = 'rgba(59, 130, 246, 1)'; ctx.setLineDash([]); }
        ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); ctx.restore();
    }

  }, [store, polylinePoints, isDragging, isMiddlePanning, isSelectionBox, startPoint, currentPoint, snapMarker, lineStart, measureStart, isMouseOver, transformationBase, activeHandle, textEntry]);

  useEffect(() => { 
      const handleResize = () => { 
        if (containerRef.current && canvasRef.current) { 
            const width = containerRef.current.clientWidth; const height = containerRef.current.clientHeight; 
            canvasRef.current.width = width; canvasRef.current.height = height; store.setCanvasSize({ width, height });
        } 
      };
      window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize);
  }, []); 

  useEffect(() => {
      if (textEntry && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
             let fontSize = store.textSize; let fontFamily = store.fontFamily; let fontBold = store.fontBold; let fontItalic = store.fontItalic;
             if (textEntry.id) {
                 const s = store.shapes[textEntry.id];
                 if (s && s.type === 'text') { fontSize = s.fontSize || fontSize; fontFamily = s.fontFamily || fontFamily; fontBold = s.fontBold || fontBold; fontItalic = s.fontItalic || fontItalic; }
             }
             const style = fontItalic ? 'italic' : 'normal'; const weight = fontBold ? 'bold' : 'normal'; const family = fontFamily ? `"${fontFamily}"` : 'sans-serif';
             ctx.font = `${style} ${weight} ${fontSize * store.viewTransform.scale}px ${family}`;
             let w = 0; let h = 0; const lineHeight = fontSize * store.viewTransform.scale * 1.2;
             if (textEntry.boxWidth) {
                 w = textEntry.boxWidth * store.viewTransform.scale; const wrappedLines = getWrappedLines(ctx, textInputValue || " ", w); h = Math.max(lineHeight, wrappedLines.length * lineHeight + 10);
             } else {
                 const lines = (textInputValue || " ").split('\n'); let maxLineW = 0;
                 lines.forEach(line => { const mw = ctx.measureText(line).width; if(mw > maxLineW) maxLineW = mw; });
                 w = Math.max(50, maxLineW + 20); h = Math.max(lineHeight, lines.length * lineHeight + 10);
             }
             setTextAreaSize({ width: w, height: h });
          }
      }
  }, [textInputValue, textEntry, store.textSize, store.fontFamily, store.fontBold, store.fontItalic, store.viewTransform.scale, store.shapes]);

  useEffect(() => { render(); }, [render]);

  const handleDoubleClick = (e: React.MouseEvent) => {
      if (store.activeTool !== 'select') { finishPolyline(); return; }
      const raw = getMousePos(e); const wr = screenToWorld(raw, store.viewTransform);
      
      const queryRect = { x: wr.x - 5, y: wr.y - 5, width: 10, height: 10 };
      const candidates = store.spatialIndex.query(queryRect).map(c => store.shapes[c.id]).filter(s => !!s);
      
      let hitShape: Shape | null = null;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const s = candidates[i];
        const l = store.layers.find(lay => lay.id === s.layerId);
        if (l && (!l.visible || l.locked)) continue; 
        if (isPointInShape(wr, s, store.viewTransform.scale)) { hitShape = s; break; }
      }

      if (hitShape && hitShape.type === 'text' && hitShape.x !== undefined && hitShape.y !== undefined) {
          setTextInputValue(hitShape.text || "");
          setTextEntry({ id: hitShape.id, x: hitShape.x, y: hitShape.y, rotation: hitShape.rotation || 0, boxWidth: hitShape.width });
      }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (textEntry) return;
    const raw = getMousePos(e); let eff = raw; const wr = screenToWorld(raw, store.viewTransform); let snapped: Point | null = null;
    hasSavedHistoryRef.current = false;

    if (store.snapOptions.enabled && !['pan','select','text'].includes(store.activeTool) && !e.ctrlKey) {
       const queryRect = { x: wr.x - 50, y: wr.y - 50, width: 100, height: 100 };
       const visible = store.spatialIndex.query(queryRect)
           .map(s => store.shapes[s.id])
           .filter(s => { const l = store.layers.find(l => l.id === s.layerId); return s && l && l.visible && !l.locked; });
       const snap = getSnapPoint(wr, visible, store.snapOptions, 15 / store.viewTransform.scale);
       if (snap) { snapped = snap; eff = worldToScreen(snap, store.viewTransform); }
    }

    setStartPoint(eff); setCurrentPoint(eff);

    if (e.button === 1 || store.activeTool === 'pan') { if(e.button === 1) e.preventDefault(); setIsMiddlePanning(e.button === 1); setIsDragging(true); return; }

    const wPos = snapped || wr;

    if (store.activeTool === 'text') { setIsDragging(true); return; }

    if (store.activeTool === 'select' && store.selectedShapeIds.size > 0) {
        for (const id of store.selectedShapeIds) {
            const shape = store.shapes[id];
            if (!shape) continue;
            const handles = getShapeHandles(shape); const handleSize = 10 / store.viewTransform.scale; 
            for (const h of handles) {
                if (getDistance(h, wPos) < handleSize) { setActiveHandle({ shapeId: shape.id, handle: h }); setIsDragging(true); return; }
            }
        }
    }

    if (store.activeTool === 'move' || store.activeTool === 'rotate') {
        if (!transformationBase) { setTransformationBase(wPos); } 
        else {
            if (store.activeTool === 'move') {
                const dx = wPos.x - transformationBase.x; const dy = wPos.y - transformationBase.y;
                store.selectedShapeIds.forEach(id => {
                     const s = store.shapes[id];
                     if(s) {
                         const diff: Partial<Shape> = {};
                         if (s.x !== undefined) diff.x = s.x + dx;
                         if (s.y !== undefined) diff.y = s.y + dy;
                         if (s.points) diff.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                         store.updateShape(id, diff, true); // Commit history on click-move
                     }
                });
            } else if (store.activeTool === 'rotate') {
                const dx = wPos.x - transformationBase.x; const dy = wPos.y - transformationBase.y; const angle = Math.atan2(dy, dx);
                store.rotateSelected(transformationBase, angle);
            }
            setTransformationBase(null); store.setTool('select');
        }
        return;
    }

    if (store.activeTool === 'select') {
      const selectWorld = screenToWorld(raw, store.viewTransform);
      const queryRect = { x: selectWorld.x - 5, y: selectWorld.y - 5, width: 10, height: 10 };
      const candidates = store.spatialIndex.query(queryRect).map(c => store.shapes[c.id]).filter(s => !!s);
      let hitShapeId = null;
      for (let i = candidates.length - 1; i >= 0; i--) {
        const s = candidates[i];
        const l = store.layers.find(lay => lay.id === s.layerId);
        if (l && (!l.visible || l.locked)) continue; 
        if (isPointInShape(selectWorld, s, store.viewTransform.scale)) { hitShapeId = s.id; break; }
      }

      if (hitShapeId) {
         if (e.shiftKey) {
             store.setSelectedShapeIds(prev => { const n = new Set(prev); if(n.has(hitShapeId!)) n.delete(hitShapeId!); else n.add(hitShapeId!); return n; });
         } else { if (!store.selectedShapeIds.has(hitShapeId)) store.setSelectedShapeIds(new Set([hitShapeId])); }
         setIsDragging(true); 
      } else { if (!e.shiftKey) store.setSelectedShapeIds(new Set()); setIsSelectionBox(true); }
      return;
    }

    if (store.activeTool === 'polyline') { setPolylinePoints(p => [...p, wPos]); return; }
    if (store.activeTool === 'line') {
      if (!lineStart) setLineStart(wPos);
      else {
        store.addShape({ id: Date.now().toString(), layerId: store.activeLayerId, type: 'line', strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, strokeEnabled: store.strokeEnabled, fillColor: 'transparent', points: [lineStart, wPos] });
        store.setSidebarTab('desenho'); setLineStart(null);
      }
      return;
    }
    if (store.activeTool === 'measure') {
        if (!measureStart) setMeasureStart(wPos);
        else {
             const dist = getDistance(measureStart, wPos).toFixed(2);
             store.addShape({ id: Date.now().toString(), layerId: store.activeLayerId, type: 'measure', strokeColor: '#ef4444', fillColor: 'transparent', points: [measureStart, wPos], label: `${dist}px` });
             setMeasureStart(null);
        }
        return;
    }

    setIsDragging(true);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (textEntry) return;
    if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); return; }

    if (isSelectionBox && startPoint && currentPoint) {
       if (getDistance(startPoint, currentPoint) > 2) {
           const ws = screenToWorld(startPoint, store.viewTransform); const we = screenToWorld(currentPoint, store.viewTransform);
           const { rect, direction } = getSelectionRect(ws, we);
           const mode = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
           const nSel = e.shiftKey ? new Set(store.selectedShapeIds) : new Set<string>();
           
           const candidates = store.spatialIndex.query(rect).map(c => store.shapes[c.id]).filter(s => !!s);
           candidates.forEach(s => {
               const l = store.layers.find(lay => lay.id === s.layerId);
               if (l && (!l.visible || l.locked)) return;
               if (isShapeInSelection(s, rect, mode)) nSel.add(s.id);
           });
           store.setSelectedShapeIds(nSel);
       }
       setIsSelectionBox(false); setStartPoint(null); return;
    }

    if (!startPoint || !currentPoint) { setIsDragging(false); setActiveHandle(null); return; }

    const ws = screenToWorld(startPoint, store.viewTransform); const we = screenToWorld(currentPoint, store.viewTransform);
    const dist = getDistance(startPoint, currentPoint);

    if (store.activeTool === 'text') {
        let boxWidth = undefined; if (dist > 10) boxWidth = Math.abs(we.x - ws.x);
        setTextInputValue(""); setTextEntry({ x: Math.min(ws.x, we.x), y: Math.min(ws.y, we.y), rotation: 0, boxWidth: boxWidth });
        setIsDragging(false); setStartPoint(null); return;
    }

    // End drag - sync QuadTree if needed
    if(isDragging && (store.activeTool === 'select' || activeHandle)) {
        store.syncQuadTree();
    }

    setIsDragging(false); setActiveHandle(null); 

    // Check if this is a shape creation tool that should create default 100x100 on single click
    const shapeCreationTools = ['circle', 'rect', 'polygon', 'arc', 'arrow'];
    const isSingleClick = dist < 5;
    
    if (!['select','pan','polyline','measure','line','text', 'move', 'rotate'].includes(store.activeTool)) {
      const n: Shape = { id: Date.now().toString(), layerId: store.activeLayerId, type: store.activeTool, strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, strokeEnabled: store.strokeEnabled, fillColor: store.fillColor, points: [] };
      
      if (isSingleClick && shapeCreationTools.includes(store.activeTool)) {
        // Single click creates 100x100 default shape
        if (store.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = 50; }
        else if (store.activeTool === 'rect') { n.x = ws.x - 50; n.y = ws.y - 50; n.width = 100; n.height = 100; }
        else if (store.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = 50; n.sides = store.polygonSides; }
        else if (store.activeTool === 'arc') { n.points = [ws, { x: ws.x + 100, y: ws.y }]; n.radius = 100; }
        else if (store.activeTool === 'arrow') { n.points = [ws, { x: ws.x + 100, y: ws.y }]; n.arrowHeadSize = 15; }
      } else {
        // Drag creates custom sized shape
        if (store.activeTool === 'arc') { n.points = [ws, we]; n.radius = getDistance(ws, we); }
        else if (store.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); }
        else if (store.activeTool === 'rect') { n.x = Math.min(ws.x, we.x); n.y = Math.min(ws.y, we.y); n.width = Math.abs(we.x - ws.x); n.height = Math.abs(we.y - ws.y); }
        else if (store.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); n.sides = store.polygonSides; }
        else if (store.activeTool === 'arrow') { n.points = [ws, we]; n.arrowHeadSize = 15; }
      }
      
      store.addShape(n); 
      store.setSidebarTab('desenho');
      
      // Return to select mode after creating geometric object
      store.setTool('select');
    }
    setStartPoint(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const raw = getMousePos(e); const worldPos = screenToWorld(raw, store.viewTransform);
    store.setMousePos(worldPos);

    if (textEntry) return;

    if (isMiddlePanning || (isDragging && store.activeTool === 'pan')) {
        if (startPoint) {
            const dx = raw.x - startPoint.x; const dy = raw.y - startPoint.y;
            store.setViewTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); setStartPoint(raw);
        }
        return;
    }

    let eff = raw;
    
    // Check if we should attempt snapping
    // Snapping is enabled if:
    // 1. Options enabled AND
    // 2. Ctrl key is NOT pressed AND
    // 3. (We are not in 'pan'/'select' mode OR We are currently dragging a handle/node)
    const isHandleDrag = !!activeHandle;
    const shouldSnap = store.snapOptions.enabled && !e.ctrlKey && 
                       (!['pan', 'select'].includes(store.activeTool) || isHandleDrag);

    if (shouldSnap) {
        const queryRect = { x: worldPos.x - 50, y: worldPos.y - 50, width: 100, height: 100 };
        const visible = store.spatialIndex.query(queryRect)
            .map(s => store.shapes[s.id])
            .filter(s => { 
                const l = store.layers.find(l => l.id === s.layerId); 
                // Don't snap to the shape currently being modified to avoid self-interference jitter
                if (activeHandle && s.id === activeHandle.shapeId) return false;
                return s && l && l.visible && !l.locked; 
            });
        const snap = getSnapPoint(worldPos, visible, store.snapOptions, 15 / store.viewTransform.scale);
        if (snap) { setSnapMarker(snap); eff = worldToScreen(snap, store.viewTransform); } else { setSnapMarker(null); }
    } else { setSnapMarker(null); }
    
    setCurrentPoint(eff);

    if (isDragging && startPoint) {
        if (activeHandle) {
            const ws = screenToWorld(eff, store.viewTransform);
            const s = store.shapes[activeHandle.shapeId];
            if(s) {
                 if (activeHandle.handle.type === 'vertex' && s.points) {
                    const newPoints = s.points.map((p, i) => i === activeHandle.handle.index ? ws : p);
                    store.updateShape(s.id, { points: newPoints }, false);
                 } else if (activeHandle.handle.type === 'resize' && s.type === 'rect') {
                    if (s.x !== undefined && s.y !== undefined && s.width !== undefined && s.height !== undefined) {
                        const idx = activeHandle.handle.index;
                        const oldX = s.x; const oldY = s.y; const oldR = s.x + s.width; const oldB = s.y + s.height;
                        let newX = oldX, newY = oldY, newW = s.width, newH = s.height;
                        if (idx === 0) { newX = ws.x; newY = ws.y; newW = oldR - newX; newH = oldB - newY; }
                        else if (idx === 1) { newY = ws.y; newW = ws.x - oldX; newH = oldB - newY; }
                        else if (idx === 2) { newW = ws.x - oldX; newH = ws.y - oldY; }
                        else if (idx === 3) { newX = ws.x; newW = oldR - newX; newH = ws.y - oldY; }
                        if (newW < 0) { newX += newW; newW = Math.abs(newW); }
                        if (newH < 0) { newY += newH; newH = Math.abs(newH); }
                        store.updateShape(s.id, { x: newX, y: newY, width: newW, height: newH }, false);
                    }
                 }
            }
            return;
        }

        if (store.activeTool === 'select' && !isSelectionBox && store.selectedShapeIds.size > 0 && !activeHandle) {
             const prevWorld = screenToWorld(startPoint, store.viewTransform);
             const currWorld = screenToWorld(eff, store.viewTransform);
             const dx = currWorld.x - prevWorld.x; const dy = currWorld.y - prevWorld.y;

             if (dx !== 0 || dy !== 0) {
                 store.selectedShapeIds.forEach(id => {
                     const s = store.shapes[id];
                     if(!s) return;
                     const l = store.layers.find(lay => lay.id === s.layerId);
                     if (l && l.locked) return;
                     
                     const diff: Partial<Shape> = {};
                     if (s.x !== undefined) diff.x = s.x + dx;
                     if (s.y !== undefined) diff.y = s.y + dy;
                     if (s.points) diff.points = s.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                     
                     store.updateShape(id, diff, false);
                 });
                 setStartPoint(eff);
             }
        }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (textEntry) return;
    e.preventDefault(); 
    const scaleFactor = 1.1; const direction = e.deltaY > 0 ? -1 : 1;
    let newScale = store.viewTransform.scale * (direction > 0 ? scaleFactor : 1/scaleFactor);
    newScale = Math.max(0.1, Math.min(newScale, 5));
    const raw = getMousePos(e); const w = screenToWorld(raw, store.viewTransform);
    const newX = raw.x - w.x * newScale; const newY = raw.y - w.y * newScale;
    store.setViewTransform({ scale: newScale, x: newX, y: newY });
  };

  let cursorClass = DEFAULT_CURSOR;
  if (isMiddlePanning || (isDragging && store.activeTool === 'pan')) cursorClass = GRABBING_CURSOR;
  else if (store.activeTool === 'pan') cursorClass = GRAB_CURSOR;
  else if (store.activeTool === 'text') cursorClass = 'text'; 
  else if (['line', 'polyline', 'rect', 'circle', 'polygon', 'arc', 'measure', 'arrow'].includes(store.activeTool)) cursorClass = 'crosshair'; 
  
  let hintMessage = "";
  if (store.activeTool === 'polyline' && polylinePoints.length > 0) hintMessage = "Enter para completar";
  else if ((store.activeTool === 'move' || store.activeTool === 'rotate') && store.selectedShapeIds.size > 0 && !transformationBase) hintMessage = "Selecione o ponto base";
  else if ((store.activeTool === 'move' || store.activeTool === 'rotate') && transformationBase) hintMessage = "Selecione o destino";
  else if ((store.activeTool === 'move' || store.activeTool === 'rotate') && store.selectedShapeIds.size === 0) hintMessage = "Selecione objetos primeiro";
  else if (store.activeTool === 'text' && !textEntry) hintMessage = "Clique para digitar ou arraste para criar área";
  else if (store.activeTool === 'text' && textEntry) hintMessage = "Digite o texto. Clique fora para finalizar.";

  const textAreaStyle: React.CSSProperties = textEntry ? {
      left: worldToScreen({x: textEntry.x, y: textEntry.y}, store.viewTransform).x,
      top: worldToScreen({x: textEntry.x, y: textEntry.y}, store.viewTransform).y,
      transform: `rotate(${textEntry.rotation}rad)`, transformOrigin: 'top left',
      font: `${store.fontItalic ? 'italic' : 'normal'} ${store.fontBold ? 'bold' : 'normal'} ${store.textSize * store.viewTransform.scale}px "${store.fontFamily}"`,
      color: store.strokeColor, minWidth: '50px', width: textAreaSize.width, height: textAreaSize.height,
      whiteSpace: textEntry.boxWidth ? 'pre-wrap' : 'pre'
  } : {};

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-50 overflow-hidden">
      <canvas 
        ref={canvasRef} className="block w-full h-full" style={{ cursor: cursorClass }} 
        onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} 
        onMouseEnter={() => setIsMouseOver(true)} onMouseLeave={() => setIsMouseOver(false)}
        onDoubleClick={handleDoubleClick} onWheel={handleWheel} onContextMenu={(e) => e.preventDefault()} 
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
};

export default EditorCanvas;