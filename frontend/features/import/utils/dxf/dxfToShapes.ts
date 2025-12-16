import { Shape, Layer, Point } from '../../../../types';
import { generateId } from '../../../../utils/uuid';
import { DxfData, DxfEntity, DxfVector } from './types';

export interface DxfImportOptions {
  floorId: string;
  defaultLayerId: string;
  explodeBlocks?: boolean;
}

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
  7: '#FFFFFF', // White
};

const getDxfColor = (index?: number, layerColor?: string): string => {
  if (index === 0 || index === 256) return layerColor || '#FFFFFF';
  if (index && DXF_COLORS[index]) return DXF_COLORS[index];
  return '#CCCCCC';
};

const dist = (p1: DxfVector, p2: DxfVector) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

export const convertDxfToShapes = (data: DxfData, options: DxfImportOptions): DxfImportResult => {
  // Safety Limit
  const ENTITY_LIMIT = 30000;
  let entityCount = data.entities ? data.entities.length : 0;
  // Estimate block entities if explodable (naive count)
  if (data.blocks) {
      // We don't multiply by inserts here, just total definitions
      // Real check should be during recursion, but this is a sanity check
      Object.values(data.blocks).forEach(b => entityCount += b.entities.length);
  }
  if (entityCount > ENTITY_LIMIT) {
      throw new Error(`Arquivo excede o limite de segurança de ${ENTITY_LIMIT} entidades. Por favor, simplifique o desenho.`);
  }

  const shapes: Shape[] = [];
  const layersMap: Map<string, Layer> = new Map();

  if (data.tables && data.tables.layer && data.tables.layer.layers) {
    Object.values(data.tables.layer.layers).forEach(l => {
      const layerId = generateId('layer');
      layersMap.set(l.name, {
        id: layerId,
        name: l.name,
        strokeColor: getDxfColor(l.color),
        strokeEnabled: true,
        fillColor: 'transparent',
        fillEnabled: false,
        visible: l.visible !== false,
        locked: Boolean(l.frozen),
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
    return layer ? layer.strokeColor : '#FFFFFF';
  };

  const processEntity = (
    entity: DxfEntity,
    transform: { x: number, y: number, rotation: number, scaleX: number, scaleY: number },
    parentLayer?: string
  ) => {
    // Recursion Depth Check or Total Shape Check could be added here
    if (shapes.length > ENTITY_LIMIT) return;

    const layerName = entity.layer || parentLayer || '0';
    const layerId = resolveLayerId(layerName);
    const layerColor = resolveLayerColor(layerName);
    const color = getDxfColor(entity.color, layerColor);

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
          const pts = entity.vertices.map(v => trans(v));
          let isClosed = (entity as any).closed === true;

          if (isClosed && pts.length > 2) {
             if (dist(pts[0], pts[pts.length-1]) > 0.001) {
                 pts.push({...pts[0]});
             }
          }

          shapes.push({
            id: generateId('dxf-poly'),
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

      case 'SPLINE':
        // Fallback: Connect control points
        if (entity.controlPoints && entity.controlPoints.length > 1) {
             const pts = entity.controlPoints.map(p => trans(p));
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
        if (entity.startPoint && entity.text) {
           const p = trans(entity.startPoint);
           const h = (entity.textHeight || 12) * Math.abs(transform.scaleY);
           const rot = (entity.rotation || 0) + transform.rotation;

           shapes.push({
            id: generateId('dxf-text'),
            type: 'text',
            x: p.x,
            y: p.y,
            points: [],
            textContent: entity.text,
            fontSize: h,
            rotation: rot * (Math.PI / 180),
            strokeColor: color,
            fillColor: color,
            layerId,
            floorId: options.floorId,
            discipline: 'architecture',
            scaleY: -1
          });
        }
        break;

      case 'INSERT':
        if (entity.name && data.blocks && data.blocks[entity.name]) {
          const block = data.blocks[entity.name];
          const insPos = entity.position || { x: 0, y: 0 };
          const insertPos = trans(insPos);

          const childScaleX = (entity.xScale || 1) * transform.scaleX;
          const childScaleY = (entity.yScale || 1) * transform.scaleY;
          const childRotation = (entity.rotation || 0) + transform.rotation;

          block.entities.forEach(child => {
             processEntity(child, {
                x: insertPos.x,
                y: insertPos.y,
                rotation: childRotation,
                scaleX: childScaleX,
                scaleY: childScaleY
             }, layerName);
          });
        }
        break;

      case 'ELLIPSE':
      case 'HATCH':
        // Not implemented yet
        break;
    }
  };

  if (data.entities) {
      data.entities.forEach(e => processEntity(e, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }));
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
      const contentHeight = maxY - minY;
      shapes.forEach(s => {
          if (s.points && s.points.length > 0) {
              s.points = s.points.map(p => ({
                  x: p.x - minX,
                  y: contentHeight - (p.y - minY)
              }));
          } else if (s.x !== undefined && s.y !== undefined) {
              s.x -= minX;
              // Flip Y for center/position
              s.y = contentHeight - (s.y - minY);
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
