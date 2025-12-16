import { describe, it, expect } from 'vitest';
import { convertDxfToShapes } from './dxfToShapes';
import { DxfData } from './types';

describe('convertDxfToShapes', () => {
  it('converts basic LINE', () => {
    const data: DxfData = {
      entities: [{
        type: 'LINE',
        layer: '0',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] // Horizontal line to avoid flip confusion first
      }]
    };

    const result = convertDxfToShapes(data, {
      floorId: 'floor1',
      defaultLayerId: 'default',
      explodeBlocks: true
    });

    expect(result.shapes).toHaveLength(1);
    const shape = result.shapes[0];
    expect(shape.type).toBe('line');
    expect(shape.points).toHaveLength(2);
    // MinY=0, MaxY=0. Height=0.
    // y = 0 - (0-0) = 0.
    expect(shape.points?.[0]).toEqual({ x: 0, y: 0 });
    expect(shape.points?.[1]).toEqual({ x: 10, y: 0 });
  });

  it('normalizes coordinates to zero origin with Y-flip', () => {
    const data: DxfData = {
      entities: [{
        type: 'LINE',
        layer: '0',
        vertices: [{ x: 100, y: 100 }, { x: 110, y: 110 }]
      }]
    };

    const result = convertDxfToShapes(data, {
      floorId: 'floor1',
      defaultLayerId: 'default'
    });

    // MinX=100, MinY=100. MaxX=110, MaxY=110. Height = 10.
    // P1 (100, 100) -> x=0, y_raw=0 -> y_flipped = 10 - 0 = 10.
    expect(result.shapes[0].points?.[0]).toEqual({ x: 0, y: 10 });
    // P2 (110, 110) -> x=10, y_raw=10 -> y_flipped = 10 - 10 = 0.
    expect(result.shapes[0].points?.[1]).toEqual({ x: 10, y: 0 });
    expect(result.origin).toEqual({ x: 100, y: 100 });
  });

  it('handles CIRCLE with correct radius and flip', () => {
      const data: DxfData = {
          entities: [{
              type: 'CIRCLE',
              layer: '0',
              center: { x: 50, y: 50 },
              radius: 10
          }]
      };

      const result = convertDxfToShapes(data, {
          floorId: 'f1',
          defaultLayerId: 'def'
      });

      expect(result.shapes[0].type).toBe('circle');
      expect(result.shapes[0].radius).toBe(10);
      // Bounds: [40, 60] x [40, 60]. Height = 20. MinY = 40.
      // Center Y (50). y_raw = 50 - 40 = 10.
      // y_flipped = 20 - 10 = 10.
      // Center remains at center.
      expect(result.shapes[0].x).toBe(10);
      expect(result.shapes[0].y).toBe(10);
      expect(result.shapes[0].points).toEqual([]);
  });

  it('throws error if too many entities', () => {
      const entities = new Array(30001).fill({ type: 'LINE', vertices: [{x:0,y:0},{x:1,y:1}], layer: '0' });
      const data: DxfData = { entities };
      expect(() => convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' })).toThrow(/limit/);
  });
});

  it('handles blocks without entities safely', () => {
      const data: DxfData = {
          entities: [],
          blocks: {
              'EmptyBlock': {
                  name: 'EmptyBlock',
                  position: { x: 0, y: 0 },
                  entities: undefined as any // Simulate missing entities
              }
          }
      };

      expect(() => convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' })).not.toThrow();
  });
