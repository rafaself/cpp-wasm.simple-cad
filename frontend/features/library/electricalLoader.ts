import electricalCatalog from '../../assets/electrical/catalog.json';
import { ElectricalCategory, NormalizedViewBox } from '../../types';

export interface ElectricalCatalogEntry {
  id: string;
  iconSvg: string;      // SVG shown in the menu/gallery
  canvasSvg: string;    // SVG rendered on the canvas
  category: ElectricalCategory;
  nominalSizeMm: number;
  defaultConnectionPoint?: { x: number; y: number }; // Normalized 0-1
  tags: string[];
}

export interface LibrarySymbol {
  id: string;
  category: ElectricalCategory;
  nominalSizeMm: number;
  tags: string[];
  iconSvg: string;       // Processed SVG for menu display
  canvasSvg: string;     // Processed SVG for canvas rendering
  viewBox: NormalizedViewBox;
  scale: number;
  defaultConnectionPoint: { x: number; y: number }; // Normalized 0-1
}

const electricalSvgs = import.meta.glob<string>('../../assets/electrical/*.svg', { as: 'raw', eager: true });
const DEFAULT_VIEWBOX_SIZE = 32;

function parseViewBoxValue(value: string | null): NormalizedViewBox | null {
  if (!value) return null;
  const parts = value
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter((part) => Number.isFinite(part));

  if (parts.length === 4) {
    return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  return null;
}

interface CenteringResult {
  viewBox: NormalizedViewBox;
  translateX: number;
  translateY: number;
  needsTranslation: boolean;
}

function computeCenteredViewBox(viewBox: NormalizedViewBox): CenteringResult {
  const centerX = viewBox.x + viewBox.width / 2;
  const centerY = viewBox.y + viewBox.height / 2;

  // Already centered at origin
  if (Math.abs(centerX) < 0.0001 && Math.abs(centerY) < 0.0001) {
    return {
      viewBox,
      translateX: 0,
      translateY: 0,
      needsTranslation: false
    };
  }

  // Need to center: compute the translation needed to shift content to new origin
  // Original content is at (viewBox.x, viewBox.y), new viewBox starts at (-width/2, -height/2)
  // So we need to translate by: newOrigin - oldOrigin = (-width/2 - viewBox.x, -height/2 - viewBox.y)
  const newViewBox: NormalizedViewBox = {
    x: -viewBox.width / 2,
    y: -viewBox.height / 2,
    width: viewBox.width,
    height: viewBox.height
  };

  return {
    viewBox: newViewBox,
    translateX: newViewBox.x - viewBox.x,
    translateY: newViewBox.y - viewBox.y,
    needsTranslation: true
  };
}

function normalizeSvg(svgContent: string): { svg: string; viewBox: NormalizedViewBox } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgEl = doc.documentElement;

  const parsedViewBox = parseViewBoxValue(svgEl.getAttribute('viewBox'));
  const width = Number.parseFloat(svgEl.getAttribute('width') ?? `${DEFAULT_VIEWBOX_SIZE}`);
  const height = Number.parseFloat(svgEl.getAttribute('height') ?? `${DEFAULT_VIEWBOX_SIZE}`);

  const originalViewBox = parsedViewBox ?? {
    x: 0,
    y: 0,
    width: Number.isFinite(width) ? width : DEFAULT_VIEWBOX_SIZE,
    height: Number.isFinite(height) ? height : DEFAULT_VIEWBOX_SIZE
  };

  const { viewBox, translateX, translateY, needsTranslation } = computeCenteredViewBox(originalViewBox);

  // If we need to recenter, wrap all content in a translated group
  if (needsTranslation) {
    const wrapperGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    wrapperGroup.setAttribute('transform', `translate(${translateX}, ${translateY})`);

    // Move all children into the wrapper group
    while (svgEl.firstChild) {
      wrapperGroup.appendChild(svgEl.firstChild);
    }
    svgEl.appendChild(wrapperGroup);
  }

  svgEl.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');

  const serializer = new XMLSerializer();
  return { svg: serializer.serializeToString(svgEl), viewBox };
}

/**
 * Computes the scale so that 1 SVG unit ~= 1cm in the world space.
 *
 * worldScale represents how many canvas units make 1 meter.
 * By multiplying the viewBox by (worldScale / 100), we keep the
 * physical size stable even when the document scale changes.
 */
function computeScale(viewBox: NormalizedViewBox, worldScale: number): number {
  if (viewBox.width === 0) return 1;
  // worldScale / 100 converts the 1px ~= 1cm assumption to the current world scale
  return worldScale / 100;
}

export function loadElectricalLibrary(worldScale: number): LibrarySymbol[] {
  const items: LibrarySymbol[] = [];

  (electricalCatalog as ElectricalCatalogEntry[]).forEach((entry) => {
    const iconPath = `../../assets/electrical/${entry.iconSvg}`;
    const canvasPath = `../../assets/electrical/${entry.canvasSvg}`;
    
    const iconContent = electricalSvgs[iconPath];
    const canvasContent = electricalSvgs[canvasPath];

    if (!iconContent) {
      console.warn(`Icon SVG for catalog entry ${entry.id} not found at ${iconPath}`);
      return;
    }

    if (!canvasContent) {
      console.warn(`Canvas SVG for catalog entry ${entry.id} not found at ${canvasPath}`);
      return;
    }

    // Process both SVGs
    const { svg: iconSvg } = normalizeSvg(iconContent as string);
    const { svg: canvasSvg, viewBox } = normalizeSvg(canvasContent as string);
    
    // Scale is computed from canvasSvg since that's what's rendered
    const scale = computeScale(viewBox, worldScale);

    items.push({
      id: entry.id,
      category: entry.category,
      nominalSizeMm: entry.nominalSizeMm,
      tags: entry.tags,
      iconSvg,
      canvasSvg,
      viewBox,
      scale,
      defaultConnectionPoint: entry.defaultConnectionPoint ?? { x: 0.5, y: 0.5 }
    });
  });

  return items;
}
