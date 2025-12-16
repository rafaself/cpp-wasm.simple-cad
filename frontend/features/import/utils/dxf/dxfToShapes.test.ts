import { describe, it, expect } from 'vitest';
import { convertDxfToShapes } from './dxfToShapes';
import { DxfData } from './types';

describe('convertDxfToShapes', () => {
  it('converts basic LINE', () => {
    const data: DxfData = {
      entities: [{
        type: 'LINE',
        layer: '0',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }]
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
    expect(shape.points?.[0]).toEqual({ x: 0, y: 0 });
    // Auto-scale 100 applied (10 -> 1000)
    expect(shape.points?.[1]).toEqual({ x: 1000, y: 0 });
  });

  it('normalizes coordinates to zero origin (no Y-flip)', () => {
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

    // MinX=100*100=10000, MinY=10000.
    // P1 (10000, 10000) -> 0, 0
    expect(result.shapes[0].points?.[0]).toEqual({ x: 0, y: 0 });
    // P2 (11000, 11000) -> 1000, 1000 (Length 10 * 100)
    expect(result.shapes[0].points?.[1]).toEqual({ x: 1000, y: 1000 });
    expect(result.origin).toEqual({ x: 10000, y: 10000 });
  });

  it('handles CIRCLE with correct radius', () => {
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
      expect(result.shapes[0].x).toBe(10);
      expect(result.shapes[0].y).toBe(10);
      expect(result.shapes[0].points).toEqual([]);
  });

  it('throws error if too many entities', () => {
      const entities = new Array(30001).fill({ type: 'LINE', vertices: [{x:0,y:0},{x:1,y:1}], layer: '0' });
      const data: DxfData = { entities };
      expect(() => convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' })).toThrow(/limit/);
  });

  it('handles blocks without entities safely', () => {
      const data: DxfData = {
          entities: [],
          blocks: {
              'EmptyBlock': {
                  name: 'EmptyBlock',
                  position: { x: 0, y: 0 },
                  entities: undefined as any
              }
          }
      };

      expect(() => convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' })).not.toThrow();
  });

  it('detects circular block references', () => {
     const data: DxfData = {
         entities: [{ type: 'INSERT', name: 'A', position: {x:0,y:0}, layer: '0' }],
         blocks: {
             'A': { name: 'A', entities: [
                 { type: 'LINE', vertices: [{x:0,y:0},{x:10,y:0}], layer: '0' },
                 { type: 'INSERT', name: 'B', position: {x:0,y:0}, layer: '0' }
             ], position: {x:0,y:0} },
             'B': { name: 'B', entities: [
                 { type: 'INSERT', name: 'A', position: {x:0,y:0}, layer: '0' }
             ], position: {x:0,y:0} }
         }
     };

     const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
     expect(result.shapes.length).toBe(1);
  });

  it('scales coordinates based on $INSUNITS (Meters -> CM)', () => {
    const data: DxfData = {
      header: { $INSUNITS: 6 }, // Meters
      entities: [{
        type: 'LINE',
        layer: '0',
        vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }] // 5 meters
      }]
    };

    const result = convertDxfToShapes(data, {
      floorId: 'floor1',
      defaultLayerId: 'default'
    });

    // 5m * 100 = 500cm
    expect(result.shapes[0].points?.[1]).toEqual({ x: 500, y: 0 });
  });

  it('enforces minimum text size', () => {
    const data: DxfData = {
      header: { $INSUNITS: 6 }, // Meters (Scale 100)
      entities: [{
        type: 'TEXT',
        layer: '0',
        startPoint: { x: 0, y: 0 },
        text: 'Tiny Text',
        textHeight: 0.05 // 0.05m = 5cm
      }]
    };

    const result = convertDxfToShapes(data, {
      floorId: 'floor1',
      defaultLayerId: 'default'
    });

    // Calculated: 5cm. Minimum: 12.
    // Result should be 12.
    expect(result.shapes[0].type).toBe('text');
    // @ts-ignore
    expect(result.shapes[0].fontSize).toBe(12);
    expect(result.shapes[0].fillColor).toBe('transparent');
  });

  it('imports ATTRIB entities attached to INSERT', () => {
      const data: DxfData = {
          entities: [{
              type: 'INSERT',
              name: 'BlockWithAttribs',
              position: { x: 0, y: 0 },
              layer: '0',
              // @ts-ignore - attribs is optional in our type but verified in logic
              attribs: [{
                  type: 'ATTRIB',
                  text: 'Room Name',
                  startPoint: { x: 10, y: 10 },
                  textHeight: 5
              }]
          }],
          blocks: {
              'BlockWithAttribs': { name: 'BlockWithAttribs', entities: [], position: {x:0,y:0} }
          }
      };

      const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
      
      // Should import the attribute as text
      expect(result.shapes).toHaveLength(1);
      expect(result.shapes[0].type).toBe('text');
      expect(result.shapes[0].textContent).toBe('Room Name');
  });

  it('auto-detects meters for small unitless files', () => {
    const data: DxfData = {
      // No header.$INSUNITS
      entities: [{
        type: 'LINE',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] // 10 units wide (likely 10m)
      }]
    };

    const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });

    // Should scale by 100 (10 -> 1000)
    expect(result.shapes[0].points?.[1]).toEqual({ x: 1000, y: 0 });
  });
});
