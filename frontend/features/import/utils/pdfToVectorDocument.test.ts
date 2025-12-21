import { describe, expect, it, vi } from 'vitest';
import * as pdfjs from 'pdfjs-dist';

import { convertPdfPageToVectorDocumentV1 } from './pdfToVectorDocument';

const OPS = pdfjs.OPS;

const createMockPage = (fnArray: number[], argsArray: unknown[], viewportTransform: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0]) => {
  return {
    getOperatorList: vi.fn().mockResolvedValue({ fnArray, argsArray }),
    getViewport: vi.fn().mockReturnValue({ transform: viewportTransform }),
  };
};

const pathForDraw = (doc: Awaited<ReturnType<typeof convertPdfPageToVectorDocumentV1>>['document'], drawIndex = 0) => {
  const draw = doc.draws[drawIndex]!;
  const path = doc.paths.find((p) => p.id === draw.pathId);
  if (!path) throw new Error('missing path for draw');
  return { draw, path };
};

describe('convertPdfPageToVectorDocumentV1', () => {
  it('converts a simple stroke path into VectorDocumentV1', async () => {
    const page = createMockPage(
      [OPS.setLineWidth, OPS.setStrokeRGBColor, OPS.constructPath, OPS.stroke],
      [
        [2],
        [1, 0, 0],
        [[OPS.moveTo, OPS.lineTo], [10, 10, 100, 100]],
        [],
      ],
    );

    const res = await convertPdfPageToVectorDocumentV1(page as any);
    expect(res.document.version).toBe(1);
    expect(res.document.draws).toHaveLength(1);
    expect(res.document.paths).toHaveLength(1);

    const { draw, path } = pathForDraw(res.document, 0);
    expect(draw.style.stroke?.color).toBe('#ff0000');
    expect(draw.style.stroke?.width).toBe(2);
    expect(path.segments[0]).toEqual({ kind: 'move', to: { x: 0, y: 90 } });
    expect(path.segments[1]).toEqual({ kind: 'line', to: { x: 90, y: 0 } });
  });

  it('emits even-odd fill rule for eoFill', async () => {
    const page = createMockPage(
      [OPS.setFillRGBColor, OPS.constructPath, OPS.eoFill],
      [
        [0, 0, 1],
        [[OPS.rectangle], [0, 0, 10, 10]],
        [],
      ],
    );

    const res = await convertPdfPageToVectorDocumentV1(page as any);
    expect(res.document.draws).toHaveLength(1);
    expect(res.document.draws[0]!.style.fill?.color).toBe('#0000ff');
    expect(res.document.draws[0]!.style.fillRule).toBe('evenodd');
  });

  it('tracks clipping paths via clipStack', async () => {
    const page = createMockPage(
      [OPS.constructPath, OPS.clip, OPS.endPath, OPS.constructPath, OPS.stroke],
      [
        [[OPS.rectangle], [0, 0, 5, 5]],
        [],
        [],
        [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 10]],
        [],
      ],
    );

    const res = await convertPdfPageToVectorDocumentV1(page as any);
    expect(res.document.draws).toHaveLength(1);
    expect(res.document.draws[0]!.clipStack?.length).toBe(1);
    expect(res.document.draws[0]!.clipStack?.[0]!.fillRule).toBe('nonzero');
  });

  it('dedupes identical paths within a page', async () => {
    const page = createMockPage(
      [OPS.constructPath, OPS.stroke, OPS.constructPath, OPS.stroke],
      [
        [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]],
        [],
        [[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]],
        [],
      ],
    );

    const res = await convertPdfPageToVectorDocumentV1(page as any);
    expect(res.document.draws).toHaveLength(2);
    expect(res.document.paths).toHaveLength(1);
    expect(res.document.draws[0]!.pathId).toBe(res.document.draws[1]!.pathId);
  });

  it('caches results per page+options (calls getOperatorList once)', async () => {
    const page = createMockPage([OPS.constructPath, OPS.stroke], [[[OPS.moveTo, OPS.lineTo], [0, 0, 10, 0]], []]);
    await convertPdfPageToVectorDocumentV1(page as any, { removeBorder: false });
    await convertPdfPageToVectorDocumentV1(page as any, { removeBorder: false });
    expect(page.getOperatorList).toHaveBeenCalledTimes(1);
  });
});

