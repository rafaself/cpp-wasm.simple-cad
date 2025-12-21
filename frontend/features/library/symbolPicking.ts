import type { Point, Shape } from '@/types';

export const worldToSymbolUv = (shape: Shape, world: Point): { u: number; v: number } | null => {
  if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return null;
  const width = shape.width;
  const height = shape.height;
  if (!(width > 0) || !(height > 0)) return null;

  const centerX = shape.x + width / 2;
  const centerY = shape.y + height / 2;
  let dx = world.x - centerX;
  let dy = world.y - centerY;

  const rot = shape.rotation ?? 0;
  if (rot) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    // rotate by -rot
    const x = dx * c + dy * s;
    const y = -dx * s + dy * c;
    dx = x;
    dy = y;
  }

  const flipX = shape.scaleX ?? 1;
  const flipY = shape.scaleY ?? 1;
  if (flipX === 0 || flipY === 0) return null;
  const denomX = width * flipX;
  const denomY = height * flipY;
  if (!Number.isFinite(denomX) || !Number.isFinite(denomY) || denomX === 0 || denomY === 0) return null;

  const nx = dx / denomX; // [-0.5, 0.5]
  const ny = dy / denomY;
  const u = nx + 0.5;
  const v = ny + 0.5;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  return { u, v };
};

export type SymbolAlphaSampler = (symbolId: string, u: number, v: number) => number | null;

export const isSymbolInstanceHitAtWorldPoint = (
  shape: Shape,
  world: Point,
  sampleAlphaAtUv: SymbolAlphaSampler,
  opts?: { toleranceWorld?: number; alphaThreshold?: number },
): boolean => {
  if (!shape.svgSymbolId) return false;
  if (shape.x === undefined || shape.y === undefined || shape.width === undefined || shape.height === undefined) return false;

  const width = shape.width;
  const height = shape.height;
  if (!(width > 0) || !(height > 0)) return false;

  const tol = opts?.toleranceWorld ?? 0;
  const alphaThreshold = opts?.alphaThreshold ?? 1;

  const centerX = shape.x + width / 2;
  const centerY = shape.y + height / 2;
  let dx = world.x - centerX;
  let dy = world.y - centerY;

  const rot = shape.rotation ?? 0;
  if (rot) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const x = dx * c + dy * s;
    const y = -dx * s + dy * c;
    dx = x;
    dy = y;
  }

  const flipX = shape.scaleX ?? 1;
  const flipY = shape.scaleY ?? 1;
  if (flipX === 0 || flipY === 0) return false;

  const denomX = width * flipX;
  const denomY = height * flipY;
  if (!Number.isFinite(denomX) || !Number.isFinite(denomY) || denomX === 0 || denomY === 0) return false;

  const halfX = Math.abs(denomX) / 2;
  const halfY = Math.abs(denomY) / 2;
  if (Math.abs(dx) > halfX + tol || Math.abs(dy) > halfY + tol) return false;

  const cx = Math.max(-halfX, Math.min(halfX, dx));
  const cy = Math.max(-halfY, Math.min(halfY, dy));

  const u = cx / denomX + 0.5;
  const v = cy / denomY + 0.5;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return false;

  const alpha = sampleAlphaAtUv(shape.svgSymbolId, u, v);
  if (alpha === null) return true;
  return alpha >= alphaThreshold;
};
