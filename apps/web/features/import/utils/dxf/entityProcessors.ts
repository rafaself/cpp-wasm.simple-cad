import { Shape, Point } from '../../../../types';
import { generateId } from '../../../../utils/uuid';

import {
  tessellateArc,
  tessellateCircle,
  tessellateBulge,
  tessellateSpline,
} from './curveTessellation';
import { Mat2D, applyToPoint, isSimilarityTransform } from './matrix2d';
import { resolveFontFamily } from './styles';
import { parseMTextContent, getDxfTextAlignment, getDxfTextShift, ParsedMText } from './textUtils';
import { DxfEntity, DxfVector, DxfStyle } from './types';

export interface EntityProcessorContext {
  matrix: Mat2D;
  shapeProps: any;
  color: string;
  dxfStyles: Record<string, DxfStyle>;
  header: { $TEXTSIZE?: number; $LTSCALE?: number } | undefined;
}

const dist = (p1: DxfVector, p2: DxfVector) =>
  Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const DXF_CURVE_TOLERANCE_DEG = 2.5;
const MIN_TEXT_SIZE = 0.001;

const toRadiansIfNeeded = (angle: number): number => {
  if (!isFinite(angle)) return 0;
  const abs = Math.abs(angle);
  return abs > Math.PI * 2 + 0.5 ? (angle * Math.PI) / 180 : angle;
};

export const processLine = (entity: DxfEntity, ctx: EntityProcessorContext): Shape[] => {
  const { matrix, shapeProps } = ctx;
  const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

  if (entity.vertices && entity.vertices.length >= 2) {
    return [
      {
        id: generateId('dxf-line'),
        type: 'line',
        points: [trans(entity.vertices[0]), trans(entity.vertices[1])],
        ...shapeProps,
      } as Shape,
    ];
  }
  return [];
};

export const processPolyline = (entity: DxfEntity, ctx: EntityProcessorContext): Shape[] => {
  const { matrix, shapeProps, color } = ctx;
  const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

  if (!entity.vertices || entity.vertices.length < 2) return [];

  const sim = isSimilarityTransform(matrix);
  const rawPts: DxfVector[] = [];
  const vs = entity.vertices;
  const isClosed =
    (entity as any).closed === true || (entity as any).shape === true || entity.closed === true;

  if (
    sim.ok &&
    isClosed &&
    vs.length === 2 &&
    vs.every((v) => v.bulge !== undefined && Math.abs(v.bulge) > 1e-10) &&
    Math.abs(Math.abs(vs[0].bulge!) - 1) < 1e-6 &&
    Math.abs(Math.abs(vs[1].bulge!) - 1) < 1e-6
  ) {
    const p1 = trans(vs[0]);
    const p2 = trans(vs[1]);
    const cx = (p1.x + p2.x) / 2;
    const cy = (p1.y + p2.y) / 2;
    const r = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
    return [
      {
        id: generateId('dxf-circle'),
        type: 'circle',
        x: cx,
        y: cy,
        radius: r,
        points: [],
        ...shapeProps,
      } as Shape,
    ];
  }

  for (let i = 0; i < vs.length; i++) {
    const curr = vs[i];
    rawPts.push(curr);
    const next = i === vs.length - 1 ? (isClosed ? vs[0] : null) : vs[i + 1];
    if (next && curr.bulge && Math.abs(curr.bulge) > 1e-10) {
      const curvePts = tessellateBulge(curr, next, curr.bulge, DXF_CURVE_TOLERANCE_DEG);
      rawPts.push(...curvePts);
    }
  }
  if (isClosed && rawPts.length > 2) {
    const first = rawPts[0];
    const last = rawPts[rawPts.length - 1];
    if (dist(first, last) > 0.001) rawPts.push({ ...first });
  }
  const pts = rawPts.map((v) => trans(v));

  const isHatch = (entity as any).isHatch === true;

  return [
    {
      id: generateId('dxf-poly'),
      type: 'polyline',
      points: pts,
      ...shapeProps,
      ...(isHatch
        ? {
            strokeEnabled: false,
            fillColor: color,
            fillEnabled: true,
            colorMode: { fill: 'custom', stroke: 'custom' },
          }
        : {}),
    } as Shape,
  ];
};

export const processSpline = (entity: DxfEntity, ctx: EntityProcessorContext): Shape[] => {
  const { matrix, shapeProps } = ctx;
  const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

  if (entity.controlPoints && entity.controlPoints.length > 1) {
    const degree = entity.degree || 3;
    const pts = tessellateSpline(entity.controlPoints, degree, entity.knots, entity.weights);
    const transformedPts = pts.map((p) => trans(p));
    return [
      {
        id: generateId('dxf-spline'),
        type: 'polyline',
        points: transformedPts,
        ...shapeProps,
      } as Shape,
    ];
  }
  return [];
};

export const processCircle = (entity: DxfEntity, ctx: EntityProcessorContext): Shape[] => {
  const { matrix, shapeProps } = ctx;
  const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

  if (entity.center && entity.radius) {
    const sim = isSimilarityTransform(matrix);
    if (sim.ok) {
      const c = trans(entity.center);
      return [
        {
          id: generateId('dxf-circle'),
          type: 'circle',
          x: c.x,
          y: c.y,
          radius: entity.radius * sim.scale,
          points: [],
          ...shapeProps,
        } as Shape,
      ];
    } else {
      const localPts = tessellateCircle(entity.center, entity.radius, DXF_CURVE_TOLERANCE_DEG);
      const pts = localPts.map((p) => trans(p));
      return [
        {
          id: generateId('dxf-circle'),
          type: 'polyline',
          points: pts,
          ...shapeProps,
        } as Shape,
      ];
    }
  }
  return [];
};

export const processArc = (entity: DxfEntity, ctx: EntityProcessorContext): Shape[] => {
  const { matrix, shapeProps } = ctx;
  const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

  if (entity.center && entity.radius) {
    const startAngle = toRadiansIfNeeded(entity.startAngle || 0);
    const endAngle = toRadiansIfNeeded(entity.endAngle || 0);
    const localPts = tessellateArc(
      entity.center,
      entity.radius,
      startAngle,
      endAngle,
      true,
      DXF_CURVE_TOLERANCE_DEG,
    );
    const pts = localPts.map((p) => trans(p));
    return [
      {
        id: generateId('dxf-arc'),
        type: 'polyline',
        points: pts,
        ...shapeProps,
      } as Shape,
    ];
  }
  return [];
};

export const processText = (entity: DxfEntity, ctx: EntityProcessorContext): Shape[] => {
  const { matrix, shapeProps, dxfStyles, header } = ctx;
  const trans = (p: DxfVector): Point => applyToPoint(matrix, p);

  const rawText = entity.text || (entity as any).value;
  const parsed: ParsedMText =
    entity.type === 'MTEXT'
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
      y: matrix.b * ux.x + matrix.d * ux.y,
    };
    const ty_vec = {
      x: matrix.a * uy.x + matrix.c * uy.y,
      y: matrix.b * uy.x + matrix.d * uy.y,
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
    h = h || header?.$TEXTSIZE || 1;
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

    return [
      {
        id: generateId('dxf-text'),
        type: 'text',
        x: p.x + shiftX,
        y: p.y + shiftY,
        points: [],
        textContent: textContent,
        fontSize: h,
        fontFamily: fontFamily,
        italic: finalOblique > 10,
        rotation: newRot,
        align: textAlign,
        scaleX: scaleX_new * finalWidthFactor,
        scaleY: scaleY_new * (isMirrored ? 1 : -1),
        ...shapeProps,
      } as Shape,
    ];
  }
  return [];
};
