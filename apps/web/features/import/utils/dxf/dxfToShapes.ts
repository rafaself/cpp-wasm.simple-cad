import { Shape, Layer, Point, ShapeColorMode } from '../../../../types';
import { generateId } from '../../../../utils/uuid';

import { applyColorScheme, resolveColorScheme, usesCustomColorMode } from './colorScheme';
import { tessellateCircle } from './curveTessellation';
import {
  processLine,
  processPolyline,
  processSpline,
  processCircle,
  processArc,
  processText,
  EntityProcessorContext,
} from './entityProcessors';
import {
  Mat2D,
  identity,
  multiply,
  applyToPoint,
  fromTranslation,
  fromScaling,
  fromRotation,
  isSimilarityTransform,
} from './matrix2d';
import {
  calculateBounds,
  normalizeShapesToOrigin,
  normalizeTextScaling,
} from './shapeNormalization';
import { resolveColor, resolveLineweight, BYBLOCK_COLOR_PLACEHOLDER } from './styles';
import { DxfData, DxfEntity, DxfVector, DxfImportOptions, DxfLayer, DxfStyle } from './types';
import { resolveUnitScale } from './unitResolver';

export interface DxfImportResult {
  shapes: Shape[];
  layers: Layer[];
  width: number;
  height: number;
  origin: { x: number; y: number };
}

const DXF_CURVE_TOLERANCE_DEG = 2.5;

const STANDARD_LINETYPES: Record<string, number[]> = {
  DASHED: [10, 5],
  HIDDEN: [5, 5],
  CENTER: [20, 5, 5, 5],
  PHANTOM: [20, 5, 5, 5, 5, 5],
  DOT: [2, 2],
  CONTINUOUS: [],
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

  Object.values(data.tables?.layer?.layers || {}).forEach((l) => {
    const layerId = generateId('layer');
    let strokeColor = resolveColor(
      {
        type: 'LAYER',
        layer: l.name,
        trueColor: (l as any).color,
        colorIndex: (l as any).colorIndex,
      } as any,
      undefined,
      undefined,
      false,
      'original',
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
      isNative: false,
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

    const tableDef = Object.values(dxfLinetypes).find((lt) => lt.name.toUpperCase() === ltypeName);
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

    return pattern.map((v) => v * finalScale);
  };

  const blockCache: Map<string, Shape[]> = new Map();
  const processingBlocks: Set<string> = new Set();

  const processEntity = (
    entity: DxfEntity,
    matrix: Mat2D,
    parentLayer?: string,
    parentColor?: string, // Resolved hex color or Placeholder from parent
    parentLinetype?: number[], // Resolved dash array from parent
    targetShapes?: Shape[],
  ) => {
    if (!targetShapes) {
      if (!shouldImportEntity(entity)) return;
    }

    const outputShapes = targetShapes || shapes;
    if (shapes.length > ENTITY_LIMIT) return;

    const rawLayer = entity.layer || '0';
    const effectiveLayer = rawLayer === '0' && parentLayer ? parentLayer : rawLayer;
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
      ...(colorModeOverride ? { colorMode: colorModeOverride } : {}),
    };

    const ctx: EntityProcessorContext = {
      matrix,
      shapeProps,
      color,
      dxfStyles,
      header: data.header,
    };

    switch (entity.type) {
      case 'LINE':
        outputShapes.push(...processLine(entity, ctx));
        break;

      case 'LWPOLYLINE':
      case 'POLYLINE':
        outputShapes.push(...processPolyline(entity, ctx));
        break;

      case 'SPLINE':
        outputShapes.push(...processSpline(entity, ctx));
        break;

      case 'CIRCLE':
        outputShapes.push(...processCircle(entity, ctx));
        break;

      case 'ARC':
        outputShapes.push(...processArc(entity, ctx));
        break;

      case 'TEXT':
      case 'MTEXT':
      case 'ATTRIB':
        outputShapes.push(...processText(entity, ctx));
        break;

      case 'INSERT':
        if (entity.name && data.blocks && data.blocks[entity.name]) {
          const blockName = entity.name;
          if (processingBlocks.has(blockName)) return;

          if (!blockCache.has(blockName)) {
            processingBlocks.add(blockName);
            const block = data.blocks[blockName];
            const localShapes: Shape[] = [];

            block.entities?.forEach((child) => {
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
          const R = fromRotation((rotation * Math.PI) / 180);
          const T_ins = fromTranslation(insPos.x, insPos.y);
          const M_local = multiply(multiply(multiply(T_ins, R), S), T_base);
          const M_final = multiply(matrix, M_local);
          const det = M_final.a * M_final.d - M_final.b * M_final.c;
          const parentSign = det < 0 ? -1 : 1;
          const sim = isSimilarityTransform(M_final);

          cachedShapes.forEach((s) => {
            const clone = { ...s, id: generateId(s.type) };
            if (clone.strokeColor === BYBLOCK_COLOR_PLACEHOLDER) {
              clone.strokeColor = color;
            }

            const cloneColorMode = buildCustomColorMode();
            if (cloneColorMode) {
              clone.colorMode = cloneColorMode;
            }

            if (clone.points) {
              clone.points = clone.points.map((p) => applyToPoint(M_final, p));
            }
            if (clone.type === 'circle' && s.x !== undefined && s.y !== undefined) {
              const c = applyToPoint(M_final, { x: s.x, y: s.y });
              clone.x = c.x;
              clone.y = c.y;
              if (typeof s.radius === 'number' && sim.ok) {
                clone.radius = s.radius * sim.scale;
              } else {
                if (typeof s.radius === 'number') {
                  const localPts = tessellateCircle(
                    { x: s.x, y: s.y },
                    s.radius,
                    DXF_CURVE_TOLERANCE_DEG,
                  );
                  clone.type = 'polyline';
                  clone.points = localPts.map((p) => applyToPoint(M_final, p));
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
              const tx = {
                x: M_final.a * ux.x + M_final.c * ux.y,
                y: M_final.b * ux.x + M_final.d * ux.y,
              };
              clone.rotation = Math.atan2(tx.y, tx.x);
              const sx_new = Math.sqrt(tx.x * tx.x + tx.y * tx.y);
              clone.scaleX = (s.scaleX || 1) * sx_new;
              clone.scaleY = (s.scaleY || -1) * sx_new * parentSign;
            }
            outputShapes.push(clone);
          });

          if (entity.attribs) {
            entity.attribs.forEach((attr) =>
              processEntity(attr, M_final, effectiveLayer, color, strokeDash, outputShapes),
            );
          }
        }
        break;
    }
  };

  const globalMatrix = fromScaling(globalScale, globalScale);
  if (data.entities) {
    data.entities.forEach((e) => processEntity(e, globalMatrix));
  }

  const bounds = calculateBounds(shapes);
  normalizeShapesToOrigin(shapes, bounds);
  const { minX, minY, maxX, maxY } =
    bounds.minX === Infinity ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : bounds;
  normalizeTextScaling(shapes);

  return {
    shapes,
    layers: Array.from(layersMap.values()),
    width: maxX - minX,
    height: maxY - minY,
    origin: { x: minX, y: minY },
  };
};
