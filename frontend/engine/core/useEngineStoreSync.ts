import { useEffect } from 'react';
import type { Layer, Shape } from '@/types';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';
import { CommandOp, type EngineCommand } from './commandBuffer';
import { getEngineRuntime } from './singleton';
import { hexToRgb } from '@/utils/color';
import { getEffectiveFillColor, getEffectiveStrokeColor, getShapeColorMode, isFillEffectivelyEnabled, isStrokeEffectivelyEnabled } from '@/utils/shapeColors';
import { deleteTextByShapeId, moveTextByShapeId, getTrackedTextShapeIds } from './textEngineSync';
import { ensureId, getEngineId, releaseId } from './IdRegistry';

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

type SupportedShapeType = 'rect' | 'line' | 'polyline' | 'circle' | 'polygon' | 'arrow';

const isSupportedShape = (s: Shape): s is Shape & { type: SupportedShapeType } => {
  return (
    (s.type === 'rect' && !s.svgSymbolId && !s.svgRaw) ||
    s.type === 'line' ||
    s.type === 'polyline' ||
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
    // Robust check: ensure values are present, default to 0 if missing (should not happen for valid shapes)
    const x = shape.x ?? 0;
    const y = shape.y ?? 0;
    const w = shape.width ?? 0;
    const h = shape.height ?? 0;

    // Only skip if width/height are effectively zero or invalid (NaN)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
         // Allow tiny rects if needed, but usually 0 size is invalid for engine picking
         if (w === 0 && h === 0) return null;
    }

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

  // Arrow
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
    if (
        l.strokeColor !== prevL.strokeColor ||
        l.fillColor !== prevL.fillColor ||
        l.strokeEnabled !== prevL.strokeEnabled ||
        l.fillEnabled !== prevL.fillEnabled ||
        l.locked !== prevL.locked
    ) {
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

    if (dependsOnLayerFill || dependsOnLayerStroke) {
        const layer = layersById.get(s.layerId) ?? null;
        const cmd = shapeToEngineCommand(s, layer, ensureId);
        if (cmd) out.push(cmd);
    }
  }

  return out;
};

const buildVisibleOrder = (
  state: ReturnType<typeof useDataStore.getState>,
  ui: Pick<ReturnType<typeof useUIStore.getState>, 'activeFloorId'>,
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

      let lastData = useDataStore.getState();
      let lastUi = useUIStore.getState();
      let lastVisibleIds = new Set<string>();
      let lastDrawOrderKey = '';
      let lastScale = lastUi.viewTransform.scale || 1;
      const shapeIdCache = createStableIdCache();

      const applySync = (nextData: typeof lastData, nextUi: typeof lastUi, prevData: typeof lastData, prevUi: typeof lastUi) => {
        // Prevent sync during active engine interaction to avoid fighting with the engine's local state
        if (runtime.isInteractionActive && runtime.isInteractionActive()) return;

        const startedAt = nowMs();
        const commands: EngineCommand[] = [];
        // P0-2: SetEntityFlags opcodes are not implemented in the engine; skip emitting to avoid UnknownCommand.

        const nextScale = nextUi.viewTransform.scale || 1;
        const scaleChanged = nextScale !== lastScale;
        if (scaleChanged) {
          commands.push({ op: CommandOp.SetViewScale, view: { scale: nextScale } });
          lastScale = nextScale;
        }

        const visibilityFilterChanged = nextUi.activeFloorId !== prevUi.activeFloorId;
        const shapesRefChanged = nextData.shapes !== prevData.shapes;
        const layerStyleChanged = nextData.layers !== prevData.layers;
        const dirtyIds = nextData.dirtyShapeIds;
        const shapeOrderChanged = nextData.shapeOrder !== prevData.shapeOrder;
        const hasNewShape = Array.from(dirtyIds).some((id) => !prevData.shapes[id]);
        const hasDeletedShape = Array.from(dirtyIds).some((id) => !!prevData.shapes[id] && !nextData.shapes[id]);
        const dirtyVisibilityChange = Array.from(dirtyIds).some((id) => {
          const prevShape = prevData.shapes[id];
          const nextShape = nextData.shapes[id];
          if (!prevShape || !nextShape) return false;
          return prevShape.floorId !== nextShape.floorId || prevShape.layerId !== nextShape.layerId;
        });

        if (!shapesRefChanged && !visibilityFilterChanged && !layerStyleChanged && dirtyIds.size === 0) {
          if (commands.length) runtime.apply(commands);
          const durationMs = nowMs() - startedAt;
          recordSyncMetrics(commands, durationMs);
          return;
        }

        let nextOrderedIds: string[] = [];
        let nextVisibleSet: Set<string>;

        const isFullScanRequired = visibilityFilterChanged || (shapesRefChanged && dirtyIds.size === 0);
        const reuseVisibleOrder = !visibilityFilterChanged && !layerStyleChanged && !shapeOrderChanged && !isFullScanRequired && !hasNewShape && !hasDeletedShape && !dirtyVisibilityChange;

        if (reuseVisibleOrder) {
          nextVisibleSet = new Set(lastVisibleIds);
          for (const id of dirtyIds) {
            if (!nextData.shapes[id]) {
              nextVisibleSet.delete(id);
            }
          }
        } else {
          const built = buildVisibleOrder(
            nextData,
            { activeFloorId: nextUi.activeFloorId },
            shapeIdCache,
          );
          nextOrderedIds = built.orderedIds;
          nextVisibleSet = built.idSet;
        }

        // Deletes when shapes disappear or become invisible.
        for (const id of lastVisibleIds) {
          if (nextVisibleSet.has(id)) continue;
          const eid = getEngineId(id);
          if (eid !== null) commands.push({ op: CommandOp.DeleteEntity, id: eid });
          if (!nextData.shapes[id]) {
            releaseId(id);
          }
        }

        // Sync text entities only when relevant to avoid O(N) scans during pointermove/typing.
        const trackedTextIds = getTrackedTextShapeIds();
        const shouldProcessText = isFullScanRequired || Array.from(dirtyIds).some((id) => trackedTextIds.has(id));
        if (shouldProcessText) {
          const textIdsToCheck = isFullScanRequired
            ? Array.from(trackedTextIds)
            : Array.from(dirtyIds).filter((id) => trackedTextIds.has(id));

          for (const shapeId of textIdsToCheck) {
            const nextShape = nextData.shapes[shapeId];
            const prevShape = prevData.shapes[shapeId];
            if (!nextShape) {
              deleteTextByShapeId(shapeId);
              continue;
            }
            if (!prevShape || nextShape.type !== 'text') continue;

            const posChanged = nextShape.x !== prevShape.x || nextShape.y !== prevShape.y;
            if (posChanged) {
              const anchorX = nextShape.x ?? 0;
              const anchorY = (nextShape.y ?? 0) + (nextShape.height ?? 0);
              moveTextByShapeId(shapeId, anchorX, anchorY);
            }
          }
        }

        const layersById = new Map(nextData.layers.map((l) => [l.id, l]));

        const idsToCheck = isFullScanRequired ? nextOrderedIds : Array.from(dirtyIds);

        for (const id of idsToCheck) {
          if (!nextVisibleSet.has(id)) continue;

          const nextShape = nextData.shapes[id]!;
          const prevShape = prevData.shapes[id];

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

        if (layerStyleChanged) {
            const changedLayerIds = computeChangedLayerIds(prevData.layers, nextData.layers);
            commands.push(...computeLayerDrivenReupsertCommands(nextData.shapes, nextVisibleSet, nextData.layers, changedLayerIds, ensureId, nextOrderedIds));
        }

        if (!reuseVisibleOrder) {
          const drawOrderIds = nextOrderedIds.map((id) => ensureId(id));
          const drawOrderKey = drawOrderIds.join(',');
          if (drawOrderKey !== lastDrawOrderKey) {
            commands.push({ op: CommandOp.SetDrawOrder, order: { ids: drawOrderIds } });
            lastDrawOrderKey = drawOrderKey;
          }
        }

        if (commands.length) runtime.apply(commands);

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
          { activeFloorId: lastUi.activeFloorId },
          shapeIdCache,
        );
        const drawOrderIds = orderedIds.map((id) => ensureId(id));
        initCommands.push({ op: CommandOp.SetDrawOrder, order: { ids: drawOrderIds } });

        const layersById = new Map(lastData.layers.map((l) => [l.id, l]));

        for (const id of orderedIds) {
          const s = lastData.shapes[id]!;
          const layer = layersById.get(s.layerId) ?? null;
          const cmd = shapeToEngineCommand(s, layer, ensureId);
          if (cmd) {
              initCommands.push(cmd);
          }
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
