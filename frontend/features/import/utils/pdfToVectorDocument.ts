import type { VectorClipEntry, VectorDocumentV1, VectorDraw, VectorFillRule, VectorPath, VectorSegment, VectorStyle, VectorStrokeStyle } from '../../../types';
import * as pdfjs from 'pdfjs-dist';
import { applyColorScheme, resolveColorScheme, type DxfColorScheme } from './dxf/colorScheme';
import {
  Matrix, IDENTITY_MATRIX, multiplyMatrix, applyMatrix, scaleFromMatrix,
  formatColor, isNearWhiteHex, clamp01,
} from './pdfMatrixUtils';
import {
  keyForSegments, boundsFromSegments, normalizeSegments, isTransparent,
} from './pdfPathUtils';

type PdfPageProxyLike = {
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getViewport: (opts: { scale: number }) => { transform: number[] };
};

export interface PdfVectorImportOptions {
  colorScheme?: DxfColorScheme;
  customColor?: string;
  /** When enabled, removes a single likely page/frame border draw (stroke-only). */
  removeBorder?: boolean;
}

export type PdfVectorDocumentResult = {
  document: VectorDocumentV1;
  width: number;
  height: number;
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
    const viewportMatrix: Matrix = viewport.transform as Matrix;

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

