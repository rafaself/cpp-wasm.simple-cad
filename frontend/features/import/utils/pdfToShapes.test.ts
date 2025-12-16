import { describe, it, expect, vi } from 'vitest';
import { convertPdfPageToShapes } from './pdfToShapes';
import * as pdfjs from 'pdfjs-dist';

// Mock OPS
const OPS = pdfjs.OPS;

// Helper to create a basic mock page
const createMockPage = (fnArray: any[], argsArray: any[]) => ({
  getOperatorList: vi.fn().mockResolvedValue({
    fnArray,
    argsArray
  }),
  getViewport: vi.fn().mockReturnValue({
    transform: [1, 0, 0, 1, 0, 0]
  }),
  getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} })
});

const bboxFromShapes = (shapes: any[]) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  shapes.forEach((s) => {
    const checkPoint = (p: { x: number; y: number }) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    };

    if (s.points) {
      s.points.forEach(checkPoint);
    } else if (typeof s.x === 'number' && typeof s.y === 'number') {
      checkPoint(s as any);
    }
  });

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

describe('convertPdfPageToShapes', () => {
  it('should convert a simple line to a Shape', async () => {
    const mockPage = createMockPage(
      [
        OPS.save, 
        OPS.setLineWidth, 
        OPS.setStrokeColor,
        OPS.constructPath, 
        OPS.stroke, 
        OPS.restore
      ],
      [
        [],
        [2], // Line width
        [1, 0, 0], // Red color
        [[OPS.moveTo, OPS.lineTo], [10, 10, 100, 100]], // Path: M 10 10 L 100 100
        [],
        []
      ]
    );

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');

    expect(shapes).toHaveLength(1);
    const line = shapes[0];
    expect(line.type).toBe('line');
    // After normalization and Y-flip: (10,10) -> (0, 90), (100,100) -> (90, 0)
    // The Y is flipped: contentHeight - (y - minY) where contentHeight = 90, minY = 10
    expect(line.points).toEqual([{ x: 0, y: 90 }, { x: 90, y: 0 }]);
    // We are forcing black now
    expect(line.strokeColor).toBe('#000000'); 
    expect(line.strokeWidth).toBe(2);
  });

  it('should convert a rectangle to a Polyline/Polygon/Rect representation', async () => {
     const mockPage = createMockPage(
        [
            OPS.constructPath, 
            OPS.stroke
        ],
        [
            [[OPS.rectangle], [10, 10, 50, 40]], // x, y, w, h
            []
        ]
     );

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');
    expect(shapes).toHaveLength(1);
    const shape = shapes[0];
    // Our logic currently converts closed paths (like rects) to polylines or svg if simple
    expect(shape.type).toBe('polyline');
    // After normalization and Y-flip: rect at (10,10) with size 50x40
    // Points: (10,10), (60,10), (60,50), (10,50) -> after flip with contentHeight=40
    // (0, 40), (50, 40), (50, 0), (0, 0), (0, 40)
    expect(shape.points).toHaveLength(5); 
    expect(shape.points[0]).toEqual({x: 0, y: 40});
    expect(shape.points[4]).toEqual({x: 0, y: 40});
  });

  it('should extract text content and convert to Text shapes', async () => {
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
    // Normalized: After Y-flip with contentHeight=fontSize, text.y = fontSize (top of bounding box)
    expect(text.x).toBe(0);
    expect(text.y).toBe(12); // After flip: contentHeight - (y - minY) = 12 - 0 = 12
    expect(text.fontSize).toBe(12);
  });

  it('should merge adjacent text items into a single Text shape', async () => {
    const mockPage = {
      getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          {
            str: 'Hello',
            transform: [12, 0, 0, 12, 50, 50],
            width: 30, // Approx width for 'Hello'
            height: 12
          },
          {
            str: ' World',
            transform: [12, 0, 0, 12, 80, 50], // Starts at 50 + 30
            width: 35,
            height: 12
          }
        ],
        styles: {}
      }),
      getViewport: vi.fn().mockReturnValue({
        transform: [1, 0, 0, 1, 0, 0]
      })
    };

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');
    expect(shapes).toHaveLength(1);
    const text = shapes[0];
    expect(text.type).toBe('text');
    expect(text.textContent).toBe('Hello World');
    // Normalized: (50,50) -> (0,0)
    expect(text.x).toBe(0); 
  });

  it('should handle nested transforms correctly (Matrix Order Regression Test)', async () => {
    const mockPage = createMockPage(
        [
            // Reference Shape (to anchor normalization at 0,0)
            OPS.constructPath,
            OPS.stroke,

            // Transformed Shape
            OPS.save,
            OPS.transform, // Translate
            OPS.transform, // Scale
            OPS.constructPath,
            OPS.stroke,
            OPS.restore
        ],
        [
            // Reference
            [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 10]],
            [],

            // Transformed
            [],
            [1, 0, 0, 1, 100, 100], // Translate 100, 100
            [2, 0, 0, 2, 0, 0],     // Scale 2, 2
            [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 10]],
            [],
            []
        ]
    );

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');
    expect(shapes).toHaveLength(2);

    const refShape = shapes[0];
    const transShape = shapes[1];

    // After Y-flip, the reference shape (0,0) to (10,10) and transformed (100,100) to (120,120)
    // ContentHeight = 120, minY = 0
    // Ref start: (0, 120 - 0) = (0, 120) after flip
    // Trans start: (100, 120 - 100) = (100, 20) after flip
    expect(refShape.points[0].x).toBeCloseTo(0, 0);
    expect(refShape.points[0].y).toBeCloseTo(120, 0);

    // Check Transformed
    // After Y-flip: (100, 120-100) = (100, 20)
    expect(transShape.points[0].x).toBeCloseTo(100, 0);
    expect(transShape.points[0].y).toBeCloseTo(20, 0);
  });

  it('keeps a known-good PDF within compact bounds', async () => {
    // Equivalent of:
    // '0.5 w', '10 10 m', '60 10 l', '10 10 m', '10 60 l', 'S'
    const mockPage = createMockPage(
        [
            OPS.setLineWidth,
            OPS.constructPath,
            OPS.constructPath,
            OPS.stroke
        ],
        [
            [0.5],
            [[OPS.moveTo, OPS.lineTo], [10, 10, 60, 10]],
            [[OPS.moveTo, OPS.lineTo], [10, 10, 10, 60]],
            []
        ]
    );

    const shapes = await convertPdfPageToShapes(mockPage as any, 'good-floor', 'good-layer');
    const bbox = bboxFromShapes(shapes);

    expect(shapes.length).toBeGreaterThan(0);
    expect(bbox.minX).toBeGreaterThanOrEqual(0);
    expect(bbox.minY).toBeGreaterThanOrEqual(0);
    // Extents are 10,10 to 60,60. Width/Height = 50.
    expect(bbox.maxX).toBeLessThanOrEqual(50);
    expect(bbox.maxY).toBeLessThanOrEqual(50);
  });

  it('prevents displacement on known-bad PDF with nested scale after translate', async () => {
    // Equivalent of:
    // '0.5 w'
    // '0 0 m', '10 10 l', 'S'
    // 'q'
    // '1 0 0 1 100 100 cm'
    // '2 0 0 2 0 0 cm'
    // '0 0 m', '10 10 l', 'S'
    // 'Q'
    const mockPage = createMockPage(
        [
            OPS.setLineWidth,
            OPS.constructPath,
            OPS.stroke,
            OPS.save,
            OPS.transform,
            OPS.transform,
            OPS.constructPath,
            OPS.stroke,
            OPS.restore
        ],
        [
            [0.5],
            [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 10]],
            [],
            [],
            [1, 0, 0, 1, 100, 100],
            [2, 0, 0, 2, 0, 0],
            [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 10]],
            [],
            []
        ]
    );

    const shapes = await convertPdfPageToShapes(mockPage as any, 'bad-floor', 'bad-layer');

    expect(shapes.length).toBe(2);

    const bbox = bboxFromShapes(shapes);
    expect(bbox.maxX).toBeLessThan(150);
    expect(bbox.maxY).toBeLessThan(150);

    const refShape = shapes[0];
    const transformedShape = shapes[1];
    const refStart = refShape.points[0];
    const transformedStart = transformedShape.points[0];

    // Reference (0,0) -> Normalized to (0,0)
    // Transformed (100,100) -> Normalized to (100,100) relative to ref
    // Wait, refShape.points[0] might be affected by normalization
    
    // Original coords: Ref(0,0), Trans(100,100)
    // MinX=0, MinY=0.
    // Normalized Ref: (0,0)
    // Normalized Trans: (100,100)
    
    expect(transformedStart.x - refStart.x).toBeCloseTo(100, 3);
    expect(Math.abs(transformedStart.y - refStart.y)).toBeCloseTo(100, 3);
  });

  it('should handle rotated text and strict grouping', async () => {
    const mockPage = {
      getOperatorList: vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          // Item 1: Rotated 45 degrees
          {
            str: 'Rotated',
            // Rotation matrix for 45 deg: [cos, sin, -sin, cos, x, y] -> [0.707, 0.707, -0.707, 0.707, 100, 100]
            transform: [0.707, 0.707, -0.707, 0.707, 100, 100], 
            width: 50,
            height: 12
          },
          // Item 2: Line 1 "A"
          {
            str: 'A',
            transform: [1, 0, 0, 1, 10, 50],
            width: 10,
            height: 12
          },
          // Item 3: Line 2 "B" (slightly below, shouldn't merge)
          {
            str: 'B',
            transform: [1, 0, 0, 1, 10, 40], // 10 units below
            width: 10,
            height: 12
          }
        ],
        styles: {}
      }),
      getViewport: vi.fn().mockReturnValue({
        transform: [1, 0, 0, 1, 0, 0]
      })
    };

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');
    
    // Expect 3 shapes (Rotated, A, B)
    expect(shapes).toHaveLength(3);

    const rotated = shapes.find(s => s.textContent === 'Rotated');
    expect(rotated).toBeDefined();
    // atan2(0.707, 0.707) is approx 0.785 rad (45 deg).
    // finalRotation = -0.785
    expect(rotated?.rotation).toBeCloseTo(-0.785, 2);

    const a = shapes.find(s => s.textContent === 'A');
    const b = shapes.find(s => s.textContent === 'B');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a?.id).not.toBe(b?.id);
  });
});