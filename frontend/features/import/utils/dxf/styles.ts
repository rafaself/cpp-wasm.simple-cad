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
    211: 10
};

export const DEFAULT_LINEWEIGHT = 1;
export const BYBLOCK_COLOR_PLACEHOLDER = '__BYBLOCK__';
export const BYBLOCK_LINETYPE_PLACEHOLDER = '__BYBLOCK__';

export const resolveColor = (
    entity: DxfEntity,
    layer?: DxfLayer,
    parentColor?: string,
    isDarkTheme: boolean = false
): string => {
    // 1. True Color (24-bit RGB)
    if (entity.trueColor !== undefined) {
        return '#' + entity.trueColor.toString(16).padStart(6, '0');
    }

    // 2. ACI Color
    let colorIndex = entity.color; // 0=ByBlock, 256=ByLayer

    if (colorIndex === undefined) colorIndex = 256; // Default to ByLayer

    if (colorIndex === 0) {
        // ByBlock
        if (parentColor) return parentColor;

        // If no parentColor is provided, we might be resolving for a Block Definition (cached).
        // Return placeholder.
        return BYBLOCK_COLOR_PLACEHOLDER;
    }

    if (colorIndex === 256) {
        // ByLayer
        if (layer && layer.color !== undefined) {
            colorIndex = layer.color;
        } else {
            colorIndex = 7;
        }
    }

    if (colorIndex < 0 || colorIndex > 255) colorIndex = 7;

    if (colorIndex === 7) {
        return isDarkTheme ? '#FFFFFF' : '#000000';
    }

    return ACI_COLORS[colorIndex] || '#000000';
};

export const resolveLineweight = (
    entity: DxfEntity,
    layer?: DxfLayer
): number => {
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
