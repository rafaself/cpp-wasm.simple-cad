/**
 * PDF path utilities - segment normalization and bounds computation.
 */
import type { VectorSegment } from '../../../types';

export const round4 = (v: number): number => {
  const s = 10_000;
  return Math.round(v * s) / s;
};

export const keyForSegments = (segs: readonly VectorSegment[], closed: boolean): string => {
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

export const boundsFromSegments = (
  segments: readonly VectorSegment[],
): { minX: number; minY: number; maxX: number; maxY: number } => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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

export const normalizePoint = (
  p: { x: number; y: number },
  minX: number,
  minY: number,
  height: number,
): { x: number; y: number } => ({
  x: p.x - minX,
  y: height - (p.y - minY),
});

export const normalizeSegments = (
  segments: VectorSegment[],
  minX: number,
  minY: number,
  height: number,
): VectorSegment[] =>
  segments.map((s) => {
    switch (s.kind) {
      case 'move':
      case 'line':
        return { ...s, to: normalizePoint(s.to, minX, minY, height) };
      case 'quad':
        return {
          ...s,
          c: normalizePoint(s.c, minX, minY, height),
          to: normalizePoint(s.to, minX, minY, height),
        };
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

export const isTransparent = (hex: string | undefined): boolean =>
  !hex || hex === 'transparent' || hex === 'none';
