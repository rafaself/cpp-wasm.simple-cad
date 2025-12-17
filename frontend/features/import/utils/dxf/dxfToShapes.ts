import { Shape, Layer, Point } from '../../../../types';
import { generateId } from '../../../../utils/uuid';
import { DxfData, DxfEntity, DxfVector, DxfImportOptions, DxfLinetype, DxfLayer } from './types';
import { tessellateArc, tessellateCircle, tessellateBulge, tessellateSpline } from './curveTessellation';
import { Mat2D, identity, multiply, applyToPoint, fromTRS, fromTranslation, fromScaling, fromRotation } from './matrix2d';
import { resolveColor, resolveLineweight, toGrayscale, BYBLOCK_COLOR_PLACEHOLDER, BYBLOCK_LINETYPE_PLACEHOLDER } from './styles';
import { sanitizeMTextContent, getDxfTextAlignment, getDxfTextShift } from './textUtils';

export interface DxfImportResult {
  shapes: Shape[];
  layers: Layer[];
  width: number;
  height: number;
  origin: { x: number; y: number };
}

const dist = (p1: DxfVector, p2: DxfVector) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

// DXF Unit Codes to Centimeters (CM) Conversion Factors
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

// Hardcoded fallbacks if table missing
const STANDARD_LINETYPES: Record<string, number[]> = {
    'DASHED': [10, 5],
    'HIDDEN': [5, 5],
    'CENTER': [20, 5, 5, 5],
    'PHANTOM': [20, 5, 5, 5, 5, 5],
    'DOT': [2, 2],
    'CONTINUOUS': []
};

const MIN_TEXT_SIZE = 0.001;

export const convertDxfToShapes = (data: DxfData, options: DxfImportOptions): DxfImportResult => {
  const ENTITY_LIMIT = 30000;
  let entityCount = data.entities ? data.entities.length : 0;
  if (data.blocks) {
      Object.values(data.blocks).forEach(b => entityCount += (b.entities?.length || 0));
  }
  if (entityCount > ENTITY_LIMIT) {
      throw new Error(`Arquivo excede o limite de segurança de ${ENTITY_LIMIT} entidades.`);
  }

  // 1. Determine Scale Factor based on DXF Units
  const insUnits = data.header?.$INSUNITS;
  let globalScale = (insUnits !== undefined && DXF_UNITS[insUnits]) ? DXF_UNITS[insUnits] : 1;

  if (insUnits === undefined) {
      // Auto-Detect logic...
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let sampleCount = 0;
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
      if (extent > 0 && extent < 2000) {
          globalScale = 100;
          console.log(`DXF Import: Auto-detected unitless file with small extents (${extent.toFixed(2)}). Assuming Meters. Scale: 100`);
      }
  }

  // 2. Prepare Layers and Styles
  const shapes: Shape[] = [];
  const layersMap: Map<string, Layer> = new Map();
  // Normalize layer keys to uppercase for case-insensitive lookup
  const dxfLayers: Record<string, DxfLayer> = {};
  if (data.tables?.layer?.layers) {
      Object.entries(data.tables.layer.layers).forEach(([k, v]) => {
          dxfLayers[k.toUpperCase()] = v;
      });
  }

  // Prepare Styles
  const dxfStyles: Record<string, any> = {};
  if (data.tables?.style?.styles) {
      Object.entries(data.tables.style.styles).forEach(([k, v]) => {
          dxfStyles[k.toUpperCase()] = v;
      });
  }

  const dxfLinetypes = data.tables?.ltype?.linetypes || {};

  // Global Linetype Scale
  const ltScale = data.header?.$LTSCALE || 1.0;

  // Process Layers
  Object.values(data.tables?.layer?.layers || {}).forEach(l => {
      const layerId = generateId('layer');
      let strokeColor = resolveColor({ type: 'LAYER', layer: l.name, color: l.color } as any, undefined, undefined, false); // Light theme default
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

  const resolveLayerId = (layerName: string): string => {
    const layer = layersMap.get(layerName);
    return layer ? layer.id : options.defaultLayerId;
  };

  const getLayerObject = (layerName: string) => dxfLayers[layerName?.toUpperCase()];

  // Helper to resolve dash array
  // Returns 'BYBLOCK_LINETYPE_PLACEHOLDER' string if it's ByBlock, or number[] if resolved.
  // Wait, TypeScript return type issue. We will handle BYBLOCK specially.
  // Let's modify resolveStrokeDash to return number[] | 'BYBLOCK'
  const resolveStrokeDash = (entity: DxfEntity, layerName: string): number[] | 'BYBLOCK' => {
      let ltype = entity.lineType;

      if (ltype?.toUpperCase() === 'BYBLOCK') {
          return 'BYBLOCK';
      }

      if (!ltype || ltype.toUpperCase() === 'BYLAYER') {
          const l = getLayerObject(layerName);
          ltype = l?.lineType || 'CONTINUOUS';
      }

      const ltypeName = ltype.toUpperCase();
      if (ltypeName === 'CONTINUOUS') return [];

      let pattern: number[] = [];

      // Check DXF Linetype Table
      const tableDef = Object.values(dxfLinetypes).find(lt => lt.name.toUpperCase() === ltypeName);
      if (tableDef && tableDef.pattern && tableDef.pattern.length > 0) {
          const converted: number[] = [];
          for (let i = 0; i < tableDef.pattern.length; i++) {
              const val = tableDef.pattern[i];
              if (Math.abs(val) < 1e-6) {
                 converted.push(0.1);
              } else if (val > 0) {
                  converted.push(val);
              } else {
                  converted.push(Math.abs(val));
              }
          }
          pattern = converted;
      } else {
          pattern = STANDARD_LINETYPES[ltypeName] || [];
      }

      if (pattern.length === 0) return [];

      const entityScale = entity.lineTypeScale || 1.0;
      const finalScale = ltScale * entityScale;

      return pattern.map(v => v * finalScale);
  };


  // Block Cache
  const blockCache: Map<string, Shape[]> = new Map();
  const processingBlocks: Set<string> = new Set();

  const processEntity = (
    entity: DxfEntity,
    matrix: Mat2D,
    parentLayer?: string,
    parentColor?: string, // Resolved hex color or Placeholder from parent
    parentLinetype?: number[], // Resolved dash array from parent
    targetShapes?: Shape[]
  ) => {
    const outputShapes = targetShapes || shapes;
    if (shapes.length > ENTITY_LIMIT) return;

    // Layer Inheritance
    const rawLayer = entity.layer || '0';
    const effectiveLayer = (rawLayer === '0' && parentLayer) ? parentLayer : rawLayer;
    const layerId = resolveLayerId(effectiveLayer);

    const dxfLayer = getLayerObject(effectiveLayer);

    // Resolve Color
    // If entity is in a block def (parentColor undefined), resolveColor might return BYBLOCK_COLOR_PLACEHOLDER
    // if entity.color is 0.
    let color = resolveColor(entity, dxfLayer, parentColor);

    // If color is resolved to BYBLOCK_COLOR_PLACEHOLDER, it means we are in a Block Definition (cached)
    // and the entity wants to inherit from the future INSERT.
    // If we are processing an INSERT (parentColor is defined), resolveColor should have used it.
    // resolveColor implementation:
    // if (colorIndex === 0) { if (parentColor) return parentColor; return BYBLOCK_COLOR_PLACEHOLDER; }

    // If we are at root, parentColor is undefined.
    // If we are recursively processing INSERT, parentColor is the Insert's color.

    if (color !== BYBLOCK_COLOR_PLACEHOLDER && options.grayscale) {
        color = toGrayscale(color);
    }

    // Resolve Lineweight
    const strokeWidth = resolveLineweight(entity, dxfLayer);

    // Resolve Linetype
    let strokeDash: number[] = [];
    const dashResult = resolveStrokeDash(entity, effectiveLayer);

    if (dashResult === 'BYBLOCK') {
        if (parentLinetype) {
            strokeDash = parentLinetype;
        } else {
            // We are in block def, set placeholder?
            // Shape.strokeDash is number[]. We can't set string.
            // We need a way to mark it.
            // We'll use a specific empty array reference or property on Shape?
            // But Shape interface is fixed.
            // Workaround: We resolve to "Continuous" (empty) but logic needs to handle it.
            // If we are caching, we need to know.
            // Actually, for Linetype, ByBlock is rare compared to ByLayer.
            // Let's assume Continuous if not resolved in Block Def,
            // AND we won't strictly support ByBlock Linetype change via INSERT for now (complexity),
            // OR we use the same "Clone Modification" logic for Linetype if we detect a pattern.
            // Let's just default to [] (Continuous) for Block Def.
            strokeDash = [];
            // To support it properly, we'd need to store "isByBlockLinetype" on the shape.
        }
    } else {
        strokeDash = dashResult;
    }

    const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

    // Common properties for shape creation
    const shapeProps = {
        strokeColor: color,
        strokeWidth: strokeWidth,
        strokeDash: strokeDash,
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        layerId,
        floorId: options.floorId,
        discipline: 'architecture' as const
    };

    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          outputShapes.push({
            id: generateId('dxf-line'),
            type: 'line',
            points: [trans(entity.vertices[0]), trans(entity.vertices[1])],
            ...shapeProps
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
              const next = (i === vs.length - 1) ? (isClosed ? vs[0] : null) : vs[i+1];
              if (next && curr.bulge && Math.abs(curr.bulge) > 1e-10) {
                  const curvePts = tessellateBulge(curr, next, curr.bulge);
                  rawPts.push(...curvePts);
              }
          }
          if (isClosed && rawPts.length > 2) {
              const first = rawPts[0];
              const last = rawPts[rawPts.length-1];
              if (dist(first, last) > 0.001) rawPts.push({...first});
          }
          const pts = rawPts.map(v => trans(v));

          outputShapes.push({
            id: generateId('dxf-poly'),
            type: 'polyline',
            points: pts,
            ...shapeProps
          });
        }
        break;

      case 'SPLINE':
        if (entity.controlPoints && entity.controlPoints.length > 1) {
            const degree = entity.degree || 3;
            const pts = tessellateSpline(entity.controlPoints, degree, entity.knots, entity.weights);
            const transformedPts = pts.map(p => trans(p));
            outputShapes.push({
               id: generateId('dxf-spline'),
               type: 'polyline',
               points: transformedPts,
               ...shapeProps
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
            ...shapeProps
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
            ...shapeProps
          });
        }
        break;

      case 'TEXT':
      case 'MTEXT':
      case 'ATTRIB':
        const rawText = entity.text || (entity as any).value;
        const textContent = (entity.type === 'MTEXT')
            ? sanitizeMTextContent(rawText)
            : rawText; // TEXT usually doesn't have MTEXT formatting codes, but can have %%u etc. We leave TEXT simple for now.

        // Determine Alignment Point
        // If halign or valign is set, we prefer Group 11 (endPoint/alignmentPoint) over Group 10 (startPoint/position)
        // BUT only if Group 11 is defined and not (0,0)? DXF spec says it is valid even if 0,0, but usually if alignment is set, it is relevant.
        // dxf-parser maps Group 10 to startPoint/position.
        // Group 11 to endPoint (for TEXT). MTEXT uses insertionPoint (Group 10) primarily, and attachment point (71).

        // For TEXT entities, we must decide between startPoint (Group 10) and endPoint (Group 11).
        // Standard AutoCAD behavior:
        // If Alignment is Left/Baseline (halign=0, valign=0), use Group 10.
        // Otherwise, use Group 11 (sometimes called alignmentPoint).

        let localPoint = entity.startPoint || entity.position;
        let halign = (entity as any).halign || 0;
        let valign = (entity as any).valign || 0;

        if (entity.type === 'TEXT') {
            // Force re-read of endPoint from object to ensure we get it even if typescript definitions vary
            const alignmentPoint = (entity as any).endPoint || (entity as any).alignmentPoint;

            if (halign !== 0 || valign !== 0) {
               if (alignmentPoint) {
                  // Ensure alignmentPoint is not (0,0,0) if startPoint is set?
                  // Sometimes 0,0 is valid, but mostly it implies uninitialized if alignment is set.
                  // But checking for object existence (alignmentPoint) is the key.
                  localPoint = alignmentPoint;
               }
            }
        } else if (entity.type === 'MTEXT') {
            // MTEXT always uses insertion point (Group 10).
            // Attachment point (71) determines how text relates to that point.
            // We need to map attachment point to align properties.
            // But 'dxf-parser' might not expose 71 directly nicely, or maps it to attachmentPoint.
            // Let's check type.
            const attachment = (entity as any).attachmentPoint; // 1=TL, 2=TC, 3=TR, 4=ML, 5=MC...
            // Mappings:
            // 1(TL) -> Left, Top
            // 2(TC) -> Center, Top
            // 3(TR) -> Right, Top
            // 4(ML) -> Left, Middle
            // 5(MC) -> Center, Middle
            // 6(MR) -> Right, Middle
            // 7(BL) -> Left, Bottom
            // 8(BC) -> Center, Bottom
            // 9(BR) -> Right, Bottom
            // If attachment is present, derive halign/valign equivalents.

            if (attachment) {
                 // 1,4,7 -> Left
                 // 2,5,8 -> Center
                 // 3,6,9 -> Right
                 // 1,2,3 -> Top
                 // 4,5,6 -> Middle
                 // 7,8,9 -> Bottom
                 const att = attachment;
                 if ([1, 4, 7].includes(att)) halign = 0; // Left
                 else if ([2, 5, 8].includes(att)) halign = 1; // Center
                 else if ([3, 6, 9].includes(att)) halign = 2; // Right

                 if ([1, 2, 3].includes(att)) valign = 3; // Top
                 else if ([4, 5, 6].includes(att)) valign = 2; // Middle
                 else if ([7, 8, 9].includes(att)) valign = 1; // Bottom
            }
        }

        if (localPoint && textContent) {
           const p = trans(localPoint);
           const rotRad = (entity.rotation || 0) * (Math.PI / 180);

           const cos = Math.cos(rotRad);
           const sin = Math.sin(rotRad);
           const ux = { x: cos, y: sin };
           const uy = { x: -sin, y: cos };

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

           // Normalize ty_vec for shift direction
           const ty_len = scaleY_new || 1;
           // If scaleY_new is 0 (unlikely), avoid NaN.
           // Note: ty_vec is calculated from Rotation matrix * Global matrix.
           // If global matrix is identity (scale 1), ty_vec length is 1.
           const ty_dir = { x: ty_vec.x / ty_len, y: ty_vec.y / ty_len };

           const det = matrix.a * matrix.d - matrix.b * matrix.c;
           const isMirrored = det < 0;
           const baseHeight = entity.textHeight || data.header?.$TEXTSIZE || 1;
           const h = Math.max(baseHeight, MIN_TEXT_SIZE);

           // Apply Style (Width Factor)
           let widthFactor = 1.0;
           if (entity.style) {
               const styleDef = dxfStyles[entity.style.toUpperCase()];
               if (styleDef && styleDef.widthFactor) {
                   widthFactor = styleDef.widthFactor;
               }
           }
           if ((entity as any).widthFactor) { // Override if entity has specific width factor (less common for TEXT, mostly MTEXT)
                widthFactor = (entity as any).widthFactor;
           }

           // Use local variables halign/valign instead of re-reading entity properties
           const textAlign = getDxfTextAlignment(halign, valign);

           // Vertical Alignment Adjustment
           const vShift = getDxfTextShift(valign, h);

           // Calculate world shift vector.
           // vShift is in local drawing units (e.g., -Height).
           // We scale it by scaleY_new to match the world scale of the shape.
           const shiftX = ty_dir.x * vShift * scaleY_new;
           const shiftY = ty_dir.y * vShift * scaleY_new;

           outputShapes.push({
            id: generateId('dxf-text'),
            type: 'text',
            x: p.x + shiftX,
            y: p.y + shiftY,
            points: [],
            textContent: textContent,
            fontSize: h,
            rotation: newRot,
            align: textAlign,
            scaleX: scaleX_new * widthFactor,
            scaleY: scaleY_new * (isMirrored ? 1 : -1),
            ...shapeProps
          });
        }
        break;

      case 'INSERT':
        if (entity.name && data.blocks && data.blocks[entity.name]) {
          const blockName = entity.name;
          if (processingBlocks.has(blockName)) return;

          // 1. Prepare Local Shapes (Cache)
          if (!blockCache.has(blockName)) {
            processingBlocks.add(blockName);
            const block = data.blocks[blockName];
            const localShapes: Shape[] = [];
            // Process block definition with Identity matrix and NO parent color.
            // This ensures entities with Color 0 (ByBlock) get BYBLOCK_COLOR_PLACEHOLDER.
            block.entities?.forEach(child => {
                processEntity(child, identity(), undefined, undefined, undefined, localShapes);
            });
            blockCache.set(blockName, localShapes);
            processingBlocks.delete(blockName);
          }

          const cachedShapes = blockCache.get(blockName);
          if (!cachedShapes) return;

          // 2. Resolve Attributes for THIS Insert instance
          // We must do this *before* iterating shapes? No, attributes are separate entities usually attached to INSERT.
          // But here we are just transforming the cached geometry.

          // 3. Transform Matrix
          const insPos = entity.position || { x: 0, y: 0 };
          const scaleX = entity.xScale || 1;
          const scaleY = entity.yScale || 1;
          const rotation = entity.rotation || 0;
          const blockDef = data.blocks[blockName];
          const base = blockDef.position || { x: 0, y: 0 };

          const T_base = fromTranslation(-base.x, -base.y);
          const S = fromScaling(scaleX, scaleY);
          const R = fromRotation(rotation * Math.PI / 180);
          const T_ins = fromTranslation(insPos.x, insPos.y);
          const M_local = multiply(multiply(multiply(T_ins, R), S), T_base);
          const M_final = multiply(matrix, M_local);

          // 4. Instantiate and Fix Colors
          cachedShapes.forEach(s => {
             const clone = { ...s, id: generateId(s.type) };

             // Check if Clone needs ByBlock resolution
             if (clone.strokeColor === BYBLOCK_COLOR_PLACEHOLDER) {
                 // Replace placeholder with THIS Insert's resolved color
                 // Note: 'color' variable here is the resolved color of the INSERT entity
                 clone.strokeColor = color;
                 // If Insert itself is ByLayer/ByBlock, 'color' is already resolved.
             }
             if (options.grayscale && clone.strokeColor && clone.strokeColor !== 'transparent') {
                 clone.strokeColor = toGrayscale(clone.strokeColor);
             }

             // Apply Geometry Transform
             if (clone.points) {
                 clone.points = clone.points.map(p => applyToPoint(M_final, p));
             }
             if (clone.type === 'text') {
                 const p = applyToPoint(M_final, { x: s.x!, y: s.y! });
                 clone.x = p.x;
                 clone.y = p.y;
                 const sRot = s.rotation || 0;
                 const cos = Math.cos(sRot);
                 const sin = Math.sin(sRot);
                 const ux = { x: cos, y: sin };
                 const tx = { x: M_final.a * ux.x + M_final.c * ux.y, y: M_final.b * ux.x + M_final.d * ux.y };
                 clone.rotation = Math.atan2(tx.y, tx.x);
                 const sx_new = Math.sqrt(tx.x*tx.x + tx.y*tx.y);
                 clone.scaleX = (s.scaleX||1) * sx_new;
                 clone.scaleY = (s.scaleY||-1) * sx_new;
             }
             outputShapes.push(clone);
          });

          if (entity.attribs) {
              entity.attribs.forEach(attr => processEntity(attr, M_final, effectiveLayer, color, strokeDash, outputShapes));
          }
        }
        break;
    }
  };

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
                // For text, we don't know the exact width/height without measureText,
                // but we can estimate or just use the anchor.
                // Text width is not stored in shape usually.
                // This bounding box is for normalization.
                // If we include only anchor, it's safer than excluding it.
                maxX = Math.max(maxX, s.x);
                maxY = Math.max(maxY, s.y);
      }
  });

  if (minX !== Infinity) {
      shapes.forEach(s => {
          if (s.points && s.points.length > 0) {
              s.points = s.points.map(p => ({ x: p.x - minX, y: p.y - minY }));
          } else if (s.x !== undefined && s.y !== undefined) {
              s.x -= minX;
              s.y -= minY;
          }
      });
  } else { minX = 0; minY = 0; }

  return {
      shapes,
      layers: Array.from(layersMap.values()),
      width: maxX - minX,
      height: maxY - minY,
      origin: { x: minX, y: minY }
  };
};
