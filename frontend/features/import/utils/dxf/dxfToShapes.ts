import { Shape, Layer, Point } from '../../../../types';
import { generateId } from '../../../../utils/uuid';
import { DxfData, DxfEntity, DxfVector, DxfImportOptions } from './types';
import { tessellateArc, tessellateCircle, tessellateBulge, tessellateSpline } from './curveTessellation';

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
                  const curvePts = tessellateBulge(curr, next, curr.bulge);
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
            // Tessellate spline in local space, then transform
            const degree = entity.degree || 3;
            // DXF parser usually provides controlPoints.
            // If knots/weights are provided, pass them.
            // Note: Our tessellateSpline expects knots/weights if provided.

            const pts = tessellateSpline(
                entity.controlPoints,
                degree,
                entity.knots,
                entity.weights
            );

            // Apply Transform
            const transformedPts = pts.map(p => trans(p));

            shapes.push({
               id: generateId('dxf-spline'),
               type: 'polyline',
               points: transformedPts,
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
          // Tessellate circle in local space to allow correct transformation (e.g. into ellipse)
          const localPts = tessellateCircle(entity.center, entity.radius);
          const pts = localPts.map(p => trans(p));

          shapes.push({
            id: generateId('dxf-circle'),
            type: 'polyline', // Converted to polyline for fidelity
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

      case 'ARC':
        if (entity.center && entity.radius) {
           // Tessellate arc in local space
           const startAngle = (entity.startAngle || 0) * (Math.PI / 180);
           const endAngle = (entity.endAngle || 0) * (Math.PI / 180);

           const localPts = tessellateArc(entity.center, entity.radius, startAngle, endAngle);
           const pts = localPts.map(p => trans(p));

           shapes.push({
            id: generateId('dxf-arc'),
            type: 'polyline', // Converted to polyline for fidelity
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
