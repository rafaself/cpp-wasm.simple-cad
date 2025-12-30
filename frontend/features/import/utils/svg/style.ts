import type { VectorFillRule, VectorStyle, VectorStrokeStyle } from '@/types';

const parseStyleAttr = (raw: string | undefined): Record<string, string> => {
  if (!raw) return {};
  const out: Record<string, string> = {};
  const parts = raw.split(';');
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
};

const toNumber = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
};

const parseNumberList = (raw: string): number[] => {
  const nums: number[] = [];
  const re = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
  for (const m of raw.matchAll(re)) {
    const n = Number.parseFloat(m[0]);
    if (Number.isFinite(n)) nums.push(n);
  }
  return nums;
};

const normalizeFillRule = (raw: string | undefined): VectorFillRule | undefined => {
  const v = raw?.toLowerCase();
  if (v === 'evenodd') return 'evenodd';
  if (v === 'nonzero') return 'nonzero';
  return undefined;
};

const normalizeCap = (raw: string | undefined): VectorStrokeStyle['cap'] | undefined => {
  const v = raw?.toLowerCase();
  if (v === 'butt' || v === 'round' || v === 'square') return v;
  return undefined;
};

const normalizeJoin = (raw: string | undefined): VectorStrokeStyle['join'] | undefined => {
  const v = raw?.toLowerCase();
  if (v === 'miter' || v === 'round' || v === 'bevel') return v;
  return undefined;
};

const isNone = (raw: string | undefined): boolean => {
  const v = raw?.trim().toLowerCase();
  return v === 'none';
};

const isTransparent = (raw: string | undefined): boolean => {
  const v = raw?.trim().toLowerCase();
  return v === 'transparent';
};

export type StyleState = {
  style: VectorStyle;
};

export const mergeSvgStyle = (parent: StyleState, attrs: Record<string, string>): StyleState => {
  const inline = parseStyleAttr(attrs.style);
  const get = (name: string): string | undefined => {
    return inline[name] ?? attrs[name];
  };

  const next: VectorStyle = { ...parent.style };

  const opacity = toNumber(get('opacity'));
  if (opacity !== null) next.opacity = opacity;

  const fillRule = normalizeFillRule(get('fill-rule'));
  if (fillRule) next.fillRule = fillRule;

  const fill = get('fill');
  if (fill !== undefined) {
    if (isNone(fill) || isTransparent(fill)) {
      delete next.fill;
    } else {
      next.fill = { color: fill };
    }
  }

  const fillOpacity = toNumber(get('fill-opacity'));
  if (fillOpacity !== null && next.fill) {
    // Keep per-channel opacity in the overall opacity (renderer can multiply).
    next.opacity = (next.opacity ?? 1) * fillOpacity;
  }

  const stroke = get('stroke');
  if (stroke !== undefined) {
    if (isNone(stroke) || isTransparent(stroke)) {
      delete next.stroke;
    } else {
      const prev = next.stroke;
      next.stroke = {
        color: stroke,
        width: prev?.width ?? 1,
        join: prev?.join ?? 'miter',
        cap: prev?.cap ?? 'butt',
        miterLimit: prev?.miterLimit,
        dash: prev?.dash,
        dashOffset: prev?.dashOffset,
      };
    }
  }

  if (next.stroke) {
    const w = toNumber(get('stroke-width'));
    if (w !== null) next.stroke.width = w;
    const cap = normalizeCap(get('stroke-linecap'));
    if (cap) next.stroke.cap = cap;
    const join = normalizeJoin(get('stroke-linejoin'));
    if (join) next.stroke.join = join;
    const ml = toNumber(get('stroke-miterlimit'));
    if (ml !== null) next.stroke.miterLimit = ml;

    const dash = get('stroke-dasharray');
    if (dash !== undefined) {
      const d = dash.trim().toLowerCase();
      if (d === 'none') {
        next.stroke.dash = undefined;
      } else {
        const nums = parseNumberList(dash);
        next.stroke.dash = nums.length ? nums : undefined;
      }
    }
    const dashOffset = toNumber(get('stroke-dashoffset'));
    if (dashOffset !== null) next.stroke.dashOffset = dashOffset;

    const strokeOpacity = toNumber(get('stroke-opacity'));
    if (strokeOpacity !== null) next.opacity = (next.opacity ?? 1) * strokeOpacity;
  }

  return { style: next };
};
