export type Mat2D = {
  a: number; // m11 (Scale X / Cos)
  b: number; // m12 (Sin)
  c: number; // m21 (-Sin)
  d: number; // m22 (Scale Y / Cos)
  e: number; // m13 (Translate X)
  f: number; // m23 (Translate Y)
};

export const identity = (): Mat2D => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
});

// Multiply: M1 * M2 (M1 applied after M2? Or M1 * M2 meaning M2 applied first?)
// Standard convention: M = M_parent * M_child.
// Point p' = M * p = M_parent * (M_child * p)
// So we want result such that result * p = m1 * (m2 * p).
//
// [ a1 c1 e1 ]   [ a2 c2 e2 ]
// [ b1 d1 f1 ] x [ b2 d2 f2 ]
// [ 0  0  1  ]   [ 0  0  1  ]
//
// a = a1*a2 + c1*b2
// c = a1*c2 + c1*d2
// e = a1*e2 + c1*f2 + e1
// ...
export const multiply = (m1: Mat2D, m2: Mat2D): Mat2D => {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    b: m1.b * m2.a + m1.d * m2.b,
    d: m1.b * m2.c + m1.d * m2.d,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
};

export const applyToPoint = (m: Mat2D, p: { x: number; y: number }): { x: number; y: number } => {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  };
};

export const fromTranslation = (x: number, y: number): Mat2D => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: x,
  f: y,
});

export const fromScaling = (sx: number, sy: number): Mat2D => ({
  a: sx,
  b: 0,
  c: 0,
  d: sy,
  e: 0,
  f: 0,
});

export const fromRotation = (angleRad: number): Mat2D => {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return {
    a: c,
    b: s,
    c: -s,
    d: c,
    e: 0,
    f: 0,
  };
};

/**
 * Creates a matrix from Translation, Rotation (degrees), Scale.
 * Order: Translate * Rotate * Scale (Standard TRS)
 * This corresponds to: Move to position, then rotate, then scale.
 *
 * However, for Block Insert, the logic is usually:
 * Translate to InsertPoint * Rotate by Angle * Scale
 *
 * Note: AutoCAD Insert applies Scale, then Rotation, then Translation relative to the block origin.
 * Let's verify standard composition order.
 * p_world = T * R * S * p_local
 */
export const fromTRS = (
  tx: number,
  ty: number,
  rotationDeg: number,
  sx: number,
  sy: number,
): Mat2D => {
  // M = T * R * S
  // We can construct manually or multiply

  const rad = rotationDeg * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // S
  // [ sx 0 0 ]
  // [ 0 sy 0 ]

  // R * S
  // [ c -s 0 ] [ sx 0 0 ]   [ c*sx -s*sy 0 ]
  // [ s  c 0 ] [ 0 sy 0 ] = [ s*sx  c*sy 0 ]

  // T * (R * S)
  // [ 1 0 tx ] [ ... ]   [ c*sx -s*sy tx ]
  // [ 0 1 ty ] [ ... ] = [ s*sx  c*sy ty ]

  return {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    e: tx,
    f: ty,
  };
};

export const isSimilarityTransform = (m: Mat2D): { ok: boolean; scale: number } => {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  const dot = m.a * m.c + m.b * m.d;
  const scale = sx || 1;
  const ok = Math.abs(sx - sy) < 1e-6 && Math.abs(dot) < 1e-6 && isFinite(scale) && scale > 0;
  return { ok, scale };
};
