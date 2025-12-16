import { describe, it, expect, vi } from 'vitest';
import { convertPdfPageToShapes } from './pdfToShapes';
import * as pdfjs from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';

// Disable worker for tests (pdfjs-dist v4+ no longer supports 'disableWorker' option)
GlobalWorkerOptions.workerSrc = '';

// Mock OPS if needed, or rely on the imported one.
// Since we are running in node (vitest), pdfjs-dist/build/pdf might work if it detects node.
// However, pdfjs.OPS might be available.

const buildPdfWithContent = (
  content: string,
  mediaBox: [number, number, number, number] = [0, 0, 300, 300]
): Uint8Array => {
  const encoder = new TextEncoder();
  const streamData = content.endsWith('\n') ? content : `${content}\n`;
  const streamBytes = encoder.encode(streamData);

  const objects = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: '<< /Type /Pages /Count 1 /Kids [3 0 R] >>' },
    {
      id: 3,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox.join(
        ' '
      )}] /Contents 4 0 R /Resources <<>> >>`,
    },
    {
      id: 4,
      body: `<< /Length ${streamBytes.length} >>\nstream\n${streamData}endstream`,
    },
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: Record<number, number> = {};

  for (const obj of objects) {
    offsets[obj.id] = pdf.length;
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const obj of objects) {
    pdf += `${offsets[obj.id].toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return encoder.encode(pdf);
};

const loadFirstPage = async (pdfBytes: Uint8Array) => {
  const task = pdfjs.getDocument({ data: pdfBytes });
  const pdf = await task.promise;
  return pdf.getPage(1);
};

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
    // After normalization and Y-flip: (10,10) -> (0, 90), (100,100) -> (90, 0)
    // The Y is flipped: contentHeight - (y - minY) where contentHeight = 90, minY = 10
    expect(line.points).toEqual([{ x: 0, y: 90 }, { x: 90, y: 0 }]);
    // We are forcing black now
    expect(line.strokeColor).toBe('#000000'); 
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
    // After normalization and Y-flip: rect at (10,10) with size 50x40
    // Points: (10,10), (60,10), (60,50), (10,50) -> after flip with contentHeight=40
    // (0, 40), (50, 40), (50, 0), (0, 0), (0, 40)
    expect(shape.points).toHaveLength(5); 
    expect(shape.points[0]).toEqual({x: 0, y: 40});
    expect(shape.points[4]).toEqual({x: 0, y: 40});
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
    // Normalized: After Y-flip with contentHeight=fontSize, text.y = fontSize (top of bounding box)
    expect(text.x).toBe(0);
    expect(text.y).toBe(12); // After flip: contentHeight - (y - minY) = 12 - 0 = 12
    expect(text.fontSize).toBe(12);
  });

  it('should merge adjacent text items into a single Text shape', async () => {
    const OPS = pdfjs.OPS;
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
    // This test verifies that CTM multiplication order is correct (M_new * CTM_old vs CTM_old * M_new).
    // Scenario:
    // 1. Reference Line at (0,0) to (10,10).
    // 2. Transformed Line:
    //    q
    //    1 0 0 1 100 100 cm  (Translate 100, 100)
    //    2 0 0 2 0 0 cm      (Scale 2, 2)
    //    Draw (0,0) to (10,10)
    //    Q
    //
    // Expected (Standard PDF Pre-multiplication / Local * Global):
    // P_global = P_local * Scale * Translate
    // (0,0) * S * T = (0,0) + (100,100) = (100,100)
    // (10,10) * S * T = (20,20) + (100,100) = (120,120)
    //
    // Incorrect (Reverse Order / Global * Local):
    // P_global = P_local * Translate * Scale
    // (0,0) + T = (100,100) * S = (200,200)
    // (10,10) + T = (110,110) * S = (220,220)

    const OPS = pdfjs.OPS;
    const mockPage = {
      getOperatorList: vi.fn().mockResolvedValue({
        fnArray: [
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
        argsArray: [
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
      }),
      getViewport: vi.fn().mockReturnValue({
        transform: [1, 0, 0, 1, 0, 0]
      }),
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} })
    };

    const shapes = await convertPdfPageToShapes(mockPage as any, 'floor1', 'layer1');
    expect(shapes).toHaveLength(2);

    // Normalization should shift everything so minX, minY is 0.
    // Ref is at 0,0. Transformed is at >100. Min is 0.
    // So coordinates should be absolute.

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
    const goodContent = ['0.5 w', '10 10 m', '60 10 l', '10 10 m', '10 60 l', 'S'].join('\n');
    const goodPdf = buildPdfWithContent(goodContent);
    const page = await loadFirstPage(goodPdf);

    const shapes = await convertPdfPageToShapes(page as any, 'good-floor', 'good-layer');
    const bbox = bboxFromShapes(shapes);

    expect(shapes.length).toBeGreaterThan(0);
    expect(bbox.minX).toBeGreaterThanOrEqual(0);
    expect(bbox.minY).toBeGreaterThanOrEqual(0);
    expect(bbox.maxX).toBeLessThanOrEqual(80);
    expect(bbox.maxY).toBeLessThanOrEqual(80);
  });

  it('prevents displacement on known-bad PDF with nested scale after translate', async () => {
    const badContent = [
      '0.5 w',
      '0 0 m',
      '10 10 l',
      'S',
      'q',
      '1 0 0 1 100 100 cm',
      '2 0 0 2 0 0 cm',
      '0 0 m',
      '10 10 l',
      'S',
      'Q',
    ].join('\n');

    const badPdf = buildPdfWithContent(badContent);
    const page = await loadFirstPage(badPdf);
    const shapes = await convertPdfPageToShapes(page as any, 'bad-floor', 'bad-layer');

    expect(shapes.length).toBe(2);

    const bbox = bboxFromShapes(shapes);
    expect(bbox.maxX).toBeLessThan(150);
    expect(bbox.maxY).toBeLessThan(150);

    const refShape = shapes[0];
    const transformedShape = shapes[1];
    const refStart = refShape.points[0];
    const transformedStart = transformedShape.points[0];

    expect(transformedStart.x - refStart.x).toBeCloseTo(100, 3);
    // After Y-flip: the Y displacement magnitude should be 100
    // Using absolute value since the direction depends on flip implementation
    expect(Math.abs(transformedStart.y - refStart.y)).toBeCloseTo(100, 3);
  });

  it('should handle rotated text and strict grouping', async () => {
    const OPS = pdfjs.OPS;
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
    
    // Expect 3 shapes (Rotated, A, B) - no merging of A and B because they are on different lines (gap > tolerance)
    // Tolerance is 0.2 * 12 = 2.4 units. Gap is 10 units.
    expect(shapes).toHaveLength(3);

    const rotated = shapes.find(s => s.textContent === 'Rotated');
    expect(rotated).toBeDefined();
    // Rotation should be approx -45 deg (Canvas equivalent) or just stored correctly.
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
