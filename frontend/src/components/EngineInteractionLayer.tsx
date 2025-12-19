import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ElectricalElement } from '@/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDataStore } from '@/stores/useDataStore';
import { screenToWorld, getDistance, getShapeBoundingBox, isPointInShape } from '@/utils/geometry';
import { calculateZoomTransform } from '@/utils/zoomHelper';
import { CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX, HIT_TOLERANCE } from '@/config/constants';
import { generateId } from '@/utils/uuid';
import type { Shape } from '@/types';
import { getDefaultColorMode } from '@/utils/shapeColors';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { getConnectionPoint } from '@/features/editor/snapEngine/detectors';
import { resolveConnectionNodePosition } from '@/utils/connections';
import { getDefaultMetadataForSymbol, getElectricalLayerConfig } from '@/features/library/electricalProperties';
import type { Patch } from '@/types';
import { isConduitShape } from '@/features/editor/utils/tools';
import TextEditorOverlay, { type TextEditState } from './TextEditorOverlay';
import { isShapeInteractable } from '@/utils/visibility';

type Draft =
  | { kind: 'none' }
  | { kind: 'line'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'rect'; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: 'polyline'; points: { x: number; y: number }[]; current: { x: number; y: number } | null }
  | { kind: 'conduit'; start: { x: number; y: number }; current: { x: number; y: number } };

const toWorldPoint = (
  evt: React.PointerEvent<HTMLDivElement>,
  viewTransform: ReturnType<typeof useUIStore.getState>['viewTransform'],
): { x: number; y: number } => {
  const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
  const screen = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  return screenToWorld(screen, viewTransform);
};

const worldToScreen = (
  world: { x: number; y: number },
  viewTransform: ReturnType<typeof useUIStore.getState>['viewTransform'],
): { x: number; y: number } => {
  return {
    x: world.x * viewTransform.scale + viewTransform.x,
    y: viewTransform.y - world.y * viewTransform.scale,
  };
};

const pointSegmentDistance = (
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(p.x - b.x, p.y - b.y);
  const t = c1 / c2;
  const projX = a.x + t * vx;
  const projY = a.y + t * vy;
  return Math.hypot(p.x - projX, p.y - projY);
};

const pickShapeAt = (
  worldPoint: { x: number; y: number },
  toleranceWorld: number,
): string | null => {
  const data = useDataStore.getState();
  const ui = useUIStore.getState();

  const queryRect = {
    x: worldPoint.x - toleranceWorld,
    y: worldPoint.y - toleranceWorld,
    width: toleranceWorld * 2,
    height: toleranceWorld * 2,
  };

  const candidates = data.spatialIndex
    .query(queryRect)
    .map((c) => data.shapes[c.id])
    .filter(Boolean) as Shape[];

  for (const shape of candidates) {
    const layer = data.layers.find((l) => l.id === shape.layerId);
    if (layer && (!layer.visible || layer.locked)) continue;
    if (!isShapeInteractable(shape, { activeFloorId: ui.activeFloorId ?? 'terreo', activeDiscipline: ui.activeDiscipline })) continue;
    if (isPointInShape(worldPoint, shape, ui.viewTransform.scale || 1, layer)) return shape.id;
  }

  return null;
};

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

const normalizeRect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const snapToGrid = (p: { x: number; y: number }, gridSize: number): { x: number; y: number } => {
  if (!gridSize || gridSize <= 0) return p;
  return { x: Math.round(p.x / gridSize) * gridSize, y: Math.round(p.y / gridSize) * gridSize };
};

const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > 2;

const getCursorForTool = (tool: ReturnType<typeof useUIStore.getState>['activeTool']): string => {
  if (tool === 'pan') return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'move' || tool === 'rotate') return 'default';
  return 'crosshair';
};

type ConduitStart = { nodeId: string; point: { x: number; y: number } };
type MoveState = { start: { x: number; y: number }; snapshot: Map<string, Shape> };

const EngineInteractionLayer: React.FC = () => {
  const viewTransform = useUIStore((s) => s.viewTransform);
  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const activeTool = useUIStore((s) => s.activeTool);
  const activeElectricalSymbolId = useUIStore((s) => s.activeElectricalSymbolId);
  const electricalRotation = useUIStore((s) => s.electricalRotation);
  const electricalFlipX = useUIStore((s) => s.electricalFlipX);
  const electricalFlipY = useUIStore((s) => s.electricalFlipY);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const setSelectedShapeIds = useUIStore((s) => s.setSelectedShapeIds);
  const canvasSize = useUIStore((s) => s.canvasSize);

  const toolDefaults = useSettingsStore((s) => s.toolDefaults);
  const snapOptions = useSettingsStore((s) => s.snap);
  const gridSize = useSettingsStore((s) => s.grid.size);

  const pointerDownRef = useRef<{ x: number; y: number; world: { x: number; y: number } } | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformStartRef = useRef<{ x: number; y: number; scale: number } | null>(null);

  const [draft, setDraft] = useState<Draft>({ kind: 'none' });
  const [conduitStart, setConduitStart] = useState<ConduitStart | null>(null);
  const moveRef = useRef<MoveState | null>(null);
  const [textEditState, setTextEditState] = useState<TextEditState | null>(null);

  const cursor = useMemo(() => getCursorForTool(activeTool), [activeTool]);

  const handleWheel = (evt: React.WheelEvent<HTMLDivElement>) => {
    evt.preventDefault();
    const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mouse = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    setViewTransform((prev) => calculateZoomTransform(prev, mouse, evt.deltaY, screenToWorld));
  };

  const beginPan = (evt: React.PointerEvent<HTMLDivElement>) => {
    isPanningRef.current = true;
    panStartRef.current = { x: evt.clientX, y: evt.clientY };
    transformStartRef.current = { ...viewTransform };
  };

  const updatePan = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current || !transformStartRef.current) return;
    const dx = evt.clientX - panStartRef.current.x;
    const dy = evt.clientY - panStartRef.current.y;
    setViewTransform({
      x: transformStartRef.current.x + dx,
      y: transformStartRef.current.y + dy,
      scale: transformStartRef.current.scale,
    });
  };

  const endPan = () => {
    isPanningRef.current = false;
    transformStartRef.current = null;
  };

  const tryFindAnchoredNode = (world: { x: number; y: number }): { nodeId: string; point: { x: number; y: number } } | null => {
    const data = useDataStore.getState();
    const ui = useUIStore.getState();
    const scale = Math.max(ui.viewTransform.scale || 1, 0.01);
    const tolerance = CONDUIT_CONNECTION_ANCHOR_TOLERANCE_PX / scale;

    const queryRect = { x: world.x - tolerance, y: world.y - tolerance, width: tolerance * 2, height: tolerance * 2 };
    const candidates = data.spatialIndex.query(queryRect).map((c) => data.shapes[c.id]).filter(Boolean) as Shape[];

    for (const shape of candidates) {
      const layer = data.layers.find((l) => l.id === shape.layerId);
      if (layer && (!layer.visible || layer.locked)) continue;

      const connPt = getConnectionPoint(shape);
      if (!connPt) continue;

      const nearConnection = getDistance(connPt, world) <= tolerance;
      const bbox = getShapeBoundingBox(shape);
      const insideBBox =
        !!bbox &&
        world.x >= bbox.x - tolerance &&
        world.x <= bbox.x + bbox.width + tolerance &&
        world.y >= bbox.y - tolerance &&
        world.y <= bbox.y + bbox.height + tolerance;

      if (nearConnection || insideBBox) {
        const nodeId = data.getOrCreateAnchoredConnectionNode(shape.id);
        return { nodeId, point: connPt };
      }
    }

    for (const node of Object.values(data.connectionNodes)) {
      const pos = resolveConnectionNodePosition(node, data.shapes);
      if (!pos) continue;
      if (getDistance(pos, world) <= tolerance) return { nodeId: node.id, point: pos };
    }

    return null;
  };

  const commitElectricalSymbolAt = (world: { x: number; y: number }) => {
    if (!activeElectricalSymbolId) return;
    const library = useLibraryStore.getState();
    const data = useDataStore.getState();

    const symbol = library.electricalSymbols[activeElectricalSymbolId];
    if (!symbol) return;

    const layerConfig = getElectricalLayerConfig(symbol.id, symbol.category);
    const targetLayerId = data.ensureLayer(layerConfig.name, {
      strokeColor: layerConfig.strokeColor,
      fillColor: layerConfig.fillColor ?? '#ffffff',
      fillEnabled: layerConfig.fillEnabled ?? false,
      strokeEnabled: true,
      isNative: true,
    });

    const width = symbol.viewBox.width * symbol.scale;
    const height = symbol.viewBox.height * symbol.scale;
    const shapeId = generateId();

    const shape: Shape = {
      id: shapeId,
      layerId: targetLayerId,
      type: 'rect',
      x: clampTiny(world.x - width / 2),
      y: clampTiny(world.y - height / 2),
      width: clampTiny(width),
      height: clampTiny(height),
      strokeColor: layerConfig.strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled: false,
      fillColor: 'transparent',
      fillEnabled: false,
      colorMode: getDefaultColorMode(),
      points: [],
      rotation: electricalRotation,
      scaleX: electricalFlipX,
      scaleY: electricalFlipY,
      svgSymbolId: symbol.id,
      svgRaw: symbol.canvasSvg,
      svgViewBox: symbol.viewBox,
      symbolScale: symbol.scale,
      connectionPoint: symbol.defaultConnectionPoint,
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    const metadata = getDefaultMetadataForSymbol(symbol.id);
    const electricalElement: ElectricalElement = {
      id: `el-${shapeId}`,
      shapeId,
      category: symbol.category,
      name: symbol.id,
      metadata,
    };

    data.addShape(shape, electricalElement);
    setSelectedShapeIds(new Set([shapeId]));
  };

  const commitConduitSegmentTo = (end: { x: number; y: number }) => {
    const start = conduitStart;
    if (!start) return;

    const data = useDataStore.getState();
    const endHit = tryFindAnchoredNode(end);
    const endNodeId = endHit ? endHit.nodeId : data.createFreeConnectionNode(end);

    if (endNodeId === start.nodeId) {
      setConduitStart(null);
      setDraft({ kind: 'none' });
      return;
    }

    const layer = data.layers.find((l) => l.id === 'eletrodutos') ?? data.layers.find((l) => l.id === data.activeLayerId) ?? data.layers[0];
    const layerId = layer?.id ?? data.activeLayerId;
    const strokeColor = layer?.strokeColor ?? toolDefaults.strokeColor;

    const conduitId = data.addConduitBetweenNodes({ fromNodeId: start.nodeId, toNodeId: endNodeId, layerId, strokeColor });
    setSelectedShapeIds(new Set([conduitId]));
    setConduitStart(null);
    setDraft({ kind: 'none' });
  };

  const commitLine = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (Math.hypot(dx, dy) < 1e-3) return;

    const id = generateId();
    const layerId = useDataStore.getState().activeLayerId;

    const s: Shape = {
      id,
      layerId,
      type: 'line',
      points: [
        { x: clampTiny(start.x), y: clampTiny(start.y) },
        { x: clampTiny(end.x), y: clampTiny(end.y) },
      ],
      strokeColor: toolDefaults.strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled: toolDefaults.strokeEnabled,
      fillColor: toolDefaults.fillColor,
      fillEnabled: false,
      colorMode: toolDefaults.colorMode,
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    useDataStore.getState().addShape(s);
    setSelectedShapeIds(new Set([id]));
  };

  const commitRect = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const r = normalizeRect(start, end);
    if (r.w < 1e-3 || r.h < 1e-3) return;

    const id = generateId();
    const layerId = useDataStore.getState().activeLayerId;

    const s: Shape = {
      id,
      layerId,
      type: 'rect',
      points: [],
      x: clampTiny(r.x),
      y: clampTiny(r.y),
      width: clampTiny(r.w),
      height: clampTiny(r.h),
      strokeColor: toolDefaults.strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled: toolDefaults.strokeEnabled,
      fillColor: toolDefaults.fillColor,
      fillEnabled: toolDefaults.fillEnabled,
      colorMode: toolDefaults.colorMode,
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    useDataStore.getState().addShape(s);
    setSelectedShapeIds(new Set([id]));
  };

  const commitPolyline = (points: { x: number; y: number }[]) => {
    if (points.length < 2) return;

    const id = generateId();
    const layerId = useDataStore.getState().activeLayerId;
    const s: Shape = {
      id,
      layerId,
      type: 'polyline',
      points: points.map((p) => ({ x: clampTiny(p.x), y: clampTiny(p.y) })),
      strokeColor: toolDefaults.strokeColor,
      strokeWidth: toolDefaults.strokeWidth,
      strokeEnabled: toolDefaults.strokeEnabled,
      fillColor: toolDefaults.fillColor,
      fillEnabled: false,
      colorMode: toolDefaults.colorMode,
      floorId: activeFloorId,
      discipline: activeDiscipline,
    };

    useDataStore.getState().addShape(s);
    setSelectedShapeIds(new Set([id]));
  };

  const handlePointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
    (evt.currentTarget as HTMLDivElement).setPointerCapture(evt.pointerId);

    if (textEditState) return;

    if (evt.button === 1 || evt.button === 2 || evt.altKey || activeTool === 'pan') {
      beginPan(evt);
      return;
    }

    if (evt.button !== 0) return;

    const world = toWorldPoint(evt, viewTransform);
    const snapped = snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world;

    pointerDownRef.current = { x: evt.clientX, y: evt.clientY, world: snapped };

    if (activeTool === 'text') {
      // Click establishes the visual top; TextEditorOverlay converts to bottom-left on commit.
      setTextEditState({ x: snapped.x, y: snapped.y, content: '' });
      useUIStore.getState().setEditingTextId(null);
      return;
    }

    if (activeTool === 'move') {
      const data = useDataStore.getState();
      const selected = Array.from(selectedShapeIds)
        .map((id) => data.shapes[id])
        .filter(Boolean) as Shape[];

      const movable = selected.filter((s) => {
        const layer = data.layers.find((l) => l.id === s.layerId);
        if (layer?.locked) return false;
        if (isConduitShape(s)) return false; // avoid breaking anchored connection semantics for now
        return true;
      });

      if (movable.length === 0) return;
      moveRef.current = { start: snapped, snapshot: new Map(movable.map((s) => [s.id, s])) };
      return;
    }

    if (activeTool === 'electrical-symbol') {
      commitElectricalSymbolAt(snapped);
      return;
    }

    if (activeTool === 'eletroduto' || activeTool === 'conduit') {
      if (!conduitStart) {
        const startHit = tryFindAnchoredNode(snapped);
        const startNodeId = startHit ? startHit.nodeId : useDataStore.getState().createFreeConnectionNode(snapped);
        const startPoint = startHit ? startHit.point : snapped;
        setConduitStart({ nodeId: startNodeId, point: startPoint });
        setDraft({ kind: 'conduit', start: startPoint, current: startPoint });
        return;
      }

      commitConduitSegmentTo(snapped);
      return;
    }

    if (activeTool === 'line') {
      setDraft({ kind: 'line', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'rect') {
      setDraft({ kind: 'rect', start: snapped, current: snapped });
      return;
    }

    if (activeTool === 'polyline') {
      setDraft((prev) => {
        if (prev.kind !== 'polyline') return { kind: 'polyline', points: [snapped], current: snapped };
        return { kind: 'polyline', points: [...prev.points, snapped], current: snapped };
      });
      return;
    }
  };

  const handlePointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      updatePan(evt);
      return;
    }

    if (textEditState) return;

    const world = toWorldPoint(evt, viewTransform);
    const snapped = snapOptions.enabled && snapOptions.grid ? snapToGrid(world, gridSize) : world;

    if (activeTool === 'move') {
      const moveState = moveRef.current;
      if (moveState) {
        const data = useDataStore.getState();
        const dx = snapped.x - moveState.start.x;
        const dy = snapped.y - moveState.start.y;
        moveState.snapshot.forEach((shape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;

          const diff: Partial<Shape> = {};
          if (shape.x !== undefined) diff.x = clampTiny(shape.x + dx);
          if (shape.y !== undefined) diff.y = clampTiny(shape.y + dy);
          if (shape.points) diff.points = shape.points.map((p) => ({ x: clampTiny(p.x + dx), y: clampTiny(p.y + dy) }));

          if (Object.keys(diff).length) data.updateShape(id, diff, false);
        });
      }
      return;
    }

    setDraft((prev) => {
      if (prev.kind === 'line') return { ...prev, current: snapped };
      if (prev.kind === 'rect') return { ...prev, current: snapped };
      if (prev.kind === 'polyline') return { ...prev, current: snapped };
      if (prev.kind === 'conduit') return { ...prev, current: snapped };
      return prev;
    });
  };

  const handlePointerUp = (evt: React.PointerEvent<HTMLDivElement>) => {
    if (isPanningRef.current) {
      endPan();
      return;
    }

    if (evt.button !== 0) return;

    if (textEditState) return;

    if (activeTool === 'move') {
      const moveState = moveRef.current;
      moveRef.current = null;
      if (moveState) {
        const data = useDataStore.getState();
        const patches: Patch[] = [];
        moveState.snapshot.forEach((prevShape, id) => {
          const curr = data.shapes[id];
          if (!curr) return;
          const diff: Partial<Shape> = {};
          if (prevShape.x !== curr.x) diff.x = curr.x;
          if (prevShape.y !== curr.y) diff.y = curr.y;
          if (prevShape.points || curr.points) diff.points = curr.points;
          if (Object.keys(diff).length === 0) return;
          patches.push({ type: 'UPDATE', id, diff, prev: prevShape });
        });
        data.saveToHistory(patches);
      }
      return;
    }

    const down = pointerDownRef.current;
    pointerDownRef.current = null;

    if (activeTool === 'select') {
      if (!down) return;
      const dx = evt.clientX - down.x;
      const dy = evt.clientY - down.y;
      if (isDrag(dx, dy)) return;

      const worldPt = down.world;
      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const hit = pickShapeAt(worldPt, tolerance);
      setSelectedShapeIds(hit ? new Set([hit]) : new Set());
      return;
    }

    if (activeTool === 'line') {
      setDraft((prev) => {
        if (prev.kind !== 'line') return { kind: 'none' };
        commitLine(prev.start, prev.current);
        return { kind: 'none' };
      });
      return;
    }

    if (activeTool === 'rect') {
      setDraft((prev) => {
        if (prev.kind !== 'rect') return { kind: 'none' };
        commitRect(prev.start, prev.current);
        return { kind: 'none' };
      });
      return;
    }
  };

  const handleDoubleClick = (evt: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'polyline') return;
    evt.preventDefault();

    setDraft((prev) => {
      if (prev.kind !== 'polyline') return { kind: 'none' };
      const pts = prev.current ? [...prev.points, prev.current] : prev.points;
      commitPolyline(pts);
      return { kind: 'none' };
    });
  };

  const draftSvg = useMemo(() => {
    if (draft.kind === 'none') return null;
    if (canvasSize.width <= 0 || canvasSize.height <= 0) return null;

    const stroke = toolDefaults.strokeColor || '#22c55e';
    // SVG is rendered in screen space, so keep stroke width in pixels (do not scale with zoom).
    const strokeWidth = Math.max(1, toolDefaults.strokeWidth ?? 2);

    if (draft.kind === 'line') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'rect') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <rect x={x} y={y} width={w} height={h} fill="transparent" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    if (draft.kind === 'conduit') {
      const a = worldToScreen(draft.start, viewTransform);
      const b = worldToScreen(draft.current, viewTransform);
      return (
        <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
        </svg>
      );
    }

    const pts = draft.points;
    const pathPts = [...pts, ...(draft.current ? [draft.current] : [])].map((p) => worldToScreen(p, viewTransform));
    const d = pathPts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(' ');
    return (
      <svg width={canvasSize.width} height={canvasSize.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} opacity={0.9} />
      </svg>
    );
  }, [canvasSize.height, canvasSize.width, draft, toolDefaults.strokeColor, toolDefaults.strokeWidth, viewTransform]);

  // Important: this is the only interactive layer above the WebGL canvas.
  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 20, touchAction: 'none', cursor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {draftSvg}
      {textEditState ? (
        <TextEditorOverlay textEditState={textEditState} setTextEditState={setTextEditState} viewTransform={viewTransform} />
      ) : null}
    </div>
  );
};

export default EngineInteractionLayer;
