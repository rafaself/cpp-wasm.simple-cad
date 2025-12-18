import { describe, expect, it } from 'vitest';
import type { Shape } from '../../../types';
import { pdfShapesToSvg } from './pdfShapesToSvg';

describe('pdfShapesToSvg', () => {
  it('emits a single SVG without raster <image> tags', () => {
    const shapes: Shape[] = [
      {
        id: 'l1',
        type: 'line',
        layerId: 'layer',
        points: [{ x: 0, y: 10 }, { x: 10, y: 0 }],
        strokeColor: '#ff0000',
        strokeWidth: 2,
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        colorMode: { fill: 'custom', stroke: 'custom' },
        discipline: 'architecture',
      },
    ];

    const result = pdfShapesToSvg(shapes);
    expect(result.svgRaw).toContain('<svg');
    expect(result.svgRaw).toContain('<polyline');
    expect(result.svgRaw).not.toContain('<image');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('maps Y-up points into Y-down SVG coordinates within the local bbox', () => {
    // Two points with y=0 and y=10 in world (Y-up) should become y=H and y=0 in SVG (Y-down)
    const shapes: Shape[] = [
      {
        id: 'p1',
        type: 'polyline',
        layerId: 'layer',
        points: [{ x: 0, y: 0 }, { x: 0, y: 10 }],
        strokeColor: '#000000',
        strokeWidth: 1,
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        colorMode: { fill: 'custom', stroke: 'custom' },
        discipline: 'architecture',
      },
    ];

    const result = pdfShapesToSvg(shapes);
    // viewBox is 0 0 W H; with minY=0 maxY=10 => H=10
    expect(result.viewBox.width).toBe(1); // min width clamped
    expect(result.viewBox.height).toBe(10);

    const match = result.svgRaw.match(/points="([^"]+)"/);
    expect(match).not.toBeNull();
    const points = (match?.[1] ?? '').split(/\s+/).map((p) => p.split(',').map(Number));
    expect(points).toHaveLength(2);
    // (0,0) -> yDown = 10 ; (0,10) -> yDown = 0
    expect(points[0][1]).toBeCloseTo(10, 6);
    expect(points[1][1]).toBeCloseTo(0, 6);
  });
});

