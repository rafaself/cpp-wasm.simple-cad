import { describe, expect, it } from 'vitest';
import type { Shape } from '../../../types';
import { removePdfBorderShapes } from './pdfBorderFilter';

describe('removePdfBorderShapes', () => {
  it('does nothing when disabled', () => {
    const shapes: Shape[] = [
      {
        id: 'border',
        type: 'polyline',
        layerId: 'l',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
          { x: 0, y: 0 },
        ],
        strokeColor: '#000000',
        strokeWidth: 1,
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        discipline: 'architecture',
      },
    ];

    const out = removePdfBorderShapes(shapes, { enabled: false });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('border');
  });

  it('removes a single closed polyline that matches global extents', () => {
    const border: Shape = {
      id: 'border',
      type: 'polyline',
      layerId: 'l',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
        { x: 0, y: 0 },
      ],
      strokeColor: '#000000',
      strokeWidth: 1,
      strokeEnabled: true,
      fillColor: 'transparent',
      fillEnabled: false,
      discipline: 'architecture',
    };

    const inner: Shape = {
      id: 'inner',
      type: 'line',
      layerId: 'l',
      points: [
        { x: 10, y: 10 },
        { x: 90, y: 10 },
      ],
      strokeColor: '#000000',
      strokeWidth: 1,
      strokeEnabled: true,
      fillColor: 'transparent',
      fillEnabled: false,
      discipline: 'architecture',
    };

    const out = removePdfBorderShapes([border, inner], { enabled: true });
    expect(out.map((s) => s.id)).toEqual(['inner']);
  });
});

