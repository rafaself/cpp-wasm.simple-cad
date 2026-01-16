import { DxfVector } from './types';

// Constants for tessellation
export const DEFAULT_TOLERANCE_DEGREES = 0.5;

/**
 * Tessellates an arc into a series of points (polyline).
 * @param center The center of the arc.
 * @param radius The radius of the arc.
 * @param startAngle The start angle in radians.
 * @param endAngle The end angle in radians.
 * @param isCounterClockwise Whether the arc is drawn counter-clockwise.
 * @param toleranceDegrees The maximum angular step in degrees.
 * @returns An array of points representing the arc.
 */
export const tessellateArc = (
  center: DxfVector,
  radius: number,
  startAngle: number, // Radians
  endAngle: number, // Radians
  isCounterClockwise: boolean = true,
  toleranceDegrees: number = DEFAULT_TOLERANCE_DEGREES,
): DxfVector[] => {
  const points: DxfVector[] = [];

  // Normalize angles to [0, 2PI)
  let s = startAngle % (2 * Math.PI);
  if (s < 0) s += 2 * Math.PI;

  let e = endAngle % (2 * Math.PI);
  if (e < 0) e += 2 * Math.PI;

  // Calculate sweep
  let sweep = e - s;

  if (isCounterClockwise) {
    if (sweep <= 0) sweep += 2 * Math.PI;
  } else {
    if (sweep >= 0) sweep -= 2 * Math.PI;
  }

  // Special case for full circle (avoid 0 sweep if start ~= end)
  if (Math.abs(sweep) < 1e-10) sweep = isCounterClockwise ? 2 * Math.PI : -2 * Math.PI;

  const toleranceRad = (toleranceDegrees * Math.PI) / 180;
  // Ensure we don't have infinite segments if tolerance is 0 or very small
  const safeTolerance = Math.max(toleranceRad, 0.001);

  // Calculate number of segments based on tolerance
  // But this is angular step, not error.
  // If tolerance is "angular step", simple division.
  // If tolerance is "chord error" (sagitta), steps = acos(1 - error/radius) * 2 or similar.
  // User said: "Passo angular baseado em tolerância (ex: 0.5°)" -> Angular step.

  const steps = Math.ceil(Math.abs(sweep) / safeTolerance);
  const numSegments = Math.max(steps, 8); // Minimum 8 segments for a circle-like curve

  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const angle = s + sweep * t;

    points.push({
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    });
  }

  return points;
};

/**
 * Tessellates a circle into a closed polyline.
 * @param center The center of the circle.
 * @param radius The radius of the circle.
 * @param toleranceDegrees The maximum angular step in degrees.
 * @returns An array of points representing the circle (closed).
 */
export const tessellateCircle = (
  center: DxfVector,
  radius: number,
  toleranceDegrees: number = DEFAULT_TOLERANCE_DEGREES,
): DxfVector[] => {
  return tessellateArc(center, radius, 0, 2 * Math.PI, true, toleranceDegrees);
};

/**
 * Calculates intermediate points for a polyline segment with a bulge.
 * Bulge = tan(theta/4)
 * @param p1 Start point
 * @param p2 End point
 * @param bulge Bulge value
 * @param toleranceDegrees Angular tolerance
 */
export const tessellateBulge = (
  p1: DxfVector,
  p2: DxfVector,
  bulge: number,
  toleranceDegrees: number = DEFAULT_TOLERANCE_DEGREES,
): DxfVector[] => {
  if (Math.abs(bulge) < 1e-10) return []; // Straight line, no intermediate points needed

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1e-10) return [];

  // Radius: r = (d/2) / sin(theta/2)
  // Note: sin(theta/2) can be close to 0 if bulge is small, but we checked bulge size.
  // However, if bulge is huge, theta approaches 2PI (rare).
  // Let's use the robust algebraic formula for center calculation.

  const b = bulge;
  const radius = (dist * (1 + b * b)) / (4 * Math.abs(b));

  // Center coordinates
  // cx = (x1+x2)/2 - b*(y2-y1)/(1-b^2) ?? No, that's wrong.
  // Correct formula from common DXF implementations:
  // cx = (x1 + x2) / 2 - (dy * (1 - b*b)) / (4 * b);
  // cy = (y1 + y2) / 2 + (dx * (1 - b*b)) / (4 * b);

  const cx = (p1.x + p2.x) / 2 - (dy * (1 - b * b)) / (4 * b);
  const cy = (p1.y + p2.y) / 2 + (dx * (1 - b * b)) / (4 * b);
  const center = { x: cx, y: cy };

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const endAngle = Math.atan2(p2.y - cy, p2.x - cx);

  // Determine sweep direction
  // If bulge > 0, CCW. If bulge < 0, CW.
  const isCounterClockwise = b > 0;

  // Use tessellateArc but we need to exclude start point (p1) to avoid duplicate if appending,
  // AND we exclude end point (p2) because usually p2 is the start of next segment.
  // BUT tessellateArc includes both start and end.
  // We will slice the result.

  const points = tessellateArc(
    center,
    radius,
    startAngle,
    endAngle,
    isCounterClockwise,
    toleranceDegrees,
  );

  // Remove first and last point because they are p1 and p2 (approximately)
  // We only want intermediate points.
  if (points.length >= 2) {
    return points.slice(1, -1);
  }
  return [];
};

/**
 * Tessellates a Spline using B-Spline interpolation.
 * Supports NURBS if weights/knots provided (simplified implementation).
 * Currently implements Uniform B-Spline or basic interpolation.
 */
export const tessellateSpline = (
  controlPoints: DxfVector[],
  degree: number = 3,
  knots?: number[],
  weights?: number[],
  resolution: number = 20, // Segments per span
): DxfVector[] => {
  if (controlPoints.length < degree + 1) return controlPoints;

  const points: DxfVector[] = [];
  const n = controlPoints.length - 1; // Index of last control point
  const p = degree;

  // Default Knots if missing (Clamped Uniform)
  let _knots = knots;
  if (!_knots || _knots.length === 0) {
    _knots = [];
    for (let i = 0; i <= p; i++) _knots.push(0);
    const internalSpans = n + 1 - p;
    for (let i = 1; i < internalSpans; i++) _knots.push(i);
    for (let i = 0; i <= p; i++) _knots.push(internalSpans);
  }

  // Default Weights if missing (all 1)
  let _weights = weights;
  if (!_weights || _weights.length === 0) {
    _weights = new Array(controlPoints.length).fill(1);
  }

  // De Boor's Algorithm implementation
  // N(i,p,t)
  const N = (i: number, p: number, t: number, knots: number[]): number => {
    if (p === 0) {
      return t >= knots[i] && t < knots[i + 1] ? 1 : 0;
    }

    const d1 = knots[i + p] - knots[i];
    const t1 = d1 === 0 ? 0 : ((t - knots[i]) / d1) * N(i, p - 1, t, knots);

    const d2 = knots[i + p + 1] - knots[i + 1];
    const t2 = d2 === 0 ? 0 : ((knots[i + p + 1] - t) / d2) * N(i + 1, p - 1, t, knots);

    return t1 + t2;
  };

  // Range: knots[p] to knots[m-p] (usually max knot value if clamped)
  const minT = _knots[p];
  const maxT = _knots[_knots.length - 1 - p];

  // Calculate total steps
  // Based on number of knot spans * resolution
  // Or just simple sampling
  const totalSteps = Math.ceil((maxT - minT) * resolution); // Resolution per unit of T

  for (let i = 0; i <= totalSteps; i++) {
    let t = minT + (i / totalSteps) * (maxT - minT);
    if (t > maxT) t = maxT;
    if (i === totalSteps) t = maxT - 0.000001; // Avoid boundary issue at exact end

    let x = 0,
      y = 0,
      rationalWeight = 0;

    // Sum basis functions
    // Optimization: Only iterate relevant i where N > 0 (i around t)
    // For simplicity, iterating all (or optimise range [floor(t)-p, floor(t)])

    for (let j = 0; j <= n; j++) {
      // Using full loop for correctness first
      const basis = N(j, p, t, _knots);
      if (basis > 1e-10) {
        const w = _weights![j] || 1;
        x += basis * controlPoints[j].x * w;
        y += basis * controlPoints[j].y * w;
        rationalWeight += basis * w;
      }
    }

    if (rationalWeight > 1e-10) {
      points.push({ x: x / rationalWeight, y: y / rationalWeight });
    }
  }

  // Ensure end point is exactly the last control point if clamped
  // (This is handled by t slightly less than maxT, but let's be explicit if needed)
  // Actually, rational BSpline might not pass through last CP if weights differ or not clamped perfectly.
  // But usually for DXF it's clamped.

  return points;
};
