import { Shape, Layer, Point } from '../../../../types';
import { generateId } from '../../../../utils/uuid';
import { DxfData, DxfEntity, DxfVector, DxfImportOptions } from './types';

export interface DxfImportResult {
  shapes: Shape[];
  layers: Layer[];
  width: number;
  height: number;
  origin: { x: number; y: number };
}

const DXF_COLORS: Record<number, string> = {
  1: '#FF0000', // Red
  2: '#FFFF00', // Yellow
  3: '#00FF00', // Green
  4: '#00FFFF', // Cyan
  5: '#0000FF', // Blue
  6: '#FF00FF', // Magenta
  7: '#000000', // Black (Dark on Light Canvas)
  8: '#808080', // Gray
  9: '#C0C0C0', // Light Gray
  250: '#333333',
  251: '#555555',
  252: '#777777',
  253: '#999999',
  254: '#BBBBBB',
  255: '#FFFFFF',
};

const getDxfColor = (index?: number, layerColor?: string): string => {
  // undefined = ByLayer, 0 = ByBlock, 256 = ByLayer
  if (index === undefined || index === 0 || index === 256) return layerColor || '#000000';
  if (DXF_COLORS[index]) return DXF_COLORS[index];
  if (index > 9 && index < 250) {
      return '#CCCCCC';
  }
  return '#000000'; // Default black
};

const toGrayscale = (hex: string): string => {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const gs = y.toString(16).padStart(2, '0');
    return `#${gs}${gs}${gs}`;
};

const dist = (p1: DxfVector, p2: DxfVector) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

// DXF Unit Codes to Centimeters (CM) Conversion Factors
// Source: AutoCAD DXF Reference ($INSUNITS)
const DXF_UNITS: Record<number, number> = {
    1: 2.54,      // Inches
    2: 30.48,     // Feet
    3: 160934.4,  // Miles
    4: 0.1,       // Millimeters
    5: 1.0,       // Centimeters
    6: 100.0,     // Meters
    7: 100000.0,  // Kilometers
    8: 0.00000254, // Microinches
    9: 0.00254,   // Mils
    10: 91.44,    // Yards
    11: 1.0e-8,   // Angstroms
    12: 1.0e-7,   // Nanometers
    13: 0.0001,   // Microns
    14: 10.0,     // Decimeters
    15: 1000.0,   // Decameters
    16: 10000.0,  // Hectometers
    17: 1.0e11,   // Gigameters
};

// DXF Linetype Mapping
// Format: [dash, gap, dash, gap...]
// We use rough approximations for common AutoCAD linetypes.
const LINETYPES: Record<string, number[]> = {
    'DASHED': [10, 5],
    'DASHED2': [5, 2.5],     // 0.5x
    'DASHEDX2': [20, 10],    // 2x
    'HIDDEN': [5, 5],
    'HIDDEN2': [2.5, 2.5],
    'HIDDENX2': [10, 10],
    'CENTER': [20, 5, 5, 5], // Long, gap, short, gap
    'CENTER2': [10, 2.5, 2.5, 2.5],
    'CENTERX2': [40, 10, 10, 10],
    'PHANTOM': [20, 5, 5, 5, 5, 5], // Long, gap, short, gap, short, gap
    'PHANTOM2': [10, 2.5, 2.5, 2.5, 2.5, 2.5],
    'PHANTOMX2': [40, 10, 10, 10, 10, 10],
    'DOT': [2, 2],
    'DOT2': [1, 1],
    'DOTX2': [4, 4],
    'DIVIDE': [20, 5, 2, 5, 2, 5], // Long, gap, dot, gap, dot, gap
    'BORDER': [20, 5, 20, 5, 5, 5],
};

const getLinetype = (name?: string): number[] => {
    if (!name) return [];
    const upper = name.toUpperCase();
    return LINETYPES[upper] || [];
};

const MIN_TEXT_SIZE = 0.1; // Reduced to allow small text (e.g. in Meters) to exist

/**
 * Uniform B-Spline interpolation for Degree 2 (Quadratic) and 3 (Cubic).
 * DXF Splines are NURBS, but often uniform knot vectors are sufficient for
 * visual approximation if we ignore weights and complex knots.
 */
const interpolateSpline = (controlPoints: DxfVector[], degree: number = 3, resolution: number = 20): DxfVector[] => {
    if (controlPoints.length < degree + 1) return controlPoints;

    const points: DxfVector[] = [];
    const n = controlPoints.length;

    // Simple uniform B-Spline basis functions
    // Note: This is a simplification. Real DXF parsing should use knots/weights.
    // However, for standard "Fit" splines, this visual approximation is vastly better than straight lines.

    // For visual fidelity, we might actually want Catmull-Rom if the spline is "passing through" points,
    // but DXF SPLINE usually defines Control Vertices (CVs) which pull the curve (B-Spline behavior).
    // If "fit points" are provided in DXF, we should prioritize those, but dxf-parser mainly gives controlPoints.

    // We will generate a curve that approximates the shape defined by CVs.

    // De Boor's algorithm is ideal but complex to implement from scratch without knots.
    // We'll use a standard cubic B-Spline subdivision or sampling.

    // Sampling along t=[0, 1] relative to the knot spans.
    // Valid parameter range for clamped B-spline is usually [knots[degree], knots[n]]

    // Let's implement a basic Chaikin's algorithm or similar subdivision for visual smoothing
    // OR just sample a Bezier approximation.
    // Most efficient: Convert B-Spline segments to Cubic Beziers.

    // Alternative: Just simple subdivision (Chaikin) for quadratic (degree 2)
    // For cubic, we can use 4-point windowing.

    const dt = 1.0 / resolution;

    // Range of parameter t where the B-spline is defined
    // For a uniform B-Spline with 'n' control points and degree 'p':
    // It is defined for t from p to n.
    // Basis functions N_i,p(t)

    // Implementation of Cox-De Boor recursion for basis functions
    const N = (i: number, p: number, t: number, knots: number[]): number => {
        if (p === 0) {
            return (t >= knots[i] && t < knots[i+1]) ? 1 : 0;
        }
        const denom1 = knots[i+p] - knots[i];
        const term1 = denom1 === 0 ? 0 : ((t - knots[i]) / denom1) * N(i, p-1, t, knots);

        const denom2 = knots[i+p+1] - knots[i+1];
        const term2 = denom2 === 0 ? 0 : ((knots[i+p+1] - t) / denom2) * N(i+1, p-1, t, knots);

        return term1 + term2;
    };

    // Generate uniform knots if missing.
    // Clamped/Open uniform knot vector: [0,0,0,0, 1, 2, ... m-p, m-p, m-p, m-p]
    // Unclamped/Periodic: [0, 1, 2, ... n+p]
    // DXF splines are usually clamped (start/end at first/last CV).

    const count = controlPoints.length;
    const knots: number[] = [];

    // Create Clamped Uniform Knot Vector
    // p+1 zeros, then internal, then p+1 max values
    for (let i = 0; i <= degree; i++) knots.push(0);
    const internalSpans = count - degree; // Number of valid segments
    for (let i = 1; i < internalSpans; i++) knots.push(i);
    for (let i = 0; i <= degree; i++) knots.push(internalSpans);

    const maxT = internalSpans;
    const totalSteps = maxT * resolution;

    for (let step = 0; step <= totalSteps; step++) {
        let t = (step / totalSteps) * maxT;
        if (t >= maxT) t = maxT - 0.000001; // Avoid going out of bound at exact end

        let x = 0, y = 0;
        // Optimization: N(i,p,t) is non-zero only for i in [floor(t)-p, floor(t)]
        // But for simplicity/robustness, we sum all active basis functions.
        for (let i = 0; i < count; i++) {
            const basis = N(i, degree, t, knots);
            if (basis > 0) {
                x += basis * controlPoints[i].x;
                y += basis * controlPoints[i].y;
            }
        }
        points.push({ x, y });
    }

    // Ensure we hit the last point exactly if clamped
    points.push(controlPoints[controlPoints.length - 1]);

    return points;
};

/**
 * Calculates intermediate points for a polyline segment with a bulge.
 * Bulge = tan(theta/4)
 */
const getBulgeCurvePoints = (p1: DxfVector, p2: DxfVector, bulge: number): DxfVector[] => {
    if (bulge === 0) return [];

    const theta = 4 * Math.atan(bulge);
    const d = dist(p1, p2);
    if (d < 1e-10) return [];

    const radius = d / (2 * Math.sin(theta / 2));
    const chordAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    // Center calculation depends on bulge sign
    // If bulge > 0, arc is CCW relative to chord.
    // Angle to center from p1 is chordAngle + (PI/2 - theta/2)
    const angleToCenter = chordAngle + (Math.PI / 2 - theta / 2);

    // We need absolute radius for distance, but sign matters for direction if we used different math.
    // Here we use geometry to find center.
    // Distance from chord midpoint to center = radius * cos(theta/2)

    // Alternative Center Calculation (Robust):
    // alpha = angle between chord and radius = (PI - theta)/2
    // Center is at p1 + vector(len=abs(r), angle=chordAngle + (PI/2 - theta/2)) ??
    // Actually simpler:
    // M = midpoint
    // Sagitta (height of arc from chord) = r - r*cos(theta/2)

    // Let's use the algebraic formula for center:
    const b = bulge;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const norm = Math.sqrt(dx*dx + dy*dy);

    // From bulge definition
    const radius_val = (norm * (1 + b*b)) / (4 * b);

    // Center coordinates
    const cx = (p1.x + p2.x) / 2 - (dy * (1 - b*b)) / (4 * b);
    const cy = (p1.y + p2.y) / 2 + (dx * (1 - b*b)) / (4 * b);

    const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    const endAngle = Math.atan2(p2.y - cy, p2.x - cx);

    const points: DxfVector[] = [];

    // Determine sweep
    let sweep = endAngle - startAngle;
    if (b > 0 && sweep < 0) sweep += Math.PI * 2;
    if (b < 0 && sweep > 0) sweep -= Math.PI * 2;

    // Tessellation quality - roughly 1 segment per 5 degrees or based on error
    const segments = Math.max(8, Math.ceil(Math.abs(sweep) / (5 * Math.PI / 180)));

    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const ang = startAngle + sweep * t;
        points.push({
            x: cx + Math.abs(radius_val) * Math.cos(ang),
            y: cy + Math.abs(radius_val) * Math.sin(ang)
        });
    }

    return points;
};

export const convertDxfToShapes = (data: DxfData, options: DxfImportOptions): DxfImportResult => {
  const ENTITY_LIMIT = 30000;
  let entityCount = data.entities ? data.entities.length : 0;
  if (data.blocks) {
      Object.values(data.blocks).forEach(b => entityCount += (b.entities?.length || 0));
  }
  if (entityCount > ENTITY_LIMIT) {
      throw new Error(`Arquivo excede o limite de segurança de ${ENTITY_LIMIT} entidades.`);
  }

  // Determine Scale Factor based on DXF Units
  // Default to 1 (Unitless/Centimeters) if undefined
  const insUnits = data.header?.$INSUNITS;
  let globalScale = (insUnits !== undefined && DXF_UNITS[insUnits]) ? DXF_UNITS[insUnits] : 1;

  // Auto-Detect Scale Heuristic for Unitless Files
  if (insUnits === undefined) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let sampleCount = 0;

      // Use $EXTMIN / $EXTMAX as seeds if available
      if (data.header?.$EXTMIN && data.header?.$EXTMAX) {
          minX = data.header.$EXTMIN.x;
          maxX = data.header.$EXTMAX.x;
          minY = data.header.$EXTMIN.y;
          maxY = data.header.$EXTMAX.y;
      }
      
      const updateBounds = (v: DxfVector) => {
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
      };

      // Check main entities (limit sample to first 1000 for speed)
      if (data.entities) {
          for (const e of data.entities) {
              if (sampleCount > 1000) break;
              if (e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
                  e.vertices?.forEach(updateBounds);
                  sampleCount++;
              } else if (e.type === 'INSERT' && e.position) {
                  updateBounds(e.position);
                  sampleCount++;
              }
          }
      }

      const extent = Math.max(maxX - minX, maxY - minY);
      // If extent is valid and small (e.g., < 2000), it's likely Meters (e.g., a 10m house is 10 units).
      // If it were MM, a 10m house would be 10000 units.
      // If it were CM, a 10m house would be 1000 units.
      if (extent > 0 && extent < 2000) {
          globalScale = 100; // Assume Meters -> CM
          console.log(`DXF Import: Auto-detected unitless file with small extents (${extent.toFixed(2)}). Assuming Meters. Scale: 100`);
      }
  }

  console.log(`DXF Import: Detected Units Code ${insUnits}, applying Scale Factor: ${globalScale}`);

  const shapes: Shape[] = [];
  const layersMap: Map<string, Layer> = new Map();

  if (data.tables && data.tables.layer && data.tables.layer.layers) {
    Object.values(data.tables.layer.layers).forEach(l => {
      const layerId = generateId('layer');
      let strokeColor = getDxfColor(l.color);
      if (options.grayscale) strokeColor = toGrayscale(strokeColor);

      layersMap.set(l.name, {
        id: layerId,
        name: l.name,
        strokeColor: strokeColor,
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        visible: l.visible !== false,
        locked: options.readOnly || Boolean(l.frozen),
        isNative: false
      });
    });
  }

  const resolveLayerId = (layerName: string): string => {
    const layer = layersMap.get(layerName);
    return layer ? layer.id : options.defaultLayerId;
  };

  const resolveLayerColor = (layerName: string): string => {
    const layer = layersMap.get(layerName);
    return layer ? layer.strokeColor : '#000000';
  };

  const processEntity = (
    entity: DxfEntity,
    transform: { x: number, y: number, rotation: number, scaleX: number, scaleY: number },
    parentLayer?: string,
    parentColor?: string,
    visitedBlocks: Set<string> = new Set()
  ) => {
    if (shapes.length > ENTITY_LIMIT) return;

    // Layer Inheritance
    const rawLayer = entity.layer || '0';
    const effectiveLayer = (rawLayer === '0' && parentLayer) ? parentLayer : rawLayer;

    const layerId = resolveLayerId(effectiveLayer);
    const layerColor = resolveLayerColor(effectiveLayer);

    // Color Inheritance
    let color = getDxfColor(entity.color, layerColor);

    // ByBlock(0) override
    if (entity.color === 0 && parentColor) {
        color = parentColor;
    }

    if (options.grayscale) color = toGrayscale(color);

    // Linetype Resolution
    // DXF hierarchy: Entity Linetype > Layer Linetype > Continuous
    // But entity.lineType might be 'ByLayer' or 'ByBlock'
    const rawLinetype = entity.lineType;
    let effectiveLinetypeName = rawLinetype;

    // If undefined or ByLayer, check Layer
    if (!effectiveLinetypeName || effectiveLinetypeName.toLowerCase() === 'bylayer') {
        // Need to fetch layer linetype (not currently in our Layer map, assuming simplified import)
        // For now, if BYLAYER, we default to continuous unless we map layer properties deeper.
        // TODO: Map layer linetypes from tables.layer.layers
    }

    const strokeDash = getLinetype(effectiveLinetypeName);

    const trans = (p: DxfVector): Point => {
      let x = p.x * transform.scaleX;
      let y = p.y * transform.scaleY;

      if (transform.rotation !== 0) {
        const rad = transform.rotation * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        x = rx;
        y = ry;
      }

      return {
        x: x + transform.x,
        y: y + transform.y
      };
    };

    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          shapes.push({
            id: generateId('dxf-line'),
            type: 'line',
            points: [trans(entity.vertices[0]), trans(entity.vertices[1])],
            strokeColor: color,
            strokeWidth: 1,
            strokeDash: strokeDash,
            strokeEnabled: true,
            fillColor: 'transparent',
            fillEnabled: false,
            layerId,
            floorId: options.floorId,
            discipline: 'architecture'
          });
        }
        break;

      case 'LWPOLYLINE':
      case 'POLYLINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          const rawPts: DxfVector[] = [];
          const vs = entity.vertices;
          const isClosed = (entity as any).closed === true || (entity.closed === true);

          for (let i = 0; i < vs.length; i++) {
              const curr = vs[i];
              rawPts.push(curr);

              // Check if we need to close back to start
              const next = (i === vs.length - 1)
                  ? (isClosed ? vs[0] : null)
                  : vs[i+1];

              if (next && curr.bulge && Math.abs(curr.bulge) > 1e-10) {
                  const curvePts = getBulgeCurvePoints(curr, next, curr.bulge);
                  rawPts.push(...curvePts);
              }
          }

          if (isClosed && rawPts.length > 2) {
              // Ensure physical closure if not already
              const first = rawPts[0];
              const last = rawPts[rawPts.length-1];
              if (dist(first, last) > 0.001) {
                  rawPts.push({...first});
              }
          }

          // Apply Transform
          const pts = rawPts.map(v => trans(v));

          shapes.push({
            id: generateId('dxf-poly'),
            type: 'polyline',
            points: pts,
            strokeColor: color,
            strokeWidth: 1,
            strokeDash: strokeDash,
            strokeEnabled: true,
            fillColor: 'transparent',
            fillEnabled: false,
            layerId,
            floorId: options.floorId,
            discipline: 'architecture'
          });
        }
        break;

      case 'SPLINE':
        if (entity.controlPoints && entity.controlPoints.length > 1) {
             // Use transformed control points for interpolation?
             // Better to interpolate in local space then transform, to handle non-uniform scale properly if needed.
             // BUT, trans() handles rotation/scale. B-Spline affine invariance holds.
             // We can interpolate Control Points in World Space (after trans).

             const rawCPs = entity.controlPoints.map(p => trans(p));
             const degree = entity.degree || 3;

             // If we have very few points, interpolation might be weird, but let's try.
             // Only interpolate if we have enough points for the degree.
             const canInterpolate = rawCPs.length > degree;

             const pts = canInterpolate ? interpolateSpline(rawCPs, degree) : rawCPs;

             shapes.push({
                id: generateId('dxf-spline'),
                type: 'polyline',
                points: pts,
                strokeColor: color,
                strokeWidth: 1,
                strokeEnabled: true,
                fillColor: 'transparent',
                fillEnabled: false,
                layerId,
                floorId: options.floorId,
                discipline: 'architecture'
             });
        }
        break;

      case 'CIRCLE':
        if (entity.center && entity.radius) {
          const c = trans(entity.center);
          const r = entity.radius * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY));

          shapes.push({
            id: generateId('dxf-circle'),
            type: 'circle',
            x: c.x,
            y: c.y,
            radius: r,
            points: [],
            strokeColor: color,
            strokeWidth: 1,
            strokeDash: strokeDash,
            strokeEnabled: true,
            fillColor: 'transparent',
            fillEnabled: false,
            layerId,
            floorId: options.floorId,
            discipline: 'architecture'
          });
        }
        break;

      case 'ARC':
        if (entity.center && entity.radius) {
           const c = trans(entity.center);
           const r = entity.radius * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY));

           let start = (entity.startAngle || 0) + transform.rotation;
           let end = (entity.endAngle || 0) + transform.rotation;

           shapes.push({
            id: generateId('dxf-arc'),
            type: 'arc',
            x: c.x,
            y: c.y,
            radius: r,
            points: [],
            startAngle: start * (Math.PI / 180),
            endAngle: end * (Math.PI / 180),
            strokeColor: color,
            strokeWidth: 1,
            strokeDash: strokeDash,
            strokeEnabled: true,
            fillColor: 'transparent',
            fillEnabled: false,
            layerId,
            floorId: options.floorId,
            discipline: 'architecture'
          });
        }
        break;

      case 'TEXT':
      case 'MTEXT':
      case 'ATTRIB':
        const textContent = entity.text || (entity as any).value; // Support ATTRIB value
        const textPoint = entity.startPoint || entity.position; // Use position if startPoint is not available
        if (textPoint && textContent) {
           const p = trans(textPoint);
           
           // Calculate height with scale. Favor entity height, then header default, then fallback.
           const baseHeight = entity.textHeight || data.header?.$TEXTSIZE || 1;
           // We allow small text sizes now, avoiding the clamping that destroyed hierarchy
           const h = Math.max(baseHeight * Math.abs(transform.scaleY), MIN_TEXT_SIZE);
           
           const rot = (entity.rotation || 0) + transform.rotation;

           // Map DXF Alignment (halign) to Shape align
           // 0 = Left (Default), 1 = Center, 2 = Right, 4 = Middle (Treat as Center)
           // 3 = Aligned, 5 = Fit (Ignored for now, defaults to left)
           let textAlign: 'left' | 'center' | 'right' = 'left';
           const halign = (entity as any).halign;
           if (halign === 1 || halign === 4) textAlign = 'center';
           if (halign === 2) textAlign = 'right';

           shapes.push({
            id: generateId('dxf-text'),
            type: 'text',
            x: p.x,
            y: p.y,
            points: [],
            textContent: textContent,
            fontSize: h,
            rotation: rot * (Math.PI / 180),
            align: textAlign,
            strokeColor: color,
            fillColor: 'transparent', // Ensure text background is transparent
            layerId,
            floorId: options.floorId,
            discipline: 'architecture',
            scaleY: -1
          });
        }
        break;

      case 'INSERT':
        if (entity.name && data.blocks && data.blocks[entity.name]) {
          if (visitedBlocks.has(entity.name)) {
              console.warn(`Circular reference detected for block: ${entity.name}`);
              return;
          }
          const nextVisited = new Set(visitedBlocks);
          nextVisited.add(entity.name);

          const block = data.blocks[entity.name];
          const insPos = entity.position || { x: 0, y: 0 };
          const insertPos = trans(insPos);

          const childScaleX = (entity.xScale || 1) * transform.scaleX;
          const childScaleY = (entity.yScale || 1) * transform.scaleY;
          const childRotation = (entity.rotation || 0) + transform.rotation;

          // Block Base Point Compensation
          // Formula: (ChildPos - BasePoint) * Scale * Rotation + InsertPos
          // We calculate the offset: InsertPos - (BasePoint * Scale * Rotation)
          const base = block.position || { x: 0, y: 0 };
          let bx = base.x * childScaleX;
          let by = base.y * childScaleY;

          if (childRotation !== 0) {
              const rad = childRotation * (Math.PI / 180);
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              const rx = bx * cos - by * sin;
              const ry = bx * sin + by * cos;
              bx = rx;
              by = ry;
          }

          const childTransform = {
              x: insertPos.x - bx,
              y: insertPos.y - by,
              rotation: childRotation,
              scaleX: childScaleX,
              scaleY: childScaleY
          };

          block.entities?.forEach(child => {
             processEntity(child, childTransform, effectiveLayer, color, nextVisited);
          });

          // Process Attributes attached to INSERT using the same transform as block children
          if (entity.attribs) {
              entity.attribs.forEach(attr => {
                  processEntity(attr, childTransform, effectiveLayer, color, visitedBlocks);
              });
          }
        }
        break;
    }
  };

  if (data.entities) {
      data.entities.forEach(e => processEntity(e, { x: 0, y: 0, rotation: 0, scaleX: globalScale, scaleY: globalScale }));
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  shapes.forEach(s => {
      if (s.points && s.points.length > 0) {
          s.points.forEach(p => {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
          });
      } else if (s.x !== undefined && s.y !== undefined) {
          minX = Math.min(minX, s.x);
          minY = Math.min(minY, s.y);
          maxX = Math.max(maxX, s.x + (s.width || 0));
          maxY = Math.max(maxY, s.y + (s.height || 0));
          if (s.radius) {
              minX = Math.min(minX, s.x - s.radius);
              minY = Math.min(minY, s.y - s.radius);
              maxX = Math.max(maxX, s.x + s.radius);
              maxY = Math.max(maxY, s.y + s.radius);
          }
      }
  });

  if (minX !== Infinity) {
      shapes.forEach(s => {
          if (s.points && s.points.length > 0) {
              s.points = s.points.map(p => ({
                  x: p.x - minX,
                  y: p.y - minY
              }));
          } else if (s.x !== undefined && s.y !== undefined) {
              s.x -= minX;
              s.y -= minY;
          }
      });
  } else {
    minX = 0; minY = 0;
  }

  return {
      shapes,
      layers: Array.from(layersMap.values()),
      width: maxX - minX,
      height: maxY - minY,
      origin: { x: minX, y: minY }
  };
};
