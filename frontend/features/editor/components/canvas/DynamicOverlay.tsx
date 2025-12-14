import React, { useRef, useEffect, useCallback } from 'react';
import { useDataStore } from '../../../../stores/useDataStore';
import { useUIStore } from '../../../../stores/useUIStore';
import { useSettingsStore } from '../../../../stores/useSettingsStore';
import { Shape } from '../../../../types';
import { screenToWorld, getDistance, rotatePoint, constrainToSquare, getShapeBoundingBox, getShapeCenter } from '../../../../utils/geometry';
import { CURSOR_SVG } from '../assets/cursors';
import RadiusInputModal from '../RadiusInputModal';
import { useCanvasInteraction } from '../../interaction/useCanvasInteraction';
import { drawGhostShape } from './renderers/GhostRenderer';
import { drawSelectionHighlight, drawHandles } from './renderers/SelectionRenderer';
import TextEditorOverlay from './overlays/TextEditorOverlay';
import { getDefaultColorMode } from '../../../../utils/shapeColors';
import NumberSpinner from '../../../../components/NumberSpinner';
import { useLibraryStore } from '../../../../stores/useLibraryStore';
import { getElectricalLayerConfig } from '../../../library/electricalProperties';
import CalibrationModal from '../../components/CalibrationModal';
import { isShapeInteractable } from '../../../../utils/visibility';

const DEFAULT_CURSOR = `url('data:image/svg+xml;base64,${btoa(CURSOR_SVG)}') 6 4, default`;
const GRAB_CURSOR = 'grab';
const GRABBING_CURSOR = 'grabbing';
const ROTATE_SVG = `<svg width="19.2" height="19.2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.51018 14.9907C4.15862 16.831 5.38765 18.4108 7.01208 19.492C8.63652 20.5732 10.5684 21.0972 12.5165 20.9851C14.4647 20.873 16.3237 20.1308 17.8133 18.8704C19.303 17.61 20.3426 15.8996 20.7756 13.997C21.2086 12.0944 21.0115 10.1026 20.214 8.32177C19.4165 6.54091 18.0617 5.06746 16.3539 4.12343C14.6461 3.17941 12.6777 2.81593 10.7454 3.08779C7.48292 3.54676 5.32746 5.91142 3 8M3 8V2M3 8H9" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(ROTATE_SVG)}") 10 10, crosshair`;

interface DynamicOverlayProps {
  width: number;
  height: number;
}

const DynamicOverlay: React.FC<DynamicOverlayProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiStore = useUIStore();
  const settingsStore = useSettingsStore();
  const { strokeWidth, strokeColor, strokeEnabled, fillColor, polygonSides } = settingsStore.toolDefaults;
  const dataStore = useDataStore();
  const libraryStore = useLibraryStore();

  const { handlers, state, setters } = useCanvasInteraction(canvasRef);
  const {
    isDragging, isMiddlePanning, startPoint, currentPoint, isSelectionBox, snapMarker,
    polylinePoints, measureStart, lineStart, arrowStart, activeHandle, transformationBase,
    arcPoints, showRadiusModal, radiusModalPos, textEditState,
    showPolygonModal, polygonModalPos, isShiftPressed, hoverCursor,
    calibrationPoints, showCalibrationModal
  } = state;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Safety check for canvas dimensions
    if (width === 0 || height === 0 || width > 32767 || height > 32767) {
        return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(uiStore.viewTransform.x, uiStore.viewTransform.y);
    ctx.scale(uiStore.viewTransform.scale, -uiStore.viewTransform.scale);

    // 1. Draw Selection Highlights & Handles
    uiStore.selectedShapeIds.forEach(id => {
        const shape = dataStore.shapes[id];
        if (shape) {
            try {
                drawSelectionHighlight(ctx, shape, uiStore.viewTransform);
                if (uiStore.activeTool === 'select' && isShapeInteractable(shape, { activeFloorId: uiStore.activeFloorId, activeDiscipline: uiStore.activeDiscipline })) {
                    drawHandles(ctx, shape, uiStore.viewTransform);
                }
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
                const supportsCenteredRotation = (ghost.type === 'rect' || ghost.type === 'text' || ghost.type === 'circle' || ghost.type === 'polygon');
                if (supportsCenteredRotation) {
                    const bounds = getShapeBoundingBox(ghost);
                    const center = getShapeCenter(ghost);
                    const newCenter = rotatePoint(center, transformationBase, angle);
                    if (ghost.type === 'circle' || ghost.type === 'polygon') {
                        ghost.x = newCenter.x; ghost.y = newCenter.y;
                    } else {
                        ghost.x = newCenter.x - bounds.width / 2;
                        ghost.y = newCenter.y - bounds.height / 2;
                    }
                    ghost.rotation = (ghost.rotation || 0) + angle;
                } else if (ghost.x !== undefined && ghost.y !== undefined) {
                    const np = rotatePoint({x: ghost.x, y: ghost.y}, transformationBase, angle); ghost.x = np.x; ghost.y = np.y;
                }
            }
            drawGhostShape(ctx, ghost, uiStore.viewTransform);
        });
    }

    if (uiStore.activeTool === 'electrical-symbol' && currentPoint) {
        const symbolId = uiStore.activeElectricalSymbolId;
        const librarySymbol = symbolId ? libraryStore.electricalSymbols[symbolId] : null;
        if (librarySymbol) {
            const layerConfig = getElectricalLayerConfig(librarySymbol.id, librarySymbol.category);
            const existingLayer = dataStore.layers.find(l => l.name.toLowerCase() === layerConfig.name.toLowerCase());
            const layerColor = existingLayer?.strokeColor ?? layerConfig.strokeColor;
            const center = snapMarker ? snapMarker : screenToWorld(currentPoint, uiStore.viewTransform);
            const width = librarySymbol.viewBox.width * librarySymbol.scale;
            const height = librarySymbol.viewBox.height * librarySymbol.scale;
            const ghost: Shape = {
                id: 'ghost-symbol',
                layerId: existingLayer?.id ?? dataStore.activeLayerId,
                type: 'rect',
                x: center.x - width / 2,
                y: center.y - height / 2,
                width,
                height,
                strokeColor: layerColor,
                strokeWidth,
                strokeEnabled: false,
                fillColor,
                colorMode: getDefaultColorMode(),
                points: [],
                rotation: uiStore.electricalRotation,
                scaleX: uiStore.electricalFlipX,
                scaleY: uiStore.electricalFlipY,
                svgSymbolId: librarySymbol.id,
                svgRaw: librarySymbol.canvasSvg,
                svgViewBox: librarySymbol.viewBox,
                symbolScale: librarySymbol.scale,
            };
            drawGhostShape(ctx, ghost, uiStore.viewTransform);
        }
    }

    // 3. Draw Creation Drafts
    if (uiStore.activeTool === 'polyline' && polylinePoints.length > 0) {
      ctx.beginPath(); ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = (strokeWidth || 2) / uiStore.viewTransform.scale;
      ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y); for(let p of polylinePoints) ctx.lineTo(p.x, p.y);
      if (currentPoint) { const wm = screenToWorld(currentPoint, uiStore.viewTransform); ctx.lineTo(wm.x, wm.y); } ctx.stroke();
    }

    // Highlight connection points for electrical symbols when drawing lines/polylines/eletrodutos
    if (['line', 'polyline', 'arrow', 'eletroduto', 'conduit'].includes(uiStore.activeTool) && currentPoint) {
        const wm = screenToWorld(currentPoint, uiStore.viewTransform);
        const threshold = 20 / uiStore.viewTransform.scale;
        
        Object.values(dataStore.shapes).forEach(shape => {
            if (shape.svgRaw && shape.connectionPoint && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
                const connX = shape.x + shape.connectionPoint.x * shape.width;
                const connY = shape.y + shape.connectionPoint.y * shape.height;
                const dist = Math.sqrt((wm.x - connX) ** 2 + (wm.y - connY) ** 2);
                
                // Draw connection point with larger highlight if cursor is near
                ctx.beginPath();
                const radius = dist < threshold ? 6 / uiStore.viewTransform.scale : 4 / uiStore.viewTransform.scale;
                ctx.arc(connX, connY, radius, 0, Math.PI * 2);
                ctx.fillStyle = dist < threshold ? '#3b82f6' : 'rgba(59, 130, 246, 0.5)';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5 / uiStore.viewTransform.scale;
                ctx.stroke();
            }
        });
    }

    if ((uiStore.activeTool === 'line' && lineStart) || (uiStore.activeTool === 'measure' && measureStart) || (uiStore.activeTool === 'arrow' && arrowStart)) {
        const start = uiStore.activeTool === 'line' ? lineStart 
            : uiStore.activeTool === 'arrow' ? arrowStart 
            : measureStart;
        if (start && currentPoint) {
            const wm = screenToWorld(currentPoint, uiStore.viewTransform);
            ctx.beginPath(); 
            ctx.strokeStyle = uiStore.activeTool === 'measure' ? '#ef4444' : strokeColor;
            ctx.lineWidth = (strokeWidth || 2) / uiStore.viewTransform.scale;
            ctx.moveTo(start.x, start.y); ctx.lineTo(wm.x, wm.y); ctx.stroke();
            
            // Draw arrow head preview for arrow tool
            if (uiStore.activeTool === 'arrow') {
                const headSize = 15 / uiStore.viewTransform.scale;
                const angle = Math.atan2(wm.y - start.y, wm.x - start.x);
                ctx.beginPath();
                ctx.moveTo(wm.x, wm.y);
                ctx.lineTo(
                    wm.x - headSize * Math.cos(angle - Math.PI / 6),
                    wm.y - headSize * Math.sin(angle - Math.PI / 6)
                );
                ctx.moveTo(wm.x, wm.y);
                ctx.lineTo(
                    wm.x - headSize * Math.cos(angle + Math.PI / 6),
                    wm.y - headSize * Math.sin(angle + Math.PI / 6)
                );
                ctx.stroke();
            }
        }
    }

    // Draw Calibration Draft
    if (uiStore.activeTool === 'calibrate') {
        const start = calibrationPoints?.start || startPoint ? screenToWorld(startPoint!, uiStore.viewTransform) : null;
        const end = calibrationPoints?.end || (currentPoint ? screenToWorld(currentPoint, uiStore.viewTransform) : null);

        if (start && end) {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = '#ef4444'; // Red for calibration
            ctx.lineWidth = 2 / uiStore.viewTransform.scale;
            ctx.setLineDash([5 / uiStore.viewTransform.scale, 5 / uiStore.viewTransform.scale]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw Markers
            const markerSize = 6 / uiStore.viewTransform.scale;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(start.x - markerSize/2, start.y - markerSize/2, markerSize, markerSize);
            ctx.fillRect(end.x - markerSize/2, end.y - markerSize/2, markerSize, markerSize);

            // Draw Label
            const dist = getDistance(start, end);
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            
            ctx.save();
            ctx.font = `bold ${14 / uiStore.viewTransform.scale}px sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Background box
            const labelText = `${dist.toFixed(1)} px`;
            const metrics = ctx.measureText(labelText);
            const padding = 4 / uiStore.viewTransform.scale;
            ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'; // Red background
            ctx.fillRect(
                midX - metrics.width / 2 - padding, 
                midY - 10 / uiStore.viewTransform.scale, 
                metrics.width + padding * 2, 
                20 / uiStore.viewTransform.scale
            );
            
            // Text (unflipped)
            ctx.translate(midX, midY);
            ctx.scale(1, -1);
            ctx.fillStyle = '#fff';
            ctx.fillText(labelText, 0, 0);
            ctx.restore();
        }
    }

    if (isDragging && startPoint && currentPoint && !activeHandle && !isMiddlePanning && !isSelectionBox && !['select','pan','polyline','line','measure', 'move', 'rotate', 'arrow', 'calibrate'].includes(uiStore.activeTool)) {
      const ws = screenToWorld(startPoint, uiStore.viewTransform);
      let wc = screenToWorld(currentPoint, uiStore.viewTransform);
      
      // Apply Shift constraint for proportional shapes (Figma-style)
      // rect -> square, ellipse uses equal radii, polygon uses equal dimensions
      if (isShiftPressed && (uiStore.activeTool === 'rect')) {
        wc = constrainToSquare(ws, wc);
      }
      
      const temp: Shape = { id: 'temp', layerId: dataStore.activeLayerId, type: uiStore.activeTool, strokeColor, strokeWidth, strokeEnabled, fillColor, points: [] };
      
      if (uiStore.activeTool === 'arc') {
          ctx.beginPath(); ctx.moveTo(ws.x, ws.y); ctx.lineTo(wc.x, wc.y);
          ctx.strokeStyle = strokeColor; ctx.stroke();
      }
      else if (uiStore.activeTool === 'circle') { 
        // Circle already maintains 1:1 ratio by using radius
        temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); 
      }
      else if (uiStore.activeTool === 'rect') { 
        temp.x = Math.min(ws.x, wc.x); 
        temp.y = Math.min(ws.y, wc.y); 
        temp.width = Math.abs(wc.x - ws.x); 
        temp.height = Math.abs(wc.y - ws.y); 
      }
      else if (uiStore.activeTool === 'polygon') { 
        // Polygon already maintains 1:1 ratio by using radius
        temp.x = ws.x; temp.y = ws.y; temp.radius = getDistance(ws, wc); temp.sides = polygonSides; 
      }
      drawGhostShape(ctx, temp, uiStore.viewTransform);
    }

    // 4. Snap Marker
    if (snapMarker) {
        const ws = snapMarker;
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

  }, [uiStore, dataStore, libraryStore, polylinePoints, isDragging, isMiddlePanning, isSelectionBox, startPoint, currentPoint, snapMarker, lineStart, arrowStart, measureStart, transformationBase, activeHandle, arcPoints, isShiftPressed, strokeColor, strokeWidth, strokeEnabled, fillColor, polygonSides, calibrationPoints]); // Added calibrationPoints

  useEffect(() => {
      render();
  }, [render]);

  let cursorClass = DEFAULT_CURSOR;
  if (isMiddlePanning || (isDragging && uiStore.activeTool === 'pan')) cursorClass = GRABBING_CURSOR;
  else if (uiStore.activeTool === 'pan') cursorClass = GRAB_CURSOR;
  else if (hoverCursor === 'rotate') cursorClass = ROTATE_CURSOR;
  else if (hoverCursor) cursorClass = hoverCursor;
  else if (['line', 'polyline', 'rect', 'circle', 'polygon', 'arc', 'measure', 'arrow', 'electrical-symbol', 'eletroduto', 'conduit', 'calibrate'].includes(uiStore.activeTool)) cursorClass = 'crosshair';

  return (
    <>
    <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute top-0 left-0 z-10"
        style={{ cursor: cursorClass, background: 'transparent' }}
        onMouseDown={handlers.onMouseDown}
        onMouseMove={handlers.onMouseMove}
        onMouseUp={handlers.onMouseUp}
        onDoubleClick={handlers.onDoubleClick}
        onWheel={handlers.onWheel}
        onContextMenu={(e) => e.preventDefault()}
    />

    {showCalibrationModal && calibrationPoints && (
        <CalibrationModal
            isOpen={showCalibrationModal}
            currentDistancePx={getDistance(calibrationPoints.start, calibrationPoints.end)}
            onConfirm={setters.confirmCalibration}
            onCancel={() => setters.setShowCalibrationModal(false)}
        />
    )}

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
                    strokeColor,
                    strokeWidth,
                    strokeEnabled,
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

    {showPolygonModal && (
      <div
        className="fixed bg-slate-900 border border-slate-600 p-2 rounded-lg shadow-xl z-50 flex items-center gap-2"
        style={{ left: polygonModalPos.x, top: polygonModalPos.y }}
      >
        <span className="text-[10px] text-slate-300 uppercase font-bold">Lados</span>
        <NumberSpinner
          value={polygonSides}
          onChange={(val) => {
            settingsStore.setPolygonSides(val);
            setters.confirmPolygonSides(val);
          }}
          min={3}
          max={12}
          className="w-14 h-7 bg-slate-800"
        />
        <button
          onClick={() => setters.confirmPolygonSides(polygonSides)}
          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-medium"
        >
          OK
        </button>
      </div>
    )}
    </>
  );
};

export default DynamicOverlay;
