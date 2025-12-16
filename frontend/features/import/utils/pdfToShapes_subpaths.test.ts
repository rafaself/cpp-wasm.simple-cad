import { describe, it, expect, vi } from 'vitest';
import { convertPdfPageToShapes } from './pdfToShapes';
import * as pdfjs from 'pdfjs-dist/build/pdf';

describe('pdfToShapes bug reproduction', () => {
  it('should not merge disjoint subpaths into a single polyline', async () => {
    const OPS = pdfjs.OPS;
    const mockPage = {
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [
            OPS.constructPath,
            OPS.stroke
        ],
        argsArray: [
            [
                [OPS.moveTo, OPS.lineTo, OPS.moveTo, OPS.lineTo],
                [10, 10, 20, 20, 50, 50, 60, 60]
            ], // M 10,10 L 20,20 M 50,50 L 60,60
            []
        ]
      }),
      getViewport: vi.fn().mockReturnValue({
        transform: [1, 0, 0, 1, 0, 0]
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} })
    };

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');

    // If bug exists, we might get 1 shape (polyline with 4 points)
    // If fixed, we should get 2 shapes (2 lines)
    expect(shapes.length).toBe(2);

    if (shapes.length === 1) {
        console.log('Bug reproduced: Got 1 shape instead of 2');
        console.log('Shape points:', shapes[0].points);
    }
  });
});
