export interface HSV {
  h: number; // 0-360
  s: number; // 0-100
  v: number; // 0-100
  a: number; // 0-1
}

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export const hsvToRgb = ({ h, s, v, a }: HSV): RGB => {
  s /= 100;
  v /= 100;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a,
  };
};

export const rgbToHsv = ({ r, g, b, a }: RGB): HSV => {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
    a,
  };
};

export const rgbToHex = ({ r, g, b }: RGB): string => {
  const toHex = (c: number) => {
    const hex = c.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
};

export const hexToRgb = (color: string): RGB | null => {
  // Try rgba format first: rgba(r, g, b, a)
  const rgbaResult = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(color);
  if (rgbaResult) {
    return {
      r: parseInt(rgbaResult[1], 10),
      g: parseInt(rgbaResult[2], 10),
      b: parseInt(rgbaResult[3], 10),
      a: rgbaResult[4] !== undefined ? parseFloat(rgbaResult[4]) : 1,
    };
  }

  // Try hex format: #RRGGBB or RRGGBB
  const hexResult = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  return hexResult
    ? {
        r: parseInt(hexResult[1], 16),
        g: parseInt(hexResult[2], 16),
        b: parseInt(hexResult[3], 16),
        a: 1,
      }
    : null;
};

export const validateHex = (hex: string): boolean => {
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
};
