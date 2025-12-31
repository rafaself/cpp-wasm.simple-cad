import { describe, expect, it } from 'vitest';

import { buildDxfSvgVectorSidecarV1 } from './dxfSvgToVectorSidecar';

import type { Shape } from '../../../../types';

describe('buildDxfSvgVectorSidecarV1', () => {
  it('returns a v1 sidecar binding the shape to all draws', () => {
    const shape: Shape = {
      id: 'shape-1',
      layerId: 'layer-1',
      type: 'rect',
      points: [],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000000',
      fillColor: 'transparent',
      svgRaw: `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0"/></svg>`,
    };

    const sidecar = buildDxfSvgVectorSidecarV1(shape);
    expect(sidecar?.version).toBe(1);
    expect(sidecar?.document.draws.length).toBe(1);
    expect(sidecar?.bindings['shape-1']?.drawIds).toEqual([sidecar!.document.draws[0]!.id]);
  });

  it('returns null for non-svg shapes', () => {
    const shape: Shape = {
      id: 'shape-2',
      layerId: 'layer-1',
      type: 'rect',
      points: [],
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      strokeColor: '#000000',
      fillColor: 'transparent',
    };
    expect(buildDxfSvgVectorSidecarV1(shape)).toBeNull();
  });
});
