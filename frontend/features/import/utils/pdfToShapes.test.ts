import { describe, it, expect, vi } from 'vitest';
import { convertPdfPageToShapes } from './pdfToShapes';
import * as pdfjs from 'pdfjs-dist/build/pdf';

// Mock OPS if needed, or rely on the imported one.
// Since we are running in node (vitest), pdfjs-dist/build/pdf might work if it detects node.
// However, pdfjs.OPS might be available.

describe('convertPdfPageToShapes', () => {
  it('should convert a simple line to a Shape', async () => {
    // Mock OPS
    const OPS = pdfjs.OPS;
    
    // Mock Page Proxy
    const mockPage = {
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [
            OPS.save, 
            OPS.setLineWidth, 
            OPS.setStrokeColor,
            OPS.constructPath, 
            OPS.stroke, 
            OPS.restore
        ],
        argsArray: [
            [],
            [2], // Line width
            [1, 0, 0], // Red color
            [[OPS.moveTo, OPS.lineTo], [10, 10, 100, 100]], // Path: M 10 10 L 100 100
            [],
            []
        ]
      }),
      getViewport: vi.fn().mockReturnValue({
        // Identity transform for simplicity
        transform: [1, 0, 0, 1, 0, 0]
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} })
    };

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');

    expect(shapes).toHaveLength(1);
    const line = shapes[0];
    expect(line.type).toBe('line');
    expect(line.points).toEqual([{ x: 10, y: 10 }, { x: 100, y: 100 }]);
    expect(line.strokeColor).toBe('rgb(255, 0, 0)');
    expect(line.strokeWidth).toBe(2);
  });

  it('should convert a rectangle to a Polyline/Polygon/Rect representation', async () => {
     const OPS = pdfjs.OPS;
     const mockPage = {
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [
            OPS.constructPath, 
            OPS.stroke
        ],
        argsArray: [
            [[OPS.rectangle], [10, 10, 50, 40]], // x, y, w, h
            []
        ]
      }),
      getViewport: vi.fn().mockReturnValue({
        transform: [1, 0, 0, 1, 0, 0]
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} })
    };

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');
    expect(shapes).toHaveLength(1);
    const shape = shapes[0];
    // Our logic currently converts closed paths (like rects) to polylines or svg if simple
    // Rect logic: M L L L Z
    expect(shape.type).toBe('polyline');
    // Our logic now explicitly closes the polyline by repeating the first point
    expect(shape.points).toHaveLength(5); 
    expect(shape.points[0]).toEqual({x: 10, y: 10});
    expect(shape.points[4]).toEqual({x: 10, y: 10});
  });

  it('should extract text content and convert to Text shapes', async () => {
    const OPS = pdfjs.OPS;
    const mockPage = {
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [],
        argsArray: []
      }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          {
            str: 'Hello World',
            transform: [12, 0, 0, 12, 50, 50], // 12pt font at (50, 50)
            width: 60,
            height: 12
          }
        ],
        styles: {}
      }),
      getViewport: vi.fn().mockReturnValue({
        transform: [1, 0, 0, 1, 0, 0] // Identity
      })
    };

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');
    expect(shapes).toHaveLength(1);
    const text = shapes[0];
    expect(text.type).toBe('text');
    expect(text.textContent).toBe('Hello World');
    expect(text.x).toBe(50);
    expect(text.y).toBe(50);
    expect(text.fontSize).toBe(12);
  });
});
