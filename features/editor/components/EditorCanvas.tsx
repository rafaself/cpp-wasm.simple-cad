import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { Shape, Point } from '../../../types';
import { screenToWorld, worldToScreen, getDistance, isPointInShape, getSnapPoint, getSelectionRect, isShapeInSelection, rotatePoint } from '../../../utils/geometry';
import UserHint from './UserHint';

const EditorCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
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
  const [isMouseOver, setIsMouseOver] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  
  // Text Entry State
  const [textEntry, setTextEntry] = useState<{ x: number, y: number, worldPos: Point } | null>(null);

  // Transformation state (Move/Rotate)
  const [transformationBase, setTransformationBase] = useState<Point | null>(null);
  
  // Ref to track if we saved history for the current drag session
  const hasSavedHistoryRef = useRef(false);

  const getMousePos = (e: React.MouseEvent): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
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
    setTransformationBase(null);
    setTextEntry(null);
    setHintDismissed(false); // Reset hint dismissal on tool change
  }, [store.activeTool]);

  // Global mouse up handler to prevent stuck states when releasing outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isMiddlePanning) {
        setIsMiddlePanning(false);
        setStartPoint(null);
        setIsDragging(false);
      }
      if (isDragging && store.activeTool === 'pan') {
         setIsDragging(false);
         setStartPoint(null);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isMiddlePanning, isDragging, store.activeTool]);


  const drawShape = (ctx: CanvasRenderingContext2D, shape: Shape, isSelected: boolean, isGhost: boolean = false) => {
    const layer = store.layers.find(l => l.id === shape.layerId);
    if (layer && !layer.visible) return;

    ctx.save();
    
    // Apply Rotation if exists
    if (shape.rotation && shape.x !== undefined && shape.y !== undefined) {
        let pivotX = shape.x;
        let pivotY = shape.y;
        
        ctx.translate(pivotX, pivotY);
        ctx.rotate(shape.rotation);
        ctx.translate(-pivotX, -pivotY);
    }

    if (isGhost) {
        ctx.strokeStyle = '#9ca3af'; // Gray
        ctx.setLineDash([5, 5]);
        ctx.fillStyle = 'transparent';
    } else {
        ctx.strokeStyle = isSelected ? '#3b82f6' : shape.strokeColor;
        ctx.fillStyle = (shape.fillColor && shape.fillColor !== 'transparent') ? shape.fillColor : 'transparent';
        ctx.setLineDash([]);
    }

    const baseWidth = shape.strokeWidth || 2;
    ctx.lineWidth = isSelected ? (baseWidth + 2) / store.viewTransform.scale : baseWidth / store.viewTransform.scale;
    
    ctx.beginPath();
    
    if (shape.type === 'line' || shape.type === 'measure') {
      if (shape.points.length >= 2) {
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        ctx.lineTo(shape.points[1].x, shape.points[1].y);
        ctx.stroke();
        if (shape.type === 'measure' && shape.label && !isGhost) {
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
       if (!isGhost && shape.fillColor !== 'transparent') ctx.fill();
       ctx.stroke();
    } else if (shape.type === 'rect') {
       ctx.rect(shape.x!, shape.y!, shape.width!, shape.height!);
       if (!isGhost && shape.fillColor !== 'transparent') ctx.fill();
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
        if (!isGhost && shape.fillColor !== 'transparent') ctx.fill();
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
    } else if (shape.type === 'text') {
        if (shape.text && shape.fontSize && shape.x !== undefined && shape.y !== undefined) {
            ctx.fillStyle = isGhost ? '#9ca3af' : shape.strokeColor; 
            
            // Build font string - Quote family to handle spaces (e.g., "Times New Roman")
            const style = shape.fontItalic ? 'italic' : 'normal';
            const weight = shape.fontBold ? 'bold' : 'normal';
            const family = shape.fontFamily ? `"${shape.fontFamily}"` : 'sans-serif';
            ctx.font = `${style} ${weight} ${shape.fontSize}px ${family}`;
            ctx.textBaseline = 'top'; // Draw from top-left
            
            ctx.fillText(shape.text, shape.x, shape.y);
            
            // Text Decoration (Manual drawing)
            const metrics = ctx.measureText(shape.text);
            const width = metrics.width;
            
            if (shape.fontUnderline) {
                const underlineY = shape.y + shape.fontSize + 2; 
                ctx.beginPath();
                ctx.lineWidth = Math.max(1, shape.fontSize / 15);
                ctx.moveTo(shape.x, underlineY);
                ctx.lineTo(shape.x + width, underlineY);
                ctx.stroke();
            }

            if (shape.fontStrike) {
                const strikeY = shape.y + (shape.fontSize / 2); 
                ctx.beginPath();
                ctx.lineWidth = Math.max(1, shape.fontSize / 15);
                ctx.moveTo(shape.x, strikeY);
                ctx.lineTo(shape.x + width, strikeY);
                ctx.stroke();
            }

            if (isSelected && !isGhost) {
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1 / store.viewTransform.scale;
                ctx.strokeRect(shape.x - 2, shape.y - 2, width + 4, shape.fontSize + 4);
            }
        }
    }
    
    ctx.restore();
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

  // Commit Text Entry
  const commitTextEntry = useCallback(() => {
     if (textEntry && textInputRef.current) {
         const text = textInputRef.current.value.trim();
         if (text) {
             store.addShape({
                id: Date.now().toString(),
                layerId: store.activeLayerId,
                type: 'text',
                x: textEntry.worldPos.x,
                y: textEntry.worldPos.y,
                text: text,
                fontSize: store.textSize,
                fontFamily: store.fontFamily,
                fontBold: store.fontBold,
                fontItalic: store.fontItalic,
                fontUnderline: store.fontUnderline,
                fontStrike: store.fontStrike,
                strokeColor: store.strokeColor,
                fillColor: 'transparent',
                points: []
             });
         }
     }
     setTextEntry(null);
  }, [textEntry, store]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if text entry is active
      if (textEntry) return;

      if (e.key === 'Enter') {
          if (store.activeTool === 'polyline') finishPolyline();
      }
      if (e.key === 'Escape') {
        if (textEntry) {
            setTextEntry(null);
            return;
        }
        setLineStart(null); setMeasureStart(null); setPolylinePoints([]); 
        setIsDragging(false); setIsSelectionBox(false); setStartPoint(null);
        setTransformationBase(null);
        if (store.activeTool === 'move' || store.activeTool === 'rotate') {
             store.setTool('select');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

    // Grid
    const gridSize = store.gridSize;
    const startX = Math.floor(-store.viewTransform.x / store.viewTransform.scale / gridSize) * gridSize;
    const startY = Math.floor(-store.viewTransform.y / store.viewTransform.scale / gridSize) * gridSize;
    const endX = startX + (canvas.width / store.viewTransform.scale) + gridSize;
    const endY = startY + (canvas.height / store.viewTransform.scale) + gridSize;
    
    ctx.fillStyle = store.gridColor;
    for(let x = startX; x < endX; x += gridSize) {
      for(let y = startY; y < endY; y += gridSize) ctx.fillRect(x, y, 2 / store.viewTransform.scale, 2 / store.viewTransform.scale);
    }

    // Draw existing shapes
    store.shapes.forEach(shape => drawShape(ctx, shape, store.selectedShapeIds.has(shape.id)));

    // --- Draw Ghosts for Move/Rotate ---
    if ((store.activeTool === 'move' || store.activeTool === 'rotate') && transformationBase && currentPoint && store.selectedShapeIds.size > 0) {
        const wm = screenToWorld(currentPoint, store.viewTransform);
        
        store.shapes.forEach(shape => {
            if (!store.selectedShapeIds.has(shape.id)) return;
            
            const ghost = { ...shape, id: 'ghost-' + shape.id };
            
            if (store.activeTool === 'move') {
                const dx = wm.x - transformationBase.x;
                const dy = wm.y - transformationBase.y;
                if (ghost.x !== undefined) ghost.x += dx;
                if (ghost.y !== undefined) ghost.y += dy;
                if (ghost.points) ghost.points = ghost.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            } 
            else if (store.activeTool === 'rotate') {
                const dx = wm.x - transformationBase.x;
                const dy = wm.y - transformationBase.y;
                const angle = Math.atan2(dy, dx);
                
                ctx.beginPath();
                ctx.moveTo(transformationBase.x, transformationBase.y);
                ctx.lineTo(wm.x, wm.y);
                ctx.strokeStyle = '#f59e0b';
                ctx.setLineDash([2, 2]);
                ctx.stroke();

                // Rotate points
                if (ghost.points) ghost.points = ghost.points.map(p => rotatePoint(p, transformationBase, angle));
                if (ghost.x !== undefined && ghost.y !== undefined) {
                    const np = rotatePoint({x: ghost.x, y: ghost.y}, transformationBase, angle);
                    ghost.x = np.x;
                    ghost.y = np.y;
                }
                if (ghost.type === 'rect' || ghost.type === 'text') {
                    ghost.rotation = (ghost.rotation || 0) + angle;
                }
            }
            
            drawShape(ctx, ghost, false, true);
        });
    }


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
    if (isDragging && startPoint && currentPoint && !isMiddlePanning && !isSelectionBox && !['select','pan','polyline','line','measure','text', 'move', 'rotate'].includes(store.activeTool)) {
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

    // Selection Box (Screen Space Overlay)
    if (isSelectionBox && startPoint && currentPoint) {
        const w = currentPoint.x - startPoint.x;
        const h = currentPoint.y - startPoint.y;
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(startPoint.x, startPoint.y, w, h);
        
        if (w < 0) {
            ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'; 
            ctx.strokeStyle = 'rgba(34, 197, 94, 1)'; 
            ctx.setLineDash([5, 5]); 
        } else {
            ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; 
            ctx.strokeStyle = 'rgba(59, 130, 246, 1)'; 
            ctx.setLineDash([]); 
        }
        
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Custom Crosshair Cursor (Screen Space)
    if (isMouseOver && currentPoint && !['select', 'pan'].includes(store.activeTool)) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const size = 10;
        ctx.moveTo(currentPoint.x - size, currentPoint.y);
        ctx.lineTo(currentPoint.x + size, currentPoint.y);
        ctx.moveTo(currentPoint.x, currentPoint.y - size);
        ctx.lineTo(currentPoint.x, currentPoint.y + size);
        ctx.stroke();
        
        // White border for contrast
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(currentPoint.x - size, currentPoint.y + 1);
        ctx.lineTo(currentPoint.x + size, currentPoint.y + 1);
        ctx.moveTo(currentPoint.x + 1, currentPoint.y - size);
        ctx.lineTo(currentPoint.x + 1, currentPoint.y + size);
        ctx.stroke();
    }

  }, [store, polylinePoints, isDragging, isMiddlePanning, isSelectionBox, startPoint, currentPoint, snapMarker, lineStart, measureStart, isMouseOver, transformationBase]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => { 
        if (containerRef.current && canvasRef.current) { 
            const width = containerRef.current.clientWidth;
            const height = containerRef.current.clientHeight; 
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            store.setCanvasSize({ width, height });
        } 
    };
    window.addEventListener('resize', handleResize); 
    handleResize(); 
    return () => window.removeEventListener('resize', handleResize);
  }, []); 

  // Render Loop
  useEffect(() => { 
      render(); 
  }, [render]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // If text entry is active, clicking outside commits it (via blur) or does nothing (if overlay catches it)
    if (textEntry) return;

    const raw = getMousePos(e);
    let eff = raw;
    const wr = screenToWorld(raw, store.viewTransform);
    let snapped: Point | null = null;
    
    // Reset history tracking for this interaction
    hasSavedHistoryRef.current = false;

    // Snapping Logic
    // MODIFIED: Ignore snap if CTRL is pressed
    if (store.snapOptions.enabled && !['pan','select'].includes(store.activeTool) && !e.ctrlKey) {
       const visible = store.shapes.filter(s => { const l = store.layers.find(l => l.id === s.layerId); return l && l.visible && !l.locked; });
       const snap = getSnapPoint(wr, visible, store.snapOptions, 15 / store.viewTransform.scale);
       if (snap) { snapped = snap; eff = worldToScreen(snap, store.viewTransform); }
    }

    setStartPoint(eff); setCurrentPoint(eff);

    // Pan / Middle Mouse
    if (e.button === 1 || store.activeTool === 'pan') {
        if(e.button === 1) e.preventDefault();
        setIsMiddlePanning(e.button === 1); setIsDragging(true); return;
    }

    const wPos = snapped || wr;

    // MOVE / ROTATE LOGIC
    if (store.activeTool === 'move' || store.activeTool === 'rotate') {
        if (!transformationBase) {
            // Step 1: Set Base Point
            setTransformationBase(wPos);
        } else {
            // Step 2: Commit Transformation
            if (store.activeTool === 'move') {
                const dx = wPos.x - transformationBase.x;
                const dy = wPos.y - transformationBase.y;
                store.updateShapes(prev => prev.map(s => {
                    if (!store.selectedShapeIds.has(s.id)) return s;
                    const l = store.layers.find(lay => lay.id === s.layerId);
                    if (l && l.locked) return s;
                    const n = { ...s };
                    if (n.x !== undefined) n.x += dx; if (n.y !== undefined) n.y += dy;
                    if (n.points) n.points = n.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    return n;
                }));
            } else if (store.activeTool === 'rotate') {
                const dx = wPos.x - transformationBase.x;
                const dy = wPos.y - transformationBase.y;
                const angle = Math.atan2(dy, dx);
                store.rotateSelected(transformationBase, angle);
            }
            
            // Reset
            setTransformationBase(null);
            store.setTool('select');
        }
        return;
    }

    // TEXT TOOL LOGIC (Start Entry)
    if (store.activeTool === 'text') {
        // Use relative coordinates for the input box position
        setTextEntry({ x: eff.x, y: eff.y, worldPos: wPos });
        return;
    }

    // SELECTION TOOL LOGIC
    if (store.activeTool === 'select') {
      const selectWorld = screenToWorld(raw, store.viewTransform);
      
      // Hit Test (Top-down)
      let hitShapeId = null;
      for (let i = store.shapes.length - 1; i >= 0; i--) {
        const s = store.shapes[i];
        const l = store.layers.find(lay => lay.id === s.layerId);
        if (l && (!l.visible || l.locked)) continue; // Skip invisible or locked
        // Passed current scale to isPointInShape for consistent screen-space hit testing
        if (isPointInShape(selectWorld, s, store.viewTransform.scale)) { hitShapeId = s.id; break; }
      }

      if (hitShapeId) {
         // Clicked on a shape
         if (e.shiftKey) {
             // Toggle selection
             store.setSelectedShapeIds(prev => { 
                 const n = new Set(prev); 
                 if(n.has(hitShapeId!)) n.delete(hitShapeId!); 
                 else n.add(hitShapeId!); 
                 return n; 
             });
         } else {
             // Standard click
             // If clicking an unselected shape, select ONLY that shape.
             // If clicking an ALREADY selected shape, do not clear selection (allows dragging group).
             if (!store.selectedShapeIds.has(hitShapeId)) {
                 store.setSelectedShapeIds(new Set([hitShapeId]));
             }
         }
         setIsDragging(true); // Prepare for potential move
      } else {
         // Clicked on empty space
         // If Shift is NOT held, clear selection immediately (standard CAD behavior)
         // But we wait to see if it becomes a box selection on mouse move? 
         // Actually, most CAD clears on click-down in empty space unless Shift is held.
         if (!e.shiftKey) {
             store.setSelectedShapeIds(new Set());
         }
         setIsSelectionBox(true); // Start box selection
      }
      return;
    }

    // DRAWING TOOLS
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
    if (textEntry) return;

    const raw = getMousePos(e);
    let eff = raw;
    const wr = screenToWorld(raw, store.viewTransform);
    store.setMousePos(wr);

    // MODIFIED: Ignore snap if CTRL is pressed
    if (store.snapOptions.enabled && (isDragging || ['polyline','measure','line','move','rotate'].includes(store.activeTool)) && !isSelectionBox && !e.ctrlKey) {
        const visible = store.shapes.filter(s => { const l = store.layers.find(l => l.id === s.layerId); return l && l.visible; });
        const snap = getSnapPoint(wr, visible, store.snapOptions, 15 / store.viewTransform.scale);
        if (snap) { eff = worldToScreen(snap, store.viewTransform); setSnapMarker(eff); } else setSnapMarker(null);
    } else setSnapMarker(null);

    setCurrentPoint(eff);

    if (isMiddlePanning && startPoint) {
      const dx = raw.x - startPoint.x; const dy = raw.y - startPoint.y;
      store.setViewTransform(p => ({ ...p, x: p.x + dx, y: p.y + dy })); setStartPoint(raw); return;
    }

    if (isSelectionBox) return; // Just update currentPoint (done above) for rendering box

    if (isDragging) {
      if (store.activeTool === 'pan' && startPoint) {
        const dx = raw.x - startPoint.x; const dy = raw.y - startPoint.y;
        store.setViewTransform(p => ({ ...p, x: p.x + dx, y: p.y + dy })); setStartPoint(raw);
      } else if (store.activeTool === 'select' && store.selectedShapeIds.size > 0 && startPoint) {
         
         // SAVE HISTORY ON FIRST MOVE
         if (!hasSavedHistoryRef.current) {
            store.saveHistory();
            hasSavedHistoryRef.current = true;
         }

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
    if (textEntry) return;

    if (isMiddlePanning) { setIsMiddlePanning(false); setStartPoint(null); return; }

    // FINISH SELECTION BOX
    if (isSelectionBox && startPoint && currentPoint) {
       if (getDistance(startPoint, currentPoint) > 2) {
           const ws = screenToWorld(startPoint, store.viewTransform);
           const we = screenToWorld(currentPoint, store.viewTransform);
           const { rect, direction } = getSelectionRect(ws, we);
           
           const mode = direction === 'LTR' ? 'WINDOW' : 'CROSSING';
           
           const nSel = e.shiftKey ? new Set(store.selectedShapeIds) : new Set<string>();
           
           store.shapes.forEach(s => {
               const l = store.layers.find(lay => lay.id === s.layerId);
               if (l && (!l.visible || l.locked)) return;
               
               if (isShapeInSelection(s, rect, mode)) {
                   nSel.add(s.id);
               }
           });
           store.setSelectedShapeIds(nSel);
       }
       setIsSelectionBox(false); setStartPoint(null); return;
    }

    setIsDragging(false);
    if (!startPoint || !currentPoint) return;
    const ws = screenToWorld(startPoint, store.viewTransform);
    const we = screenToWorld(currentPoint, store.viewTransform);
    
    if (getDistance(ws, we) < 2 && !['select','measure','polyline','line','text'].includes(store.activeTool)) return;

    // CREATE SHAPE
    if (!['select','pan','polyline','measure','line','text', 'move', 'rotate'].includes(store.activeTool)) {
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
    if (textEntry) return;

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
  else if (store.activeTool === 'text') cursorClass = 'text'; 
  else if (isMouseOver && !['select', 'pan'].includes(store.activeTool)) cursorClass = 'none'; // Custom cursor
  else cursorClass = 'default';

  if (isDragging && ['pan','select'].includes(store.activeTool)) cursorClass = 'grabbing';
  if (isMiddlePanning) cursorClass = 'grabbing';
  
  // Hint Logic
  let hintMessage = "";
  if (store.activeTool === 'polyline' && polylinePoints.length > 0) hintMessage = "Enter to complete";
  else if ((store.activeTool === 'move' || store.activeTool === 'rotate') && store.selectedShapeIds.size > 0 && !transformationBase) hintMessage = "Select base point";
  else if ((store.activeTool === 'move' || store.activeTool === 'rotate') && transformationBase) hintMessage = "Select destination";
  else if ((store.activeTool === 'move' || store.activeTool === 'rotate') && store.selectedShapeIds.size === 0) hintMessage = "Select objects first";
  else if (store.activeTool === 'text' && !textEntry) hintMessage = "Click to place text";
  else if (store.activeTool === 'text' && textEntry) hintMessage = "Type text, Enter or Click away to finish";

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gray-50 overflow-hidden">
      <canvas 
        ref={canvasRef} 
        className="block w-full h-full" 
        style={{ cursor: cursorClass }} 
        onMouseDown={handleMouseDown} 
        onMouseMove={handleMouseMove} 
        onMouseUp={handleMouseUp} 
        onMouseEnter={() => setIsMouseOver(true)}
        onMouseLeave={() => setIsMouseOver(false)}
        onDoubleClick={() => finishPolyline()} 
        onWheel={handleWheel} 
        onContextMenu={(e) => e.preventDefault()} 
      />
      
      {/* Text Entry Overlay */}
      {textEntry && (
         <textarea
            ref={textInputRef}
            autoFocus
            placeholder="Type..."
            className="absolute z-[60] bg-transparent border border-blue-500 outline-none resize-none overflow-hidden text-nowrap p-0 m-0 leading-none"
            style={{
                left: textEntry.x,
                top: textEntry.y,
                font: `${store.fontItalic ? 'italic' : 'normal'} ${store.fontBold ? 'bold' : 'normal'} ${store.textSize * store.viewTransform.scale}px "${store.fontFamily}"`,
                color: store.strokeColor,
                minWidth: '50px',
                height: `${store.textSize * store.viewTransform.scale * 1.5}px` // slightly taller to accommodate leading
            }}
            onBlur={commitTextEntry}
            onKeyDown={(e) => { 
                if(e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    commitTextEntry(); 
                }
                if(e.key === 'Escape') {
                    setTextEntry(null);
                }
            }}
         />
      )}

      <UserHint 
        visible={!!hintMessage && !hintDismissed} 
        message={hintMessage} 
        onClose={() => setHintDismissed(true)}
      />
    </div>
  );
};

export default EditorCanvas;