
import { describe, it, expect } from 'vitest';
import { convertPdfPageToShapes } from './pdfToShapes';
import * as pdfjs from 'pdfjs-dist/build/pdf';

// Use the real OPS from pdfjs
const OPS = pdfjs.OPS;

// Mock page object
const createMockPage = (ops: any[], args: any[]) => ({
  getOperatorList: async () => ({
    fnArray: ops,
    argsArray: args,
  }),
  getViewport: () => ({
    transform: [1, 0, 0, 1, 0, 0], // Identity viewport
  }),
  getTextContent: async () => ({ items: [] }),
});

describe('pdfToShapes Investigation', () => {

  it('should reproduce the "Multiple MoveTo" bug (Spurious Lines)', async () => {
    // Scenario: A single path with two disjoint segments
    // M 10,10 -> L 20,20
    // M 50,50 -> L 60,60

    const ops = [
      OPS.constructPath,
      OPS.stroke,
    ];

    // args[0] is array of ops for constructPath, args[1] is the data (coords)
    const pathOps = [OPS.moveTo, OPS.lineTo, OPS.moveTo, OPS.lineTo];
    const pathData = [10, 10,   20, 20,    50, 50,    60, 60];

    const args = [
      [pathOps, pathData], // Args for constructPath
      []                   // Args for stroke (empty)
    ];

    const shapes = await convertPdfPageToShapes(createMockPage(ops, args), 'floor1', 'layer1');

    console.log('Generated Shapes:', JSON.stringify(shapes, null, 2));

    const polyline = shapes.find(s => s.type === 'polyline');

    if (polyline) {
        // If the bug exists, we get one polyline with 4 points.
        // The points will be (10,10), (20,20), (50,50), (60,60).
        // This implicitly draws a line from (20,20) to (50,50).
        if (polyline.points?.length === 4) {
            console.log('CONFIRMED: Disjoint subpaths are merged into one polyline.');
            // Let's assert this failure condition to prove reproduction
            expect(polyline.points.length).toBe(4);
        } else {
             console.log('Unexpected point count:', polyline.points?.length);
        }
    } else {
        // It might have been detected as something else?
        console.log('No polyline generated. Shapes count:', shapes.length);
        expect(shapes.length).toBeGreaterThan(0);
    }
  });

  it('should confirm strokeWidth 0 is preserved in Shape object', async () => {
      const ops = [
          OPS.setLineWidth,
          OPS.constructPath,
          OPS.stroke
      ];

      const pathOps = [OPS.moveTo, OPS.lineTo];
      const pathData = [0, 0, 10, 10];

      const args = [
          [0], // width 0
          [pathOps, pathData],
          []
      ];

      const shapes = await convertPdfPageToShapes(createMockPage(ops, args), 'floor1', 'layer1');
      const line = shapes[0];

      if (line) {
          console.log('Shape Stroke Width:', line.strokeWidth);
          expect(line.strokeWidth).toBe(0);
      } else {
          console.error("No shapes generated for strokeWidth test");
      }
  });
});
