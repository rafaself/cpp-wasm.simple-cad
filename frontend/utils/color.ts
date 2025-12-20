const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Convert a hex color (#RRGGBB or #RGB) to RGB components. */
export const hexToRgb = (hex: string) => {
  const c = hex.trim();

  // rgba(r,g,b,a) / rgb(r,g,b)
  const rgba = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (rgba) {
    const r = Number.parseInt(rgba[1], 10);
    const g = Number.parseInt(rgba[2], 10);
    const b = Number.parseInt(rgba[3], 10);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return { r: Math.max(0, Math.min(255, r)), g: Math.max(0, Math.min(255, g)), b: Math.max(0, Math.min(255, b)) };
  }

  if (!c.startsWith('#')) return null;
  let clean = c.slice(1);
  if (clean.length === 3) {
    clean = clean.split('').map(ch => ch + ch).join('');
  }
  if (clean.length !== 6) return null;
  const intValue = parseInt(clean, 16);
  if (Number.isNaN(intValue)) return null;
  return {
    r: (intValue >> 16) & 0xff,
    g: (intValue >> 8) & 0xff,
    b: intValue & 0xff
  };
};

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const getLuminanceFromRgb = (rgb: { r: number; g: number; b: number }) => {
  const transform = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const r = transform(rgb.r);
  const g = transform(rgb.g);
  const b = transform(rgb.b);
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
};

export const getLuminance = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return getLuminanceFromRgb(rgb);
};

export const mixColors = (from: string, to: string, weight: number) => {
  const rgbFrom = hexToRgb(from);
  const rgbTo = hexToRgb(to);
  if (!rgbFrom || !rgbTo) return from;
  const clamped = clamp01(weight);
  const r = Math.round(rgbFrom.r * (1 - clamped) + rgbTo.r * clamped);
  const g = Math.round(rgbFrom.g * (1 - clamped) + rgbTo.g * clamped);
  const b = Math.round(rgbFrom.b * (1 - clamped) + rgbTo.b * clamped);
  return rgbToHex(r, g, b);
};

/** Ensures `color` has a minimum luminance difference from `background`. */
export const ensureContrastColor = (color: string, background: string, minContrast = 0.35) => {
  const bgLuma = getLuminance(background);
  const targetLuma = getLuminance(color);
  if (Math.abs(bgLuma - targetLuma) >= minContrast) return color;

  const bleedTarget = bgLuma > 0.5 ? '#000000' : '#ffffff';
  for (let weight = 0.25; weight <= 1; weight += 0.15) {
    const candidate = mixColors(color, bleedTarget, weight);
    if (Math.abs(getLuminance(candidate) - bgLuma) >= minContrast) {
      return candidate;
    }
  }
  return bleedTarget;
};
