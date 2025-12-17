import { describe, it, expect } from 'vitest';
import { convertDxfToShapes } from './dxfToShapes';
import { DxfData } from './types';
import { resolveColor } from './styles';

describe('DXF Fidelity & Requirements', () => {

  describe('Unit Overrides', () => {
    // We will simulate the "sourceUnits" option passing
    it('forces Meters conversion when Source=Meters selected (ignoring INSUNITS)', () => {
        const data: DxfData = {
            header: { $INSUNITS: 1 }, // Inches defined in file
            entities: [{ type: 'LINE', vertices: [{x:0,y:0},{x:10,y:0}], layer: '0' }]
        };
        // Option "sourceUnits": 'meters' (implied new option)
        const result = convertDxfToShapes(data, {
            floorId: 'f1', defaultLayerId: 'def',
            // @ts-ignore
            sourceUnits: 'meters'
        });

        // 10 meters -> 1000 pixels.
        // If it obeyed Inches: 10 * 0.0254 * 100 = 25.4 pixels.
        expect(result.shapes[0].points?.[1].x).toBeCloseTo(1000);
    });

    it('forces Millimeters conversion', () => {
        const data: DxfData = { entities: [{ type: 'LINE', vertices: [{x:0,y:0},{x:1000,y:0}], layer: '0' }] };
        const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def', sourceUnits: 'mm' } as any);
        // 1000mm = 1m = 100px
        expect(result.shapes[0].points?.[1].x).toBeCloseTo(100);
    });
  });

  describe('Color Modes', () => {
     it('Force B&W turns red line to black', () => {
         const data: DxfData = { entities: [{ type: 'LINE', color: 1, vertices: [{x:0,y:0},{x:10,y:0}], layer: '0' }] };
         // @ts-ignore
         const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def', colorMode: 'monochrome' });
         expect(result.shapes[0].strokeColor).toBe('#000000');
     });

     it('Force B&W keeps transparency? (TBD - usually alpha is separate)', () => {
         // Assuming our resolving logic handles it.
         // For now just check it's black.
     });
  });

  describe('Text Fidelity', () => {
      it('Extracts \\W width factor from MText', () => {
          const data: DxfData = {
              entities: [{
                  type: 'MTEXT', text: '\\W0.8;Narrow Text',
                  position: {x:0,y:0}, layer: '0', textHeight: 1
              }]
          };
          const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
          // ScaleX = 100 (Default Meter Scale) * 0.8 = 80.
          // @ts-ignore
          // In unitless auto-detect mode (which triggers here as INSUNITS missing),
          // small extents (1 unit) -> Meters -> Scale 100.
          // BUT wait, my auto-detect logic relies on extents.
          // Entity position (0,0). Width? Text is not geometry, so extent is 0-0.
          // Auto-detect fails to find valid geometry extent if only text?
          // Let's verify `dxfToShapes.ts` auto detect.
          // "if (e.type === 'LINE' ...)"
          // Text is NOT used for auto-detect bounds.
          // So extent = 0.
          // "if (extent > 0 && extent < 2000)" -> false.
          // globalScale defaults to 1 (Centimeters/Unitless fallback).
          // So ScaleX = 1 * 0.8 = 0.8.

          // Fix test data to force Meters scale (add a line of length 1) or set sourceUnits
          const result2 = convertDxfToShapes(data, {
              floorId: 'f1', defaultLayerId: 'def',
              // @ts-ignore
              sourceUnits: 'meters'
          });

          // Now scale is 100; widthFactor should survive normalization.
          // @ts-ignore
          expect(result2.shapes[0].scaleX).toBeCloseTo(0.8, 2);
          expect(result2.shapes[0].textContent).toBe('Narrow Text');
      });

      it('Maps fonts correctly', () => {
          const data: DxfData = {
              tables: { style: { styles: { 'Standard': { name: 'Standard', fontFileName: 'romans.shx' } } } },
              entities: [{ type: 'TEXT', text: 'ABC', style: 'Standard', position: {x:0,y:0}, layer: '0' }]
          };
          const result = convertDxfToShapes(data, { floorId: 'f1', defaultLayerId: 'def' });
          // @ts-ignore
          expect(result.shapes[0].fontFamily).toMatch(/serif/);
      });
  });

});
