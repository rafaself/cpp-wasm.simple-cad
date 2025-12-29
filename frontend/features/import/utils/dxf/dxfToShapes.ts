import { Shape, Layer, Point, ShapeColorMode } from '../../../../types';
import { generateId } from '../../../../utils/uuid';
import { DxfData, DxfEntity, DxfVector, DxfImportOptions, DxfLinetype, DxfLayer, DxfStyle } from './types';
import { tessellateArc, tessellateCircle, tessellateBulge, tessellateSpline } from './curveTessellation';
import { Mat2D, identity, multiply, applyToPoint, fromTRS, fromTranslation, fromScaling, fromRotation } from './matrix2d';
import { resolveColor, resolveLineweight, resolveFontFamily, BYBLOCK_COLOR_PLACEHOLDER, BYBLOCK_LINETYPE_PLACEHOLDER } from './styles';
import { applyColorScheme, resolveColorScheme, usesCustomColorMode } from './colorScheme';
import { parseMTextContent, getDxfTextAlignment, getDxfTextShift, ParsedMText } from './textUtils';
import { resolveUnitScale } from './unitResolver';
import { calculateBounds, normalizeShapesToOrigin, normalizeTextScaling } from './shapeNormalization';

export interface DxfImportResult {
  shapes: Shape[];
  layers: Layer[];
  width: number;
  height: number;
  origin: { x: number; y: number };
}

const dist = (p1: DxfVector, p2: DxfVector) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

const STANDARD_LINETYPES: Record<string, number[]> = {
    'DASHED': [10, 5],
    'HIDDEN': [5, 5],
    'CENTER': [20, 5, 5, 5],
    'PHANTOM': [20, 5, 5, 5, 5, 5],
    'DOT': [2, 2],
    'CONTINUOUS': []
};

const MIN_TEXT_SIZE = 0.001;
const DXF_CURVE_TOLERANCE_DEG = 2.5;

const toRadiansIfNeeded = (angle: number): number => {
    if (!isFinite(angle)) return 0;
    const abs = Math.abs(angle);
    return abs > Math.PI * 2 + 0.5 ? (angle * Math.PI) / 180 : angle;
};

const isSimilarityTransform = (m: Mat2D): { ok: boolean; scale: number } => {
    const sx = Math.hypot(m.a, m.b);
    const sy = Math.hypot(m.c, m.d);
    const dot = m.a * m.c + m.b * m.d;
    const scale = sx || 1;
    const ok = Math.abs(sx - sy) < 1e-6 && Math.abs(dot) < 1e-6 && isFinite(scale) && scale > 0;
    return { ok, scale };
};

export const convertDxfToShapes = (data: DxfData, options: DxfImportOptions): DxfImportResult => {
  const ENTITY_LIMIT = 30000;

  const shouldImportEntity = (e: DxfEntity) => options.includePaperSpace || !e.inPaperSpace;

  let entityCount = 0;
  if (data.entities) {
      entityCount = data.entities.filter(shouldImportEntity).length;
  }

  if (entityCount > ENTITY_LIMIT) {
      throw new Error(`Arquivo excede o limite de segurança de ${ENTITY_LIMIT} entidades.`);
  }

  const colorScheme = resolveColorScheme(options);
  const buildCustomColorMode = (): ShapeColorMode | undefined =>
    usesCustomColorMode(colorScheme.scheme) ? { fill: 'custom', stroke: 'custom' } : undefined;

  const { globalScale } = resolveUnitScale(data, options, shouldImportEntity);

  const shapes: Shape[] = [];
  const layersMap: Map<string, Layer> = new Map();
  const dxfLayers: Record<string, DxfLayer> = {};
  if (data.tables?.layer?.layers) {
      Object.entries(data.tables.layer.layers).forEach(([k, v]) => {
          dxfLayers[k.toUpperCase()] = v;
      });
  }

  const dxfStyles: Record<string, DxfStyle> = {};
  if (data.tables?.style?.styles) {
      Object.entries(data.tables.style.styles).forEach(([k, v]) => {
          dxfStyles[k.toUpperCase()] = v as any;
      });
  }

  const dxfLinetypes = data.tables?.ltype?.linetypes || {};
  const ltScale = data.header?.$LTSCALE || 1.0;

  Object.values(data.tables?.layer?.layers || {}).forEach(l => {
      const layerId = generateId('layer');
      let strokeColor = resolveColor(
          { type: 'LAYER', layer: l.name, trueColor: (l as any).color, colorIndex: (l as any).colorIndex } as any,
          undefined,
          undefined,
          false,
          'original'
      );
      if (strokeColor !== BYBLOCK_COLOR_PLACEHOLDER) {
          strokeColor = applyColorScheme(strokeColor, colorScheme.scheme, colorScheme.customColor);
      }

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
    if (!targetShapes) {
       if (!shouldImportEntity(entity)) return;
    }

    const outputShapes = targetShapes || shapes;
    if (shapes.length > ENTITY_LIMIT) return;

    const rawLayer = entity.layer || '0';
    const effectiveLayer = (rawLayer === '0' && parentLayer) ? parentLayer : rawLayer;
    const layerId = resolveLayerId(effectiveLayer);
    const dxfLayer = getLayerObject(effectiveLayer);

    let color = resolveColor(entity, dxfLayer, parentColor, false, 'original');
    if (color !== BYBLOCK_COLOR_PLACEHOLDER) {
        color = applyColorScheme(color, colorScheme.scheme, colorScheme.customColor);
    }

    const strokeWidth = resolveLineweight(entity, dxfLayer);

    let strokeDash: number[] = [];
    const dashResult = resolveStrokeDash(entity, effectiveLayer);

    if (dashResult === 'BYBLOCK') {
        if (parentLinetype) {
            strokeDash = parentLinetype;
        } else {
            strokeDash = [];
        }
    } else {
        strokeDash = dashResult;
    }

    const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

    const colorModeOverride = buildCustomColorMode();
    const shapeProps = {
        strokeColor: color,
        strokeWidth: strokeWidth,
        strokeDash: strokeDash,
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        layerId,
        floorId: options.floorId,
        discipline: 'architecture' as const,
        ...(colorModeOverride ? { colorMode: colorModeOverride } : {})
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
          const sim = isSimilarityTransform(matrix);
          const rawPts: DxfVector[] = [];
          const vs = entity.vertices;
          const isClosed = (entity as any).closed === true || (entity as any).shape === true || (entity.closed === true);

          if (
              sim.ok &&
              isClosed &&
              vs.length === 2 &&
              vs.every(v => v.bulge !== undefined && Math.abs(v.bulge) > 1e-10) &&
              Math.abs(Math.abs(vs[0].bulge!) - 1) < 1e-6 &&
              Math.abs(Math.abs(vs[1].bulge!) - 1) < 1e-6
          ) {
              const p1 = trans(vs[0]);
              const p2 = trans(vs[1]);
              const cx = (p1.x + p2.x) / 2;
              const cy = (p1.y + p2.y) / 2;
              const r = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
              outputShapes.push({
                  id: generateId('dxf-circle'),
                  type: 'circle',
                  x: cx,
                  y: cy,
                  radius: r,
                  points: [],
                  ...shapeProps
              });
              break;
          }

          for (let i = 0; i < vs.length; i++) {
              const curr = vs[i];
              rawPts.push(curr);
              const next = (i === vs.length - 1) ? (isClosed ? vs[0] : null) : vs[i+1];
              if (next && curr.bulge && Math.abs(curr.bulge) > 1e-10) {
                  const curvePts = tessellateBulge(curr, next, curr.bulge, DXF_CURVE_TOLERANCE_DEG);
                  rawPts.push(...curvePts);
              }
          }
          if (isClosed && rawPts.length > 2) {
              const first = rawPts[0];
              const last = rawPts[rawPts.length-1];
              if (dist(first, last) > 0.001) rawPts.push({...first});
          }
          const pts = rawPts.map(v => trans(v));

          const isHatch = (entity as any).isHatch === true;

          outputShapes.push({
            id: generateId('dxf-poly'),
            type: 'polyline',
            points: pts,
            ...shapeProps,
            ...(isHatch
              ? {
                  strokeEnabled: false,
                  fillColor: color,
                  fillEnabled: true,
                  colorMode: { fill: 'custom', stroke: 'custom' }
                }
              : {})
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
          const sim = isSimilarityTransform(matrix);
          if (sim.ok) {
              const c = trans(entity.center);
              outputShapes.push({
                  id: generateId('dxf-circle'),
                  type: 'circle',
                  x: c.x,
                  y: c.y,
                  radius: entity.radius * sim.scale,
                  points: [],
                  ...shapeProps
              });
          } else {
              const localPts = tessellateCircle(entity.center, entity.radius, DXF_CURVE_TOLERANCE_DEG);
              const pts = localPts.map(p => trans(p));
              outputShapes.push({
                id: generateId('dxf-circle'),
                type: 'polyline',
                points: pts,
                ...shapeProps
              });
          }
        }
        break;

      case 'ARC':
        if (entity.center && entity.radius) {
           const startAngle = toRadiansIfNeeded(entity.startAngle || 0);
           const endAngle = toRadiansIfNeeded(entity.endAngle || 0);
           const localPts = tessellateArc(entity.center, entity.radius, startAngle, endAngle, true, DXF_CURVE_TOLERANCE_DEG);
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
        const parsed: ParsedMText = (entity.type === 'MTEXT')
            ? parseMTextContent(rawText)
            : { text: rawText, widthFactor: undefined, oblique: undefined };

        const textContent = parsed.text;

        let localPoint = entity.startPoint || entity.position;
        let halign = (entity as any).halign || 0;
        let valign = (entity as any).valign || 0;

        if (entity.type === 'TEXT') {
            const alignmentPoint = (entity as any).endPoint || (entity as any).alignmentPoint;
            if (halign !== 0 || valign !== 0) {
               if (alignmentPoint) {
                  localPoint = alignmentPoint;
               }
            }
        } else if (entity.type === 'MTEXT') {
            const attachment = (entity as any).attachmentPoint;
            if (attachment) {
                 const att = attachment;
                 if ([1, 4, 7].includes(att)) halign = 0;
                 else if ([2, 5, 8].includes(att)) halign = 1;
                 else if ([3, 6, 9].includes(att)) halign = 2;

                 if ([1, 2, 3].includes(att)) valign = 3;
                 else if ([4, 5, 6].includes(att)) valign = 2;
                 else if ([7, 8, 9].includes(att)) valign = 1;
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

           const ty_len = scaleY_new || 1;
           const ty_dir = { x: ty_vec.x / ty_len, y: ty_vec.y / ty_len };

           const det = matrix.a * matrix.d - matrix.b * matrix.c;
           const isMirrored = det < 0;

           let h = entity.textHeight || (entity as any).height;
           if (!h || h === 0) {
               if (entity.style) {
                   const styleDef = dxfStyles[entity.style.toUpperCase()];
                   if (styleDef) {
                       const fixedH = styleDef.fixedTextHeight || styleDef.fixedHeight;
                       if (fixedH && fixedH > 0) h = fixedH;
                   }
               }
           }
           h = h || data.header?.$TEXTSIZE || 1;
           h = Math.max(h, MIN_TEXT_SIZE);

           let fontFile: string | undefined;
           let styleWidthFactor = 1.0;
           let styleOblique = 0;

           if (entity.style) {
               const styleDef = dxfStyles[entity.style.toUpperCase()];
               if (styleDef) {
                   fontFile = styleDef.fontFile;
                   if (styleDef.widthFactor) styleWidthFactor = styleDef.widthFactor;
                   if (styleDef.obliqueAngle) styleOblique = styleDef.obliqueAngle;
               }
           }

           const fontFamily = resolveFontFamily(fontFile);

           let finalWidthFactor = styleWidthFactor;
           if ((entity as any).widthFactor) finalWidthFactor *= (entity as any).widthFactor;
           if (parsed.widthFactor) finalWidthFactor *= parsed.widthFactor;

           let finalOblique = styleOblique;
           if (parsed.oblique) finalOblique += parsed.oblique;

           const textAlign = getDxfTextAlignment(halign, valign);
           const vShift = getDxfTextShift(valign, h);

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
            fontFamily: fontFamily,
            italic: (finalOblique > 10),
            rotation: newRot,
            align: textAlign,
            scaleX: scaleX_new * finalWidthFactor,
            scaleY: scaleY_new * (isMirrored ? 1 : -1),
            ...shapeProps
          });
        }
        break;

      case 'INSERT':
        if (entity.name && data.blocks && data.blocks[entity.name]) {
          const blockName = entity.name;
          if (processingBlocks.has(blockName)) return;

          if (!blockCache.has(blockName)) {
            processingBlocks.add(blockName);
            const block = data.blocks[blockName];
            const localShapes: Shape[] = [];

            block.entities?.forEach(child => {
                processEntity(child, identity(), undefined, undefined, undefined, localShapes);
            });
            blockCache.set(blockName, localShapes);
            processingBlocks.delete(blockName);
          }

          const cachedShapes = blockCache.get(blockName);
          if (!cachedShapes) return;

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
          const det = M_final.a * M_final.d - M_final.b * M_final.c;
          const parentSign = det < 0 ? -1 : 1;
          const sim = isSimilarityTransform(M_final);

           cachedShapes.forEach(s => {
              const clone = { ...s, id: generateId(s.type) };
              if (clone.strokeColor === BYBLOCK_COLOR_PLACEHOLDER) {
                  clone.strokeColor = color;
              }

              const cloneColorMode = buildCustomColorMode();
              if (cloneColorMode) {
                  clone.colorMode = cloneColorMode;
              }

             if (clone.points) {
                 clone.points = clone.points.map(p => applyToPoint(M_final, p));
             }
             if (clone.type === 'circle' && s.x !== undefined && s.y !== undefined) {
                 const c = applyToPoint(M_final, { x: s.x, y: s.y });
                 clone.x = c.x;
                 clone.y = c.y;
                 if (typeof s.radius === 'number' && sim.ok) {
                     clone.radius = s.radius * sim.scale;
                 } else {
                     if (typeof s.radius === 'number') {
                         const localPts = tessellateCircle({ x: s.x, y: s.y }, s.radius, DXF_CURVE_TOLERANCE_DEG);
                         clone.type = 'polyline';
                         clone.points = localPts.map(p => applyToPoint(M_final, p));
                         delete (clone as any).x;
                         delete (clone as any).y;
                         delete (clone as any).radius;
                     }
                 }
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
                clone.scaleY = (s.scaleY||-1) * sx_new * parentSign;
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

  const bounds = calculateBounds(shapes);
  normalizeShapesToOrigin(shapes, bounds);
  const { minX, minY, maxX, maxY } = bounds.minX === Infinity 
    ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } 
    : bounds;
  normalizeTextScaling(shapes);

  return {
      shapes,
      layers: Array.from(layersMap.values()),
      width: maxX - minX,
      height: maxY - minY,
      origin: { x: minX, y: minY }
  };
};
