import { applyToPoint, identity, multiply } from '../dxf/matrix2d';

import { parseSvgPathData } from './pathData';
import { mergeSvgStyle, type StyleState } from './style';
import { parseSvgTransform } from './transform';
import { parseXml } from './xml';

import type { XmlNode } from './xml';
import type { Mat2D } from '../dxf/matrix2d';
import type {
  VectorClipEntry,
  VectorDocumentV1,
  VectorDraw,
  VectorPath,
  VectorSegment,
  VectorStyle,
} from '@/types';

const round4 = (v: number): number => {
  const s = 10_000;
  return Math.round(v * s) / s;
};

const normalizeTag = (tag: string): string => {
  // strip namespace prefixes (e.g. svg:path)
  const i = tag.indexOf(':');
  return (i >= 0 ? tag.slice(i + 1) : tag).toLowerCase();
};

const urlId = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const m = raw.match(/url\(\s*#([^)]+)\s*\)/);
  return m?.[1] ?? null;
};

const toNumber = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
};

const parsePoints = (raw: string | undefined): Array<{ x: number; y: number }> => {
  if (!raw) return [];
  const nums: number[] = [];
  const re = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
  for (const m of raw.matchAll(re)) {
    const n = Number.parseFloat(m[0]);
    if (Number.isFinite(n)) nums.push(n);
  }
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push({ x: nums[i]!, y: nums[i + 1]! });
  }
  return pts;
};

const matToTransform = (m: Mat2D) => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f });

const keyForSegments = (segs: readonly VectorSegment[], closed: boolean): string => {
  // Stable-ish key with rounding to reduce float noise.
  const norm = segs.map((s) => {
    switch (s.kind) {
      case 'move':
      case 'line':
        return { k: s.kind, to: { x: round4(s.to.x), y: round4(s.to.y) } };
      case 'quad':
        return {
          k: s.kind,
          c: { x: round4(s.c.x), y: round4(s.c.y) },
          to: { x: round4(s.to.x), y: round4(s.to.y) },
        };
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

type SvgWalkState = {
  transform: Mat2D;
  style: StyleState;
  clipStack: VectorClipEntry[];
};

type ClipDef = {
  nodes: XmlNode[];
  transform: Mat2D;
  fillRule?: 'nonzero' | 'evenodd';
};

type SvgToIrContext = {
  nextPathId: number;
  nextDrawId: number;
  paths: VectorPath[];
  draws: VectorDraw[];
  pathKeyToId: Map<string, string>;
  nodeById: Map<string, XmlNode>;
  clipById: Map<string, ClipDef>;
};

const makeDefaultStyle = (): StyleState => ({ style: {} as VectorStyle });

const getOrCreatePathId = (
  ctx: SvgToIrContext,
  segments: VectorSegment[],
  closed: boolean,
): string => {
  const key = keyForSegments(segments, closed);
  const existing = ctx.pathKeyToId.get(key);
  if (existing) return existing;
  const id = `p${ctx.nextPathId++}`;
  ctx.pathKeyToId.set(key, id);
  ctx.paths.push({ id, segments, closed });
  return id;
};

const addDraw = (
  ctx: SvgToIrContext,
  pathId: string,
  style: VectorStyle,
  transform: Mat2D,
  clipStack: VectorClipEntry[],
) => {
  const draw: VectorDraw = {
    id: `d${ctx.nextDrawId++}`,
    pathId,
    style,
    transform: matToTransform(transform),
    clipStack: clipStack.length ? clipStack : undefined,
  };
  ctx.draws.push(draw);
};

const transformSegments = (segments: VectorSegment[], t: Mat2D): VectorSegment[] => {
  if (t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0) return segments;
  return segments.map((s) => {
    switch (s.kind) {
      case 'move':
      case 'line':
        return { ...s, to: applyToPoint(t, s.to) };
      case 'quad':
        return { ...s, c: applyToPoint(t, s.c), to: applyToPoint(t, s.to) };
      case 'cubic':
        return {
          ...s,
          c1: applyToPoint(t, s.c1),
          c2: applyToPoint(t, s.c2),
          to: applyToPoint(t, s.to),
        };
      case 'arc':
        // Best-effort: apply translation/rotation-scale to center; keep angles in local space.
        return { ...s, center: applyToPoint(t, s.center) };
      case 'close':
        return s;
    }
  });
};

const applyClipAttr = (
  ctx: SvgToIrContext,
  node: XmlNode,
  state: SvgWalkState,
): VectorClipEntry[] => {
  const clipId = urlId(node.attrs['clip-path'] ?? node.attrs['clipPath']);
  if (!clipId) return state.clipStack;
  const def = ctx.clipById.get(clipId);
  if (!def) return state.clipStack;

  const next: VectorClipEntry[] = [...state.clipStack];
  const entryTransform = matToTransform(def.transform);

  const addClipPathFromSegments = (
    segments: VectorSegment[],
    closed: boolean,
    fillRule?: 'nonzero' | 'evenodd',
  ) => {
    const pid = getOrCreatePathId(ctx, segments, closed);
    next.push({ pathId: pid, fillRule, transform: entryTransform });
  };

  const collectClipChild = (child: XmlNode, st: Mat2D) => {
    const tag = normalizeTag(child.tag);
    const t = multiply(st, parseSvgTransform(child.attrs.transform));
    if (tag === 'g') {
      child.children.forEach((c) => collectClipChild(c, t));
      return;
    }
    if (tag === 'path') {
      const d = child.attrs.d ?? '';
      const parsed = parseSvgPathData(d);
      addClipPathFromSegments(transformSegments(parsed.segments, t), parsed.closed, def.fillRule);
      return;
    }
    if (tag === 'rect') {
      const x = toNumber(child.attrs.x) ?? 0;
      const y = toNumber(child.attrs.y) ?? 0;
      const w = toNumber(child.attrs.width) ?? 0;
      const h = toNumber(child.attrs.height) ?? 0;
      if (!(w > 0) || !(h > 0)) return;
      const segs: VectorSegment[] = [
        { kind: 'move', to: { x, y } },
        { kind: 'line', to: { x: x + w, y } },
        { kind: 'line', to: { x: x + w, y: y + h } },
        { kind: 'line', to: { x, y: y + h } },
        { kind: 'close' },
      ];
      addClipPathFromSegments(transformSegments(segs, t), true, def.fillRule);
      return;
    }
    // Other clip primitives can be added incrementally as needed.
  };

  def.nodes.forEach((n) => collectClipChild(n, def.transform));
  return next;
};

const resolveHrefId = (node: XmlNode): string | null => {
  const href = node.attrs.href ?? node.attrs['xlink:href'];
  if (!href) return null;
  if (!href.startsWith('#')) return null;
  return href.slice(1);
};

const walk = (ctx: SvgToIrContext, node: XmlNode, state: SvgWalkState) => {
  const tag = normalizeTag(node.tag);
  if (!tag) return;

  if (tag === 'defs') return;
  if (tag === 'clippath') return;

  const nodeTransform = parseSvgTransform(node.attrs.transform);
  const transform = multiply(state.transform, nodeTransform);
  const style = mergeSvgStyle(state.style, node.attrs);
  const clipStack = applyClipAttr(ctx, node, { ...state, transform, style });

  if (tag === 'g' || tag === 'symbol') {
    const st: SvgWalkState = { transform, style, clipStack };
    node.children.forEach((c) => walk(ctx, c, st));
    return;
  }

  if (tag === 'use') {
    const refId = resolveHrefId(node);
    if (!refId) return;
    const ref = ctx.nodeById.get(refId);
    if (!ref) return;

    const x = toNumber(node.attrs.x) ?? 0;
    const y = toNumber(node.attrs.y) ?? 0;
    // Per spec, x/y are an additional translation applied before the element's own transform.
    const useTransform = multiply(transform, { a: 1, b: 0, c: 0, d: 1, e: x, f: y });
    const st: SvgWalkState = { transform: useTransform, style, clipStack };
    walk(ctx, ref, st);
    return;
  }

  const emitPath = (segments: VectorSegment[], closed: boolean) => {
    const pathId = getOrCreatePathId(ctx, segments, closed);
    addDraw(ctx, pathId, style.style, transform, clipStack);
  };

  if (tag === 'path') {
    const parsed = parseSvgPathData(node.attrs.d ?? '');
    if (parsed.segments.length === 0) return;
    emitPath(parsed.segments, parsed.closed);
    return;
  }

  if (tag === 'line') {
    const x1 = toNumber(node.attrs.x1);
    const y1 = toNumber(node.attrs.y1);
    const x2 = toNumber(node.attrs.x2);
    const y2 = toNumber(node.attrs.y2);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return;
    const segs: VectorSegment[] = [
      { kind: 'move', to: { x: x1, y: y1 } },
      { kind: 'line', to: { x: x2, y: y2 } },
    ];
    emitPath(segs, false);
    return;
  }

  if (tag === 'polyline' || tag === 'polygon') {
    const pts = parsePoints(node.attrs.points);
    if (pts.length < 2) return;
    const segs: VectorSegment[] = [{ kind: 'move', to: pts[0]! }];
    for (let i = 1; i < pts.length; i += 1) segs.push({ kind: 'line', to: pts[i]! });
    const isClosed = tag === 'polygon';
    if (isClosed) segs.push({ kind: 'close' });
    emitPath(segs, isClosed);
    return;
  }

  if (tag === 'rect') {
    const x = toNumber(node.attrs.x) ?? 0;
    const y = toNumber(node.attrs.y) ?? 0;
    const w = toNumber(node.attrs.width) ?? 0;
    const h = toNumber(node.attrs.height) ?? 0;
    if (!(w > 0) || !(h > 0)) return;
    const segs: VectorSegment[] = [
      { kind: 'move', to: { x, y } },
      { kind: 'line', to: { x: x + w, y } },
      { kind: 'line', to: { x: x + w, y: y + h } },
      { kind: 'line', to: { x, y: y + h } },
      { kind: 'close' },
    ];
    emitPath(segs, true);
    return;
  }

  if (tag === 'circle') {
    const cx = toNumber(node.attrs.cx);
    const cy = toNumber(node.attrs.cy);
    const r = toNumber(node.attrs.r);
    if (cx === null || cy === null || r === null || !(r > 0)) return;
    const start: VectorSegment = { kind: 'move', to: { x: cx + r, y: cy } };
    const arc1: VectorSegment = {
      kind: 'arc',
      center: { x: cx, y: cy },
      radius: { x: r, y: r },
      rotation: 0,
      startAngle: 0,
      endAngle: Math.PI,
      ccw: false,
    };
    const arc2: VectorSegment = {
      kind: 'arc',
      center: { x: cx, y: cy },
      radius: { x: r, y: r },
      rotation: 0,
      startAngle: Math.PI,
      endAngle: Math.PI * 2,
      ccw: false,
    };
    emitPath([start, arc1, arc2, { kind: 'close' }], true);
    return;
  }

  // Ignore unsupported tags.
};

export const svgToVectorDocumentV1 = (svgRaw: string): VectorDocumentV1 => {
  const root = parseXml(svgRaw);
  if (!root || normalizeTag(root.tag) !== 'svg') {
    return { version: 1, paths: [], draws: [] };
  }

  const nodeById = new Map<string, XmlNode>();
  const clipById = new Map<string, ClipDef>();

  const index = (node: XmlNode, inheritedTransform: Mat2D) => {
    const tag = normalizeTag(node.tag);
    const t = multiply(inheritedTransform, parseSvgTransform(node.attrs.transform));
    const id = node.attrs.id;
    if (id) nodeById.set(id, node);

    if (tag === 'clippath' && id) {
      clipById.set(id, {
        nodes: node.children,
        transform: t,
        fillRule: (node.attrs['clip-rule'] as ClipDef['fillRule']) ?? undefined,
      });
    }

    node.children.forEach((c) => index(c, t));
  };

  index(root, identity());

  const ctx: SvgToIrContext = {
    nextPathId: 1,
    nextDrawId: 1,
    paths: [],
    draws: [],
    pathKeyToId: new Map(),
    nodeById,
    clipById,
  };

  const initialState: SvgWalkState = {
    transform: identity(),
    style: makeDefaultStyle(),
    clipStack: [],
  };

  // Root-level attributes affect children (e.g. fill/stroke).
  const rootState: SvgWalkState = {
    transform: identity(),
    style: mergeSvgStyle(initialState.style, root.attrs),
    clipStack: [],
  };

  root.children.forEach((c) => walk(ctx, c, rootState));

  return { version: 1, paths: ctx.paths, draws: ctx.draws };
};
