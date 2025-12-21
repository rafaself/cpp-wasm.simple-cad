import type { VectorClipEntry, VectorDocumentV1, VectorDraw, VectorFillRule, VectorPath, VectorSegment, VectorStyle, VectorStrokeStyle } from '../../../types';
import * as pdfjs from 'pdfjs-dist';
import { applyColorScheme, resolveColorScheme, type DxfColorScheme } from './dxf/colorScheme';

// Basic Matrix [a, b, c, d, e, f]
// x' = ax + cy + e
// y' = bx + dy + f
type Matrix = [number, number, number, number, number, number];

type PdfPageProxyLike = {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getViewport: (opts: { scale: number }) => { transform: Matrix };
};

export interface PdfVectorImportOptions {
  colorScheme?: DxfColorScheme;
  customColor?: string;
  /**
   * When enabled, removes a single likely page/frame border draw (stroke-only) that matches
   * overall extents, mirroring `removePdfBorderShapes` behavior.
   */
  removeBorder?: boolean;
}

export type PdfVectorDocumentResult = {
  document: VectorDocumentV1;
  width: number;
  height: number;
};

const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];

const multiplyMatrix = (m1: Matrix, m2: Matrix): Matrix => {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
};

const applyMatrix = (p: { x: number; y: number }, m: Matrix): { x: number; y: number } => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const toHex2From01 = (v01: number): string =>
  Math.round(clamp01(v01) * 255)
    .toString(16)
    .padStart(2, '0');

const formatColor = (args: number[]): string => {
  if (args.length === 1) {
    const h = toHex2From01(args[0]);
    return `#${h}${h}${h}`;
  }
  if (args.length === 3) {
    return `#${toHex2From01(args[0])}${toHex2From01(args[1])}${toHex2From01(args[2])}`;
  }
  if (args.length === 4) {
    const c = clamp01(args[0]);
    const m = clamp01(args[1]);
    const y = clamp01(args[2]);
    const k = clamp01(args[3]);
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    const rh = Math.min(255, Math.max(0, r)).toString(16).padStart(2, '0');
    const gh = Math.min(255, Math.max(0, g)).toString(16).padStart(2, '0');
    const bh = Math.min(255, Math.max(0, b)).toString(16).padStart(2, '0');
    return `#${rh}${gh}${bh}`;
  }
  return '#000000';
};

const isNearWhiteHex = (hex: string): boolean => {
  if (!hex.startsWith('#') || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r >= 242 && g >= 242 && b >= 242;
};

const round4 = (v: number): number => {
  const s = 10_000;
  return Math.round(v * s) / s;
};

const keyForSegments = (segs: readonly VectorSegment[], closed: boolean): string => {
  const norm = segs.map((s) => {
    switch (s.kind) {
      case 'move':
      case 'line':
        return { k: s.kind, to: { x: round4(s.to.x), y: round4(s.to.y) } };
      case 'quad':
        return { k: s.kind, c: { x: round4(s.c.x), y: round4(s.c.y) }, to: { x: round4(s.to.x), y: round4(s.to.y) } };
      case 'cubic':
        return {
          k: s.kind,
          c1: { x: round4(s.c1.x), y: round4(s.c1.y) },
          c2: { x: round4(s.c2.x), y: round4(s.c2.y) },
          to: { x: round4(s.to.x), y: round4(s.to.y) },
        };
      case 'arc':
        return {
          k: s.kind,
          center: { x: round4(s.center.x), y: round4(s.center.y) },
          radius: { x: round4(s.radius.x), y: round4(s.radius.y) },
          rotation: round4(s.rotation),
          startAngle: round4(s.startAngle),
          endAngle: round4(s.endAngle),
          ccw: !!s.ccw,
        };
      case 'close':
        return { k: 'close' };
    }
  });
  return JSON.stringify({ closed, norm });
};

type PendingPath = { segments: VectorSegment[]; closed: boolean };
type PendingClip = PendingPath & { fillRule: VectorFillRule };
type PendingDraw = { path: PendingPath; style: VectorStyle; clipStack: PendingClip[] };

type GraphicsState = {
  ctm: Matrix;
  strokeColor: string;
  fillColor: string;
  lineWidth: number;
  lineCap: VectorStrokeStyle['cap'];
  lineJoin: VectorStrokeStyle['join'];
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  strokeAlpha: number;
  fillAlpha: number;
  clipStack: PendingClip[];
};

const cloneState = (s: GraphicsState): GraphicsState => ({
  ...s,
  ctm: [...s.ctm] as Matrix,
  dash: [...s.dash],
  clipStack: [...s.clipStack],
});

const scaleFromMatrix = (m: Matrix): number => {
  const sx = Math.hypot(m[0], m[1]);
  const sy = Math.hypot(m[2], m[3]);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return 1;
  return (sx + sy) / 2;
};

const isTransparent = (hex: string | undefined): boolean => !hex || hex === 'transparent' || hex === 'none';

const boundsFromSegments = (segments: readonly VectorSegment[]): { minX: number; minY: number; maxX: number; maxY: number } => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const add = (p: { x: number; y: number }) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const s of segments) {
    switch (s.kind) {
      case 'move':
      case 'line':
        add(s.to);
        break;
      case 'quad':
        add(s.c);
        add(s.to);
        break;
      case 'cubic':
        add(s.c1);
        add(s.c2);
        add(s.to);
        break;
      case 'arc':
        add({ x: s.center.x - s.radius.x, y: s.center.y - s.radius.y });
        add({ x: s.center.x + s.radius.x, y: s.center.y + s.radius.y });
        break;
      case 'close':
        break;
    }
  }

  return { minX, minY, maxX, maxY };
};

const normalizePoint = (p: { x: number; y: number }, minX: number, minY: number, height: number): { x: number; y: number } => ({
  x: p.x - minX,
  y: height - (p.y - minY),
});

const normalizeSegments = (segments: VectorSegment[], minX: number, minY: number, height: number): VectorSegment[] =>
  segments.map((s) => {
    switch (s.kind) {
      case 'move':
      case 'line':
        return { ...s, to: normalizePoint(s.to, minX, minY, height) };
      case 'quad':
        return { ...s, c: normalizePoint(s.c, minX, minY, height), to: normalizePoint(s.to, minX, minY, height) };
      case 'cubic':
        return {
          ...s,
          c1: normalizePoint(s.c1, minX, minY, height),
          c2: normalizePoint(s.c2, minX, minY, height),
          to: normalizePoint(s.to, minX, minY, height),
        };
      case 'arc':
        return {
          ...s,
          center: normalizePoint(s.center, minX, minY, height),
          radius: { ...s.radius },
        };
      case 'close':
        return s;
    }
  });

const removeLikelyBorderDraw = (draws: readonly PendingDraw[]): PendingDraw[] => {
  if (draws.length === 0) return [];

  let globalMinX = Infinity;
  let globalMinY = Infinity;
  let globalMaxX = -Infinity;
  let globalMaxY = -Infinity;

  for (const d of draws) {
    const b = boundsFromSegments(d.path.segments);
    globalMinX = Math.min(globalMinX, b.minX);
    globalMinY = Math.min(globalMinY, b.minY);
    globalMaxX = Math.max(globalMaxX, b.maxX);
    globalMaxY = Math.max(globalMaxY, b.maxY);
  }

  if (!Number.isFinite(globalMinX) || !Number.isFinite(globalMinY) || !Number.isFinite(globalMaxX) || !Number.isFinite(globalMaxY)) return [...draws];

  const totalW = Math.max(1, globalMaxX - globalMinX);
  const totalH = Math.max(1, globalMaxY - globalMinY);
  const tol = Math.max(2, Math.min(totalW, totalH) * 0.005);

  const approxEqual = (a: number, b: number) => Math.abs(a - b) <= tol;

  const isLikelyBorder = (d: PendingDraw): boolean => {
    const stroke = d.style.stroke;
    const fill = d.style.fill;
    if (!stroke || isTransparent(stroke.color) || !(stroke.width > 0)) return false;
    if (fill && !isTransparent(fill.color)) return false;

    const segs = d.path.segments;
    const lineCount = segs.filter((s) => s.kind === 'line').length;
    const hasClose = segs.some((s) => s.kind === 'close') || d.path.closed;
    if (lineCount < 4 || !hasClose) return false;

    const b = boundsFromSegments(segs);
    return (
      approxEqual(b.minX, globalMinX) &&
      approxEqual(b.minY, globalMinY) &&
      approxEqual(b.maxX, globalMaxX) &&
      approxEqual(b.maxY, globalMaxY)
    );
  };

  let removed = false;
  const next: PendingDraw[] = [];
  for (const d of draws) {
    if (!removed && isLikelyBorder(d)) {
      removed = true;
      continue;
    }
    next.push(d);
  }
  return next;
};

const pageCache = new WeakMap<object, Map<string, Promise<PdfVectorDocumentResult>>>();

const cacheKeyFromOptions = (options?: PdfVectorImportOptions): string => JSON.stringify({
  colorScheme: options?.colorScheme ?? null,
  customColor: options?.customColor ?? null,
  removeBorder: options?.removeBorder ?? false,
});

export const convertPdfPageToVectorDocumentV1 = async (page: PdfPageProxyLike, options?: PdfVectorImportOptions): Promise<PdfVectorDocumentResult> => {
  const key = cacheKeyFromOptions(options);
  const cachedForPage = pageCache.get(page as unknown as object);
  const existing = cachedForPage?.get(key);
  if (existing) return existing;

  const p = (async (): Promise<PdfVectorDocumentResult> => {
    const colorPrefs = resolveColorScheme({ colorScheme: options?.colorScheme, customColor: options?.customColor });
    const applyScheme = (base: string): string => applyColorScheme(base, colorPrefs.scheme, colorPrefs.customColor);

    const opList = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1.0 });
    const viewportMatrix: Matrix = viewport.transform;

    const OPS = pdfjs.OPS;

    const stateStack: GraphicsState[] = [];
    let state: GraphicsState = {
      ctm: IDENTITY_MATRIX,
      strokeColor: applyScheme('#000000'),
      fillColor: applyScheme('#000000'),
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 4,
      dash: [],
      dashOffset: 0,
      strokeAlpha: 1,
      fillAlpha: 1,
      clipStack: [],
    };

    let currentSegments: VectorSegment[] = [];
    let currentPoint: { x: number; y: number } = { x: 0, y: 0 };
    let subpathStart: { x: number; y: number } | null = null;

    const pendingDraws: PendingDraw[] = [];

    const ensureMoveTo = () => {
      if (currentSegments.length > 0) return;
      currentSegments.push({ kind: 'move', to: { ...currentPoint } });
      subpathStart = { ...currentPoint };
    };

    const clearPath = () => {
      currentSegments = [];
      subpathStart = null;
    };

    const snapshotPath = (opts?: { forceClose?: boolean }): PendingPath | null => {
      if (currentSegments.length === 0) return null;
      const segs = [...currentSegments];
      const needsClose = !!opts?.forceClose;
      const hasClose = segs.some((s) => s.kind === 'close');
      if (needsClose && !hasClose) segs.push({ kind: 'close' });
      const closed = hasClose || needsClose;
      return { segments: segs, closed };
    };

    const pushDraw = (path: PendingPath, kind: 'fill' | 'stroke', fillRule?: VectorFillRule) => {
      const device = multiplyMatrix(viewportMatrix, state.ctm);
      const scale = scaleFromMatrix(device);
      const strokeWidth = Math.max(0.05, state.lineWidth * scale);

      if (kind === 'fill') {
        const fillHex = state.fillColor;
        if (isTransparent(fillHex)) return;
        const style: VectorStyle = {
          fill: { color: fillHex },
          fillRule: fillRule ?? 'nonzero',
          opacity: clamp01(state.fillAlpha),
        };
        pendingDraws.push({ path, style, clipStack: [...state.clipStack] });
        return;
      }

      const strokeHex = state.strokeColor;
      if (isTransparent(strokeHex) || !(strokeWidth > 0)) return;
      const dash = state.dash.length ? state.dash.map((d) => d * scale) : undefined;
      const style: VectorStyle = {
        stroke: {
          color: strokeHex,
          width: strokeWidth,
          join: state.lineJoin,
          cap: state.lineCap,
          miterLimit: state.miterLimit,
          ...(dash ? { dash } : {}),
          ...(state.dashOffset ? { dashOffset: state.dashOffset * scale } : {}),
        },
        opacity: clamp01(state.strokeAlpha),
      };
      pendingDraws.push({ path, style, clipStack: [...state.clipStack] });
    };

    const { fnArray, argsArray } = opList;
    for (let i = 0; i < fnArray.length; i++) {
      const fn = fnArray[i]!;
      const args = argsArray[i];

      switch (fn) {
        case OPS.save:
          stateStack.push(cloneState(state));
          break;
        case OPS.restore:
          if (stateStack.length) state = stateStack.pop()!;
          break;
        case OPS.transform: {
          const a = Number((args as number[])[0]);
          const b = Number((args as number[])[1]);
          const c = Number((args as number[])[2]);
          const d = Number((args as number[])[3]);
          const e = Number((args as number[])[4]);
          const f = Number((args as number[])[5]);
          const incoming: Matrix = [a, b, c, d, e, f];
          state.ctm = multiplyMatrix(incoming, state.ctm);
          break;
        }
        case OPS.setLineWidth:
          state.lineWidth = Math.max(0.05, Number((args as number[])[0]));
          break;
        case OPS.setLineCap: {
          const v = Number((args as number[])[0]);
          state.lineCap = v === 1 ? 'round' : v === 2 ? 'square' : 'butt';
          break;
        }
        case OPS.setLineJoin: {
          const v = Number((args as number[])[0]);
          state.lineJoin = v === 1 ? 'round' : v === 2 ? 'bevel' : 'miter';
          break;
        }
        case OPS.setMiterLimit:
          state.miterLimit = Math.max(0, Number((args as number[])[0]));
          break;
        case OPS.setDash: {
          const dashArray = (args as unknown[])[0];
          const dashPhase = (args as unknown[])[1];
          state.dash = Array.isArray(dashArray) ? dashArray.map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0) : [];
          state.dashOffset = Number.isFinite(Number(dashPhase)) ? Number(dashPhase) : 0;
          break;
        }
        case OPS.setStrokeColor:
        case OPS.setStrokeRGBColor:
        case OPS.setStrokeGray:
        case OPS.setStrokeCMYKColor:
          state.strokeColor = applyScheme(formatColor((args as number[]).map((v) => Number(v))));
          break;
        case OPS.setFillColor:
        case OPS.setFillRGBColor:
        case OPS.setFillGray:
        case OPS.setFillCMYKColor: {
          const fillHex = formatColor((args as number[]).map((v) => Number(v)));
          state.fillColor = isNearWhiteHex(fillHex) ? 'transparent' : applyScheme(fillHex);
          break;
        }
        case OPS.setGState: {
          const gs = (args as unknown[])[0];
          const applyGs = (obj: unknown) => {
            if (obj && typeof obj === 'object') {
              const rec = obj as Record<string, unknown>;
              const ca = rec['ca'];
              const CA = rec['CA'];
              if (typeof ca === 'number') state.fillAlpha = clamp01(ca);
              if (typeof CA === 'number') state.strokeAlpha = clamp01(CA);
            }
          };
          if (Array.isArray(gs)) gs.forEach(applyGs);
          else applyGs(gs);
          break;
        }
        case OPS.constructPath: {
          const pathOps = (args as unknown[])[0] as number[];
          const pathData = (args as unknown[])[1] as number[];

          let di = 0;
          for (let j = 0; j < pathOps.length; j++) {
            const op = pathOps[j]!;
            if (currentSegments.length === 0 && op !== OPS.moveTo && op !== OPS.rectangle) ensureMoveTo();

            const toViewport = multiplyMatrix(viewportMatrix, state.ctm);
            const readPoint = (): { x: number; y: number } => {
              const x = Number(pathData[di++]);
              const y = Number(pathData[di++]);
              return applyMatrix({ x, y }, toViewport);
            };

            switch (op) {
              case OPS.moveTo: {
                const p = readPoint();
                currentSegments.push({ kind: 'move', to: p });
                currentPoint = p;
                subpathStart = p;
                break;
              }
              case OPS.lineTo: {
                const p = readPoint();
                currentSegments.push({ kind: 'line', to: p });
                currentPoint = p;
                break;
              }
              case OPS.curveTo: {
                const c1 = readPoint();
                const c2 = readPoint();
                const to = readPoint();
                currentSegments.push({ kind: 'cubic', c1, c2, to });
                currentPoint = to;
                break;
              }
              case OPS.curveTo2: {
                const c2 = readPoint();
                const to = readPoint();
                const c1 = { ...currentPoint };
                currentSegments.push({ kind: 'cubic', c1, c2, to });
                currentPoint = to;
                break;
              }
              case OPS.curveTo3: {
                const c1 = readPoint();
                const to = readPoint();
                const c2 = { ...to };
                currentSegments.push({ kind: 'cubic', c1, c2, to });
                currentPoint = to;
                break;
              }
              case OPS.rectangle: {
                const x = Number(pathData[di++]);
                const y = Number(pathData[di++]);
                const w = Number(pathData[di++]);
                const h = Number(pathData[di++]);
                const p1 = applyMatrix({ x, y }, toViewport);
                const p2 = applyMatrix({ x: x + w, y }, toViewport);
                const p3 = applyMatrix({ x: x + w, y: y + h }, toViewport);
                const p4 = applyMatrix({ x, y: y + h }, toViewport);
                currentSegments.push({ kind: 'move', to: p1 });
                currentSegments.push({ kind: 'line', to: p2 });
                currentSegments.push({ kind: 'line', to: p3 });
                currentSegments.push({ kind: 'line', to: p4 });
                currentSegments.push({ kind: 'close' });
                currentPoint = p1;
                subpathStart = p1;
                break;
              }
              case OPS.closePath: {
                currentSegments.push({ kind: 'close' });
                if (subpathStart) currentPoint = { ...subpathStart };
                break;
              }
              default:
                // ignore unknown path ops
                break;
            }
          }
          break;
        }
        case OPS.clip:
        case OPS.eoClip: {
          const path = snapshotPath();
          if (!path) break;
          const fillRule: VectorFillRule = fn === OPS.eoClip ? 'evenodd' : 'nonzero';
          state.clipStack = [...state.clipStack, { ...path, fillRule }];
          break;
        }
        case OPS.endPath:
          clearPath();
          break;
        case OPS.stroke:
        case OPS.closeStroke:
        case OPS.fill:
        case OPS.eoFill:
        case OPS.fillStroke:
        case OPS.eoFillStroke:
        case OPS.closeFillStroke:
        case OPS.closeEOFillStroke: {
          const fillRule: VectorFillRule =
            fn === OPS.eoFill || fn === OPS.eoFillStroke || fn === OPS.closeEOFillStroke ? 'evenodd' : 'nonzero';
          const forceClose = fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
          const isStroke =
            fn === OPS.stroke || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;
          const isFill = fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke;

          const path = snapshotPath({ forceClose });
          if (!path) break;

          if (isFill) pushDraw(path, 'fill', fillRule);
          if (isStroke) pushDraw(path, 'stroke');

          clearPath();
          break;
        }
        default:
          // ignore
          break;
      }
    }

    const finalPending = options?.removeBorder ? removeLikelyBorderDraw(pendingDraws) : pendingDraws;

    // Compute global bounds for normalization.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of finalPending) {
      const b = boundsFromSegments(d.path.segments);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
      for (const clip of d.clipStack) {
        const cb = boundsFromSegments(clip.segments);
        minX = Math.min(minX, cb.minX);
        minY = Math.min(minY, cb.minY);
        maxX = Math.max(maxX, cb.maxX);
        maxY = Math.max(maxY, cb.maxY);
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return { document: { version: 1, paths: [], draws: [] }, width: 0, height: 0 };
    }

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const pathKeyToId = new Map<string, string>();
    const paths: VectorPath[] = [];
    const draws: VectorDraw[] = [];
    let nextPathId = 1;
    let nextDrawId = 1;

    const getOrCreatePathId = (segments: VectorSegment[], closed: boolean): string => {
      const key = keyForSegments(segments, closed);
      const existingId = pathKeyToId.get(key);
      if (existingId) return existingId;
      const id = `p${nextPathId++}`;
      pathKeyToId.set(key, id);
      paths.push({ id, segments, closed });
      return id;
    };

    const getOrCreateClipEntry = (clip: PendingClip): VectorClipEntry => {
      const segs = normalizeSegments(clip.segments, minX, minY, height);
      const pid = getOrCreatePathId(segs, clip.closed);
      return { pathId: pid, fillRule: clip.fillRule };
    };

    for (const d of finalPending) {
      const segs = normalizeSegments(d.path.segments, minX, minY, height);
      const pid = getOrCreatePathId(segs, d.path.closed);
      const clipStack = d.clipStack.map(getOrCreateClipEntry);

      draws.push({
        id: `d${nextDrawId++}`,
        pathId: pid,
        style: d.style,
        ...(clipStack.length ? { clipStack } : {}),
      });
    }

    return { document: { version: 1, paths, draws }, width, height };
  })();

  const map = cachedForPage ?? new Map<string, Promise<PdfVectorDocumentResult>>();
  map.set(key, p);
  if (!cachedForPage) pageCache.set(page as unknown as object, map);
  return p;
};

