import { describe, it, expect } from 'vitest';
import { normalizeConnectionTopology, detachAnchoredNodesForShape, resolveConnectionNodePosition } from '../utils/connections';
import { ConnectionNode, Shape } from '../types';
import { useDataStore } from '../stores/useDataStore';

const idFactoryFrom = (ids: string[]) => {
  const queue = [...ids];
  return () => {
    const next = queue.shift();
    if (!next) throw new Error('idFactory exhausted');
    return next;
  };
};

describe('connection topology', () => {
  it('migrates legacy conduit endpoints (shape ids) into anchored nodes', () => {
    const a: Shape = {
      id: 'A',
      layerId: 'desenho',
      type: 'rect',
      x: 100,
      y: 200,
      width: 40,
      height: 20,
      strokeColor: '#000',
      fillColor: 'transparent',
      points: [],
      svgRaw: '<svg/>',
      connectionPoint: { x: 0.5, y: 0.5 },
    };
    const b: Shape = {
      id: 'B',
      layerId: 'desenho',
      type: 'rect',
      x: 300,
      y: 400,
      width: 20,
      height: 20,
      strokeColor: '#000',
      fillColor: 'transparent',
      points: [],
      svgRaw: '<svg/>',
      connectionPoint: { x: 0.5, y: 0.5 },
    };
    const conduit: Shape = {
      id: 'C1',
      layerId: 'eletrodutos',
      type: 'eletroduto',
      strokeColor: '#8b5cf6',
      fillColor: 'transparent',
      points: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
      fromConnectionId: 'A',
      toConnectionId: 'B',
    };

    const shapes = { A: a, B: b, C1: conduit };
    const nodes: Record<string, ConnectionNode> = {};

    const normalized = normalizeConnectionTopology(shapes, nodes, { idFactory: idFactoryFrom(['n1', 'n2']) });

    const c1 = normalized.shapes.C1;
    expect(c1.fromNodeId).toBe('n1');
    expect(c1.toNodeId).toBe('n2');

    expect(normalized.nodes.n1.kind).toBe('anchored');
    expect(normalized.nodes.n1.anchorShapeId).toBe('A');
    expect(normalized.nodes.n2.kind).toBe('anchored');
    expect(normalized.nodes.n2.anchorShapeId).toBe('B');

    // Connection points should resolve to centers of the rect bounds per normalized connectionPoint (0.5,0.5).
    expect(c1.points[0]).toEqual({ x: 120, y: 210 });
    expect(c1.points[1]).toEqual({ x: 310, y: 410 });
  });

  it('creates free nodes for conduits without legacy links', () => {
    const conduit: Shape = {
      id: 'C1',
      layerId: 'eletrodutos',
      type: 'eletroduto',
      strokeColor: '#8b5cf6',
      fillColor: 'transparent',
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    };

    const shapes = { C1: conduit };
    const nodes: Record<string, ConnectionNode> = {};

    const normalized = normalizeConnectionTopology(shapes, nodes, { idFactory: idFactoryFrom(['n1', 'n2']) });
    expect(normalized.shapes.C1.fromNodeId).toBe('n1');
    expect(normalized.shapes.C1.toNodeId).toBe('n2');
    expect(normalized.nodes.n1.kind).toBe('free');
    expect(normalized.nodes.n1.position).toEqual({ x: 10, y: 20 });
    expect(normalized.nodes.n2.kind).toBe('free');
    expect(normalized.nodes.n2.position).toEqual({ x: 30, y: 40 });
  });

  it('detaches anchored nodes to free nodes when the anchor device is deleted', () => {
    const device: Shape = {
      id: 'A',
      layerId: 'desenho',
      type: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000',
      fillColor: 'transparent',
      points: [],
      svgRaw: '<svg/>',
      connectionPoint: { x: 1, y: 0 },
    };

    const shapes = { A: device };
    const nodes: Record<string, ConnectionNode> = {
      n1: { id: 'n1', kind: 'anchored', anchorShapeId: 'A' },
    };

    const detached = detachAnchoredNodesForShape(nodes, shapes, 'A');
    expect(detached.n1.kind).toBe('free');
    expect(detached.n1.anchorShapeId).toBeUndefined();
    expect(resolveConnectionNodePosition(detached.n1, {})).toEqual({ x: 10, y: 0 });
  });

  it('auto-anchors a free node inside a device bounds', () => {
    const device: Shape = {
      id: 'A',
      layerId: 'desenho',
      type: 'rect',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      strokeColor: '#000',
      fillColor: 'transparent',
      points: [],
      svgRaw: '<svg/>',
      connectionPoint: { x: 1, y: 0.5 },
    };

    const conduit: Shape = {
      id: 'C1',
      layerId: 'eletrodutos',
      type: 'eletroduto',
      strokeColor: '#8b5cf6',
      fillColor: 'transparent',
      points: [{ x: 5, y: 5 }, { x: 100, y: 5 }],
      fromNodeId: 'n1',
      toNodeId: 'n2',
    };

    const shapes = { A: device, C1: conduit };
    const nodes: Record<string, ConnectionNode> = {
      n1: { id: 'n1', kind: 'free', position: { x: 5, y: 5 } },
      n2: { id: 'n2', kind: 'free', position: { x: 100, y: 5 } },
    };

    const normalized = normalizeConnectionTopology(shapes, nodes, { pruneOrphans: false });
    expect(normalized.nodes.n1.kind).toBe('anchored');
    expect(normalized.nodes.n1.anchorShapeId).toBe('A');
    expect(normalized.shapes.C1.points[0]).toEqual({ x: 20, y: 10 });
  });

  it('keeps pinned nodes detached even if inside a symbol', () => {
    const device: Shape = {
      id: 'A',
      layerId: 'desenho',
      type: 'rect',
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      strokeColor: '#000',
      fillColor: 'transparent',
      points: [],
      svgRaw: '<svg/>',
      connectionPoint: { x: 1, y: 0.5 },
    };

    const conduit: Shape = {
      id: 'C2',
      layerId: 'eletrodutos',
      type: 'eletroduto',
      strokeColor: '#8b5cf6',
      fillColor: 'transparent',
      points: [{ x: 5, y: 5 }, { x: 30, y: 5 }],
      fromNodeId: 'n1',
      toNodeId: 'n2',
    };

    const shapes = { A: device, C2: conduit };
    const nodes: Record<string, ConnectionNode> = {
      n1: { id: 'n1', kind: 'free', position: { x: 5, y: 5 }, pinned: true },
      n2: { id: 'n2', kind: 'free', position: { x: 30, y: 5 } },
    };

    const normalized = normalizeConnectionTopology(shapes, nodes, { pruneOrphans: false });
    expect(normalized.nodes.n1.kind).toBe('free');
    expect(normalized.nodes.n1.anchorShapeId).toBeUndefined();
    expect(normalized.shapes.C2.points[0]).toEqual({ x: 5, y: 5 });
  });

  it('updates conduit endpoints when moving an anchored device (store integration)', () => {
    const store = useDataStore.getState();
    store.spatialIndex.clear();
    useDataStore.setState({
      shapes: {},
      electricalElements: {},
      connectionNodes: {},
      diagramNodes: {},
      diagramEdges: {},
      past: [],
      future: [],
    });

    const outletA: Shape = {
      id: 'A',
      layerId: 'desenho',
      type: 'rect',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000',
      fillColor: 'transparent',
      points: [],
      svgRaw: '<svg/>',
      connectionPoint: { x: 1, y: 0 },
    };
    const outletB: Shape = {
      id: 'B',
      layerId: 'desenho',
      type: 'rect',
      x: 100,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000',
      fillColor: 'transparent',
      points: [],
      svgRaw: '<svg/>',
      connectionPoint: { x: 0, y: 0 },
    };

    useDataStore.getState().addShape(outletA);
    useDataStore.getState().addShape(outletB);

    const nA = useDataStore.getState().getOrCreateAnchoredConnectionNode('A');
    const nB = useDataStore.getState().getOrCreateAnchoredConnectionNode('B');
    const conduitId = useDataStore.getState().addConduitBetweenNodes({
      fromNodeId: nA,
      toNodeId: nB,
      layerId: 'eletrodutos',
      strokeColor: '#8b5cf6',
    });

    const initialConduit = useDataStore.getState().shapes[conduitId];
    expect(initialConduit.points[0]).toEqual({ x: 10, y: 0 });

    useDataStore.getState().updateShape('A', { x: 50 }, false);
    const movedConduit = useDataStore.getState().shapes[conduitId];
    expect(movedConduit.points[0]).toEqual({ x: 60, y: 0 });
  });
});
