import { describe, it, expect } from 'vitest';
import { convertDxfToShapes } from './dxfToShapes';
import { DxfData } from './types';

describe('convertDxfToShapes', () => {
  const boundsOf = (points: Array<{ x: number; y: number }>) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY };
  };

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

  it('handles CIRCLE by preserving as circle', () => {
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

      // Similarity transform (uniform scale) should preserve circle representation.
      expect(result.shapes[0].type).toBe('circle');
      expect(result.shapes[0].radius).toBeCloseTo(1000);
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

  it('allows small text sizes (no large clamp)', () => {
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

    // Calculated: 5cm.
    expect(result.shapes[0].type).toBe('text');
    expect(result.shapes[0].fontSize).toBe(5);
    expect(result.shapes[0].scaleX).toBe(1);
    expect(result.shapes[0].fillColor).toBe('transparent');
  });

  it('maps DXF alignment to shape alignment', () => {
      const data: DxfData = {
        entities: [
          { type: 'TEXT', layer: '0', startPoint: {x:0,y:0}, text: 'Left', textHeight: 1, halign: 0 },
          { type: 'TEXT', layer: '0', startPoint: {x:0,y:0}, text: 'Center', textHeight: 1, halign: 1 },
          { type: 'TEXT', layer: '0', startPoint: {x:0,y:0}, text: 'Right', textHeight: 1, halign: 2 },
          { type: 'TEXT', layer: '0', startPoint: {x:0,y:0}, text: 'Middle', textHeight: 1, halign: 4 },
        ]
      };

      const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });

      // @ts-ignore
      expect(result.shapes[0].align).toBe('left');
      // @ts-ignore
      expect(result.shapes[1].align).toBe('center');
      // @ts-ignore
      expect(result.shapes[2].align).toBe('right');
      // @ts-ignore
      expect(result.shapes[3].align).toBe('center'); // Middle -> Center
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
                  layer: '0',
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
        layer: '0',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] // 10 units wide (likely 10m)
      }]
    };

    const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });

    // Should scale by 100 (10 -> 1000)
    expect(result.shapes[0].points?.[1]).toEqual({ x: 1000, y: 0 });
  });

  it('converts polyline with bulge to arc segments', () => {
    // Semicircle: width 10, height 5. Bulge = 1.
    const data: DxfData = {
        entities: [{
            type: 'LWPOLYLINE',
            layer: '0',
            vertices: [
                { x: 0, y: 0, bulge: 1 },
                { x: 10, y: 0 }
            ]
        }]
    };

    const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
    const shape = result.shapes[0];

    expect(shape.type).toBe('polyline');
    // Should have many points due to tessellation, not just 2
    expect(shape.points?.length).toBeGreaterThan(2);

    // Midpoint check (approximate): At x=5, y should be -5 (assuming bulge direction)
    // Note: Bulge 1 = tan(ang/4) -> ang = 180 deg.
    // Arc goes from (0,0) to (10,0). Center (5,0). Radius 5.
    // Direction depends on coordinate system and winding.
    // We just check that we have intermediate points.
    const midIndex = Math.floor(shape.points!.length / 2);
    const midPt = shape.points![midIndex];

    // Check height difference relative to start point to handle normalization offset
    const startPt = shape.points![0];
    const heightDiff = Math.abs(midPt.y - startPt.y);
    expect(heightDiff).toBeGreaterThan(0.1);
  });

  it('interpolates SPLINE control points', () => {
      const data: DxfData = {
          entities: [{
              type: 'SPLINE',
              layer: '0',
              controlPoints: [
                  { x: 0, y: 0 },
                  { x: 10, y: 10 },
                  { x: 20, y: 0 },
                  { x: 30, y: 10 }
              ]
          }]
      };

      const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
      const shape = result.shapes[0];

      expect(shape.type).toBe('polyline');
      // Should result in more points than control points due to interpolation
      expect(shape.points?.length).toBeGreaterThan(4);
  });

  it('maps DXF linetypes to strokeDash', () => {
      const data: DxfData = {
          entities: [{
              type: 'LINE',
              layer: '0',
              lineType: 'DASHED',
              vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }]
          }]
      };

      const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
      const shape = result.shapes[0];

      // DASHED = [10, 5]
      expect(shape.strokeDash).toEqual([10, 5]);
  });

  it('handles ARC by converting to polyline', () => {
      const data: DxfData = {
          entities: [{
              type: 'ARC',
              layer: '0',
              center: { x: 0, y: 0 },
              radius: 10,
              startAngle: 0,
              endAngle: 180
          }]
      };

      const result = convertDxfToShapes(data, {
          floorId: 'f1',
          defaultLayerId: 'def'
      });

      expect(result.shapes[0].type).toBe('polyline');
      expect(result.shapes[0].points?.length).toBeGreaterThan(4);

      const pts = result.shapes[0].points!;
      const b = boundsOf(pts);

      // Bounds-based assertions are stable across tessellation density/ordering.
      // ARC: center (0,0), radius 10, start 0 end 180 => width 20, height 10.
      // Default unitless heuristic scales by 100 for small files (width ~2000, height ~1000).
      expect(b.minX).toBeCloseTo(0, 1);
      expect(b.minY).toBeCloseTo(0, 1);
      expect(b.maxX).toBeCloseTo(2000, 1);
      expect(b.maxY).toBeCloseTo(1000, 1);
  });

  it('correctly resolves ByBlock color inheritance in Blocks', () => {
    // Block "Box" has a line with Color 0 (ByBlock).
    // Insert 1 has Color 1 (Red). Line should be Red.
    // Insert 2 has Color 5 (Blue). Line should be Blue.
    const data: DxfData = {
        entities: [
            { type: 'INSERT', name: 'Box', position: {x:0,y:0}, color: 1, layer: '0' },
            { type: 'INSERT', name: 'Box', position: {x:20,y:0}, color: 5, layer: '0' }
        ],
        blocks: {
            'Box': {
                name: 'Box',
                position: {x:0,y:0},
                entities: [
                    { type: 'LINE', vertices: [{x:0,y:0},{x:10,y:0}], color: 0, layer: '0' } // ByBlock
                ]
            }
        }
    };

    const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });

    // Should have 2 line shapes (one from each insert)
    expect(result.shapes).toHaveLength(2);

    const [left, right] = [...result.shapes].sort((a, b) => {
      const ax = Math.min(...(a.points?.map(p => p.x) ?? [0]));
      const bx = Math.min(...(b.points?.map(p => p.x) ?? [0]));
      return ax - bx;
    });

    // Left insert (Red - #FF0000)
    expect(left.strokeColor?.toLowerCase()).toBe('#ff0000');

    // Right insert (Blue - #0000FF)
    expect(right.strokeColor?.toLowerCase()).toBe('#0000ff');
  });

  it('correctly inherits Lineweight from Layer', () => {
      // Layer 'Heavy' has lineweight 50 (0.50mm -> 3px)
      // Line entity has lineweight -1 (ByLayer)
      const data: DxfData = {
          tables: {
              layer: {
                  layers: {
                      'Heavy': { name: 'Heavy', lineweight: 50, color: 7 }
                  }
              }
          },
          entities: [
              { type: 'LINE', layer: 'Heavy', vertices: [{x:0,y:0},{x:10,y:0}], lineweight: -1 }
          ]
      };

      const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
      const shape = result.shapes[0];

      // Lineweight 50 maps to 3px in styles.ts
      expect(shape.strokeWidth).toBe(3);
  });
});
