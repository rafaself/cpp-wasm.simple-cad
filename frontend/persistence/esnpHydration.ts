import type { Layer, SerializedProject, Shape, ShapeColorMode } from '@/types';
import type { EntityId } from '@/engine/core/protocol';
import type { EsnpSnapshot, EsnpText } from './esnpSnapshot';
import { rgbToHex } from '@/utils/cssColor';
import { normalizeLayerStyle, normalizeShapeStyle } from '@/utils/storeNormalization';
import { TextStyleFlags, TextBoxMode, unpackColorRGBA } from '@/types/text';

export type EsnpHydratedLayer = {
  engineId: number;
  layer: Layer;
};

export type EsnpHydratedEntity = {
  engineId: EntityId;
  shape: Shape;
  textMeta?: { boxMode: TextBoxMode; constraintWidth: number };
};

export type EsnpHydrationResult = {
  project: SerializedProject;
  layers: EsnpHydratedLayer[];
  entities: EsnpHydratedEntity[];
};

type HydrationOptions = {
  layerIdForEngine?: (engineId: number) => string;
  shapeIdForEntity?: (engineId: EntityId) => string;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const toHex = (r: number, g: number, b: number): string =>
  rgbToHex(clamp01(r) * 255, clamp01(g) * 255, clamp01(b) * 255);

const toOpacityPct = (a: number): number => Math.round(clamp01(a) * 100);

const toBool = (v: number): boolean => v > 0.5;

const toColorMode = (): ShapeColorMode => ({ fill: 'custom', stroke: 'custom' });

const buildStroke = (r: number, g: number, b: number, a: number, enabled: number, width: number) => ({
  strokeColor: toHex(r, g, b),
  strokeOpacity: toOpacityPct(a),
  strokeEnabled: toBool(enabled),
  strokeWidth: Number.isFinite(width) ? width : 1,
});

const buildFill = (r: number, g: number, b: number, a: number) => ({
  fillColor: toHex(r, g, b),
  fillOpacity: toOpacityPct(a),
  fillEnabled: a > 0.001,
});

const toTextAlign = (align: number): 'left' | 'center' | 'right' => {
  if (align === 1) return 'center';
  if (align === 2) return 'right';
  return 'left';
};

const toFontFamily = (fontId: number): string => {
  switch (fontId) {
    case 1:
      return 'Arial';
    case 2:
      return 'Times';
    case 3:
      return 'Roboto';
    case 4:
      return 'Inter';
    default:
      return 'Inter';
  }
};

const getPrimaryRun = (text: EsnpText) => text.runs[0];

const buildTextShape = (text: EsnpText, shapeId: string, layerId: string): EsnpHydratedEntity => {
  const run = getPrimaryRun(text);
  const fontSize = run?.fontSize ?? 16;
  const flags = run?.flags ?? TextStyleFlags.None;
  const { r, g, b, a } = run ? unpackColorRGBA(run.colorRGBA) : { r: 1, g: 1, b: 1, a: 1 };

  const layoutWidth = text.layoutWidth || Math.max(0, text.maxX - text.minX);
  const layoutHeight = text.layoutHeight || Math.max(0, text.maxY - text.minY);
  const width = text.boxMode === TextBoxMode.FixedWidth ? text.constraintWidth : layoutWidth;
  const height = layoutHeight;

  const shape: Shape = normalizeShapeStyle({
    id: shapeId,
    layerId,
    type: 'text',
    points: [],
    x: text.x,
    y: text.y - height,
    width,
    height,
    rotation: text.rotation,
    textContent: text.content,
    fontSize,
    fontFamily: toFontFamily(run?.fontId ?? 4),
    align: toTextAlign(text.align),
    bold: (flags & TextStyleFlags.Bold) !== 0,
    italic: (flags & TextStyleFlags.Italic) !== 0,
    underline: (flags & TextStyleFlags.Underline) !== 0,
    strike: (flags & TextStyleFlags.Strikethrough) !== 0,
    strokeColor: toHex(r, g, b),
    strokeOpacity: toOpacityPct(a),
    strokeEnabled: false,
    fillColor: '#ffffff',
    fillOpacity: 0,
    fillEnabled: false,
    colorMode: toColorMode(),
  });

  return {
    engineId: text.id,
    shape,
    textMeta: { boxMode: text.boxMode, constraintWidth: text.constraintWidth },
  };
};

export const buildProjectFromEsnp = (
  snapshot: EsnpSnapshot,
  options: HydrationOptions = {},
): EsnpHydrationResult => {
  const layerIdForEngine = options.layerIdForEngine ?? ((engineId) => `layer-${engineId}`);
  const shapeIdForEntity = options.shapeIdForEntity ?? ((engineId) => `entity-${engineId}`);

  const layers = [...snapshot.layers].sort((a, b) => a.order - b.order).map((rec) => {
    const layer: Layer = normalizeLayerStyle({
      id: layerIdForEngine(rec.id),
      name: rec.name || 'Layer',
      strokeColor: '#000000',
      strokeEnabled: true,
      fillColor: '#ffffff',
      fillEnabled: true,
      visible: (rec.flags & 1) !== 0,
      locked: (rec.flags & 2) !== 0,
    });
    return { engineId: rec.id, layer };
  });

  const entities = new Map<EntityId, EsnpHydratedEntity>();

  const addEntity = (engineId: EntityId, shape: Shape, textMeta?: EsnpHydratedEntity['textMeta']) => {
    entities.set(engineId, { engineId, shape: normalizeShapeStyle(shape), ...(textMeta ? { textMeta } : {}) });
  };

  for (const rect of snapshot.rects) {
    const layerId = layerIdForEngine(rect.layerId);
    addEntity(rect.id, {
      id: shapeIdForEntity(rect.id),
      layerId,
      type: 'rect',
      points: [],
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      ...buildFill(rect.fillR, rect.fillG, rect.fillB, rect.fillA),
      ...buildStroke(rect.strokeR, rect.strokeG, rect.strokeB, rect.strokeA, rect.strokeEnabled, rect.strokeWidth),
      colorMode: toColorMode(),
    });
  }

  for (const line of snapshot.lines) {
    const layerId = layerIdForEngine(line.layerId);
    addEntity(line.id, {
      id: shapeIdForEntity(line.id),
      layerId,
      type: 'line',
      points: [
        { x: line.x0, y: line.y0 },
        { x: line.x1, y: line.y1 },
      ],
      fillColor: '#ffffff',
      fillEnabled: false,
      fillOpacity: 0,
      ...buildStroke(line.r, line.g, line.b, line.a, line.enabled, line.strokeWidth),
      colorMode: toColorMode(),
    });
  }

  for (const poly of snapshot.polylines) {
    const layerId = layerIdForEngine(poly.layerId);
    const start = poly.offset;
    const end = poly.offset + poly.count;
    const points = snapshot.points.slice(start, end).map((p) => ({ x: p.x, y: p.y }));
    if (points.length < 2) continue;

    addEntity(poly.id, {
      id: shapeIdForEntity(poly.id),
      layerId,
      type: 'polyline',
      points,
      fillColor: '#ffffff',
      fillEnabled: false,
      fillOpacity: 0,
      ...buildStroke(poly.r, poly.g, poly.b, poly.a, poly.enabled, poly.strokeWidth),
      colorMode: toColorMode(),
    });
  }

  for (const circle of snapshot.circles) {
    const layerId = layerIdForEngine(circle.layerId);
    addEntity(circle.id, {
      id: shapeIdForEntity(circle.id),
      layerId,
      type: 'circle',
      points: [],
      x: circle.cx,
      y: circle.cy,
      width: circle.rx * 2,
      height: circle.ry * 2,
      rotation: circle.rot,
      scaleX: circle.sx,
      scaleY: circle.sy,
      ...buildFill(circle.fillR, circle.fillG, circle.fillB, circle.fillA),
      ...buildStroke(circle.strokeR, circle.strokeG, circle.strokeB, circle.strokeA, circle.strokeEnabled, circle.strokeWidth),
      colorMode: toColorMode(),
    });
  }

  for (const polygon of snapshot.polygons) {
    const layerId = layerIdForEngine(polygon.layerId);
    addEntity(polygon.id, {
      id: shapeIdForEntity(polygon.id),
      layerId,
      type: 'polygon',
      points: [],
      x: polygon.cx,
      y: polygon.cy,
      width: polygon.rx * 2,
      height: polygon.ry * 2,
      rotation: polygon.rot,
      scaleX: polygon.sx,
      scaleY: polygon.sy,
      sides: polygon.sides,
      ...buildFill(polygon.fillR, polygon.fillG, polygon.fillB, polygon.fillA),
      ...buildStroke(polygon.strokeR, polygon.strokeG, polygon.strokeB, polygon.strokeA, polygon.strokeEnabled, polygon.strokeWidth),
      colorMode: toColorMode(),
    });
  }

  for (const arrow of snapshot.arrows) {
    const layerId = layerIdForEngine(arrow.layerId);
    addEntity(arrow.id, {
      id: shapeIdForEntity(arrow.id),
      layerId,
      type: 'arrow',
      points: [
        { x: arrow.ax, y: arrow.ay },
        { x: arrow.bx, y: arrow.by },
      ],
      arrowHeadSize: arrow.head,
      fillColor: '#ffffff',
      fillEnabled: false,
      fillOpacity: 0,
      ...buildStroke(arrow.sr, arrow.sg, arrow.sb, arrow.sa, arrow.strokeEnabled, arrow.strokeWidth),
      colorMode: toColorMode(),
    });
  }

  for (const text of snapshot.texts) {
    const layerId = layerIdForEngine(text.layerId);
    const shapeId = shapeIdForEntity(text.id);
    const entry = buildTextShape(text, shapeId, layerId);
    entities.set(text.id, entry);
  }

  const orderedShapes: Shape[] = [];
  const seen = new Set<string>();
  for (const id of snapshot.drawOrder) {
    const entry = entities.get(id);
    if (!entry) continue;
    orderedShapes.push(entry.shape);
    seen.add(entry.shape.id);
  }

  const remaining = Array.from(entities.values())
    .filter((entry) => !seen.has(entry.shape.id))
    .sort((a, b) => a.engineId - b.engineId);

  for (const entry of remaining) orderedShapes.push(entry.shape);

  const project: SerializedProject = {
    layers: layers.map((l) => l.layer),
    shapes: orderedShapes,
    activeLayerId: layers[0]?.layer.id ?? 'desenho',
  };

  return {
    project,
    layers,
    entities: Array.from(entities.values()),
  };
};
