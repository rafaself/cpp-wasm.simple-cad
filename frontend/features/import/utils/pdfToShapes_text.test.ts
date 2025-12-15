
import { describe, it, expect, vi } from 'vitest';
import { convertPdfPageToShapes } from './pdfToShapes';
import { Shape } from '../../../types';

// Mock pdfjs-dist objects
const mockGetViewport = vi.fn();
const mockGetOperatorList = vi.fn();
const mockGetTextContent = vi.fn();

const mockPage = {
  getViewport: mockGetViewport,
  getOperatorList: mockGetOperatorList,
  getTextContent: mockGetTextContent,
};

describe('convertPdfPageToShapes - Text Rendering Fidelity', () => {
  it('should set textWrapping="none" and scaleY=1 for imported text', async () => {
    // 1. Simulate standard PDF page (A4 at 72dpi: 595 x 842)
    // viewbox [0, 0, 595.28, 841.89]
    const viewportTransform = [1, 0, 0, -1, 0, 841.89];
    mockGetViewport.mockReturnValue({
      transform: viewportTransform,
      width: 595.28,
      height: 841.89,
    });

    mockGetOperatorList.mockResolvedValue({ fnArray: [], argsArray: [] });

    // 2. Simulate a text item
    const textTransform = [12, 0, 0, 12, 100, 700];
    const textItem = {
      str: 'Test Text',
      transform: textTransform,
      width: 50,
      height: 12,
    };

    mockGetTextContent.mockResolvedValue({
      items: [textItem],
      styles: {},
    });

    // 3. Run conversion
    const shapes = await convertPdfPageToShapes(mockPage, 'f1', 'l1');
    const textShape = shapes.find(s => s.type === 'text') as Shape;

    expect(textShape).toBeDefined();

    // VERIFICATION 1: No Wrapping
    expect(textShape.textWrapping).toBe('none');

    // VERIFICATION 2: No Flip (scaleY=1)
    expect(textShape.scaleY).toBe(1);

    // VERIFICATION 3: Baseline adjustment
    // Original PDF Y: 700. Canvas Y (Y-Down) = -700 + 841.89 = 141.89.
    // Adjusted Y: 141.89 - 12 (FontSize) = 129.89.
    // The final shape coordinate is normalized (shifted to 0,0).
    // So if this is the only shape:
    // minX = 100. minY = 129.89.
    // Shape X = 100 - 100 = 0.
    // Shape Y = 129.89 - 129.89 = 0.
    expect(textShape.y).toBeCloseTo(0, 1);
  });
});
