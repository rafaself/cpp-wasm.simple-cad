import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { Shape, Point } from '../../../types';
import { screenToWorld, worldToScreen, getDistance, isPointInShape, getSnapPoint, getSelectionRect, isShapeInSelection } from '../../../utils/geometry';

const EditorCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useAppStore();
  
  // Local interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [isSelectionBox, setIsSelectionBox] = useState(false);
  const [snapMarker, setSnapMarker] = useState<Point | null>(null);
  const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [lineStart, setLineStart] = useState<Point | null>(null);

  const getMousePos = (e: React.MouseEvent): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    setLineStart(null);
    setMeasureStart(null);
    setPolylinePoints([]);
    setStartPoint(null);
    setIsDragging(false);
    setIsSelectionBox(false);
    setSnapMarker(null);
  }, [store.activeTool]);

  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape, isSelected: boolean) => {
    const layer = store.layers.find(l => l.id === shape.layerId);
    if (layer && !layer.visible) return;

    ctx.strokeStyle = isSelected ? '#3b82f6' : shape.strokeColor;
    const baseWidth = shape.strokeWidth || 2;
    ctx.lineWidth = isSelected ? (baseWidth + 2) / store.viewTransform.scale : baseWidth / store.viewTransform.scale;
    ctx.fillStyle = (shape.fillColor && shape.fillColor !== 'transparent') ? shape.fillColor : 'transparent';
    ctx.beginPath();
    
    if (shape.type === 'line' || shape.type === 'measure') {
      if (shape.points.length >= 2) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        ctx.lineTo(shape.points[1].x, shape.points[1].y);
        ctx.stroke();
        if (shape.type === 'measure' && shape.label) {
          const midX = (shape.points[0].x + shape.points[1].x) / 2;
          const midY = (shape.points[0].y + shape.points[1].y) / 2;
          ctx.save();
          ctx.font = `bold ${14 / store.viewTransform.scale}px sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.translate(midX, midY);
          const tm = ctx.measureText(shape.label);
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(-tm.width/2 - 4, -18 / store.viewTransform.scale, tm.width + 8, 20 / store.viewTransform.scale);
          ctx.fillStyle = '#fff';
          ctx.fillText(shape.label, 0, -2 / store.viewTransform.scale);
          ctx.restore();
        }
      }
    } else if (shape.type === 'circle') {
       ctx.arc(shape.x!, shape.y!, shape.radius!, 0, Math.PI * 2);
       if (shape.fillColor !== 'transparent') ctx.fill();
       ctx.stroke();
    } else if (shape.type === 'rect') {
       ctx.rect(shape.x!, shape.y!, shape.width!, shape.height!);
       if (shape.fillColor !== 'transparent') ctx.fill();
       ctx.stroke();
    } else if (shape.type === 'polyline') {
       if (shape.points.length > 0) {
         ctx.moveTo(shape.points[0].x, shape.points[0].y);
         for (let i = 1; i < shape.points.length; i++) ctx.lineTo(shape.points[i].x, shape.points[i].y);
         ctx.stroke();
       }
    } else if (shape.type === 'polygon') {
        const angleStep = (Math.PI * 2) / shape.sides!;
        const startAngle = -Math.PI / 2; 
        ctx.moveTo(shape.x! + shape.radius! * Math.cos(startAngle), shape.y! + shape.radius! * Math.sin(startAngle));
        for (let i = 1; i <= shape.sides!; i++) {
          ctx.lineTo(shape.x! + shape.radius! * Math.cos(startAngle + i * angleStep), shape.y! + shape.radius! * Math.sin(startAngle + i * angleStep));
        }
        ctx.closePath();
        if (shape.fillColor !== 'transparent') ctx.fill();
        ctx.stroke();
    } else if (shape.type === 'arc') {
        if (shape.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          const cpX = (shape.points[0].x + shape.points[1].x) / 2;
          const cpY = (shape.points[0].y + shape.points[1].y) / 2 - 50; 
          ctx.quadraticCurveTo(cpX, cpY, shape.points[1].x, shape.points[1].y);
          ctx.stroke();
       }
    }
  };

  const finishPolyline = useCallback(() => {
    if (polylinePoints.length > 1) {
      store.addShape({
        id: Date.now().toString(), layerId: store.activeLayerId, type: 'polyline',
        strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, fillColor: 'transparent', points: [...polylinePoints]
      });
      setPolylinePoints([]);
    }
  }, [polylinePoints, store]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && store.activeTool === 'polyline') finishPolyline();
      if (e.key === 'Escape') {
        setLineStart(null); setMeasureStart(null); setPolylinePoints([]); setIsDragging(false); setIsSelectionBox(false); setStartPoint(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.activeTool, finishPolyline]);

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

    // Grid
    const gridSize = 50;
    const startX = Math.floor(-store.viewTransform.x / store.viewTransform.scale / gridSize) * gridSize;
    const startY = Math.floor(-store.viewTransform.y / store.viewTransform.scale / gridSize) * gridSize;
    const endX = startX + (canvas.width / store.viewTransform.scale) + gridSize;
    const endY = startY + (canvas.height / store.viewTransform.scale) + gridSize;
    ctx.fillStyle = '#e5e7eb';
    for(let x = startX; x < endX; x += gridSize) {
      for(let y = startY; y < endY; y += gridSize) ctx.fillRect(x, y, 2 / store.viewTransform.scale, 2 / store.viewTransform.scale);
    }

    store.shapes.forEach(shape => drawShape(ctx, shape, store.selectedShapeIds.has(shape.id)));

    // In-progress tools
    if (store.activeTool === 'polyline' && polylinePoints.length > 0) {
      ctx.beginPath(); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = (store.strokeWidth || 2) / store.viewTransform.scale;
      ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y);
      for(let p of polylinePoints) ctx.lineTo(p.x, p.y);
      if (currentPoint) {
         const wm = screenToWorld(currentPoint, store.viewTransform);
         ctx.lineTo(wm.x, wm.y);
      }
      ctx.stroke();
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

    // Drag shapes
    if (isDragging && startPoint && currentPoint && !isMiddlePanning && !isSelectionBox && !['select','pan','polyline','line','measure'].includes(store.activeTool)) {
      const ws = screenToWorld(startPoint, store.viewTransform);
      const wc = screenToWorld(currentPoint, store.viewTransform);
      const temp: Shape = { id: 'temp', layerId: store.activeLayerId, type: store.activeTool, strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, fillColor: store.fillColor, points: [] };
      if (store.activeTool === 'arc') temp.points = [ws, wc];
      else if (store.activeTool === 'circle') { temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); }
      else if (store.activeTool === 'rect') { temp.x = Math.min(ws.x, wc.x); temp.y = Math.min(ws.y, wc.y); temp.width = Math.abs(wc.x - ws.x); temp.height = Math.abs(wc.y - ws.y); }
      else if (store.activeTool === 'polygon') { temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); temp.sides = store.polygonSides; }
      drawShape(ctx, temp, false);
    }

    // Snap Marker
    if (snapMarker) {
        const ws = screenToWorld(snapMarker, store.viewTransform);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 / store.viewTransform.scale; ctx.beginPath();
        const s = 6 / store.viewTransform.scale;
        ctx.moveTo(ws.x - s, ws.y - s); ctx.lineTo(ws.x + s, ws.y + s);
        ctx.moveTo(ws.x + s, ws.y - s); ctx.lineTo(ws.x - s, ws.y + s);
        ctx.rect(ws.x - s, ws.y - s, s * 2, s * 2); ctx.stroke();
    }
    ctx.restore();

    // Selection Box
    if (isSelectionBox && startPoint && currentPoint) {
        const w = currentPoint.x - startPoint.x;
        const h = currentPoint.y - startPoint.y;
        ctx.beginPath(); ctx.rect(startPoint.x, startPoint.y, w, h);
        if (w > 0) { ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; ctx.strokeStyle = 'rgba(59, 130, 246, 1)'; ctx.setLineDash([]); }
        else { ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'; ctx.strokeStyle = 'rgba(34, 197, 94, 1)'; ctx.setLineDash([5, 3]); }
        ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    }

  }, [store, polylinePoints, isDragging, isMiddlePanning, isSelectionBox, startPoint, currentPoint, snapMarker, lineStart, measureStart]);

  // Handle Resize
  // We decouple this from 'render' to prevent infinite loops (Minified React error #185)
  useEffect(() => {
    const handleResize = () => { 
        if (canvasRef.current) { 
            const width = window.innerWidth;
            const height = window.innerHeight - 180; // Adjusted for taller ribbon
            
            // Set canvas size (clears canvas context)
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            
            // Sync with store (triggers re-render -> new render() callback -> painting)
            // Using the store instance from the closure is fine here.
            store.setCanvasSize({ width, height });
        } 
    };
    
    window.addEventListener('resize', handleResize); 
    handleResize(); // Initial call
    
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount (and unmount)

  // Render Loop
  useEffect(() => { 
      render(); 
  }, [render]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const raw = getMousePos(e);
    let eff = raw;
    const wr = screenToWorld(raw, store.viewTransform);
    let snapped: Point | null = null;

    if (store.snapOptions.enabled && !['pan','select'].includes(store.activeTool)) {
       const visible = store.shapes.filter(s => { const l = store.layers.find(l => l.id === s.layerId); return l && l.visible && !l.locked; });
       const snap = getSnapPoint(wr, visible, store.snapOptions, 15 / store.viewTransform.scale);
       if (snap) { snapped = snap; eff = worldToScreen(snap, store.viewTransform); }
    }

    setStartPoint(eff); setCurrentPoint(eff);

    if (e.button === 1 || store.activeTool === 'pan') {
        if(e.button === 1) e.preventDefault();
        setIsMiddlePanning(e.button === 1); setIsDragging(true); return;
    }

    const wPos = snapped || wr;

    if (store.activeTool === 'select') {
      const selectWorld = screenToWorld(raw, store.viewTransform);
      let foundId = null;
      for (let i = store.shapes.length - 1; i >= 0; i--) {
        const s = store.shapes[i];
        const l = store.layers.find(lay => lay.id === s.layerId);
        if (l && !l.visible) continue;
        if (isPointInShape(selectWorld, s)) { foundId = s.id; break; }
      }

      if (foundId) {
         if (e.shiftKey) {
             store.setSelectedShapeIds(prev => { const n = new Set(prev); if(n.has(foundId!)) n.delete(foundId!); else n.add(foundId!); return n; });
         } else if (!store.selectedShapeIds.has(foundId)) {
             store.setSelectedShapeIds(new Set([foundId]));
         }
         setIsDragging(true);
      } else {
         if (!e.shiftKey) store.setSelectedShapeIds(new Set());
         setIsSelectionBox(true);
      }
      return;
    }

    if (store.activeTool === 'polyline') { setPolylinePoints(p => [...p, wPos]); return; }
    if (store.activeTool === 'line') {
      if (!lineStart) setLineStart(wPos);
      else {
        store.addShape({ id: Date.now().toString(), layerId: store.activeLayerId, type: 'line', strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, fillColor: 'transparent', points: [lineStart, wPos] });
        setLineStart(null);
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

  const handleMouseMove = (e: React.MouseEvent) => {
    const raw = getMousePos(e);
    let eff = raw;
    const wr = screenToWorld(raw, store.viewTransform);
    store.setMousePos(wr);

    if (store.snapOptions.enabled && (isDragging || ['polyline','measure','line'].includes(store.activeTool)) && !isSelectionBox) {
        const visible = store.shapes.filter(s => { const l = store.layers.find(l => l.id === s.layerId); return l && l.visible; });
        const snap = getSnapPoint(wr, visible, store.snapOptions, 15 / store.viewTransform.scale);
        if (snap) { eff = worldToScreen(snap, store.viewTransform); setSnapMarker(eff); } else setSnapMarker(null);
    } else setSnapMarker(null);

    setCurrentPoint(eff);

    if (isMiddlePanning && startPoint) {
      const dx = raw.x - startPoint.x; const dy = raw.y - startPoint.y;
      store.setViewTransform(p => ({ ...p, x: p.x + dx, y: p.y + dy })); setStartPoint(raw); return;
    }

    if (isSelectionBox) return;

    if (isDragging) {
      if (store.activeTool === 'pan' && startPoint) {
        const dx = raw.x - startPoint.x; const dy = raw.y - startPoint.y;
        store.setViewTransform(p => ({ ...p, x: p.x + dx, y: p.y + dy })); setStartPoint(raw);
      } else if (store.activeTool === 'select' && store.selectedShapeIds.size > 0 && startPoint) {
         const ws = screenToWorld(startPoint, store.viewTransform);
         const wc = screenToWorld(eff, store.viewTransform);
         const dx = wc.x - ws.x; const dy = wc.y - ws.y;
         store.updateShapes(prev => prev.map(s => {
           if (!store.selectedShapeIds.has(s.id)) return s;
           const l = store.layers.find(lay => lay.id === s.layerId);
           if (l && l.locked) return s;
           const n = { ...s };
           if (n.x !== undefined) n.x += dx; if (n.y !== undefined) n.y += dy;
           if (n.points) n.points = n.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
           return n;
         }));
         setStartPoint(eff);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); return; }

    if (isSelectionBox && startPoint && currentPoint) {
       const ws = screenToWorld(startPoint, store.viewTransform);
       const we = screenToWorld(currentPoint, store.viewTransform);
       const { rect, direction } = getSelectionRect(ws, we);
       const mode = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
       const nSel = new Set(store.selectedShapeIds);
       store.shapes.forEach(s => {
           const l = store.layers.find(lay => lay.id === s.layerId);
           if (l && !l.visible) return;
           if (isShapeInSelection(s, rect, mode)) nSel.add(s.id);
       });
       store.setSelectedShapeIds(nSel);
       setIsSelectionBox(false); setStartPoint(null); return;
    }

    setIsDragging(false);
    if (!startPoint || !currentPoint) return;
    const ws = screenToWorld(startPoint, store.viewTransform);
    const we = screenToWorld(currentPoint, store.viewTransform);
    if (getDistance(ws, we) < 2 && !['select','measure','polyline','line'].includes(store.activeTool)) return;

    if (!['select','pan','polyline','measure','line'].includes(store.activeTool)) {
      const n: Shape = { id: Date.now().toString(), layerId: store.activeLayerId, type: store.activeTool, strokeColor: store.strokeColor, strokeWidth: store.strokeWidth, fillColor: store.fillColor, points: [] };
      if (store.activeTool === 'arc') n.points = [ws, we];
      else if (store.activeTool === 'circle') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); }
      else if (store.activeTool === 'rect') { n.x = Math.min(ws.x, we.x); n.y = Math.min(ws.y, we.y); n.width = Math.abs(we.x - ws.x); n.height = Math.abs(we.y - ws.y); }
      else if (store.activeTool === 'polygon') { n.x = ws.x; n.y = ws.y; n.radius = getDistance(ws, we); n.sides = store.polygonSides; }
      store.addShape(n);
    }
    setStartPoint(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault(); 
    const scaleFactor = 1.1; const direction = e.deltaY > 0 ? -1 : 1;
    let newScale = store.viewTransform.scale * (direction > 0 ? scaleFactor : 1/scaleFactor);
    newScale = Math.max(0.1, Math.min(newScale, 50));
    const raw = getMousePos(e);
    const w = screenToWorld(raw, store.viewTransform);
    const newX = raw.x - w.x * newScale;
    const newY = raw.y - w.y * newScale;
    store.setViewTransform({ scale: newScale, x: newX, y: newY });
  };

  let cursorClass = 'default';
  if (isMiddlePanning || store.activeTool === 'pan') cursorClass = 'grab';
  else if (store.activeTool === 'select') cursorClass = 'default';
  else cursorClass = 'crosshair';
  if (isDragging && ['pan','select'].includes(store.activeTool)) cursorClass = 'grabbing';
  if (isMiddlePanning) cursorClass = 'grabbing';

  return <canvas ref={canvasRef} className="block w-full h-full bg-gray-50" style={{ cursor: cursorClass }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={() => finishPolyline()} onWheel={handleWheel} onContextMenu={(e) => e.preventDefault()} />;
};

export default EditorCanvas;