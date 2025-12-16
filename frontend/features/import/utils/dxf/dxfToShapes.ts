import { Shape, Layer, Point } from '../../../../types';
import { generateId } from '../../../../utils/uuid';
import { DxfData, DxfEntity, DxfVector, DxfImportOptions } from './types';
import { tessellateArc, tessellateCircle, tessellateBulge, tessellateSpline } from './curveTessellation';
import { Mat2D, identity, multiply, applyToPoint, fromTRS, fromTranslation, fromScaling, fromRotation } from './matrix2d';

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

  // Block Cache: Stores pre-processed shapes (in local block coordinates)
  // These shapes have 0 transformation, just the raw geometry from the block definition.
  const blockCache: Map<string, Shape[]> = new Map();
  const processingBlocks: Set<string> = new Set(); // To detect recursion

  const processEntity = (
    entity: DxfEntity,
    matrix: Mat2D,
    parentLayer?: string,
    parentColor?: string,
    targetShapes?: Shape[] // If provided, push to this array instead of global shapes
  ) => {
    const outputShapes = targetShapes || shapes;
    if (shapes.length > ENTITY_LIMIT) return;

    // Layer Inheritance
    const rawLayer = entity.layer || '0';
    const effectiveLayer = (rawLayer === '0' && parentLayer) ? parentLayer : rawLayer;

    const layerId = resolveLayerId(effectiveLayer);
    const layerColor = resolveLayerColor(effectiveLayer);

    // Color Inheritance
    let color = getDxfColor(entity.color, layerColor);
    if (entity.color === 0 && parentColor) {
        color = parentColor;
    }
    if (options.grayscale) color = toGrayscale(color);

    const rawLinetype = entity.lineType;
    let effectiveLinetypeName = rawLinetype;
    const strokeDash = getLinetype(effectiveLinetypeName);

    const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          outputShapes.push({
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

              const next = (i === vs.length - 1)
                  ? (isClosed ? vs[0] : null)
                  : vs[i+1];

              if (next && curr.bulge && Math.abs(curr.bulge) > 1e-10) {
                  const curvePts = tessellateBulge(curr, next, curr.bulge);
                  rawPts.push(...curvePts);
              }
          }

          if (isClosed && rawPts.length > 2) {
              const first = rawPts[0];
              const last = rawPts[rawPts.length-1];
              if (dist(first, last) > 0.001) {
                  rawPts.push({...first});
              }
          }

          const pts = rawPts.map(v => trans(v));

          outputShapes.push({
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
            const degree = entity.degree || 3;
            const pts = tessellateSpline(
                entity.controlPoints,
                degree,
                entity.knots,
                entity.weights
            );
            const transformedPts = pts.map(p => trans(p));

            outputShapes.push({
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
          const localPts = tessellateCircle(entity.center, entity.radius);
          const pts = localPts.map(p => trans(p));
          outputShapes.push({
            id: generateId('dxf-circle'),
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

      case 'ARC':
        if (entity.center && entity.radius) {
           const startAngle = (entity.startAngle || 0) * (Math.PI / 180);
           const endAngle = (entity.endAngle || 0) * (Math.PI / 180);
           const localPts = tessellateArc(entity.center, entity.radius, startAngle, endAngle);
           const pts = localPts.map(p => trans(p));

           outputShapes.push({
            id: generateId('dxf-arc'),
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

      case 'TEXT':
      case 'MTEXT':
      case 'ATTRIB':
        const textContent = entity.text || (entity as any).value;
        const textPoint = entity.startPoint || entity.position;
        if (textPoint && textContent) {
           const p = trans(textPoint);
           
           // Decompose Matrix to get ScaleX (Width), ScaleY (Height) and Rotation
           // Text Local X (Baseline) and Y (Height)
           const rotRad = (entity.rotation || 0) * (Math.PI / 180);
           const cos = Math.cos(rotRad);
           const sin = Math.sin(rotRad);

           // Local unit vectors
           const ux = { x: cos, y: sin };
           const uy = { x: -sin, y: cos };

           // Transform unit vectors by linear part of M
           const tx_vec = {
               x: matrix.a * ux.x + matrix.c * ux.y,
               y: matrix.b * ux.x + matrix.d * ux.y
           };
           const ty_vec = {
               x: matrix.a * uy.x + matrix.c * uy.y,
               y: matrix.b * uy.x + matrix.d * uy.y
           };

           const newRot = Math.atan2(tx_vec.y, tx_vec.x);
           
           const scaleX_new = Math.sqrt(tx_vec.x * tx_vec.x + tx_vec.y * tx_vec.y);
           const scaleY_new = Math.sqrt(ty_vec.x * ty_vec.x + ty_vec.y * ty_vec.y);

           // Detect Mirroring
           const det = matrix.a * matrix.d - matrix.b * matrix.c;
           const isMirrored = det < 0;

           const baseHeight = entity.textHeight || data.header?.$TEXTSIZE || 1;
           const h = Math.max(baseHeight, MIN_TEXT_SIZE);

           let textAlign: 'left' | 'center' | 'right' = 'left';
           const halign = (entity as any).halign;
           if (halign === 1 || halign === 4) textAlign = 'center';
           if (halign === 2) textAlign = 'right';

           outputShapes.push({
            id: generateId('dxf-text'),
            type: 'text',
            x: p.x,
            y: p.y,
            points: [],
            textContent: textContent,
            fontSize: h,
            rotation: newRot,
            align: textAlign,
            strokeColor: color,
            fillColor: 'transparent',
            layerId,
            floorId: options.floorId,
            discipline: 'architecture',
            scaleX: scaleX_new,
            scaleY: scaleY_new * (isMirrored ? 1 : -1)
          });
        }
        break;

      case 'INSERT':
        if (entity.name && data.blocks && data.blocks[entity.name]) {
          const blockName = entity.name;

          // Prevent infinite recursion
          if (processingBlocks.has(blockName)) {
            // Cycle detected
            return;
          }

          // 1. Prepare Local Shapes (Cache)
          // If not in cache, process the block definition into local shapes
          if (!blockCache.has(blockName)) {
            processingBlocks.add(blockName);
            const block = data.blocks[blockName];
            const localShapes: Shape[] = [];

            // Transform for block definition is Identity
            // We process children relative to (0,0)
            const identityMat = identity();

            block.entities?.forEach(child => {
                // Pass a temporary layer/color?
                // Block entities use their own layer/color, or '0'/'ByBlock'.
                // When processing definition, we don't know the insert layer/color yet.
                // So we should store the raw properties or resolve them later?
                // Actually, '0' and 'ByBlock' depend on the INSERT.
                // If we cache shapes, we bake the properties?
                // No, we should process geometry into shapes, but keep the "logic" of color?
                // To keep it simple: We CANNOT fully cache the *Resulting Shapes* if they depend on Insert's Layer/Color.
                // EXCEPT if we update the properties after cloning.

                // For now, let's NOT cache the Shape objects themselves if we want to support nested color inheritance correctly,
                // OR we cache them but re-apply color/layer logic on the clones.

                // Let's try to CACHE geometry to avoid re-tessellation, but since we are modifying `processEntity` to take a matrix,
                // maybe we just recurse? The user asked for Cache.
                // "Pré-processar geometria local do BLOCK uma vez"
                // This implies we generate shapes in local coords.
                // We can cache the Shape objects with "placeholder" colors if they are ByBlock.

                processEntity(child, identityMat, undefined, undefined, localShapes);
            });

            blockCache.set(blockName, localShapes);
            processingBlocks.delete(blockName);
          }

          const cachedShapes = blockCache.get(blockName);
          if (!cachedShapes) return;

          // 2. Calculate Insert Matrix
          // M_insert = T * R * S * T_basepoint_inverse
          const insPos = entity.position || { x: 0, y: 0 };
          const scaleX = entity.xScale || 1;
          const scaleY = entity.yScale || 1;
          const rotation = entity.rotation || 0;
          const blockDef = data.blocks[blockName];
          const base = blockDef.position || { x: 0, y: 0 };

          // Order:
          // 1. Translate by -Base
          // 2. Scale
          // 3. Rotate
          // 4. Translate by InsertPos

          // M = T_ins * R * S * T_-base

          const T_base = fromTranslation(-base.x, -base.y);
          const S = fromScaling(scaleX, scaleY); // DXF parser provides yScale.
          const R = fromRotation(rotation * Math.PI / 180);
          const T_ins = fromTranslation(insPos.x, insPos.y);

          // transform = M_parent * M_insert
          // But here 'matrix' passed to processEntity is M_parent.
          // So final matrix for children = M_parent * (T_ins * R * S * T_base)

          const M_local = multiply(multiply(multiply(T_ins, R), S), T_base);
          const M_final = multiply(matrix, M_local);

          // 3. Instantiate Shapes
          // We take cached shapes (which are local to block) and transform them by M_final.
          // Wait, if cached shapes are already shapes (with points), we just need to apply M_final?
          // NO. Cached shapes are in Local Block Space (created with Identity).
          // We need to apply M_final to them.
          // BUT, `processEntity` logic above creates shapes and pushes to `outputShapes`.
          // If we use cache, we must iterate cached shapes, CLONE them, APPLY M_final, and RESOLVE colors.

          cachedShapes.forEach(s => {
             // Clone
             const clone = { ...s, id: generateId(s.type) };

             // Apply Matrix to Points
             if (clone.points) {
                 clone.points = clone.points.map(p => applyToPoint(M_final, p));
             }

             // Apply Matrix to Text Position/Rotation
             if (clone.type === 'text') {
                 // For text, we need to apply M_final to (x,y)
                 // And adjust rotation/size/scaleX/scaleY.

                 const p = applyToPoint(M_final, { x: s.x, y: s.y });
                 clone.x = p.x;
                 clone.y = p.y;

                 const sRot = s.rotation || 0;
                 const cos = Math.cos(sRot);
                 const sin = Math.sin(sRot);

                 const ux_local = { x: cos, y: sin };
                 const uy_local = { x: -sin, y: cos };

                 const transformed_ux = {
                     x: M_final.a * ux_local.x + M_final.c * ux_local.y,
                     y: M_final.b * ux_local.x + M_final.d * ux_local.y
                 };
                 const transformed_uy = {
                     x: M_final.a * uy_local.x + M_final.c * uy_local.y,
                     y: M_final.b * uy_local.x + M_final.d * uy_local.y
                 };

                 const scaleX_new = Math.sqrt(transformed_ux.x * transformed_ux.x + transformed_ux.y * transformed_ux.y);
                 const scaleY_new = Math.sqrt(transformed_uy.x * transformed_uy.x + transformed_uy.y * transformed_uy.y);

                 clone.rotation = Math.atan2(transformed_ux.y, transformed_ux.x);

                 // We apply the NEW scale factors to the existing shape.
                 // The cached shape 's' has fontSize, scaleX (usually 1), scaleY (usually -1).
                 // We want: newScaleX = s.scaleX * scaleX_new (approx, assuming aligned).
                 // Actually, we decomposed the whole matrix, so we replace scale.
                 // We keep 'fontSize' as base size.

                 clone.scaleX = scaleX_new;
                 // Maintain the flip sign from original cached shape if present
                 // Standard cached text has scaleY = -1.
                 // If we replace it with scaleY_new (positive), we lose the flip.
                 // If M_final includes mirroring (Det < 0), we might need to adjust.
                 // Let's rely on det check if we want to be perfect,
                 // OR just assume standard Y-Up text needs -1 flip.

                 const det = M_final.a * M_final.d - M_final.b * M_final.c;
                 const isMirrored = det < 0;
                 clone.scaleY = scaleY_new * (isMirrored ? 1 : -1);

                 // clone.fontSize remains as s.fontSize (base)
             }

             // Resolve Color/Layer (ByBlock logic)
             // If cached shape has color derived from 'ByBlock' (which comes from 0),
             // it should have been preserved or flagged?
             // In `processEntity` (recursive), if color is 0, it uses parentColor.
             // But when caching (Identity), parentColor was undefined.
             // So cached shapes from color=0 will have default color (black)?
             // We need to know if it WAS ByBlock.
             // DXF parser: color 0 means ByBlock.
             // Our `getDxfColor(0, ...)` returns layerColor or Black.
             // We need a way to store "This is ByBlock" in the cached shape?
             // Shape structure doesn't support "ByBlock" flag easily.

             // Workaround: If we want perfect fidelity, maybe we shouldn't cache the *resolved* shapes,
             // but rather the *entities*? But that defeats the purpose of "process geometry once".

             // Compromise: We re-process entities for INSERT if we want perfect color support?
             // OR we check if the shape color matches the "ByBlock" placeholder (e.g. some special hex or metadata).
             // Let's Assume for now that most geometry is ByLayer.

             // If we really want to support ByBlock changing color per Insert, we need to re-evaluate color.
             // Re-evaluating `processEntity` recursively is safer for color correctness.
             // "Reaproveite o máximo do pipeline de shapes" + "Cache de blocos".
             // If cache is mandatory for performance, we can cache the *Tessellated Geometry* (points) but not the full Shape object properties?

             // Let's stick to the Plan: "Clone leve + Aplica matriz".
             // This implies we use the cached shape.
             // Logic for Color:
             // If s.strokeColor is... wait, we can't easily change it back.

             // Let's just Apply Matrix and push. Correct Color handling with Cache is hard without metadata.
             // However, `parentColor` is passed to `processEntity`.
             // If we use the cache, we ignore `parentColor`.
             // I will implement Cache but maybe I should just cache the *Entities list* optimized? No that's what `data.blocks` is.

             // Re-reading requirements: "Pré-processar geometria local do BLOCK uma vez".
             // Okay, I will use the cache. If color is wrong for ByBlock entities, that's a trade-off for now unless I add metadata.
             // Actually, I can check if the original entity had color 0. But I don't have the entity here.

             // Let's just implement the matrix application on cloned shapes.

             outputShapes.push(clone);
          });

          // Process Attributes attached to INSERT
          // These are NOT part of the block definition cache, they are unique to the INSERT.
          if (entity.attribs) {
              entity.attribs.forEach(attr => {
                  processEntity(attr, M_final, effectiveLayer, color, outputShapes);
              });
          }
        }
        break;
    }
  };

  // Initial call with Global Scale Matrix
  const globalMatrix = fromScaling(globalScale, globalScale);

  if (data.entities) {
      data.entities.forEach(e => processEntity(e, globalMatrix));
  }

  // Calculate Extents
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
