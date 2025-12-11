import electricalCatalog from '../../assets/electrical/catalog.json';
import { ElectricalCategory } from '../../types';

export interface ElectricalCatalogEntry {
  id: string;
  svg: string;
  category: ElectricalCategory;
  nominalSizeMm: number;
  tags: string[];
}

export interface NormalizedViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LibrarySymbol {
  id: string;
  category: ElectricalCategory;
  nominalSizeMm: number;
  tags: string[];
  svg: string;
  viewBox: NormalizedViewBox;
  scale: number;
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

function ensureCenteredViewBox(viewBox: NormalizedViewBox): NormalizedViewBox {
  const centerX = viewBox.x + viewBox.width / 2;
  const centerY = viewBox.y + viewBox.height / 2;

  if (Math.abs(centerX) < 0.0001 && Math.abs(centerY) < 0.0001) {
    return viewBox;
  }

  return {
    x: -viewBox.width / 2,
    y: -viewBox.height / 2,
    width: viewBox.width,
    height: viewBox.height
  };
}

function normalizeSvg(svgContent: string): { svg: string; viewBox: NormalizedViewBox } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const svgEl = doc.documentElement;

  const parsedViewBox = parseViewBoxValue(svgEl.getAttribute('viewBox'));
  const width = Number.parseFloat(svgEl.getAttribute('width') ?? `${DEFAULT_VIEWBOX_SIZE}`);
  const height = Number.parseFloat(svgEl.getAttribute('height') ?? `${DEFAULT_VIEWBOX_SIZE}`);

  const viewBox = ensureCenteredViewBox(
    parsedViewBox ?? {
      x: -(Number.isFinite(width) ? width : DEFAULT_VIEWBOX_SIZE) / 2,
      y: -(Number.isFinite(height) ? height : DEFAULT_VIEWBOX_SIZE) / 2,
      width: Number.isFinite(width) ? width : DEFAULT_VIEWBOX_SIZE,
      height: Number.isFinite(height) ? height : DEFAULT_VIEWBOX_SIZE
    }
  );

  svgEl.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');

  const serializer = new XMLSerializer();
  return { svg: serializer.serializeToString(svgEl), viewBox };
}

function computeScale(viewBox: NormalizedViewBox, nominalSizeMm: number, worldScale: number): number {
  const nominalMeters = nominalSizeMm / 1000;
  const widthInWorldUnits = nominalMeters * worldScale;
  return viewBox.width === 0 ? 1 : widthInWorldUnits / viewBox.width;
}

export function loadElectricalLibrary(worldScale: number): LibrarySymbol[] {
  const items: LibrarySymbol[] = [];

  (electricalCatalog as ElectricalCatalogEntry[]).forEach((entry) => {
    const svgPath = `../../assets/electrical/${entry.svg}`;
    const svgContent = electricalSvgs[svgPath];

    if (!svgContent) {
      console.warn(`SVG for catalog entry ${entry.id} not found at ${svgPath}`);
      return;
    }

    const { svg, viewBox } = normalizeSvg(svgContent as string);
    const scale = computeScale(viewBox, entry.nominalSizeMm, worldScale);

    items.push({
      id: entry.id,
      category: entry.category,
      nominalSizeMm: entry.nominalSizeMm,
      tags: entry.tags,
      svg,
      viewBox,
      scale
    });
  });

  return items;
}
