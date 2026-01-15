import { describe, it, expect } from 'vitest';

import { convertDxfToShapes } from './dxfToShapes';
import { DxfData } from './types';

describe('DXF Fidelity & Requirements', () => {
  describe('Unit Overrides', () => {
    it('forces Meters conversion when Source=Meters selected (ignoring INSUNITS)', () => {
      const data: DxfData = {
        header: { $INSUNITS: 1 }, // Inches defined in file
        entities: [
          {
            type: 'LINE',
            vertices: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            layer: '0',
          },
        ],
      };
      const result = convertDxfToShapes(data, {
        floorId: 'f1',
        defaultLayerId: 'def',
        sourceUnits: 'meters',
      });

      // 10 meters -> 1000 pixels.
      // If it obeyed Inches: 10 * 0.0254 * 100 = 25.4 pixels.
      expect(result.shapes[0].points?.[1].x).toBeCloseTo(1000);
    });

    it('forces Millimeters conversion', () => {
      const data: DxfData = {
        entities: [
          {
            type: 'LINE',
            vertices: [
              { x: 0, y: 0 },
              { x: 1000, y: 0 },
            ],
            layer: '0',
          },
        ],
      };
      const result = convertDxfToShapes(data, {
        floorId: 'f1',
        defaultLayerId: 'def',
        sourceUnits: 'mm',
      });
      // 1000mm = 1m = 100px
      expect(result.shapes[0].points?.[1].x).toBeCloseTo(100);
    });
  });

  describe('Color Schemes', () => {
    it('Force B&W via custom scheme defaults to black', () => {
      const data: DxfData = {
        entities: [
          {
            type: 'LINE',
            color: 1,
            vertices: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
            ],
            layer: '0',
          },
        ],
      };
      const result = convertDxfToShapes(data, {
        floorId: 'f1',
        defaultLayerId: 'def',
        colorScheme: 'custom',
      });
      expect(result.shapes[0].strokeColor).toBe('#000000');
    });
  });

  describe('Text Fidelity', () => {
    it('Extracts \\W width factor from MText', () => {
      const data: DxfData = {
        entities: [
          {
            type: 'MTEXT',
            text: '\\W0.8;Narrow Text',
            position: { x: 0, y: 0 },
            layer: '0',
            textHeight: 1,
          },
        ],
      };

      // Make scaling deterministic for this contract: sourceUnits=meters.
      const result = convertDxfToShapes(data, {
        floorId: 'f1',
        defaultLayerId: 'def',
        sourceUnits: 'meters',
      });

      const shape = result.shapes[0];
      expect(shape.type).toBe('text');
      expect(shape.textContent).toBe('Narrow Text');
      // widthFactor is expressed via `scaleX` after text normalization.
      expect(shape.scaleX).toBeCloseTo(0.8, 2);
    });

    it('Maps fonts correctly', () => {
      const data: DxfData = {
        tables: { style: { styles: { Standard: { name: 'Standard', fontFile: 'romans.shx' } } } },
        entities: [
          { type: 'TEXT', text: 'ABC', style: 'Standard', position: { x: 0, y: 0 }, layer: '0' },
        ],
      };
      const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
      expect(result.shapes[0].type).toBe('text');
      expect(result.shapes[0].fontFamily).toMatch(/serif/);
    });
  });
});
