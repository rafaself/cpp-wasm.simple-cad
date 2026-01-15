import { ACI_COLORS } from './aciColors';
import { DxfEntity, DxfLayer } from './types';

export const LINEWEIGHTS: Record<number, number> = {
  0: 1, // Default / 0.00mm
  5: 1, // 0.05mm
  9: 1,
  13: 1,
  15: 1,
  18: 1,
  20: 1.5, // 0.20mm
  25: 1.5,
  30: 2, // 0.30mm
  35: 2,
  40: 2.5, // 0.40mm
  50: 3, // 0.50mm
  53: 3,
  60: 3.5,
  70: 4,
  80: 4.5,
  90: 5,
  100: 5.5, // 1.00mm
  106: 6,
  120: 6,
  140: 7,
  158: 8,
  200: 10,
  211: 10,
};

export const FONT_MAP: Record<string, string> = {
  // Serif / "CAD-like"
  romans: 'serif',
  romand: 'serif',
  simplex: 'serif',
  complex: 'serif',
  times: 'serif',

  // Monospace
  txt: 'monospace',
  monotxt: 'monospace',

  // Sans-serif
  arial: 'Arial, sans-serif',
  verdana: 'Verdana, sans-serif',
  tahoma: 'Tahoma, sans-serif',
  calibri: 'Calibri, sans-serif',
  isocp: 'sans-serif',
  isocpeur: 'sans-serif',
  isoct: 'sans-serif',
  swiss: 'sans-serif',

  // Default fallback
  default: 'sans-serif',
};

export const DEFAULT_LINEWEIGHT = 1;
export const BYBLOCK_COLOR_PLACEHOLDER = '__BYBLOCK__';
export const BYBLOCK_LINETYPE_PLACEHOLDER = '__BYBLOCK__';

export const resolveFontFamily = (fontFile?: string): string => {
  if (!fontFile) return FONT_MAP['default'];

  // Extract filename without extension
  const name = fontFile.split('.')[0].toLowerCase();

  // Direct map check
  if (FONT_MAP[name]) return FONT_MAP[name];

  // Heuristics
  if (name.includes('roman')) return 'serif';
  if (name.includes('mono') || name.includes('txt')) return 'monospace';

  return FONT_MAP['default'];
};

export const resolveColor = (
  entity: DxfEntity,
  layer?: DxfLayer,
  parentColor?: string,
  isDarkTheme: boolean = false,
  colorMode: 'original' | 'grayscale' | 'monochrome' = 'original',
): string => {
  // Handle ByBlock Placeholder immediately
  if (parentColor === BYBLOCK_COLOR_PLACEHOLDER) {
    // If we are resolving nested entity and parent is placeholder, return placeholder.
    // Actually, resolveColor is called FOR the child using parent's resolved color.
    // But if parentColor ITSELF is the placeholder (meaning we are inside a block definition cache context),
    // we should also return placeholder if entity is ByBlock.
    // If entity is ByLayer, we resolve it.
  }

  let hex = '#000000';

  // 1. True Color (24-bit RGB)
  // dxf-parser may populate `colorIndex` + `color` where `color` is derived RGB.
  if (entity.trueColor !== undefined) {
    hex = '#' + entity.trueColor.toString(16).padStart(6, '0');
  } else if (entity.colorIndex !== undefined && entity.color !== undefined) {
    // Treat as derived RGB (0xRRGGBB)
    hex = '#' + entity.color.toString(16).padStart(6, '0');
  } else {
    // 2. ACI Color
    let colorIndex = entity.colorIndex !== undefined ? entity.colorIndex : entity.color; // 0=ByBlock, 256=ByLayer

    if (colorIndex === undefined) colorIndex = 256; // Default to ByLayer

    if (colorIndex === 0) {
      // ByBlock
      if (parentColor) {
        // If parentColor is placeholder, return it
        if (parentColor === BYBLOCK_COLOR_PLACEHOLDER) return BYBLOCK_COLOR_PLACEHOLDER;
        hex = parentColor;
      } else {
        return BYBLOCK_COLOR_PLACEHOLDER;
      }
    } else if (colorIndex === 256) {
      // ByLayer
      if (layer) {
        // dxf-parser exposes both `colorIndex` (ACI) and `color` (derived RGB).
        if (layer.colorIndex !== undefined) {
          if (layer.color !== undefined) {
            hex = '#' + layer.color.toString(16).padStart(6, '0');
          } else {
            const li = layer.colorIndex;
            if (li === 7) hex = isDarkTheme ? '#FFFFFF' : '#000000';
            else hex = ACI_COLORS[li] || '#000000';
          }
        } else if (layer.color !== undefined) {
          // Fallback: treat as ACI if it's in range, otherwise RGB.
          if (layer.color >= 0 && layer.color <= 255) {
            const li = layer.color;
            if (li === 7) hex = isDarkTheme ? '#FFFFFF' : '#000000';
            else hex = ACI_COLORS[li] || '#000000';
          } else {
            hex = '#' + layer.color.toString(16).padStart(6, '0');
          }
        } else {
          hex = isDarkTheme ? '#FFFFFF' : '#000000';
        }
      } else {
        hex = isDarkTheme ? '#FFFFFF' : '#000000';
      }
    } else {
      // Explicit ACI
      if (colorIndex < 0 || colorIndex > 255) colorIndex = 7;
      if (colorIndex === 7) {
        hex = isDarkTheme ? '#FFFFFF' : '#000000';
      } else {
        hex = ACI_COLORS[colorIndex] || '#000000';
      }
    }
  }

  // Apply Mode Post-Processing
  if (hex === BYBLOCK_COLOR_PLACEHOLDER || hex === 'transparent') return hex;

  if (colorMode === 'monochrome') {
    // Force Black (or White if Dark Theme? No, req says Force B&W "Photocopy")
    // "Force Black & White (colors become black)"
    // But if theme is dark, black is invisible.
    // Assuming "Black" means "Ink Color".
    // If the canvas background is dark, we might need White.
    // But "Monochrome" usually implies "Printed Look".
    // Let's assume strict #000000 as requested, unless user strictly wants visible.
    // If I return #000000 and the canvas is #1e293b (slate-800), it's hard to see.
    // However, the requirement says "Force Black & White... colors become black".
    // I will return #000000.
    return '#000000';
  }

  if (colorMode === 'grayscale') {
    return toGrayscale(hex);
  }

  return hex;
};

export const resolveLineweight = (entity: DxfEntity, layer?: DxfLayer): number => {
  let lw = entity.lineweight;

  if (lw === undefined) lw = -1;

  if (lw === -2) {
    return DEFAULT_LINEWEIGHT;
  }

  if (lw === -1) {
    // ByLayer - Check Layer Lineweight
    // DxfLayer doesn't standardly have lineweight property in many parsers,
    // but if we extended type, we check it.
    // Assuming layer object passed has it (we need to update types if not).
    // Let's check if 'lineweight' exists on layer.
    // @ts-ignore
    if (layer && layer.lineweight !== undefined) {
      // @ts-ignore
      const layerLw = layer.lineweight;
      if (layerLw >= 0) return LINEWEIGHTS[layerLw] || DEFAULT_LINEWEIGHT;
      // If layer says Default (-3), return Default.
    }
    return DEFAULT_LINEWEIGHT;
  }

  if (lw === -3) {
    return DEFAULT_LINEWEIGHT;
  }

  return LINEWEIGHTS[lw] || 1;
};

export const toGrayscale = (hex: string): string => {
  if (hex === BYBLOCK_COLOR_PLACEHOLDER) return hex;
  if (!hex || !hex.startsWith('#') || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  const gs = y.toString(16).padStart(2, '0');
  return `#${gs}${gs}${gs}`;
};
