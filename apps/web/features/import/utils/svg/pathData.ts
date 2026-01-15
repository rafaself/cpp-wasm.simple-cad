import type { Point, VectorSegment } from '@/types';

type CommandToken = { kind: 'cmd'; v: string } | { kind: 'num'; v: number };

const tokenize = (d: string): CommandToken[] => {
  const out: CommandToken[] = [];
  const re = /[a-zA-Z]|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
  for (const m of d.matchAll(re)) {
    const t = m[0]!;
    if (/^[a-zA-Z]$/.test(t)) out.push({ kind: 'cmd', v: t });
    else out.push({ kind: 'num', v: Number.parseFloat(t) });
  }
  return out;
};

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

const svgArcToCenter = (
  p0: Point,
  p1: Point,
  rxIn: number,
  ryIn: number,
  xAxisRotationDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
): {
  center: Point;
  radius: Point;
  rotation: number;
  startAngle: number;
  endAngle: number;
  ccw: boolean;
} | null => {
  // Based on SVG 1.1 arc implementation notes (endpoint-to-center conversion).
  const rx0 = Math.abs(rxIn);
  const ry0 = Math.abs(ryIn);
  if (!(rx0 > 0) || !(ry0 > 0)) return null;

  const phi = (xAxisRotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;

  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Correct radii
  let rx = rx0;
  let ry = ry0;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const num = rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2;
  const den = rx2 * y1p2 + ry2 * x1p2;
  if (!(den > 0)) return null;
  const coef = sign * Math.sqrt(Math.max(0, num / den));

  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const det = ux * vy - uy * vx;
    return Math.atan2(det, dot);
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const startAngle = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!Number.isFinite(delta)) delta = 0;

  const ccw = sweepFlag === 0;
  if (sweepFlag === 0 && delta > 0) delta -= Math.PI * 2;
  if (sweepFlag === 1 && delta < 0) delta += Math.PI * 2;

  const endAngle = startAngle + delta;

  return {
    center: { x: cx, y: cy },
    radius: { x: rx, y: ry },
    rotation: phi,
    startAngle,
    endAngle,
    ccw,
  };
};

export const parseSvgPathData = (d: string): { segments: VectorSegment[]; closed: boolean } => {
  const tokens = tokenize(d);
  const segments: VectorSegment[] = [];

  let i = 0;
  let cmd = 'M';

  let curr: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastCubicCtrl: Point | null = null;
  let lastQuadCtrl: Point | null = null;
  let closed = false;

  const nextNum = (): number | null => {
    if (i >= tokens.length) return null;
    const t = tokens[i]!;
    if (t.kind !== 'num') return null;
    i += 1;
    return t.v;
  };

  const nextCmdOrKeep = () => {
    if (i >= tokens.length) return;
    const t = tokens[i]!;
    if (t.kind === 'cmd') {
      cmd = t.v;
      i += 1;
    }
  };

  const isRel = (c: string) => c === c.toLowerCase();

  while (i < tokens.length) {
    nextCmdOrKeep();
    const c = cmd;
    const rel = isRel(c);
    const up = c.toUpperCase();

    if (up === 'Z') {
      segments.push({ kind: 'close' });
      closed = true;
      curr = { ...start };
      lastCubicCtrl = null;
      lastQuadCtrl = null;
      continue;
    }

    const readPoint = (): Point | null => {
      const x = nextNum();
      const y = nextNum();
      if (x === null || y === null) return null;
      return rel ? add(curr, { x, y }) : { x, y };
    };

    switch (up) {
      case 'M': {
        const p = readPoint();
        if (!p) break;
        segments.push({ kind: 'move', to: p });
        curr = p;
        start = p;
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        // Subsequent pairs are treated as implicit "L"
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const p = readPoint();
        if (!p) break;
        segments.push({ kind: 'line', to: p });
        curr = p;
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'H': {
        const x = nextNum();
        if (x === null) break;
        const p = rel ? { x: curr.x + x, y: curr.y } : { x, y: curr.y };
        segments.push({ kind: 'line', to: p });
        curr = p;
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'V': {
        const y = nextNum();
        if (y === null) break;
        const p = rel ? { x: curr.x, y: curr.y + y } : { x: curr.x, y };
        segments.push({ kind: 'line', to: p });
        curr = p;
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'C': {
        const c1 = readPoint();
        const c2 = readPoint();
        const p = readPoint();
        if (!c1 || !c2 || !p) break;
        segments.push({ kind: 'cubic', c1, c2, to: p });
        lastCubicCtrl = c2;
        lastQuadCtrl = null;
        curr = p;
        break;
      }
      case 'S': {
        const c2 = readPoint();
        const p = readPoint();
        if (!c2 || !p) break;
        const c1 = lastCubicCtrl
          ? { x: 2 * curr.x - lastCubicCtrl.x, y: 2 * curr.y - lastCubicCtrl.y }
          : { ...curr };
        segments.push({ kind: 'cubic', c1, c2, to: p });
        lastCubicCtrl = c2;
        lastQuadCtrl = null;
        curr = p;
        break;
      }
      case 'Q': {
        const qc: Point | null = readPoint();
        const p = readPoint();
        if (!qc || !p) break;
        segments.push({ kind: 'quad', c: qc, to: p });
        lastQuadCtrl = qc;
        lastCubicCtrl = null;
        curr = p;
        break;
      }
      case 'T': {
        const p = readPoint();
        if (!p) break;
        const qc: Point = lastQuadCtrl
          ? { x: 2 * curr.x - lastQuadCtrl.x, y: 2 * curr.y - lastQuadCtrl.y }
          : { ...curr };
        segments.push({ kind: 'quad', c: qc, to: p });
        lastQuadCtrl = qc;
        lastCubicCtrl = null;
        curr = p;
        break;
      }
      case 'A': {
        const rx = nextNum();
        const ry = nextNum();
        const rot = nextNum();
        const laf = nextNum();
        const sf = nextNum();
        const p = readPoint();
        if (rx === null || ry === null || rot === null || laf === null || sf === null || !p) break;
        const arc = svgArcToCenter(curr, p, rx, ry, rot, laf ? 1 : 0, sf ? 1 : 0);
        if (!arc) {
          segments.push({ kind: 'line', to: p });
        } else {
          segments.push({
            kind: 'arc',
            center: arc.center,
            radius: arc.radius,
            rotation: arc.rotation,
            startAngle: arc.startAngle,
            endAngle: arc.endAngle,
            ccw: arc.ccw,
          });
        }
        curr = p;
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      default:
        // Unsupported command: consume one token to avoid infinite loop.
        i += 1;
        break;
    }
  }

  return { segments, closed };
};
