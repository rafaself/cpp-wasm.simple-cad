import { useEffect } from 'react';
import type { Layer, Shape } from '@/types';
import { useDataStore } from '@/stores/useDataStore';
import { CommandOp, type EngineCommand } from './commandBuffer';
import { getEngineRuntime } from './singleton';
import { hexToRgb } from '@/utils/color';
import { getEffectiveFillColor, getEffectiveStrokeColor, getShapeColorMode, isFillEffectivelyEnabled, isStrokeEffectivelyEnabled } from '@/utils/shapeColors';

type SupportedShapeType = 'rect' | 'line' | 'polyline' | 'eletroduto';

export const isSupportedShape = (s: Shape): s is Shape & { type: SupportedShapeType } => {
  return (
    (s.type === 'rect' && !s.svgSymbolId && !s.svgRaw) ||
    s.type === 'line' ||
    s.type === 'polyline' ||
    s.type === 'eletroduto'
  );
};

export type LayerStyle = Pick<Layer, 'strokeColor' | 'strokeEnabled' | 'fillColor' | 'fillEnabled'>;

export const shapeToEngineCommand = (shape: Shape, layer: LayerStyle | null, ensureId: (id: string) => number, z: number): EngineCommand | null => {
  if (!isSupportedShape(shape)) return null;
  const id = ensureId(shape.id);

  const effectiveStrokeEnabled = isStrokeEffectivelyEnabled(shape, layer as any);
  const effectiveStrokeHex = getEffectiveStrokeColor(shape, layer as any);
  const strokeRgb = hexToRgb(effectiveStrokeHex) ?? { r: 0, g: 0, b: 0 };
  const strokeR = strokeRgb.r / 255.0;
  const strokeG = strokeRgb.g / 255.0;
  const strokeB = strokeRgb.b / 255.0;
  const strokeEnabled = effectiveStrokeEnabled ? 1.0 : 0.0;
  const strokeOpacity = Math.max(0, Math.min(100, shape.strokeOpacity ?? 100)) / 100;
  const strokeA = strokeOpacity;

  if (shape.type === 'rect') {
    if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return null;

    const effectiveFillEnabled = isFillEffectivelyEnabled(shape, layer as any);
    const effectiveFillHex = getEffectiveFillColor(shape, layer as any);
    const fillOpacity = Math.max(0, Math.min(100, shape.fillOpacity ?? 100)) / 100;

    let fillR = 0.0, fillG = 0.0, fillB = 0.0, fillA = 0.0;
    if (effectiveFillEnabled && effectiveFillHex && effectiveFillHex !== 'transparent') {
      const rgb = hexToRgb(effectiveFillHex);
      if (rgb) {
        fillR = rgb.r / 255.0;
        fillG = rgb.g / 255.0;
        fillB = rgb.b / 255.0;
        fillA = fillOpacity;
      }
    }

    return {
      op: CommandOp.UpsertRect,
      id,
      rect: {
        x: shape.x,
        y: shape.y,
        w: shape.width,
        h: shape.height,
        z,
        fillR,
        fillG,
        fillB,
        fillA,
        strokeR,
        strokeG,
        strokeB,
        strokeA,
        strokeEnabled,
      },
    };
  }

  if (shape.type === 'line') {
    const p0 = shape.points?.[0];
    const p1 = shape.points?.[1];
    if (!p0 || !p1) return null;
    return { op: CommandOp.UpsertLine, id, line: { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, z, r: strokeR, g: strokeG, b: strokeB, a: strokeA, enabled: strokeEnabled } };
  }

  // Conduits are rendered in WASM from nodes + endpoints; do not mirror as generic polylines.
  if (shape.type === 'eletroduto') {
    if (!shape.fromNodeId || !shape.toNodeId) return null;
    const fromNodeId = ensureId(shape.fromNodeId);
    const toNodeId = ensureId(shape.toNodeId);
    return { op: CommandOp.UpsertConduit, id, conduit: { fromNodeId, toNodeId, z, r: strokeR, g: strokeG, b: strokeB, a: strokeA, enabled: strokeEnabled } };
  }

  const points = shape.points;
  if (!points || points.length < 2) return null;
  return { op: CommandOp.UpsertPolyline, id, polyline: { points, z, r: strokeR, g: strokeG, b: strokeB, a: strokeA, enabled: strokeEnabled } };
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
      l.fillEnabled !== prevL.fillEnabled
    ) {
      changedLayerIds.add(l.id);
    }
  }
  return changedLayerIds;
};

export const computeLayerDrivenReupsertCommands = (
  shapes: Readonly<Record<string, Shape>>,
  layers: readonly Layer[],
  changedLayerIds: ReadonlySet<string>,
  ensureId: (id: string) => number,
): EngineCommand[] => {
  if (changedLayerIds.size === 0) return [];

  const layersById = new Map(layers.map((l) => [l.id, l]));
  const out: EngineCommand[] = [];

  const shapeIds = Object.keys(shapes);
  for (let i = 0; i < shapeIds.length; i++) {
    const id = shapeIds[i];
    const s = shapes[id]!;
    if (!changedLayerIds.has(s.layerId)) continue;
    if (!isSupportedShape(s)) continue;

    const mode = getShapeColorMode(s);
    const dependsOnLayer = mode.stroke === 'layer' || (s.type === 'rect' && mode.fill === 'layer');
    if (!dependsOnLayer) continue;

    const layer = layersById.get(s.layerId) ?? null;
    const z = (i + 1) / (shapeIds.length + 1);
    const cmd = shapeToEngineCommand(s, layer, ensureId, z);
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
    symbol: {
      symbolKey,
      x: shape.x,
      y: shape.y,
      w: shape.width,
      h: shape.height,
      rotation,
      scaleX,
      scaleY,
      connX: shape.connectionPoint.x,
      connY: shape.connectionPoint.y,
    },
  };
};

export const useEngineStoreSync = (): void => {
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let disposed = false;

    (async () => {
      const runtime = await getEngineRuntime();
      if (disposed) return;

      const ensureId = runtime.ids.ensureIdForString;

      // Initial full sync (batched) to guarantee deterministic engine state.
      const initialState = useDataStore.getState();
      const initialLayersById = new Map(initialState.layers.map((l) => [l.id, l]));
      const initialShapeIds = initialState.shapeOrder.length > 0
        ? initialState.shapeOrder
        : Object.keys(initialState.shapes).sort((a, b) => a.localeCompare(b));

      const initialShapes = initialShapeIds
        .map((id) => initialState.shapes[id])
        .filter(Boolean) as Shape[];
      const initialCommands: EngineCommand[] = [{ op: CommandOp.ClearAll }];

      // Connection nodes first (conduits depend on them).
      for (const nodeId of Object.keys(initialState.connectionNodes).sort((a, b) => a.localeCompare(b))) {
        const n = initialState.connectionNodes[nodeId]!;
        const id = ensureId(n.id);
        if (n.kind === 'anchored' && n.anchorShapeId) {
          const anchorSymbolId = ensureId(n.anchorShapeId);
          initialCommands.push({ op: CommandOp.UpsertNode, id, node: { kind: 1, anchorSymbolId, x: 0, y: 0 } });
        } else {
          const x = n.position?.x ?? 0;
          const y = n.position?.y ?? 0;
          initialCommands.push({ op: CommandOp.UpsertNode, id, node: { kind: 0, anchorSymbolId: 0, x, y } });
        }
      }

      // Symbols (used by anchored nodes).
      for (const s of initialShapes) {
        const cmd = toUpsertSymbolCommand(s, ensureId);
        if (cmd) initialCommands.push(cmd);
      }

      for (let i = 0; i < initialShapes.length; i++) {
        const s = initialShapes[i];
        const layer = initialLayersById.get(s.layerId) ?? null;
        const z = (i + 1) / (initialShapes.length + 1);
        const cmd = shapeToEngineCommand(s, layer, ensureId, z);
        if (cmd) initialCommands.push(cmd);
      }
      runtime.apply(initialCommands);

      unsubscribe = useDataStore.subscribe((state, prev) => {
        const commands: EngineCommand[] = [];

        const nextShapes = state.shapes;
        const prevShapes = prev.shapes;
        const nextNodes = state.connectionNodes;
        const prevNodes = prev.connectionNodes;
        const nextLayers = state.layers;
        const prevLayers = prev.layers;
        const layersById = new Map(nextLayers.map((l) => [l.id, l]));

        const changedLayerIds = computeChangedLayerIds(prevLayers, nextLayers);

        // Deletes
        for (const prevId of Object.keys(prevShapes).sort((a, b) => a.localeCompare(b))) {
          if (nextShapes[prevId]) continue;
          const eid = runtime.ids.maps.idStringToHash.get(prevId);
          if (eid === undefined) continue;
          commands.push({ op: CommandOp.DeleteEntity, id: eid });
        }

        for (const prevNodeId of Object.keys(prevNodes).sort((a, b) => a.localeCompare(b))) {
          if (nextNodes[prevNodeId]) continue;
          const eid = runtime.ids.maps.idStringToHash.get(prevNodeId);
          if (eid === undefined) continue;
          commands.push({ op: CommandOp.DeleteEntity, id: eid });
        }

        // Nodes: adds/updates
        for (const id of Object.keys(nextNodes).sort((a, b) => a.localeCompare(b))) {
          const nextNode = nextNodes[id]!;
          const prevNode = prevNodes[id];
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

        // Adds + updates (reference inequality means immutable replacement)
        // We re-sync all shapes if order might have changed, but for now just use the new Z from its position in shapeOrder
        const nextShapeIds = state.shapeOrder.length > 0 ? state.shapeOrder : Object.keys(nextShapes).sort((a, b) => a.localeCompare(b));

        for (let i = 0; i < nextShapeIds.length; i++) {
          const id = nextShapeIds[i];
          const nextShape = nextShapes[id];
          if (!nextShape) continue;
          const prevShape = prevShapes[id];

          // Re-upsert if shape changed OR if we are doing a full refresh (implied by changedLayerIds)
          const needsUpsert = nextShape !== prevShape || changedLayerIds.has(nextShape.layerId);
          if (!needsUpsert) continue;

          // Symbols are not rendered as rects by WASM, but they need to exist for anchored node resolution.
          const symCmd = toUpsertSymbolCommand(nextShape, ensureId);
          if (symCmd) commands.push(symCmd);

          const layer = layersById.get(nextShape.layerId) ?? null;
          const z = (i + 1) / (nextShapeIds.length + 1);
          const cmd = shapeToEngineCommand(nextShape, layer, ensureId, z);
          if (cmd) {
            commands.push(cmd);
          } else {
            // If the shape became unsupported/invalid, remove it from the engine mirror.
            const eid = runtime.ids.maps.idStringToHash.get(id);
            if (eid !== undefined) commands.push({ op: CommandOp.DeleteEntity, id: eid });
          }
        }

        // Layer style changes: re-upsert affected shapes even if the shape object did not change.
        commands.push(...computeLayerDrivenReupsertCommands(nextShapes, nextLayers, changedLayerIds, ensureId));

        if (commands.length) runtime.apply(commands);
      });
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
};
