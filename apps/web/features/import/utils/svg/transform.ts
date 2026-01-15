import { identity, multiply, fromRotation, fromScaling, fromTranslation } from '../dxf/matrix2d';

import type { Mat2D } from '../dxf/matrix2d';

const toNumber = (value: string): number | null => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const parseNumberList = (raw: string): number[] => {
  const nums: number[] = [];
  const re = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/g;
  for (const m of raw.matchAll(re)) {
    const n = toNumber(m[0]);
    if (n !== null) nums.push(n);
  }
  return nums;
};

const degToRad = (deg: number): number => (deg * Math.PI) / 180;

export const parseSvgTransform = (raw: string | undefined): Mat2D => {
  if (!raw) return identity();
  let acc = identity();
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (const m of raw.matchAll(re)) {
    const name = m[1]!.toLowerCase();
    const args = parseNumberList(m[2] ?? '');
    let t = identity();
    switch (name) {
      case 'matrix': {
        if (args.length >= 6) {
          t = { a: args[0]!, b: args[1]!, c: args[2]!, d: args[3]!, e: args[4]!, f: args[5]! };
        }
        break;
      }
      case 'translate': {
        const x = args[0] ?? 0;
        const y = args[1] ?? 0;
        t = fromTranslation(x, y);
        break;
      }
      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args.length > 1 ? (args[1] ?? 1) : sx;
        t = fromScaling(sx, sy);
        break;
      }
      case 'rotate': {
        const angle = args[0] ?? 0;
        const rad = degToRad(angle);
        t = fromRotation(rad);
        if (args.length >= 3) {
          const cx = args[1] ?? 0;
          const cy = args[2] ?? 0;
          t = multiply(fromTranslation(cx, cy), multiply(t, fromTranslation(-cx, -cy)));
        }
        break;
      }
      case 'skewx': {
        const ang = degToRad(args[0] ?? 0);
        t = { a: 1, b: 0, c: Math.tan(ang), d: 1, e: 0, f: 0 };
        break;
      }
      case 'skewy': {
        const ang = degToRad(args[0] ?? 0);
        t = { a: 1, b: Math.tan(ang), c: 0, d: 1, e: 0, f: 0 };
        break;
      }
      default:
        break;
    }
    // SVG transforms apply in the order they appear: M = M * T
    acc = multiply(acc, t);
  }
  return acc;
};
