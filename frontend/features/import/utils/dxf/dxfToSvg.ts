import { applyColorScheme, resolveColorScheme, ColorSchemePreferences } from './colorScheme';
import { tessellateBulge, tessellateSpline } from './curveTessellation';
import { resolveColor, resolveLineweight, BYBLOCK_COLOR_PLACEHOLDER } from './styles';
import { DxfData, DxfEntity, DxfImportOptions } from './types';

// DXF Unit Codes to Centimeters (CM) Conversion Factors
const DXF_UNITS: Record<number, number> = {
  1: 2.54, // Inches
  2: 30.48, // Feet
  3: 160934.4, // Miles
  4: 0.1, // Millimeters
  5: 1.0, // Centimeters
  6: 100.0, // Meters
  7: 100000.0, // Kilometers
  8: 0.00000254, // Microinches
  9: 0.00254, // Mils
  10: 91.44, // Yards
  11: 1.0e-8, // Angstroms
  12: 1.0e-7, // Nanometers
  13: 0.0001, // Microns
  14: 10.0, // Decimeters
  15: 1000.0, // Decameters
  16: 10000.0, // Hectometers
  17: 1.0e11, // Gigameters
};

// Helper to escape XML characters
const escapeXml = (unsafe: string): string => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
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
  rotation: number = 0,
): string => {
  const parts: string[] = [];
  if (x !== 0 || y !== 0) parts.push(`translate(${formatFloat(x)} ${formatFloat(y)})`);
  if (rotation !== 0) parts.push(`rotate(${formatFloat(rotation)})`);
  if (scaleX !== 1 || scaleY !== 1)
    parts.push(`scale(${formatFloat(scaleX)} ${formatFloat(scaleY)})`);
  return parts.join(' ');
};

const toRadiansIfNeeded = (angle: number): number => {
  if (!isFinite(angle)) return 0;
  const abs = Math.abs(angle);
  return abs > Math.PI * 2 + 0.5 ? (angle * Math.PI) / 180 : angle;
};

// Hardcoded fallbacks if table missing
const STANDARD_LINETYPES: Record<string, number[]> = {
  DASHED: [10, 5],
  HIDDEN: [5, 5],
  CENTER: [20, 5, 5, 5],
  PHANTOM: [20, 5, 5, 5, 5, 5],
  DOT: [2, 2],
  DOT2: [2, 2],
  CONTINUOUS: [],
};

const resolveStrokeDash = (
  entity: DxfEntity,
  layer?: any,
  data?: DxfData,
): number[] | 'BYBLOCK' => {
  let ltype: string = typeof entity.lineType === 'string' ? entity.lineType : '';

  if (ltype?.toUpperCase() === 'BYBLOCK') return 'BYBLOCK';

  if (!ltype || ltype.toUpperCase() === 'BYLAYER') {
    const layerType = typeof layer?.lineType === 'string' ? layer.lineType : undefined;
    ltype = layerType || 'CONTINUOUS';
  }

  const ltypeName = ltype.toUpperCase();
  if (ltypeName === 'CONTINUOUS') return [];

  let pattern: number[] = [];

  const table = data?.tables?.ltype?.linetypes || {};
  const tableDef = Object.values(table).find((lt) => lt.name.toUpperCase() === ltypeName);
  if (tableDef?.pattern?.length) {
    const converted: number[] = [];
    for (const val of tableDef.pattern) {
      if (Math.abs(val) < 1e-6) converted.push(0.1);
      else if (val > 0) converted.push(val);
      else converted.push(Math.abs(val));
    }
    pattern = converted;
  } else {
    pattern = STANDARD_LINETYPES[ltypeName] || [];
  }

  if (!pattern.length) return [];

  const ltScale = data?.header?.$LTSCALE || 1.0;
  const entityScale = entity.lineTypeScale || 1.0;
  const finalScale = ltScale * entityScale;

  return pattern.map((v) => v * finalScale);
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
  colorScheme: ColorSchemePreferences,
): string | null => {
  // Resolve Style
  // If blockContext is true, we are inside a symbol definition.
  // We don't have access to the parent layer here, so we return 'currentColor' for ByBlock.
  let color = resolveColor(
    entity,
    data.tables?.layer?.layers[entity.layer],
    undefined,
    false,
    'original',
  );

  if (color !== BYBLOCK_COLOR_PLACEHOLDER) {
    color = applyColorScheme(color, colorScheme.scheme, colorScheme.customColor);
  }

  if (color === BYBLOCK_COLOR_PLACEHOLDER) {
    color = 'currentColor';
  }

  const strokeWidth = resolveLineweight(entity, data.tables?.layer?.layers[entity.layer]);
  const dash = resolveStrokeDash(entity, data.tables?.layer?.layers[entity.layer], data);
  const dashAttr =
    dash === 'BYBLOCK' || (Array.isArray(dash) && dash.length === 0)
      ? ''
      : ` stroke-dasharray="${dash.join(' ')}"`;

  // vector-effect="non-scaling-stroke" ensures line thickness is consistent regardless of zoom/scale
  const commonAttrs = `stroke="${color}" stroke-width="${strokeWidth}" fill="none" vector-effect="non-scaling-stroke"${dashAttr}`;

  switch (entity.type) {
    case 'LINE': {
      if (!entity.vertices || entity.vertices.length < 2) return null;
      const [p1, p2] = entity.vertices;
      return `<path d="M ${formatFloat(p1.x)} ${formatFloat(p1.y)} L ${formatFloat(p2.x)} ${formatFloat(p2.y)}" ${commonAttrs} />`;
    }

    case 'LWPOLYLINE':
    case 'POLYLINE': {
      if (!entity.vertices || entity.vertices.length < 2) return null;
      const isClosed =
        (entity as any).closed === true || (entity as any).shape === true || entity.closed === true;

      // Special case: closed 2-vertex bulge circle.
      // Render as <circle> to avoid huge polygon point counts.
      if (
        isClosed &&
        entity.vertices.length === 2 &&
        entity.vertices.every((v) => v.bulge !== undefined && Math.abs(v.bulge) > 1e-10) &&
        Math.abs(Math.abs(entity.vertices[0].bulge!) - 1) < 1e-6 &&
        Math.abs(Math.abs(entity.vertices[1].bulge!) - 1) < 1e-6
      ) {
        const p1 = entity.vertices[0];
        const p2 = entity.vertices[1];
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const r = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
        return `<circle cx="${formatFloat(cx)}" cy="${formatFloat(cy)}" r="${formatFloat(r)}" ${commonAttrs} />`;
      }

      const rawPts = entity.vertices;
      const expanded: typeof rawPts = [];

      for (let i = 0; i < rawPts.length; i++) {
        const curr = rawPts[i];
        expanded.push(curr);
        const next = i === rawPts.length - 1 ? (isClosed ? rawPts[0] : null) : rawPts[i + 1];
        if (next && curr.bulge && Math.abs(curr.bulge) > 1e-10) {
          expanded.push(...tessellateBulge(curr, next, curr.bulge));
        }
      }

      // Ensure closed shape ends at start point (avoid gaps when bulges add points)
      if (isClosed && expanded.length > 2) {
        const first = expanded[0];
        const last = expanded[expanded.length - 1];
        if (Math.abs(first.x - last.x) > 1e-6 || Math.abs(first.y - last.y) > 1e-6) {
          expanded.push({ ...first });
        }
      }

      const points = expanded.map((v) => `${formatFloat(v.x)},${formatFloat(v.y)}`).join(' ');

      if (isClosed) {
        if ((entity as any).isHatch === true) {
          const hatchAttrs = `stroke="none" fill="${color}"`;
          return `<polygon points="${points}" ${hatchAttrs} />`;
        }
        return `<polygon points="${points}" ${commonAttrs} />`;
      }
      return `<polyline points="${points}" ${commonAttrs} />`;
    }

    case 'SPLINE': {
      const cps = (entity as any).controlPoints as any[] | undefined;
      const fit = (entity as any).fitPoints as any[] | undefined;
      const controlPoints = cps && cps.length > 0 ? cps : fit;
      if (!controlPoints || controlPoints.length < 2) return null;

      const degree = (entity as any).degreeOfSplineCurve ?? (entity as any).degree ?? 3;
      const knots = (entity as any).knotValues ?? (entity as any).knots;

      // Lower resolution than editable mode to keep SVG size reasonable, while preserving shape characteristics.
      const pts = tessellateSpline(controlPoints as any, degree, knots, undefined, 12);
      if (!pts.length) return null;

      const d =
        `M ${formatFloat(pts[0].x)} ${formatFloat(pts[0].y)} ` +
        pts
          .slice(1)
          .map((p) => `L ${formatFloat(p.x)} ${formatFloat(p.y)}`)
          .join(' ');
      return `<path d="${d}" ${commonAttrs} />`;
    }

    case 'CIRCLE': {
      if (!entity.center || !entity.radius) return null;
      return `<circle cx="${formatFloat(entity.center.x)}" cy="${formatFloat(entity.center.y)}" r="${formatFloat(entity.radius)}" ${commonAttrs} />`;
    }

    case 'ARC': {
      if (
        !entity.center ||
        !entity.radius ||
        entity.startAngle === undefined ||
        entity.endAngle === undefined
      )
        return null;
      // dxf-parser typically returns radians; fall back to degrees if needed.
      const startRad = toRadiansIfNeeded(entity.startAngle);
      const endRad = toRadiansIfNeeded(entity.endAngle);

      const x1 = entity.center.x + entity.radius * Math.cos(startRad);
      const y1 = entity.center.y + entity.radius * Math.sin(startRad);
      const x2 = entity.center.x + entity.radius * Math.cos(endRad);
      const y2 = entity.center.y + entity.radius * Math.sin(endRad);

      // Large arc flag
      let diff = endRad - startRad;
      if (diff < 0) diff += Math.PI * 2;
      const largeArc = diff > Math.PI ? 1 : 0;
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
        entity.rotation,
      );

      // We apply 'color' to the <use> tag, which cascades to 'currentColor' in the symbol
      return `<use href="#${blockId}" transform="${transform}" color="${color}" stroke="${color}" fill="none" />`;
    }

    case 'TEXT':
    case 'MTEXT': {
      // Simplified Text Support
      if (!entity.text || (!entity.startPoint && !entity.position)) return null;

      // Resolve Position based on alignment
      let pos = entity.startPoint || entity.position || { x: 0, y: 0 };
      let halign = (entity as any).halign || 0;
      let valign = (entity as any).valign || 0;

      if (entity.type === 'TEXT') {
        // For TEXT, if align is set, use alignmentPoint (Group 11) if available
        const alignmentPoint = (entity as any).endPoint || (entity as any).alignmentPoint;
        if ((halign !== 0 || valign !== 0) && alignmentPoint) {
          pos = alignmentPoint;
        }
      } else if (entity.type === 'MTEXT') {
        // MText attachment point mapping
        const attachment = (entity as any).attachmentPoint;
        if (attachment) {
          if ([1, 4, 7].includes(attachment))
            halign = 0; // Left
          else if ([2, 5, 8].includes(attachment))
            halign = 1; // Center
          else if ([3, 6, 9].includes(attachment)) halign = 2; // Right

          if ([1, 2, 3].includes(attachment))
            valign = 3; // Top
          else if ([4, 5, 6].includes(attachment))
            valign = 2; // Middle
          else if ([7, 8, 9].includes(attachment)) valign = 1; // Bottom
        }
      }

      let height = entity.textHeight || (entity as any).height;
      if (!height || height === 0) {
        // Fallback to Style fixed height
        if (entity.style && data.tables?.style?.styles) {
          const styleName = entity.style.toUpperCase();
          const styles = data.tables.style.styles;
          // Case-insensitive lookup
          const styleKey = Object.keys(styles).find((k) => k.toUpperCase() === styleName);
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
      const cleanText = entity.text
        .replace(/\\P/g, '\n')
        .replace(/\\[A-Z0-9]+;?/g, '')
        .replace(/[{}]/g, '');

      // Map Alignment to SVG properties
      let textAnchor = 'start';
      if (halign === 1 || halign === 4) textAnchor = 'middle';
      else if (halign === 2) textAnchor = 'end';

      // Vertical alignment logic is tricky in SVG 1.1.
      // 'dominant-baseline' support is spotty in some viewers/contexts (like simple img tag?).
      // Safer to rely on manual dy shift if needed, but let's try standard first or minimal adjustment.
      // For MText Top/Middle/Bottom:
      let baseline = 'auto'; // 0 - Baseline

      if (valign === 3) {
        // Top
        baseline = 'hanging';
        // SVG hanging is top of em box. DXF Top is top of Cap Height?
        // Often 'hanging' works well enough.
        // dy might be needed for 'text-before-edge' behavior.
        // Actually, standard SVG text origin is baseline.
        // If we want Top alignment, we want the baseline to be below the point.
        // dominant-baseline="hanging" puts the "hanging baseline" at the point.
      } else if (valign === 2) {
        // Middle
        baseline = 'middle';
      } else if (valign === 1) {
        // Bottom
        // Point is at bottom of text. Standard baseline is slightly above bottom (descent).
        // This usually matches 'auto' close enough or 'text-after-edge'.
        baseline = 'auto';
      }

      return `<text transform="${transform}" font-size="${formatFloat(height)}" fill="${color}" stroke="none" font-family="monospace" text-anchor="${textAnchor}" dominant-baseline="${baseline}">${escapeXml(cleanText)}</text>`;
    }

    default:
      return null;
  }
};

export const dxfToSvg = (
  data: DxfData,
  options: DxfImportOptions,
): {
  svgRaw: string;
  viewBox: { x: number; y: number; width: number; height: number };
  unitsScale: number;
} => {
  const colorScheme = resolveColorScheme(options);
  // Determine Scale Factor (Logic copied from dxfToShapes)
  const insUnits = data.header?.$INSUNITS;
  let unitsScale = 1;
  let sourceToMeters = 1.0;

  if (options.sourceUnits && options.sourceUnits !== 'auto') {
    switch (options.sourceUnits) {
      case 'meters':
        sourceToMeters = 1.0;
        break;
      case 'cm':
        sourceToMeters = 0.01;
        break;
      case 'mm':
        sourceToMeters = 0.001;
        break;
      case 'feet':
        sourceToMeters = 0.3048;
        break;
      case 'inches':
        sourceToMeters = 0.0254;
        break;
    }
    unitsScale = sourceToMeters * 100;
  } else {
    if (insUnits !== undefined && DXF_UNITS[insUnits]) {
      unitsScale = DXF_UNITS[insUnits];
    } else {
      // Heuristic for Unitless
      let minX = Infinity,
        maxX = -Infinity;
      let minY = Infinity,
        maxY = -Infinity;
      let sampleCount = 0;
      const shouldImport = (e: DxfEntity) => options.includePaperSpace || !e.inPaperSpace;

      data.entities.forEach((e) => {
        if (sampleCount > 1000 || !shouldImport(e)) return;
        if (e.vertices) {
          e.vertices.forEach((v) => {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
          });
          sampleCount++;
        } else if (e.position) {
          minX = Math.min(minX, e.position.x);
          maxX = Math.max(maxX, e.position.x);
          minY = Math.min(minY, e.position.y);
          maxY = Math.max(maxY, e.position.y);
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
      maxY: -Infinity,
    },
  };

  // 1. Process Blocks into Defs
  if (data.blocks) {
    Object.values(data.blocks).forEach((block) => {
      const blockId = `block_${block.name.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
      const parts: string[] = [];

      if (block.entities) {
        block.entities.forEach((ent) => {
          const svgStr = entityToSvg(ent, data, colorScheme);
          if (svgStr) parts.push(svgStr);
        });
      }

      const bx = block.position?.x ?? 0;
      const by = block.position?.y ?? 0;
      const content = parts.join('');
      const transform = bx !== 0 || by !== 0 ? `transform="translate(${-bx} ${-by})"` : '';

      acc.defs.push(
        `<symbol id="${blockId}" overflow="visible"><g ${transform}>${content}</g></symbol>`,
      );
    });
  }

  // 2. Process Entities
  data.entities.forEach((entity) => {
    // Filter Paper Space if needed
    if (!options.includePaperSpace && entity.inPaperSpace) return;

    // Update Extents (Always calculate from entities for accuracy)
    if (entity.vertices) {
      // If polyline has bulges, include tessellated points to avoid clipping.
      const rawPts = entity.vertices;
      const hasBulge = rawPts.some((v) => v.bulge && Math.abs(v.bulge) > 1e-10);
      if (hasBulge && (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE')) {
        const isClosed =
          (entity as any).closed === true ||
          (entity as any).shape === true ||
          entity.closed === true;
        const expanded: typeof rawPts = [];
        for (let i = 0; i < rawPts.length; i++) {
          const curr = rawPts[i];
          expanded.push(curr);
          const next = i === rawPts.length - 1 ? (isClosed ? rawPts[0] : null) : rawPts[i + 1];
          if (next && curr.bulge && Math.abs(curr.bulge) > 1e-10) {
            expanded.push(...tessellateBulge(curr, next, curr.bulge));
          }
        }
        expanded.forEach((v) => updateExtents(acc, v.x, v.y));
      } else {
        rawPts.forEach((v) => updateExtents(acc, v.x, v.y));
      }
    }
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
    if (entity.type === 'SPLINE') {
      const cps = (entity as any).controlPoints as any[] | undefined;
      const fit = (entity as any).fitPoints as any[] | undefined;
      (cps || []).forEach((p) => updateExtents(acc, p.x, p.y));
      (fit || []).forEach((p) => updateExtents(acc, p.x, p.y));
    }
    // Text
    if (
      (entity.type === 'TEXT' || entity.type === 'MTEXT') &&
      (entity.startPoint || entity.position)
    ) {
      const p = entity.startPoint || entity.position;
      if (p) updateExtents(acc, p.x, p.y);
    }

    const svgStr = entityToSvg(entity, data, colorScheme);
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
  const safeWidth = width > 0 && width < Infinity ? width : 1000;
  const safeHeight = height > 0 && height < Infinity ? height : 1000;
  const minX = acc.extents.minX !== Infinity ? acc.extents.minX : 0;
  const minY = acc.extents.minY !== Infinity ? acc.extents.minY : 0;

  // Add Padding to prevent clipping (5%)
  const padding = Math.max(safeWidth, safeHeight) * 0.05;
  const paddedMinX = minX - padding;
  const paddedMinY = minY - padding;
  const paddedWidth = safeWidth + padding * 2;
  const paddedHeight = safeHeight + padding * 2;

  const viewBox = `${formatFloat(paddedMinX)} ${formatFloat(paddedMinY)} ${formatFloat(paddedWidth)} ${formatFloat(paddedHeight)}`;

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
    viewBox: { x: paddedMinX, y: paddedMinY, width: paddedWidth, height: paddedHeight },
    unitsScale,
  };
};
