import { describe, it, expect } from 'vitest';

import { dxfToSvg } from './dxfToSvg';
import { DxfData } from './types';

// Mock simple DXF data
const mockDxfData: DxfData = {
  header: {
    $EXTMIN: { x: 0, y: 0 },
    $EXTMAX: { x: 100, y: 100 },
  },
  entities: [
    {
      type: 'LINE',
      layer: 'Wall',
      vertices: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    },
    {
      type: 'CIRCLE',
      layer: 'Furniture',
      center: { x: 50, y: 50 },
      radius: 10,
    },
  ],
  blocks: {
    myBlock: {
      name: 'myBlock',
      position: { x: 0, y: 0 },
      entities: [
        {
          type: 'LINE',
          layer: '0',
          vertices: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
          ],
        },
      ],
    },
  },
  tables: {
    layer: {
      layers: {
        Wall: { name: 'Wall', color: 1 }, // Red
        Furniture: { name: 'Furniture', color: 5 }, // Blue
      },
    },
  },
};

describe('dxfToSvg', () => {
  it('should generate valid SVG structure', () => {
    const result = dxfToSvg(mockDxfData, { floorId: '1', defaultLayerId: '1' });

    expect(result.svgRaw).toContain('<svg');
    // viewBox includes padding to avoid clipping. Assert invariants, not an exact string.
    expect(result.viewBox.x).toBeLessThan(0);
    expect(result.viewBox.y).toBeLessThan(0);
    expect(result.viewBox.width).toBeGreaterThan(60);
    expect(result.viewBox.height).toBeGreaterThan(60);
    expect(result.svgRaw).toContain('<g id="Wall">');
    expect(result.svgRaw).toContain('<g id="Furniture">');
  });

  it('should convert LINE entities', () => {
    const result = dxfToSvg(mockDxfData, { floorId: '1', defaultLayerId: '1' });
    expect(result.svgRaw).toContain('d="M 0 0 L 10 10"');
  });

  it('should convert CIRCLE entities', () => {
    const result = dxfToSvg(mockDxfData, { floorId: '1', defaultLayerId: '1' });
    expect(result.svgRaw).toContain('<circle cx="50" cy="50" r="10"');
  });

  it('should generate defs for blocks', () => {
    const result = dxfToSvg(mockDxfData, { floorId: '1', defaultLayerId: '1' });
    expect(result.svgRaw).toContain('<defs>');
    expect(result.svgRaw).toContain('<symbol id="block_myBlock"');
  });

  it('should handle INSERT entities (blocks)', () => {
    const dataWithInsert: DxfData = {
      ...mockDxfData,
      entities: [
        {
          type: 'INSERT',
          layer: '0',
          name: 'myBlock',
          position: { x: 20, y: 20 },
          xScale: 2,
          yScale: 2,
          rotation: 45,
        },
      ],
    };

    const result = dxfToSvg(dataWithInsert, {
      floorId: '1',
      defaultLayerId: '1',
    });
    expect(result.svgRaw).toContain('<use href="#block_myBlock"');
    expect(result.svgRaw).toContain('transform="translate(20 20) rotate(45) scale(2 2)"');
  });

  it('respects grayscale color scheme', () => {
    const result = dxfToSvg(mockDxfData, {
      floorId: '1',
      defaultLayerId: '1',
      colorScheme: 'grayscale',
    });

    expect(result.svgRaw.toLowerCase()).toContain('stroke="#4c4c4c"');
  });

  it('respects custom color scheme', () => {
    const result = dxfToSvg(mockDxfData, {
      floorId: '1',
      defaultLayerId: '1',
      colorScheme: 'custom',
      customColor: '#1a2b3c',
    });

    expect(result.svgRaw.toLowerCase()).toContain('stroke="#1a2b3c"');
  });
});
