import { NormalizedViewBox, Point, Shape } from '../../../types';

export interface PdfShapesToSvgResult {
  svgRaw: string;
  viewBox: NormalizedViewBox;
  width: number;
  height: number;
  origin: { x: number; y: number };
}

export interface PdfShapesToSvgOptions {
  paddingPx?: number;
}

const escapeXml = (unsafe: string): string =>
  unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const coerceNumber = (v: unknown, fallback: number): number => (isFiniteNumber(v) ? v : fallback);

const isTransparent = (color: string | undefined): boolean =>
  !color || color === 'transparent' || color === 'none' || color === 'rgba(0,0,0,0)';

const pointsToSvgAttr = (points: Point[], mapX: (x: number) => number, mapY: (y: number) => number): string =>
  points.map((p) => `${mapX(p.x)},${mapY(p.y)}`).join(' ');

const extractSvgInnerContent = (svgRaw: string): string => {
  const start = svgRaw.indexOf('>');
  const end = svgRaw.lastIndexOf('</svg>');
  if (start === -1 || end === -1 || end <= start) return svgRaw;
  return svgRaw.slice(start + 1, end).trim();
};

const estimateTextWidth = (text: string, fontSize: number): number => {
  // Heuristic: average glyph width ~= 0.6em
  return text.length * fontSize * 0.6;
};

const accumulateBoundsFromPoints = (
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  pts: readonly Point[],
  expandBy: number = 0
) => {
  pts.forEach((p) => {
    bounds.minX = Math.min(bounds.minX, p.x - expandBy);
    bounds.minY = Math.min(bounds.minY, p.y - expandBy);
    bounds.maxX = Math.max(bounds.maxX, p.x + expandBy);
    bounds.maxY = Math.max(bounds.maxY, p.y + expandBy);
  });
};

const accumulateBounds = (shapes: readonly Shape[]) => {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  shapes.forEach((s) => {
    const strokeEnabled = s.strokeEnabled !== false && !isTransparent(s.strokeColor);
    const strokeWidth = Math.max(0, coerceNumber(s.strokeWidth, 1));
    // SVG strokes extend half inside and half outside the geometry. Expand bounds so the selection box
    // encloses the visible stroke, then the caller can apply a fixed 1px padding.
    const strokeExpand = strokeEnabled ? strokeWidth / 2 : 0;

    if (s.type === 'line' || s.type === 'polyline') {
      if (s.points?.length) accumulateBoundsFromPoints(bounds, s.points, strokeExpand);
      return;
    }

    if (s.type === 'rect') {
      const x = coerceNumber(s.x, 0);
      const y = coerceNumber(s.y, 0);
      const w = coerceNumber(s.width, 0);
      const h = coerceNumber(s.height, 0);
      accumulateBoundsFromPoints(bounds, [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ], strokeExpand);
      return;
    }

    if (s.type === 'text' && typeof s.textContent === 'string') {
      const x = coerceNumber(s.x, 0);
      const y = coerceNumber(s.y, 0);
      const fontSize = coerceNumber(s.fontSize, 12);
      const w = estimateTextWidth(s.textContent, fontSize);
      const h = fontSize;
      accumulateBoundsFromPoints(bounds, [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ], strokeExpand);
    }
  });

  return bounds;
};

/**
 * Converts already-normalized PDF shapes (using the editor/world coordinate system, where Y increases "up")
 * into a single SVG string (standard SVG Y-down), so it can be rendered as a single object like DXF SVG mode.
 */
 export const pdfShapesToSvg = (
  shapes: readonly Shape[],
  options?: PdfShapesToSvgOptions
 ): PdfShapesToSvgResult => {
  const nonEmpty = shapes.filter((s) => {
    if (s.type === 'line' || s.type === 'polyline') return (s.points?.length ?? 0) >= 2;
    if (s.type === 'rect') return isFiniteNumber(s.width) && isFiniteNumber(s.height) && s.width > 0 && s.height > 0;
    if (s.type === 'text') return typeof s.textContent === 'string' && s.textContent.trim().length > 0;
    return false;
  });

  const bounds = accumulateBounds(nonEmpty);
  const hasBounds = Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) && Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY);

  const origin = { x: hasBounds ? bounds.minX : 0, y: hasBounds ? bounds.minY : 0 };
  const width = Math.max(1, (hasBounds ? bounds.maxX - bounds.minX : 1));
  const height = Math.max(1, (hasBounds ? bounds.maxY - bounds.minY : 1));

  // Local mapping:
  // - X: normalize by minX
  // - Y: convert from Y-up (world) to Y-down (SVG) by flipping within the local bbox
  const mapX = (x: number) => x - origin.x;
  const mapYDown = (y: number) => height - (y - origin.y);

  const elements: string[] = [];

  nonEmpty.forEach((s) => {
    const strokeEnabled = s.strokeEnabled !== false && !isTransparent(s.strokeColor);
    const fillEnabled = s.fillEnabled !== false && !isTransparent(s.fillColor);
    const stroke = strokeEnabled ? s.strokeColor : 'none';
    const fill = fillEnabled ? s.fillColor : 'none';
    const strokeWidth = Math.max(0, coerceNumber(s.strokeWidth, 1));

    if (s.type === 'line') {
      const pts = s.points ?? [];
      const pointsAttr = pointsToSvgAttr(pts, mapX, mapYDown);
      elements.push(
        `<polyline points="${pointsAttr}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" vector-effect="non-scaling-stroke" />`
      );
      return;
    }

    if (s.type === 'polyline') {
      const pts = s.points ?? [];
      const pointsAttr = pointsToSvgAttr(pts, mapX, mapYDown);
      const first = pts[0];
      const last = pts[pts.length - 1];
      const isClosed =
        first && last && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;

      if (isClosed) {
        elements.push(
          `<polygon points="${pointsAttr}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" vector-effect="non-scaling-stroke" />`
        );
      } else {
        elements.push(
          `<polyline points="${pointsAttr}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" vector-effect="non-scaling-stroke" />`
        );
      }
      return;
    }

    if (s.type === 'text' && typeof s.textContent === 'string') {
      const x = mapX(coerceNumber(s.x, 0));
      const y = mapYDown(coerceNumber(s.y, 0));
      const fontSize = Math.max(1, coerceNumber(s.fontSize, 12));
      const fontFamily = s.fontFamily ? escapeXml(s.fontFamily) : 'sans-serif';
      const angleDeg = isFiniteNumber(s.rotation) ? (s.rotation * 180) / Math.PI : 0;
      const transform = angleDeg ? ` transform="rotate(${angleDeg} ${x} ${y})"` : '';

      elements.push(
        `<text x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" fill="${strokeEnabled ? stroke : '#000000'}"${transform}>${escapeXml(
          s.textContent
        )}</text>`
      );
      return;
    }

    if (s.type === 'rect') {
      const x = mapX(coerceNumber(s.x, 0));
      const yTopDown = height - ((coerceNumber(s.y, 0) - origin.y) + coerceNumber(s.height, 0));
      const w = coerceNumber(s.width, 0);
      const h = coerceNumber(s.height, 0);

      if (typeof s.svgRaw === 'string' && s.svgRaw.trim().length > 0) {
        const inner = extractSvgInnerContent(s.svgRaw);
        // The rect's embedded svg content was authored in Y-up local coordinates.
        // We place it into the Y-down master SVG by flipping it within its own bbox.
        elements.push(
          `<g transform="translate(${x} ${yTopDown})"><g transform="translate(0 ${h}) scale(1 -1)">${inner}</g></g>`
        );
        return;
      }

      elements.push(
        `<rect x="${x}" y="${yTopDown}" width="${w}" height="${h}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" />`
      );
    }
  });

  const content = elements.join('');
  const paddingPx = Math.max(0, coerceNumber(options?.paddingPx, 0));
  const paddedWidth = width + paddingPx * 2;
  const paddedHeight = height + paddingPx * 2;
  const contentWithPadding =
    paddingPx > 0 ? `<g transform="translate(${paddingPx} ${paddingPx})">${content}</g>` : content;

  const viewBox: NormalizedViewBox = { x: 0, y: 0, width: paddedWidth, height: paddedHeight };
  const svgRaw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${paddedWidth} ${paddedHeight}">${contentWithPadding}</svg>`;

  return { svgRaw, viewBox, width: paddedWidth, height: paddedHeight, origin };
};

