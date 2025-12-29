import { FrameSettings, Rect, Shape } from '../types';

const mmToPx = (mm: number, worldScale: number) => (mm / 1000) * worldScale;

export interface FrameData {
  outerRect: Rect;
  marginRect: Rect | null;
  shapes: Shape[];
  pxPerMm: number;
}

export const computeFrameData = (frame: FrameSettings, worldScale: number): FrameData | null => {
  if (!frame.enabled) return null;
  if (frame.widthMm <= 0 || frame.heightMm <= 0 || worldScale <= 0) return null;

  const pxPerMm = mmToPx(1, worldScale);
  const width = mmToPx(frame.widthMm, worldScale);
  const height = mmToPx(frame.heightMm, worldScale);
  const safeMarginMm = Math.max(0, Math.min(frame.marginMm, frame.widthMm / 2, frame.heightMm / 2));
  const margin = mmToPx(safeMarginMm, worldScale);

  const outerRect: Rect = {
    x: -width / 2,
    y: -height / 2,
    width,
    height,
  };

  const marginRect: Rect | null = margin > 0
    ? {
        x: outerRect.x + margin,
        y: outerRect.y + margin,
        width: Math.max(0, width - margin * 2),
        height: Math.max(0, height - margin * 2),
      }
    : null;

  const shapes: Shape[] = [
    {
      id: '__frame-outer',
      layerId: '__frame',
      type: 'rect',
      x: outerRect.x,
      y: outerRect.y,
      width: outerRect.width,
      height: outerRect.height,
      strokeColor: '#38bdf8',
      strokeWidth: 2,
      strokeEnabled: true,
      fillColor: 'rgba(56, 189, 248, 0.04)',
      fillEnabled: true,
      isFrame: true,
      colorMode: { fill: 'custom', stroke: 'custom' },
      points: [],
    },
  ];

  if (marginRect && marginRect.width > 0 && marginRect.height > 0) {
    shapes.push({
      id: '__frame-margin',
      layerId: '__frame',
      type: 'rect',
      x: marginRect.x,
      y: marginRect.y,
      width: marginRect.width,
      height: marginRect.height,
      strokeColor: 'rgba(56, 189, 248, 0.5)',
      strokeWidth: 1,
      strokeEnabled: true,
      fillColor: 'transparent',
      fillEnabled: false,
      isFrame: true,
      colorMode: { fill: 'custom', stroke: 'custom' },
      points: [],
    });
  }

  return { outerRect, marginRect, shapes, pxPerMm };
};
