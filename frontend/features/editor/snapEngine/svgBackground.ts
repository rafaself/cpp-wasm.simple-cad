import { Point, Shape } from '../../../types';

const parsedCache = new Map<string, Element>();
const geometryCache = new Map<string, Point[]>();

const getParser = () => new DOMParser();

const isElementHidden = (el: Element, hiddenIds: Set<string>): boolean => {
  if (hiddenIds.size === 0) return el.getAttribute('display') === 'none';
  let current: Element | null = el;
  while (current) {
    if (current.getAttribute('display') === 'none') return true;
    const id = current.getAttribute('id');
    if (id && hiddenIds.has(id)) return true;
    current = current.parentElement;
  }
  return false;
};

const samplePath = (path: SVGPathElement): Point[] => {
  const length = path.getTotalLength();
  if (!isFinite(length) || length === 0) return [];
  const step = Math.max(4, length / 80);
  const points: Point[] = [];
  for (let dist = 0; dist <= length; dist += step) {
    const pt = path.getPointAtLength(dist);
    points.push({ x: pt.x, y: pt.y });
  }
  const end = path.getPointAtLength(length);
  points.push({ x: end.x, y: end.y });
  return points;
};

const parsePointsString = (value: string | null): Point[] => {
  if (!value) return [];
  return value
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(',').map(Number))
    .filter(([x, y]) => isFinite(x) && isFinite(y))
    .map(([x, y]) => ({ x, y }));
};

const collectSvgPoints = (root: Element, hiddenIds: Set<string>): Point[] => {
  const points: Point[] = [];

  root.querySelectorAll('path').forEach(el => {
    if (el instanceof SVGPathElement && !isElementHidden(el, hiddenIds)) {
      points.push(...samplePath(el));
    }
  });

  root.querySelectorAll('polyline, polygon').forEach(el => {
    if (!(el instanceof SVGGeometryElement)) return;
    if (isElementHidden(el, hiddenIds)) return;
    points.push(...parsePointsString(el.getAttribute('points')));
  });

  root.querySelectorAll('line').forEach(el => {
    if (!(el instanceof SVGLineElement) || isElementHidden(el, hiddenIds)) return;
    const x1 = Number(el.getAttribute('x1'));
    const y1 = Number(el.getAttribute('y1'));
    const x2 = Number(el.getAttribute('x2'));
    const y2 = Number(el.getAttribute('y2'));
    if ([x1, y1, x2, y2].every(isFinite)) {
      points.push({ x: x1, y: y1 }, { x: x2, y: y2 });
    }
  });

  root.querySelectorAll('rect').forEach(el => {
    if (!(el instanceof SVGRectElement) || isElementHidden(el, hiddenIds)) return;
    const x = Number(el.getAttribute('x')) || 0;
    const y = Number(el.getAttribute('y')) || 0;
    const width = Number(el.getAttribute('width'));
    const height = Number(el.getAttribute('height'));
    if (isFinite(width) && isFinite(height)) {
      points.push(
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
      );
    }
  });

  root.querySelectorAll('circle').forEach(el => {
    if (!(el instanceof SVGCircleElement) || isElementHidden(el, hiddenIds)) return;
    const cx = Number(el.getAttribute('cx'));
    const cy = Number(el.getAttribute('cy'));
    const r = Number(el.getAttribute('r'));
    if ([cx, cy, r].every(isFinite) && r > 0) {
      points.push(
        { x: cx + r, y: cy },
        { x: cx - r, y: cy },
        { x: cx, y: cy + r },
        { x: cx, y: cy - r }
      );
    }
  });

  return points;
};

export const getSvgSnapPoints = (shape: Shape): Point[] => {
  const svgSource = shape.svgOriginalRaw ?? shape.svgRaw;
  if (!svgSource || !shape.svgViewBox || shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) {
    return [];
  }

  const hiddenIds = new Set(shape.svgHiddenLayers ?? []);
  const cacheKey = `${shape.id}-${svgSource}-${Array.from(hiddenIds).sort().join(',')}`;
  if (geometryCache.has(cacheKey)) {
    return geometryCache.get(cacheKey)!;
  }

  const parser = getParser();
  let root: Element | undefined;
  if (parsedCache.has(svgSource)) {
    root = parsedCache.get(svgSource)!;
  } else {
    const doc = parser.parseFromString(svgSource, 'image/svg+xml');
    root = doc.documentElement;
    parsedCache.set(svgSource, root);
  }

  const localPoints = collectSvgPoints(root, hiddenIds);
  const { x, y, width, height, svgViewBox } = shape;
  const scaled = localPoints.map(pt => ({
    x: x + ((pt.x - svgViewBox.x) / svgViewBox.width) * width,
    y: y + ((pt.y - svgViewBox.y) / svgViewBox.height) * height,
  }));

  geometryCache.set(cacheKey, scaled);
  return scaled;
};
