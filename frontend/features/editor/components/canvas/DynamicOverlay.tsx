import React, { useRef, useEffect, useCallback } from 'react';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { Shape } from '../../../../types';
import { screenToWorld, getDistance, rotatePoint } from '../../../../utils/geometry';
import { CURSOR_SVG } from '../assets/cursors';
import RadiusInputModal from '../RadiusInputModal';
import { useCanvasInteraction } from './hooks/useCanvasInteraction';
import { drawGhostShape } from './renderers/GhostRenderer';
import { drawSelectionHighlight, drawHandles } from './renderers/SelectionRenderer';
import TextEditorOverlay from './overlays/TextEditorOverlay';
import { getDefaultColorMode } from '../../../../utils/shapeColors';

const DEFAULT_CURSOR = `url('data:image/svg+xml;base64,${btoa(CURSOR_SVG)}') 6 4, default`;
const GRAB_CURSOR = 'grab';
const GRABBING_CURSOR = 'grabbing';

interface DynamicOverlayProps {
  width: number;
  height: number;
}

const DynamicOverlay: React.FC<DynamicOverlayProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiStore = useUIStore();
  const dataStore = useDataStore();

  const { handlers, state, setters } = useCanvasInteraction(canvasRef);
  const {
    isDragging, isMiddlePanning, startPoint, currentPoint, isSelectionBox, snapMarker,
    polylinePoints, measureStart, lineStart, activeHandle, transformationBase,
    arcPoints, showRadiusModal, radiusModalPos, textEditState
  } = state;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(uiStore.viewTransform.x, uiStore.viewTransform.y);
    ctx.scale(uiStore.viewTransform.scale, uiStore.viewTransform.scale);

    // 1. Draw Selection Highlights & Handles
    uiStore.selectedShapeIds.forEach(id => {
        const shape = dataStore.shapes[id];
        if (shape) {
            try {
                drawSelectionHighlight(ctx, shape, uiStore.viewTransform);
                if (uiStore.activeTool === 'select') drawHandles(ctx, shape, uiStore.viewTransform);
            } catch (e) {
                console.error("Error drawing selection for shape", id, e);
            }
        }
    });

    // 2. Draw Transformation Ghosts (Move/Rotate)
    if ((uiStore.activeTool === 'move' || uiStore.activeTool === 'rotate') && transformationBase && currentPoint && uiStore.selectedShapeIds.size > 0) {
        const wm = screenToWorld(currentPoint, uiStore.viewTransform);
        uiStore.selectedShapeIds.forEach(id => {
            const shape = dataStore.shapes[id];
            if(!shape) return;
            const ghost = { ...shape, id: 'ghost-' + shape.id };
            if (uiStore.activeTool === 'move') {
                const dx = wm.x - transformationBase.x; const dy = wm.y - transformationBase.y;
                if (ghost.x !== undefined) ghost.x += dx; if (ghost.y !== undefined) ghost.y += dy;
                if (ghost.points) ghost.points = ghost.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            } else if (uiStore.activeTool === 'rotate') {
                const dx = wm.x - transformationBase.x; const dy = wm.y - transformationBase.y;
                const angle = Math.atan2(dy, dx);
                ctx.beginPath(); ctx.moveTo(transformationBase.x, transformationBase.y); ctx.lineTo(wm.x, wm.y); ctx.strokeStyle = '#f59e0b'; ctx.setLineDash([2, 2]); ctx.stroke();
                if (ghost.points) ghost.points = ghost.points.map(p => rotatePoint(p, transformationBase, angle));
                if (ghost.x !== undefined && ghost.y !== undefined) { const np = rotatePoint({x: ghost.x, y: ghost.y}, transformationBase, angle); ghost.x = np.x; ghost.y = np.y; }
                if (ghost.type === 'rect') ghost.rotation = (ghost.rotation || 0) + angle;
            }
            drawGhostShape(ctx, ghost, uiStore.viewTransform);
        });
    }

    // 3. Draw Creation Drafts
    if (uiStore.activeTool === 'polyline' && polylinePoints.length > 0) {
      ctx.beginPath(); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = (uiStore.strokeWidth || 2) / uiStore.viewTransform.scale;
      ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y); for(let p of polylinePoints) ctx.lineTo(p.x, p.y);
      if (currentPoint) { const wm = screenToWorld(currentPoint, uiStore.viewTransform); ctx.lineTo(wm.x, wm.y); } ctx.stroke();
    }

    if ((uiStore.activeTool === 'line' && lineStart) || (uiStore.activeTool === 'measure' && measureStart)) {
        const start = uiStore.activeTool === 'line' ? lineStart : measureStart;
        if (start && currentPoint) {
            const wm = screenToWorld(currentPoint, uiStore.viewTransform);
            ctx.beginPath(); ctx.strokeStyle = uiStore.activeTool === 'measure' ? '#ef4444' : uiStore.strokeColor;
            ctx.lineWidth = (uiStore.strokeWidth || 2) / uiStore.viewTransform.scale;
            ctx.moveTo(start.x, start.y); ctx.lineTo(wm.x, wm.y); ctx.stroke();
        }
    }

    if (isDragging && startPoint && currentPoint && !activeHandle && !isMiddlePanning && !isSelectionBox && !['select','pan','polyline','line','measure', 'move', 'rotate'].includes(uiStore.activeTool)) {
      const ws = screenToWorld(startPoint, uiStore.viewTransform); const wc = screenToWorld(currentPoint, uiStore.viewTransform);
      const temp: Shape = { id: 'temp', layerId: dataStore.activeLayerId, type: uiStore.activeTool, strokeColor: uiStore.strokeColor, strokeWidth: uiStore.strokeWidth, strokeEnabled: uiStore.strokeEnabled, fillColor: uiStore.fillColor, points: [] };
      if (uiStore.activeTool === 'arc') {
          ctx.beginPath(); ctx.moveTo(ws.x, ws.y); ctx.lineTo(wc.x, wc.y);
          ctx.strokeStyle = uiStore.strokeColor; ctx.stroke();
      }
      else if (uiStore.activeTool === 'circle') { temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); }
      else if (uiStore.activeTool === 'rect') { temp.x = Math.min(ws.x, wc.x); temp.y = Math.min(ws.y, wc.y); temp.width = Math.abs(wc.x - ws.x); temp.height = Math.abs(wc.y - ws.y); }
      else if (uiStore.activeTool === 'polygon') { temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); temp.sides = uiStore.polygonSides; }
      else if (uiStore.activeTool === 'arrow') { temp.points = [ws, wc]; temp.arrowHeadSize = 15; }
      drawGhostShape(ctx, temp, uiStore.viewTransform);
    }

    // 4. Snap Marker
    if (snapMarker) {
        const ws = screenToWorld(snapMarker, uiStore.viewTransform);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 / uiStore.viewTransform.scale; ctx.beginPath();
        const s = 6 / uiStore.viewTransform.scale;
        ctx.moveTo(ws.x - s, ws.y - s); ctx.lineTo(ws.x + s, ws.y + s); ctx.moveTo(ws.x + s, ws.y - s); ctx.lineTo(ws.x - s, ws.y + s);
        ctx.rect(ws.x - s, ws.y - s, s * 2, s * 2); ctx.stroke();
    }

    ctx.restore();

    // 5. Selection Box (Screen Space)
    if (isSelectionBox && startPoint && currentPoint) {
        const w = currentPoint.x - startPoint.x; const h = currentPoint.y - startPoint.y;
        ctx.save(); ctx.beginPath(); ctx.rect(startPoint.x, startPoint.y, w, h);
        if (w < 0) { ctx.fillStyle = 'rgba(34, 197, 94, 0.2)'; ctx.strokeStyle = 'rgba(34, 197, 94, 1)'; ctx.setLineDash([5, 5]); }
        else { ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; ctx.strokeStyle = 'rgba(59, 130, 246, 1)'; ctx.setLineDash([]); }
        ctx.lineWidth = 1; ctx.fill(); ctx.stroke(); ctx.restore();
    }

    // 6. Arc Draft (Click 1 - Click 2)
    if (uiStore.activeTool === 'arc' && arcPoints) {
        const ws = arcPoints.start;
        const we = arcPoints.end;
        ctx.beginPath(); ctx.moveTo(ws.x, ws.y); ctx.lineTo(we.x, we.y);
        ctx.strokeStyle = '#9ca3af'; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    }

  }, [uiStore, dataStore, polylinePoints, isDragging, isMiddlePanning, isSelectionBox, startPoint, currentPoint, snapMarker, lineStart, measureStart, transformationBase, activeHandle, arcPoints]);

  useEffect(() => {
      render();
  }, [render]);

  let cursorClass = DEFAULT_CURSOR;
  if (isMiddlePanning || (isDragging && uiStore.activeTool === 'pan')) cursorClass = GRABBING_CURSOR;
  else if (uiStore.activeTool === 'pan') cursorClass = GRAB_CURSOR;
  else if (['line', 'polyline', 'rect', 'circle', 'polygon', 'arc', 'measure', 'arrow'].includes(uiStore.activeTool)) cursorClass = 'crosshair';

  return (
    <>
    <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 z-10"
        style={{ cursor: cursorClass }}
        onMouseDown={handlers.onMouseDown}
        onMouseMove={handlers.onMouseMove}
        onMouseUp={handlers.onMouseUp}
        onDoubleClick={handlers.onDoubleClick}
        onWheel={handlers.onWheel}
        onContextMenu={(e) => e.preventDefault()}
    />

    {showRadiusModal && arcPoints && (
        <RadiusInputModal
            initialRadius={getDistance(arcPoints.start, arcPoints.end)}
            position={radiusModalPos}
            onConfirm={(radius) => {
                const n: Shape = {
                    id: Date.now().toString(),
                    layerId: dataStore.activeLayerId,
                    type: 'arc',
                    points: [arcPoints.start, arcPoints.end],
                    radius: radius,
                    strokeColor: uiStore.strokeColor,
                    strokeWidth: uiStore.strokeWidth,
                    strokeEnabled: uiStore.strokeEnabled,
                    fillColor: 'transparent',
                    colorMode: getDefaultColorMode()
                };
                dataStore.addShape(n);
                setters.setArcPoints(null);
                setters.setShowRadiusModal(false);
                uiStore.setSidebarTab('desenho');
                uiStore.setTool('select');
            }}
            onCancel={() => {
                setters.setArcPoints(null);
                setters.setShowRadiusModal(false);
                uiStore.setTool('select');
            }}
        />
    )}
    
    {textEditState && (
      <TextEditorOverlay
        textEditState={textEditState}
        setTextEditState={setters.setTextEditState}
        viewTransform={uiStore.viewTransform}
      />
    )}
    </>
  );
};

export default DynamicOverlay;
