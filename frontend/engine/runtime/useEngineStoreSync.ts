import { useEffect } from 'react';
import type { Shape } from '@/types';
import { useDataStore } from '@/stores/useDataStore';
import { CommandOp, type EngineCommand } from './commandBuffer';
import { getEngineRuntime } from './singleton';

type SupportedShapeType = 'rect' | 'line' | 'polyline' | 'arrow' | 'eletroduto' | 'conduit';

const isSupportedShape = (s: Shape): s is Shape & { type: SupportedShapeType } => {
  return (
    (s.type === 'rect' && !s.svgSymbolId && !s.svgRaw) ||
    s.type === 'line' ||
    s.type === 'polyline' ||
    s.type === 'arrow' ||
    s.type === 'eletroduto' ||
    s.type === 'conduit'
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

  const points = shape.points;
  if (!points || points.length < 2) return null;
  return { op: CommandOp.UpsertPolyline, id, polyline: { points } };
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
      const initialShapes = Object.values(useDataStore.getState().shapes);
      const initialCommands: EngineCommand[] = [{ op: CommandOp.ClearAll }];
      for (const s of initialShapes) {
        const cmd = toUpsertCommand(s, ensureId);
        if (cmd) initialCommands.push(cmd);
      }
      runtime.apply(initialCommands);

      unsubscribe = useDataStore.subscribe((state, prev) => {
        const commands: EngineCommand[] = [];

        const nextShapes = state.shapes;
        const prevShapes = prev.shapes;

        // Deletes
        for (const prevId of Object.keys(prevShapes)) {
          if (nextShapes[prevId]) continue;
          const eid = runtime.ids.maps.idStringToHash.get(prevId);
          if (eid === undefined) continue;
          commands.push({ op: CommandOp.DeleteEntity, id: eid });
        }

        // Adds + updates (reference inequality means immutable replacement)
        for (const [id, nextShape] of Object.entries(nextShapes)) {
          const prevShape = prevShapes[id];
          if (prevShape === nextShape) continue;
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
