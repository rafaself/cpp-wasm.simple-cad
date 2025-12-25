import { useEffect } from 'react';
import type { Layer, Shape } from '@/types';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import { CommandOp, type EngineCommand } from './commandBuffer';
import { getEngineRuntime } from './singleton';
import { hexToRgb } from '@/utils/color';
import { getEffectiveFillColor, getEffectiveStrokeColor, getShapeColorMode, isFillEffectivelyEnabled, isStrokeEffectivelyEnabled } from '@/utils/shapeColors';
import { deleteTextByShapeId, moveTextByShapeId, getAllTextShapeIds } from './textEngineSync';
import { ensureId, getEngineId } from './IdRegistry';

export type StableIdCache = {
  lastRef: Record<string, unknown> | null;
  lastKeys: string[];
  lastKeySet: Set<string>;
};

export const createStableIdCache = (): StableIdCache => ({
  lastRef: null,
  lastKeys: [],
  lastKeySet: new Set<string>(),
});

export const getCachedSortedKeys = (obj: Record<string, unknown>, cache: StableIdCache): string[] => {
  if (obj === cache.lastRef) return cache.lastKeys;

  const keys = Object.keys(obj);
  const sameCardinality = keys.length === cache.lastKeySet.size;
  const sameKeys = sameCardinality && keys.every((k) => cache.lastKeySet.has(k));
  if (sameKeys) {
    cache.lastRef = obj;
    return cache.lastKeys;
  }

  const sorted = [...keys].sort((a, b) => a.localeCompare(b));
  cache.lastRef = obj;
  cache.lastKeys = sorted;
  cache.lastKeySet = new Set(sorted);
  return sorted;
};

type SyncDebugSample = {
  timestampMs: number;
  durationMs: number;
  commandCount: number;
  commandOps: Partial<Record<CommandOp, number>>;
};

type SyncDebugState = {
  applyCount: number;
  totalDurationMs: number;
  totalCommands: number;
  lastDurationMs: number;
  lastCommandCount: number;
  lastCommandOps: Partial<Record<CommandOp, number>>;
  history: SyncDebugSample[];
};

const nowMs = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const getDebugSyncState = (): SyncDebugState | null => {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { __debugEngineSync?: SyncDebugState };
  if (!w.__debugEngineSync) {
    w.__debugEngineSync = {
      applyCount: 0,
      totalDurationMs: 0,
      totalCommands: 0,
      lastDurationMs: 0,
      lastCommandCount: 0,
      lastCommandOps: {},
      history: [],
    };
  }
  return w.__debugEngineSync;
};

const recordSyncMetrics = (commands: readonly EngineCommand[], durationMs: number): void => {
  const debug = getDebugSyncState();
  if (!debug) return;

  const ops: Partial<Record<CommandOp, number>> = {};
  for (const cmd of commands) {
    ops[cmd.op] = (ops[cmd.op] ?? 0) + 1;
  }

  debug.applyCount += 1;
  debug.totalDurationMs += durationMs;
  debug.totalCommands += commands.length;
  debug.lastDurationMs = durationMs;
  debug.lastCommandCount = commands.length;
  debug.lastCommandOps = ops;
  debug.history.push({
    timestampMs: Date.now(),
    durationMs,
    commandCount: commands.length,
    commandOps: ops,
  });
  if (debug.history.length > 50) debug.history.shift();
};

type SupportedShapeType = 'rect' | 'line' | 'polyline' | 'eletroduto' | 'circle' | 'polygon' | 'arrow';

const isSupportedShape = (s: Shape): s is Shape & { type: SupportedShapeType } => {
  return (
    (s.type === 'rect' && !s.svgSymbolId && !s.svgRaw) ||
    s.type === 'line' ||
    s.type === 'polyline' ||
    s.type === 'eletroduto' ||
    s.type === 'circle' ||
    s.type === 'polygon' ||
    s.type === 'arrow'
  );
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const clampStrokeWidthPx = (w: number | undefined): number => {
  const n = w ?? 1;
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(100, Math.round(n)));
};

const rgb01 = (hex: string): { r: number; g: number; b: number } => {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  return { r: rgb.r / 255.0, g: rgb.g / 255.0, b: rgb.b / 255.0 };
};

export const shapeToEngineCommand = (shape: Shape, layer: Layer | null, ensureId: (id: string) => number): EngineCommand | null => {
  if (!isSupportedShape(shape)) return null;
  const id = ensureId(shape.id);

  const strokeEnabledEff = isStrokeEffectivelyEnabled(shape, layer);
  const strokeHex = getEffectiveStrokeColor(shape, layer);
  const strokeRgb = rgb01(strokeHex);
  const strokeOpacity = clamp01((shape.strokeOpacity ?? 100) / 100);
  const strokeEnabled = strokeEnabledEff ? 1.0 : 0.0;
  const strokeWidthPx = clampStrokeWidthPx(shape.strokeWidth);

  if (shape.type === 'rect') {
    if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return null;
    const fillEnabledEff = isFillEffectivelyEnabled(shape, layer);
    const fillHex = getEffectiveFillColor(shape, layer);
    const fillRgb = rgb01(fillHex);
    const fillOpacity = clamp01((shape.fillOpacity ?? 100) / 100);
    const fillA = fillEnabledEff && fillHex !== 'transparent' ? fillOpacity : 0.0;

    return {
      op: CommandOp.UpsertRect,
      id,
      rect: {
        x: shape.x,
        y: shape.y,
        w: shape.width,
        h: shape.height,
        fillR: fillRgb.r,
        fillG: fillRgb.g,
        fillB: fillRgb.b,
        fillA,
        strokeR: strokeRgb.r,
        strokeG: strokeRgb.g,
        strokeB: strokeRgb.b,
        strokeA: strokeOpacity,
        strokeEnabled,
        strokeWidthPx,
      },
    };
  }

  if (shape.type === 'line') {
    const p0 = shape.points?.[0];
    const p1 = shape.points?.[1];
    if (!p0 || !p1) return null;
    return {
      op: CommandOp.UpsertLine,
      id,
      line: { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, r: strokeRgb.r, g: strokeRgb.g, b: strokeRgb.b, a: strokeOpacity, enabled: strokeEnabled, strokeWidthPx },
    };
  }

  if (shape.type === 'eletroduto') {
    if (!shape.fromNodeId || !shape.toNodeId) return null;
    const fromNodeId = ensureId(shape.fromNodeId);
    const toNodeId = ensureId(shape.toNodeId);
    return { op: CommandOp.UpsertConduit, id, conduit: { fromNodeId, toNodeId, r: strokeRgb.r, g: strokeRgb.g, b: strokeRgb.b, a: strokeOpacity, enabled: strokeEnabled, strokeWidthPx } };
  }

  if (shape.type === 'polyline') {
    const points = shape.points ?? [];
    if (points.length < 2) return null;
    return { op: CommandOp.UpsertPolyline, id, polyline: { points, r: strokeRgb.r, g: strokeRgb.g, b: strokeRgb.b, a: strokeOpacity, enabled: strokeEnabled, strokeWidthPx } };
  }

  if (shape.type === 'circle') {
    if (shape.x === undefined || shape.y === undefined) return null;
    const w = shape.width ?? (shape.radius ?? 50) * 2;
    const h = shape.height ?? (shape.radius ?? 50) * 2;
    const rx = w / 2;
    const ry = h / 2;
    const rot = shape.rotation ?? 0;
    const sx = shape.scaleX ?? 1;
    const sy = shape.scaleY ?? 1;

    const fillEnabledEff = isFillEffectivelyEnabled(shape, layer);
    const fillHex = getEffectiveFillColor(shape, layer);
    const fillRgb = rgb01(fillHex);
    const fillOpacity = clamp01((shape.fillOpacity ?? 100) / 100);
    const fillA = fillEnabledEff && fillHex !== 'transparent' ? fillOpacity : 0.0;

    return {
      op: CommandOp.UpsertCircle,
      id,
      circle: {
        cx: shape.x,
        cy: shape.y,
        rx,
        ry,
        rot,
        sx,
        sy,
        fillR: fillRgb.r,
        fillG: fillRgb.g,
        fillB: fillRgb.b,
        fillA,
        strokeR: strokeRgb.r,
        strokeG: strokeRgb.g,
        strokeB: strokeRgb.b,
        strokeA: strokeOpacity,
        strokeEnabled,
        strokeWidthPx,
      },
    };
  }

  if (shape.type === 'polygon') {
    if (shape.x === undefined || shape.y === undefined) return null;
    const w = shape.width ?? (shape.radius ?? 50) * 2;
    const h = shape.height ?? (shape.radius ?? 50) * 2;
    const rx = w / 2;
    const ry = h / 2;
    const rot = shape.rotation ?? 0;
    const sx = shape.scaleX ?? 1;
    const sy = shape.scaleY ?? 1;
    const sides = Math.max(3, Math.floor(shape.sides ?? 6));

    const fillEnabledEff = isFillEffectivelyEnabled(shape, layer);
    const fillHex = getEffectiveFillColor(shape, layer);
    const fillRgb = rgb01(fillHex);
    const fillOpacity = clamp01((shape.fillOpacity ?? 100) / 100);
    const fillA = fillEnabledEff && fillHex !== 'transparent' ? fillOpacity : 0.0;

    return {
      op: CommandOp.UpsertPolygon,
      id,
      polygon: {
        cx: shape.x,
        cy: shape.y,
        rx,
        ry,
        rot,
        sx,
        sy,
        sides,
        fillR: fillRgb.r,
        fillG: fillRgb.g,
        fillB: fillRgb.b,
        fillA,
        strokeR: strokeRgb.r,
        strokeG: strokeRgb.g,
        strokeB: strokeRgb.b,
        strokeA: strokeOpacity,
        strokeEnabled,
        strokeWidthPx,
      },
    };
  }

  // Arrow: shaft thickness is screen-space (strokeWidthPx), head is in world units (as authored in shape.arrowHeadSize).
  const p0 = shape.points?.[0];
  const p1 = shape.points?.[1];
  if (!p0 || !p1) return null;
  const head = Math.max(2, shape.arrowHeadSize ?? 10);
  return {
    op: CommandOp.UpsertArrow,
    id,
    arrow: {
      ax: p0.x,
      ay: p0.y,
      bx: p1.x,
      by: p1.y,
      head,
      strokeR: strokeRgb.r,
      strokeG: strokeRgb.g,
      strokeB: strokeRgb.b,
      strokeA: strokeOpacity,
      strokeEnabled,
      strokeWidthPx,
    },
  };
};

export const computeChangedLayerIds = (prevLayers: readonly Layer[], nextLayers: readonly Layer[]): Set<string> => {
  const changedLayerIds = new Set<string>();
  if (nextLayers === prevLayers) return changedLayerIds;

  const prevById = new Map(prevLayers.map((l) => [l.id, l]));
  for (const l of nextLayers) {
    const prevL = prevById.get(l.id);
    if (!prevL) continue;
    if (l.strokeColor !== prevL.strokeColor || l.fillColor !== prevL.fillColor || l.strokeEnabled !== prevL.strokeEnabled || l.fillEnabled !== prevL.fillEnabled) {
      changedLayerIds.add(l.id);
    }
  }
  return changedLayerIds;
};

export const computeLayerDrivenReupsertCommands = (
  shapes: Readonly<Record<string, Shape>>,
  visibleShapeIds: ReadonlySet<string>,
  layers: readonly Layer[],
  changedLayerIds: ReadonlySet<string>,
  ensureId: (id: string) => number,
  orderedShapeIds?: readonly string[],
): EngineCommand[] => {
  if (changedLayerIds.size === 0) return [];

  const layersById = new Map(layers.map((l) => [l.id, l]));
  const out: EngineCommand[] = [];

  const ids = orderedShapeIds ?? Object.keys(shapes).sort((a, b) => a.localeCompare(b));
  for (const id of ids) {
    if (!visibleShapeIds.has(id)) continue;
    const s = shapes[id]!;
    if (!changedLayerIds.has(s.layerId)) continue;
    if (!isSupportedShape(s)) continue;

    const mode = getShapeColorMode(s);
    const dependsOnLayerFill = (s.type === 'rect' || s.type === 'circle' || s.type === 'polygon') && mode.fill === 'layer';
    const dependsOnLayerStroke = mode.stroke === 'layer';
    if (!dependsOnLayerFill && !dependsOnLayerStroke) continue;

    const layer = layersById.get(s.layerId) ?? null;
    const cmd = shapeToEngineCommand(s, layer, ensureId);
    if (cmd) out.push(cmd);
  }

  return out;
};

const toUpsertSymbolCommand = (shape: Shape, ensureId: (id: string) => number): EngineCommand | null => {
  if (shape.type !== 'rect') return null;
  if (!shape.svgSymbolId) return null;
  if (!shape.connectionPoint) return null;
  if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return null;

  const id = ensureId(shape.id);
  const symbolKey = ensureId(`sym:${shape.svgSymbolId}`);
  const rotation = shape.rotation ?? 0;
  const scaleX = shape.scaleX ?? 1;
  const scaleY = shape.scaleY ?? 1;

  return {
    op: CommandOp.UpsertSymbol,
    id,
    symbol: { symbolKey, x: shape.x, y: shape.y, w: shape.width, h: shape.height, rotation, scaleX, scaleY, connX: shape.connectionPoint.x, connY: shape.connectionPoint.y },
  };
};

const buildVisibleOrder = (
  state: ReturnType<typeof useDataStore.getState>,
  ui: Pick<ReturnType<typeof useUIStore.getState>, 'activeFloorId' | 'activeDiscipline'>,
  shapeIdCache: StableIdCache,
): { orderedIds: string[]; idSet: Set<string> } => {
  const layerById = new Map(state.layers.map((l) => [l.id, l]));
  const orderedIds: string[] = [];
  const idSet = new Set<string>();

  const consider = (id: string) => {
    const s = state.shapes[id];
    if (!s) return;
    if (!isSupportedShape(s)) return;
    if (s.floorId && ui.activeFloorId && s.floorId !== ui.activeFloorId) return;
    if (s.discipline && ui.activeDiscipline && s.discipline !== ui.activeDiscipline) return;
    const layer = layerById.get(s.layerId);
    if (layer && !layer.visible) return;
    if (idSet.has(id)) return;
    idSet.add(id);
    orderedIds.push(id);
  };

  for (const id of state.shapeOrder ?? []) consider(id);
  const sortedShapeIds = getCachedSortedKeys(state.shapes as Record<string, unknown>, shapeIdCache);
  for (const id of sortedShapeIds) consider(id);

  return { orderedIds, idSet };
};

export const useEngineStoreSync = (): void => {
  useEffect(() => {
    let unsubscribeData: (() => void) | null = null;
    let unsubscribeUi: (() => void) | null = null;
    let disposed = false;

    (async () => {
      const runtime = await getEngineRuntime();
      if (disposed) return;

      // REMOVED: const ensureId = runtime.ids.ensureIdForString;
      // Now imported from IdRegistry

      let lastData = useDataStore.getState();
      let lastUi = useUIStore.getState();
      let lastVisibleIds = new Set<string>();
      let lastDrawOrderKey = '';
      let lastScale = lastUi.viewTransform.scale || 1;
      const shapeIdCache = createStableIdCache();
      const connectionNodeCache = createStableIdCache();
      const prevConnectionNodeCache = createStableIdCache();

      const applySync = (nextData: typeof lastData, nextUi: typeof lastUi, prevData: typeof lastData, prevUi: typeof lastUi) => {
        const startedAt = nowMs();
        const commands: EngineCommand[] = [];

        const nextScale = nextUi.viewTransform.scale || 1;
        const scaleChanged = nextScale !== lastScale;
        if (scaleChanged) {
          commands.push({ op: CommandOp.SetViewScale, view: { scale: nextScale } });
          lastScale = nextScale;
        }

        const visibilityFilterChanged = nextUi.activeFloorId !== prevUi.activeFloorId || nextUi.activeDiscipline !== prevUi.activeDiscipline;
        const shapesRefChanged = nextData.shapes !== prevData.shapes;
        const layerStyleChanged = nextData.layers !== prevData.layers;
        const dirtyIds = nextData.dirtyShapeIds;

        // Critical Optimization: Skip sync if nothing relevant changed.
        // If clearDirtyShapeIds was called, nextData != prevData (because of dirtyShapeIds prop),
        // but if shapes, layers, and visibility are same, we should do nothing.
        // Unless dirtyIds has items (which means we haven't processed them yet).

        if (!shapesRefChanged && !visibilityFilterChanged && !layerStyleChanged && dirtyIds.size === 0) {
          if (commands.length) runtime.apply(commands);
          const durationMs = nowMs() - startedAt;
          recordSyncMetrics(commands, durationMs);
          return;
        }

        const { orderedIds: nextOrderedIds, idSet: nextVisibleSet } = buildVisibleOrder(
          nextData,
          { activeFloorId: nextUi.activeFloorId, activeDiscipline: nextUi.activeDiscipline },
          shapeIdCache,
        );

        // Deletes when shapes disappear or become invisible.
        for (const id of lastVisibleIds) {
          if (nextVisibleSet.has(id)) continue;
          const eid = getEngineId(id);
          if (eid !== null) commands.push({ op: CommandOp.DeleteEntity, id: eid });
        }

        // Sync text entities: delete texts whose shapes were deleted
        const trackedTextShapeIds = getAllTextShapeIds();
        for (const shapeId of trackedTextShapeIds) {
          if (!nextData.shapes[shapeId]) {
            // Shape was deleted - delete from engine
            deleteTextByShapeId(shapeId);
          }
        }

        // Sync text position changes
        for (const shapeId of trackedTextShapeIds) {
          const nextShape = nextData.shapes[shapeId];
          const prevShape = prevData.shapes[shapeId];
          if (!nextShape || !prevShape) continue;
          if (nextShape.type !== 'text') continue;
          
          // Check if position changed
          const posChanged = nextShape.x !== prevShape.x || nextShape.y !== prevShape.y;
          if (posChanged) {
            // Calculate anchor position (top-left in Y-Up world)
            const anchorX = nextShape.x ?? 0;
            const anchorY = (nextShape.y ?? 0) + (nextShape.height ?? 0);
            moveTextByShapeId(shapeId, anchorX, anchorY);
          }
        }

        const layersById = new Map(nextData.layers.map((l) => [l.id, l]));

        // Adds + updates for visible shapes.
        // OPTIMIZATION: Use dirtyShapeIds if available to skip checking ALL shapes.

        // If dirtyIds has items, we assume we only need to check those (plus visibility changes).
        // If dirtyIds is empty BUT shapesRefChanged is true, it means we missed capturing dirty IDs (e.g. initial load, or some other op), so we must full scan.
        // Logic: Full scan if (visibility changed OR (shapes changed AND dirty empty)).

        const isFullScanRequired = visibilityFilterChanged || (shapesRefChanged && dirtyIds.size === 0);

        const idsToCheck = isFullScanRequired ? nextOrderedIds : Array.from(dirtyIds);

        for (const id of idsToCheck) {
          // If using dirtyIds, we must check visibility again because a shape might be dirty but invisible.
          if (!nextVisibleSet.has(id)) continue;

          const nextShape = nextData.shapes[id]!;
          const prevShape = prevData.shapes[id];

          // Optimization: identity check if we are doing full scan (if explicit dirty, we assume changed)
          if (isFullScanRequired && prevShape === nextShape && lastVisibleIds.has(id)) continue;

          const layer = layersById.get(nextShape.layerId) ?? null;
          const cmd = shapeToEngineCommand(nextShape, layer, ensureId);
          if (cmd) {
            commands.push(cmd);
          } else {
            const eid = getEngineId(id);
            if (eid !== null) commands.push({ op: CommandOp.DeleteEntity, id: eid });
          }
        }

        // Layer style changes: re-upsert affected visible shapes even if the shape object did not change.
        if (layerStyleChanged) {
            const changedLayerIds = computeChangedLayerIds(prevData.layers, nextData.layers);
            commands.push(...computeLayerDrivenReupsertCommands(nextData.shapes, nextVisibleSet, nextData.layers, changedLayerIds, ensureId, nextOrderedIds));
        }

        // Nodes: deletes then adds/updates (conduits depend on them).
        const prevNodeIds = getCachedSortedKeys(prevData.connectionNodes as Record<string, unknown>, prevConnectionNodeCache);
        for (const prevNodeId of prevNodeIds) {
          if (nextData.connectionNodes[prevNodeId]) continue;
          const eid = getEngineId(prevNodeId);
          if (eid !== null) commands.push({ op: CommandOp.DeleteEntity, id: eid });
        }
        const nextNodeIds = getCachedSortedKeys(nextData.connectionNodes as Record<string, unknown>, connectionNodeCache);
        for (const id of nextNodeIds) {
          const nextNode = nextData.connectionNodes[id]!;
          const prevNode = prevData.connectionNodes[id];
          if (prevNode === nextNode) continue;
          const eid = ensureId(id);
          if (nextNode.kind === 'anchored' && nextNode.anchorShapeId) {
            const anchorSymbolId = ensureId(nextNode.anchorShapeId);
            commands.push({ op: CommandOp.UpsertNode, id: eid, node: { kind: 1, anchorSymbolId, x: 0, y: 0 } });
          } else {
            const x = nextNode.position?.x ?? 0;
            const y = nextNode.position?.y ?? 0;
            commands.push({ op: CommandOp.UpsertNode, id: eid, node: { kind: 0, anchorSymbolId: 0, x, y } });
          }
        }

        // Symbols (used by anchored nodes).
        // Optimization: Use dirty IDs for symbols too? Assuming symbol creation/update is tied to shape update.
        const shapeIdsForSymbols = isFullScanRequired ? getCachedSortedKeys(nextData.shapes as Record<string, unknown>, shapeIdCache) : Array.from(dirtyIds);
        for (const id of shapeIdsForSymbols) {
          const nextShape = nextData.shapes[id];
          if (!nextShape) continue; // Deleted
          const prevShape = prevData.shapes[id];
          if (isFullScanRequired && prevShape === nextShape) continue;

          const symCmd = toUpsertSymbolCommand(nextShape, ensureId);
          if (symCmd) commands.push(symCmd);
        }

        // Draw order (visible shapes only).
        // This is always O(N) but just an array mapping.
        const drawOrderIds = nextOrderedIds.map((id) => ensureId(id));
        const drawOrderKey = drawOrderIds.join(',');
        if (drawOrderKey !== lastDrawOrderKey) {
          commands.push({ op: CommandOp.SetDrawOrder, order: { ids: drawOrderIds } });
          lastDrawOrderKey = drawOrderKey;
        }

        if (commands.length) runtime.apply(commands);

        // Clear dirty flags after sync
        if (dirtyIds.size > 0 && nextData.clearDirtyShapeIds) {
            nextData.clearDirtyShapeIds();
        }

        const durationMs = nowMs() - startedAt;
        recordSyncMetrics(commands, durationMs);
        lastVisibleIds = nextVisibleSet;
      };

      // Initial full sync.
      {
        const initStartedAt = nowMs();
        const initCommands: EngineCommand[] = [{ op: CommandOp.ClearAll }];
        initCommands.push({ op: CommandOp.SetViewScale, view: { scale: lastScale } });

        const { orderedIds } = buildVisibleOrder(
          lastData,
          { activeFloorId: lastUi.activeFloorId, activeDiscipline: lastUi.activeDiscipline },
          shapeIdCache,
        );
        const drawOrderIds = orderedIds.map((id) => ensureId(id));
        initCommands.push({ op: CommandOp.SetDrawOrder, order: { ids: drawOrderIds } });

        const layersById = new Map(lastData.layers.map((l) => [l.id, l]));
        for (const nodeId of Object.keys(lastData.connectionNodes).sort((a, b) => a.localeCompare(b))) {
          const n = lastData.connectionNodes[nodeId]!;
          const id = ensureId(n.id);
          if (n.kind === 'anchored' && n.anchorShapeId) {
            const anchorSymbolId = ensureId(n.anchorShapeId);
            initCommands.push({ op: CommandOp.UpsertNode, id, node: { kind: 1, anchorSymbolId, x: 0, y: 0 } });
          } else {
            const x = n.position?.x ?? 0;
            const y = n.position?.y ?? 0;
            initCommands.push({ op: CommandOp.UpsertNode, id, node: { kind: 0, anchorSymbolId: 0, x, y } });
          }
        }
        for (const s of Object.values(lastData.shapes)) {
          if (!s) continue;
          const symCmd = toUpsertSymbolCommand(s, ensureId);
          if (symCmd) initCommands.push(symCmd);
        }
        for (const id of orderedIds) {
          const s = lastData.shapes[id]!;
          const layer = layersById.get(s.layerId) ?? null;
          const cmd = shapeToEngineCommand(s, layer, ensureId);
          if (cmd) initCommands.push(cmd);
        }

        runtime.apply(initCommands);
        recordSyncMetrics(initCommands, nowMs() - initStartedAt);
        lastVisibleIds = new Set(orderedIds);
        lastDrawOrderKey = drawOrderIds.join(',');
      }

      unsubscribeData = useDataStore.subscribe((next, prev) => {
        lastData = next;
        applySync(next, lastUi, prev, lastUi);
      });

      unsubscribeUi = useUIStore.subscribe((nextUi) => {
        const prevUi = lastUi;
        lastUi = nextUi;
        applySync(lastData, nextUi, lastData, prevUi);
      });
    })();

    return () => {
      disposed = true;
      unsubscribeData?.();
      unsubscribeUi?.();
    };
  }, []);
};
