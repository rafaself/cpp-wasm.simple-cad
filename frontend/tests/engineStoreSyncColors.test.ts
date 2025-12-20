import { describe, expect, it } from 'vitest';
import type { Layer, Shape } from '../types';
import { CommandOp } from '../engine/runtime/commandBuffer';
import { computeChangedLayerIds, computeLayerDrivenReupsertCommands, shapeToEngineCommand } from '../engine/runtime/useEngineStoreSync';
import { getDefaultColorMode } from '../utils/shapeColors';

const makeEnsureId = () => {
  const map = new Map<string, number>();
  let next = 1;
  return (id: string) => {
    const existing = map.get(id);
    if (existing) return existing;
    map.set(id, next);
    return next++;
  };
};

const baseLayer = (overrides: Partial<Layer> = {}): Layer => ({
  id: 'layer-1',
  name: 'Layer 1',
  strokeColor: '#112233',
  strokeEnabled: true,
  fillColor: '#AABBCC',
  fillEnabled: true,
  visible: true,
  locked: false,
  ...overrides,
});

const rectShape = (overrides: Partial<Shape> = {}): Shape => ({
  id: 'shape-1',
  layerId: 'layer-1',
  type: 'rect',
  points: [],
  x: 1,
  y: 2,
  width: 3,
  height: 4,
  strokeColor: '#FF0000',
  strokeEnabled: true,
  strokeOpacity: 100,
  fillColor: '#00FF00',
  fillEnabled: true,
  fillOpacity: 100,
  colorMode: getDefaultColorMode(),
  ...overrides,
});

const lineShape = (overrides: Partial<Shape> = {}): Shape => ({
  id: 'shape-2',
  layerId: 'layer-1',
  type: 'line',
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
  ],
  strokeColor: '#FF0000',
  strokeEnabled: true,
  strokeOpacity: 100,
  fillColor: 'transparent',
  fillEnabled: false,
  colorMode: getDefaultColorMode(),
  ...overrides,
});

describe('shapeToEngineCommand (colors + inheritance)', () => {
  it('uses layer stroke/fill when colorMode is layer', () => {
    const ensureId = makeEnsureId();
    const layer = baseLayer({ strokeColor: '#112233', fillColor: '#AABBCC', strokeEnabled: true, fillEnabled: true });
    const shape = rectShape({
      strokeColor: '#FFFFFF',
      fillColor: '#000000',
      colorMode: { stroke: 'layer', fill: 'layer' },
    });

    const cmd = shapeToEngineCommand(shape, layer, ensureId);
    expect(cmd?.op).toBe(CommandOp.UpsertRect);
    if (!cmd || cmd.op !== CommandOp.UpsertRect) throw new Error('Expected UpsertRect');

    // #112233 => (0x11,0x22,0x33)
    expect(cmd.rect.strokeR).toBeCloseTo(0x11 / 255, 6);
    expect(cmd.rect.strokeG).toBeCloseTo(0x22 / 255, 6);
    expect(cmd.rect.strokeB).toBeCloseTo(0x33 / 255, 6);
    expect(cmd.rect.strokeA).toBeCloseTo(1, 6);
    expect(cmd.rect.strokeEnabled).toBe(1);

    // #AABBCC => (0xAA,0xBB,0xCC)
    expect(cmd.rect.fillR).toBeCloseTo(0xaa / 255, 6);
    expect(cmd.rect.fillG).toBeCloseTo(0xbb / 255, 6);
    expect(cmd.rect.fillB).toBeCloseTo(0xcc / 255, 6);
    expect(cmd.rect.fillA).toBeCloseTo(1, 6);
  });

  it('uses shape stroke/fill when colorMode is custom', () => {
    const ensureId = makeEnsureId();
    const layer = baseLayer({ strokeColor: '#000000', fillColor: '#000000' });
    const shape = rectShape({
      strokeColor: '#112233',
      fillColor: '#AABBCC',
      colorMode: { stroke: 'custom', fill: 'custom' },
    });

    const cmd = shapeToEngineCommand(shape, layer, ensureId);
    expect(cmd?.op).toBe(CommandOp.UpsertRect);
    if (!cmd || cmd.op !== CommandOp.UpsertRect) throw new Error('Expected UpsertRect');

    expect(cmd.rect.strokeR).toBeCloseTo(0x11 / 255, 6);
    expect(cmd.rect.strokeG).toBeCloseTo(0x22 / 255, 6);
    expect(cmd.rect.strokeB).toBeCloseTo(0x33 / 255, 6);
    expect(cmd.rect.strokeA).toBeCloseTo(1, 6);
    expect(cmd.rect.strokeEnabled).toBe(1);

    expect(cmd.rect.fillR).toBeCloseTo(0xaa / 255, 6);
    expect(cmd.rect.fillG).toBeCloseTo(0xbb / 255, 6);
    expect(cmd.rect.fillB).toBeCloseTo(0xcc / 255, 6);
    expect(cmd.rect.fillA).toBeCloseTo(1, 6);
  });

  it('respects fillEnabled + fillOpacity when effective fill is enabled', () => {
    const ensureId = makeEnsureId();
    const layer = baseLayer({ fillEnabled: true, fillColor: '#FFFFFF' });
    const shape = rectShape({
      fillOpacity: 30,
      colorMode: { stroke: 'layer', fill: 'layer' },
    });

    const cmd = shapeToEngineCommand(shape, layer, ensureId);
    expect(cmd?.op).toBe(CommandOp.UpsertRect);
    if (!cmd || cmd.op !== CommandOp.UpsertRect) throw new Error('Expected UpsertRect');
    expect(cmd.rect.fillA).toBeCloseTo(0.3, 6);
  });

  it('encodes line stroke color and enabled', () => {
    const ensureId = makeEnsureId();
    const layer = baseLayer({ strokeColor: '#112233', strokeEnabled: false });
    const shape = lineShape({ colorMode: { stroke: 'layer', fill: 'layer' } });

    const cmd = shapeToEngineCommand(shape, layer, ensureId);
    expect(cmd?.op).toBe(CommandOp.UpsertLine);
    if (!cmd || cmd.op !== CommandOp.UpsertLine) throw new Error('Expected UpsertLine');

    expect(cmd.line.r).toBeCloseTo(0x11 / 255, 6);
    expect(cmd.line.g).toBeCloseTo(0x22 / 255, 6);
    expect(cmd.line.b).toBeCloseTo(0x33 / 255, 6);
    expect(cmd.line.a).toBeCloseTo(1, 6);
    expect(cmd.line.enabled).toBe(0);
  });
});

describe('layer-driven re-upserts', () => {
  it('re-upserts only shapes that depend on layer style', () => {
    const ensureId = makeEnsureId();
    const prevLayers = [baseLayer({ strokeColor: '#000000', fillColor: '#000000' })];
    const nextLayers = [baseLayer({ strokeColor: '#112233', fillColor: '#AABBCC' })];
    const changed = computeChangedLayerIds(prevLayers, nextLayers);
    expect(changed.has('layer-1')).toBe(true);

    const shapes: Record<string, Shape> = {
      // depends on layer (stroke+fill)
      a: rectShape({ id: 'a', colorMode: { stroke: 'layer', fill: 'layer' } }),
      // does not depend on layer (custom)
      b: rectShape({ id: 'b', colorMode: { stroke: 'custom', fill: 'custom' } }),
      // depends on layer stroke only (fill custom)
      c: rectShape({ id: 'c', colorMode: { stroke: 'layer', fill: 'custom' } }),
      // depends on layer stroke (line)
      d: lineShape({ id: 'd', colorMode: { stroke: 'layer', fill: 'layer' } }),
    };

    const cmds = computeLayerDrivenReupsertCommands(shapes, nextLayers, changed, ensureId);
    const ids = cmds.map((c) => ('id' in c ? c.id : 0)).sort((x, y) => x - y);

    // We expect 3 commands: a, c, d (b excluded)
    expect(cmds).toHaveLength(3);
    expect(ids).toHaveLength(3);
  });
});
