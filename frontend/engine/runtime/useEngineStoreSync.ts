import { useEffect } from 'react';
import type { Shape } from '@/types';
import { useDataStore } from '@/stores/useDataStore';
import { CommandOp, type EngineCommand } from './commandBuffer';
import { getEngineRuntime } from './singleton';

type SupportedShapeType = 'rect' | 'line' | 'polyline' | 'arrow' | 'eletroduto';

const isSupportedShape = (s: Shape): s is Shape & { type: SupportedShapeType } => {
  return (
    (s.type === 'rect' && !s.svgSymbolId && !s.svgRaw) ||
    s.type === 'line' ||
    s.type === 'polyline' ||
    s.type === 'arrow' ||
    s.type === 'eletroduto'
  );
};

const toUpsertCommand = (shape: Shape, ensureId: (id: string) => number): EngineCommand | null => {
  if (!isSupportedShape(shape)) return null;
  const id = ensureId(shape.id);

  if (shape.type === 'rect') {
    if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return null;
    return { op: CommandOp.UpsertRect, id, rect: { x: shape.x, y: shape.y, w: shape.width, h: shape.height } };
  }

  if (shape.type === 'line' || shape.type === 'arrow') {
    const p0 = shape.points?.[0];
    const p1 = shape.points?.[1];
    if (!p0 || !p1) return null;
    return { op: CommandOp.UpsertLine, id, line: { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y } };
  }

  // Conduits are rendered in WASM from nodes + endpoints; do not mirror as generic polylines.
  if (shape.type === 'eletroduto') {
    if (!shape.fromNodeId || !shape.toNodeId) return null;
    const fromNodeId = ensureId(shape.fromNodeId);
    const toNodeId = ensureId(shape.toNodeId);
    return { op: CommandOp.UpsertConduit, id, conduit: { fromNodeId, toNodeId } };
  }

  const points = shape.points;
  if (!points || points.length < 2) return null;
  return { op: CommandOp.UpsertPolyline, id, polyline: { points } };
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
      const initialShapes = Object.keys(initialState.shapes)
        .sort((a, b) => a.localeCompare(b))
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

      for (const s of initialShapes) {
        const cmd = toUpsertCommand(s, ensureId);
        if (cmd) initialCommands.push(cmd);
      }
      runtime.apply(initialCommands);

      unsubscribe = useDataStore.subscribe((state, prev) => {
        const commands: EngineCommand[] = [];

        const nextShapes = state.shapes;
        const prevShapes = prev.shapes;
        const nextNodes = state.connectionNodes;
        const prevNodes = prev.connectionNodes;

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
        for (const id of Object.keys(nextShapes).sort((a, b) => a.localeCompare(b))) {
          const nextShape = nextShapes[id]!;
          const prevShape = prevShapes[id];
          if (prevShape === nextShape) continue;

          // Symbols are not rendered as rects by WASM, but they need to exist for anchored node resolution.
          const symCmd = toUpsertSymbolCommand(nextShape, ensureId);
          if (symCmd) commands.push(symCmd);

          const cmd = toUpsertCommand(nextShape, ensureId);
          if (cmd) {
            commands.push(cmd);
          } else {
            // If the shape became unsupported/invalid, remove it from the engine mirror.
            const eid = runtime.ids.maps.idStringToHash.get(id);
            if (eid !== undefined) commands.push({ op: CommandOp.DeleteEntity, id: eid });
          }
        }

        if (commands.length) runtime.apply(commands);
      });
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
};
