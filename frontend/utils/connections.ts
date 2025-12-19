import { ConnectionNode, Point, Shape } from '../types';
import { getShapeBoundingBox } from './geometry';
import { generateId } from './uuid';

const isConduitShape = (shape: Shape) => shape.type === 'eletroduto';

const resolveShapeConnectionPoint = (shape: Shape): Point | null => {
  if (
    shape.svgRaw &&
    shape.connectionPoint &&
    shape.x !== undefined &&
    shape.y !== undefined &&
    shape.width !== undefined &&
    shape.height !== undefined
  ) {
    return {
      x: shape.x + shape.connectionPoint.x * shape.width,
      y: shape.y + shape.connectionPoint.y * shape.height,
    };
  }
  return null;
};

export const resolveConnectionNodePosition = (node: ConnectionNode, shapes: Record<string, Shape>): Point | null => {
  if (node.kind === 'anchored' && node.anchorShapeId) {
    const anchorShape = shapes[node.anchorShapeId];
    const resolved = anchorShape ? resolveShapeConnectionPoint(anchorShape) : null;
    if (resolved) return resolved;
  }
  return node.position ?? null;
};

export const resolveConduitEndpoints = (
  conduit: Shape,
  nodes: Record<string, ConnectionNode>,
  shapes: Record<string, Shape>
): { start: Point | null; end: Point | null } => {
  if (!isConduitShape(conduit)) return { start: null, end: null };
  const startNodeId = conduit.fromNodeId;
  const endNodeId = conduit.toNodeId;
  const start = startNodeId ? resolveConnectionNodePosition(nodes[startNodeId], shapes) : null;
  const end = endNodeId ? resolveConnectionNodePosition(nodes[endNodeId], shapes) : null;
  return { start, end };
};

export type IdFactory = () => string;

const defaultIdFactory: IdFactory = () => generateId();

const ensureFreeNodeAt = (
  nodes: Record<string, ConnectionNode>,
  position: Point,
  idFactory: IdFactory
): { nodes: Record<string, ConnectionNode>; nodeId: string } => {
  const nodeId = idFactory();
  return { nodes: { ...nodes, [nodeId]: { id: nodeId, kind: 'free', position } }, nodeId };
};

export const getConduitNodeUsage = (shapes: Record<string, Shape>): Record<string, number> => {
  const usage: Record<string, number> = {};
  Object.values(shapes).forEach((s) => {
    if (!isConduitShape(s)) return;
    if (s.fromNodeId) usage[s.fromNodeId] = (usage[s.fromNodeId] ?? 0) + 1;
    if (s.toNodeId) usage[s.toNodeId] = (usage[s.toNodeId] ?? 0) + 1;
  });
  return usage;
};

export const detachAnchoredNodesForShape = (
  nodes: Record<string, ConnectionNode>,
  shapes: Record<string, Shape>,
  anchorShapeId: string
): Record<string, ConnectionNode> => {
  let changed = false;
  const next = { ...nodes };
  Object.values(nodes).forEach((n) => {
    if (n.kind !== 'anchored' || n.anchorShapeId !== anchorShapeId) return;
    const pos = resolveConnectionNodePosition(n, shapes);
    next[n.id] = { ...n, kind: 'free', anchorShapeId: undefined, position: pos ?? n.position };
    changed = true;
  });
  return changed ? next : nodes;
};

/**
 * Normalizes conduit topology:
 * - Ensures every conduit has `fromNodeId/toNodeId` (created from points if missing).
 * - Keeps node positions coherent (anchored nodes are resolved from their shape).
 * - Ensures conduit points match resolved node positions.
 * - Optionally prunes orphan free nodes.
 */
export const normalizeConnectionTopology = (
  shapes: Record<string, Shape>,
  nodes: Record<string, ConnectionNode>,
  opts?: { idFactory?: IdFactory; pruneOrphans?: boolean }
): { shapes: Record<string, Shape>; nodes: Record<string, ConnectionNode> } => {
  const idFactory = opts?.idFactory ?? defaultIdFactory;
  const pruneOrphans = opts?.pruneOrphans ?? true;
  const autoAnchorFreeNodes = true;
  const autoAnchorMargin = 6;

  let nextShapes = shapes;
  let nextNodes = nodes;

  // First, keep anchored node cached positions fresh.
  Object.values(nextNodes).forEach((n) => {
    if (n.kind !== 'anchored' || !n.anchorShapeId) return;
    const pos = resolveConnectionNodePosition(n, nextShapes);
    if (!pos) return;
    if (n.position?.x === pos.x && n.position?.y === pos.y) return;
    nextNodes = { ...nextNodes, [n.id]: { ...n, position: pos } };
  });

  // Second, ensure every conduit references nodes.
  Object.values(nextShapes).forEach((s) => {
    if (!isConduitShape(s)) return;

    let fromNodeId = s.fromNodeId;
    let toNodeId = s.toNodeId;

    if (!fromNodeId) {
      if (s.points?.[0]) {
        const res = ensureFreeNodeAt(nextNodes, s.points[0], idFactory);
        nextNodes = res.nodes;
        fromNodeId = res.nodeId;
      }
    }

    if (!toNodeId) {
      if (s.points?.[1]) {
        const res = ensureFreeNodeAt(nextNodes, s.points[1], idFactory);
        nextNodes = res.nodes;
        toNodeId = res.nodeId;
      }
    }

    if (fromNodeId !== s.fromNodeId || toNodeId !== s.toNodeId) {
      nextShapes = { ...nextShapes, [s.id]: { ...s, fromNodeId, toNodeId } };
    }
  });

  // Third, reconcile free-node positions from conduit points (so editing points updates nodes).
  Object.values(nextShapes).forEach((s) => {
    if (!isConduitShape(s) || !s.points) return;
    const fromId = s.fromNodeId;
    const toId = s.toNodeId;

    if (fromId) {
      const node = nextNodes[fromId];
      if (node && node.kind === 'free' && s.points[0]) {
        const p = s.points[0];
        if (!node.position || node.position.x !== p.x || node.position.y !== p.y) {
          nextNodes = { ...nextNodes, [fromId]: { ...node, position: p } };
        }
      }
    }

    if (toId) {
      const node = nextNodes[toId];
      if (node && node.kind === 'free' && s.points[1]) {
        const p = s.points[1];
        if (!node.position || node.position.x !== p.x || node.position.y !== p.y) {
          nextNodes = { ...nextNodes, [toId]: { ...node, position: p } };
        }
      }
    }
  });

  // Optional: if a free node sits inside an electrical symbol bounds, treat it as anchored to that symbol.
  // This prevents "looks connected but isn't" cases and makes endpoints follow devices deterministically.
  if (autoAnchorFreeNodes) {
    const symbolCandidates = Object.values(nextShapes)
      .filter((s) => resolveShapeConnectionPoint(s) !== null)
      .map((s) => ({
        id: s.id,
        point: resolveShapeConnectionPoint(s)!,
        bbox: getShapeBoundingBox(s),
      }));

    const dist2 = (a: Point, b: Point) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    };

    Object.values(nextNodes).forEach((n) => {
    if (n.kind !== 'free' || !n.position || n.pinned) return;

      const hits = symbolCandidates.filter((c) => {
        const b = c.bbox;
        return (
          n.position!.x >= b.x - autoAnchorMargin &&
          n.position!.x <= b.x + b.width + autoAnchorMargin &&
          n.position!.y >= b.y - autoAnchorMargin &&
          n.position!.y <= b.y + b.height + autoAnchorMargin
        );
      });
      if (hits.length === 0) return;

      // Choose the closest connection point if multiple symbols overlap.
      let best = hits[0];
      let bestD2 = dist2(n.position, best.point);
      for (let i = 1; i < hits.length; i++) {
        const d2 = dist2(n.position, hits[i].point);
        if (d2 < bestD2) {
          best = hits[i];
          bestD2 = d2;
        }
      }

      nextNodes = {
        ...nextNodes,
        [n.id]: {
          ...n,
          kind: 'anchored',
          anchorShapeId: best.id,
          position: best.point,
        },
      };
    });
  }

  // Fourth, update conduit points from resolved node positions.
  Object.values(nextShapes).forEach((s) => {
    if (!isConduitShape(s)) return;
    const { start, end } = resolveConduitEndpoints(s, nextNodes, nextShapes);
    if (!start || !end) return;
    const curr = s.points ?? [];
    const hasDiff =
      curr.length < 2 || curr[0].x !== start.x || curr[0].y !== start.y || curr[1].x !== end.x || curr[1].y !== end.y;
    if (!hasDiff) return;
    nextShapes = { ...nextShapes, [s.id]: { ...s, points: [start, end] } };
  });

  if (pruneOrphans) {
    const usage = getConduitNodeUsage(nextShapes);
    const pruned: Record<string, ConnectionNode> = {};
    Object.values(nextNodes).forEach((n) => {
      if (n.kind === 'anchored') {
        pruned[n.id] = n;
        return;
      }
      if ((usage[n.id] ?? 0) > 0) {
        pruned[n.id] = n;
      }
    });
    nextNodes = pruned;
  }

  return { shapes: nextShapes, nodes: nextNodes };
};
