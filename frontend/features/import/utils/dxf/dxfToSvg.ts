
import { DxfData, DxfEntity, DxfImportOptions } from './types';
import { resolveColor, resolveLineweight, BYBLOCK_COLOR_PLACEHOLDER, toGrayscale } from './styles';

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

// Helper to escape XML characters
const escapeXml = (unsafe: string): string => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

// Helper to format floats to reduce string size
const formatFloat = (n: number | undefined): string => {
  if (n === undefined) return '0';
  // Round to 3 decimals to save space, sufficient for visual rendering
  return parseFloat(n.toFixed(3)).toString();
};

// Generate SVG Transform string from DXF properties
const getTransform = (
  x: number = 0,
  y: number = 0,
  scaleX: number = 1,
  scaleY: number = 1,
  rotation: number = 0
): string => {
  const parts: string[] = [];
  if (x !== 0 || y !== 0) parts.push(`translate(${formatFloat(x)} ${formatFloat(y)})`);
  if (rotation !== 0) parts.push(`rotate(${formatFloat(rotation)})`);
  if (scaleX !== 1 || scaleY !== 1) parts.push(`scale(${formatFloat(scaleX)} ${formatFloat(scaleY)})`);
  return parts.join(' ');
};

interface SvgAccumulator {
  defs: string[];
  layers: Map<string, string[]>;
  extents: { minX: number; minY: number; maxX: number; maxY: number };
}

const updateExtents = (acc: SvgAccumulator, x: number, y: number) => {
  if (x < acc.extents.minX) acc.extents.minX = x;
  if (y < acc.extents.minY) acc.extents.minY = y;
  if (x > acc.extents.maxX) acc.extents.maxX = x;
  if (y > acc.extents.maxY) acc.extents.maxY = y;
};

const entityToSvg = (
  entity: DxfEntity,
  data: DxfData,
  options: DxfImportOptions,
  blockContext: boolean = false
): string | null => {
  // Resolve Style
  // If blockContext is true, we are inside a symbol definition.
  // We don't have access to the parent layer here, so we return 'currentColor' for ByBlock.
  let color = resolveColor(entity, data.tables?.layer?.layers[entity.layer]);

  if (options.grayscale) {
      color = toGrayscale(color);
  }

  if (color === BYBLOCK_COLOR_PLACEHOLDER) {
      color = 'currentColor';
  }

  const strokeWidth = resolveLineweight(entity, data.tables?.layer?.layers[entity.layer]);

  // vector-effect="non-scaling-stroke" ensures line thickness is consistent regardless of zoom/scale
  const commonAttrs = `stroke="${color}" stroke-width="${strokeWidth}" fill="none" vector-effect="non-scaling-stroke"`;

  switch (entity.type) {
    case 'LINE': {
      if (!entity.vertices || entity.vertices.length < 2) return null;
      const [p1, p2] = entity.vertices;
      return `<path d="M ${formatFloat(p1.x)} ${formatFloat(p1.y)} L ${formatFloat(p2.x)} ${formatFloat(p2.y)}" ${commonAttrs} />`;
    }

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      if (!entity.vertices || entity.vertices.length < 2) return null;
      // Note: Ignoring bulges (arcs) for MVP performance mode
      const points = entity.vertices.map(v => `${formatFloat(v.x)},${formatFloat(v.y)}`).join(' ');

      if (entity.closed) {
          return `<polygon points="${points}" ${commonAttrs} />`;
      }
      return `<polyline points="${points}" ${commonAttrs} />`;
    }

    case 'CIRCLE': {
      if (!entity.center || !entity.radius) return null;
      return `<circle cx="${formatFloat(entity.center.x)}" cy="${formatFloat(entity.center.y)}" r="${formatFloat(entity.radius)}" ${commonAttrs} />`;
    }

    case 'ARC': {
      if (!entity.center || !entity.radius || entity.startAngle === undefined || entity.endAngle === undefined) return null;
      // Convert angles to radians and calculate start/end points
      // DXF angles are degrees CCW from X-axis.
      const startRad = (entity.startAngle * Math.PI) / 180;
      const endRad = (entity.endAngle * Math.PI) / 180;

      const x1 = entity.center.x + entity.radius * Math.cos(startRad);
      const y1 = entity.center.y + entity.radius * Math.sin(startRad);
      const x2 = entity.center.x + entity.radius * Math.cos(endRad);
      const y2 = entity.center.y + entity.radius * Math.sin(endRad);

      // Large arc flag
      let diff = entity.endAngle - entity.startAngle;
      if (diff < 0) diff += 360;
      const largeArc = diff > 180 ? 1 : 0;
      const sweep = 1; // CCW

      const d = `M ${formatFloat(x1)} ${formatFloat(y1)} A ${formatFloat(entity.radius)} ${formatFloat(entity.radius)} 0 ${largeArc} ${sweep} ${formatFloat(x2)} ${formatFloat(y2)}`;
      return `<path d="${d}" ${commonAttrs} />`;
    }

    case 'INSERT': {
      // <use href="#blockName" ... />
      if (!entity.name) return null;
      // Sanitize block name for ID
      const blockId = `block_${entity.name.replace(/[^a-zA-Z0-9-_]/g, '_')}`;

      const transform = getTransform(
        entity.position?.x,
        entity.position?.y,
        entity.xScale,
        entity.yScale,
        entity.rotation
      );

      // We apply 'color' to the <use> tag, which cascades to 'currentColor' in the symbol
      return `<use href="#${blockId}" transform="${transform}" color="${color}" stroke="${color}" fill="none" />`;
    }

    case 'TEXT':
    case 'MTEXT': {
       // Simplified Text Support
       if (!entity.text || (!entity.startPoint && !entity.position)) return null;
       const pos = entity.startPoint || entity.position || { x: 0, y: 0 };
       
       let height = entity.textHeight || (entity as any).height;
       if (!height || height === 0) {
           // Fallback to Style fixed height
           if (entity.style && data.tables?.style?.styles) {
               const styleName = entity.style.toUpperCase();
               const styles = data.tables.style.styles;
               // Case-insensitive lookup
               const styleKey = Object.keys(styles).find(k => k.toUpperCase() === styleName);
               if (styleKey) {
                   const style = styles[styleKey];
                   // fixedTextHeight (40) is the property
                   const fixedH = style.fixedTextHeight || style.fixedHeight;
                   if (fixedH && fixedH > 0) {
                       height = fixedH;
                   }
               }
           }
       }
       // Fallback to global default
       height = height || data.header?.$TEXTSIZE || 1;

       const widthFactor = (entity as any).widthFactor || 1;

       // Handle rotation and flip
       // Entity rotation is CCW. We need to flip Y for text to be readable if global Y is flipped.
       // Since we flip the entire container (scaleY: -1), we keep text in logical DXF space (Y-Up).
       const rot = entity.rotation || 0;
       const transform = `translate(${formatFloat(pos.x)} ${formatFloat(pos.y)}) rotate(${formatFloat(rot)}) scale(${formatFloat(widthFactor)}, -1)`;

       // Clean text
       const cleanText = entity.text.replace(/\\P/g, '\n').replace(/\\[A-Z0-9]+;?/g, '').replace(/[{}]/g, '');

       return `<text transform="${transform}" font-size="${formatFloat(height)}" fill="${color}" stroke="none" font-family="monospace">${escapeXml(cleanText)}</text>`;
    }

    default:
      return null;
  }
};

export const dxfToSvg = (
  data: DxfData,
  options: DxfImportOptions
): { svgRaw: string; viewBox: { x: number; y: number; width: number; height: number }, unitsScale: number } => {
  // Determine Scale Factor (Logic copied from dxfToShapes)
  const insUnits = data.header?.$INSUNITS;
  let unitsScale = 1;
  let sourceToMeters = 1.0;

  if (options.sourceUnits && options.sourceUnits !== 'auto') {
      switch (options.sourceUnits) {
          case 'meters': sourceToMeters = 1.0; break;
          case 'cm': sourceToMeters = 0.01; break;
          case 'mm': sourceToMeters = 0.001; break;
          case 'feet': sourceToMeters = 0.3048; break;
          case 'inches': sourceToMeters = 0.0254; break;
      }
      unitsScale = sourceToMeters * 100;
  } else {
      if (insUnits !== undefined && DXF_UNITS[insUnits]) {
          unitsScale = DXF_UNITS[insUnits];
      } else {
          // Heuristic for Unitless
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity;
          let sampleCount = 0;
          const shouldImport = (e: DxfEntity) => options.includePaperSpace || !e.inPaperSpace;

          data.entities.forEach(e => {
              if (sampleCount > 1000 || !shouldImport(e)) return;
              if (e.vertices) {
                  e.vertices.forEach(v => {
                      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
                      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
                  });
                  sampleCount++;
              } else if (e.position) {
                  minX = Math.min(minX, e.position.x); maxX = Math.max(maxX, e.position.x);
                  minY = Math.min(minY, e.position.y); maxY = Math.max(maxY, e.position.y);
                  sampleCount++;
              }
          });
          const extent = Math.max(maxX - minX, maxY - minY);
          if (extent > 0 && extent < 2000) {
              unitsScale = 100; // Assume Meters
          } else {
              unitsScale = 1; // Assume CM or MM (already huge)
          }
      }
  }

  const acc: SvgAccumulator = {
    defs: [],
    layers: new Map(),
    extents: {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity
    }
  };

  // 1. Process Blocks into Defs
  if (data.blocks) {
    Object.values(data.blocks).forEach(block => {
      const blockId = `block_${block.name.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
      const parts: string[] = [];

      if (block.entities) {
        block.entities.forEach(ent => {
          const svgStr = entityToSvg(ent, data, options, true);
          if (svgStr) parts.push(svgStr);
        });
      }

      const bx = block.position?.x ?? 0;
      const by = block.position?.y ?? 0;
      const content = parts.join('');
      const transform = (bx !== 0 || by !== 0) ? `transform="translate(${-bx} ${-by})"` : '';

      acc.defs.push(`<symbol id="${blockId}" overflow="visible"><g ${transform}>${content}</g></symbol>`);
    });
  }

  // 2. Process Entities
  data.entities.forEach(entity => {
    // Filter Paper Space if needed
    if (!options.includePaperSpace && entity.inPaperSpace) return;

    // Update Extents (Always calculate from entities for accuracy)
    if (entity.vertices) entity.vertices.forEach(v => updateExtents(acc, v.x, v.y));
    if (entity.center) {
        updateExtents(acc, entity.center.x, entity.center.y);
        if (entity.radius) {
            updateExtents(acc, entity.center.x - entity.radius, entity.center.y - entity.radius);
            updateExtents(acc, entity.center.x + entity.radius, entity.center.y + entity.radius);
        }
    }
    if (entity.position) {
         updateExtents(acc, entity.position.x, entity.position.y);
         // For INSERTs (Blocks), we should ideally estimate the block size, 
         // but simple position check is better than nothing.
         // TODO: Recurse into block for precise extents if needed.
    }
    // Text
    if ((entity.type === 'TEXT' || entity.type === 'MTEXT') && (entity.startPoint || entity.position)) {
        const p = entity.startPoint || entity.position;
        if (p) updateExtents(acc, p.x, p.y);
    }

    const svgStr = entityToSvg(entity, data, options);
    if (svgStr) {
      const layerName = entity.layer || '0';
      if (!acc.layers.has(layerName)) {
        acc.layers.set(layerName, []);
      }
      acc.layers.get(layerName)!.push(svgStr);
    }
  });

  // 3. Construct Final SVG
  const width = acc.extents.maxX - acc.extents.minX;
  const height = acc.extents.maxY - acc.extents.minY;

  // Safety for empty files/invalid extents
  const safeWidth = (width > 0 && width < Infinity) ? width : 1000;
  const safeHeight = (height > 0 && height < Infinity) ? height : 1000;
  const minX = (acc.extents.minX !== Infinity) ? acc.extents.minX : 0;
  const minY = (acc.extents.minY !== Infinity) ? acc.extents.minY : 0;

  const viewBox = `${formatFloat(minX)} ${formatFloat(minY)} ${formatFloat(safeWidth)} ${formatFloat(safeHeight)}`;

  const defsSection = acc.defs.length > 0 ? `<defs>${acc.defs.join('')}</defs>` : '';

  const layerGroups: string[] = [];
  acc.layers.forEach((content, layerName) => {
    // Sanitize Layer ID for consistency with svgHiddenLayers expectation
    const cleanLayerId = layerName.replace(/[^a-zA-Z0-9-_]/g, '_');
    layerGroups.push(`<g id="${cleanLayerId}">${content.join('')}</g>`);
  });

  const svgRaw = `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${defsSection}${layerGroups.join('')}</svg>`;

  return {
    svgRaw,
    viewBox: { x: minX, y: minY, width: safeWidth, height: safeHeight },
    unitsScale
  };
};
