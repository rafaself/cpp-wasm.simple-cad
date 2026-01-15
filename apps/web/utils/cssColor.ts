export type ParsedCssColor = { hex: string; alpha: number };

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const clamp255 = (v: number): number => Math.max(0, Math.min(255, v));

const toHex2 = (v: number): string =>
  clamp255(Math.round(v)).toString(16).padStart(2, '0').toUpperCase();

export const rgbToHex = (r: number, g: number, b: number): string =>
  `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

export const parseCssColorToHexAlpha = (input: string): ParsedCssColor | null => {
  const c = input.trim();
  if (!c) return null;
  if (c.toLowerCase() === 'transparent') return { hex: '#000000', alpha: 0 };

  const rgba =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (rgba) {
    const r = Number.parseInt(rgba[1], 10);
    const g = Number.parseInt(rgba[2], 10);
    const b = Number.parseInt(rgba[3], 10);
    const a = rgba[4] === undefined ? 1 : Number.parseFloat(rgba[4]);
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return { hex: rgbToHex(r, g, b), alpha: clamp01(a) };
  }

  const hex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.exec(c);
  if (hex) {
    const raw = hex[1].toUpperCase();
    if (raw.length === 3) {
      const r = Number.parseInt(raw[0] + raw[0], 16);
      const g = Number.parseInt(raw[1] + raw[1], 16);
      const b = Number.parseInt(raw[2] + raw[2], 16);
      return { hex: rgbToHex(r, g, b), alpha: 1 };
    }
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    return { hex: rgbToHex(r, g, b), alpha: 1 };
  }

  return null;
};

export const hexToCssRgba = (hex: string, alpha: number): string => {
  const parsed = parseCssColorToHexAlpha(hex);
  if (!parsed) return hex;
  const h = parsed.hex.slice(1);
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(alpha).toFixed(2)})`;
};
