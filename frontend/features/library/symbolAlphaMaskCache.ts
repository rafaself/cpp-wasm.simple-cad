type AlphaMask = {
  sizePx: number;
  alpha: Uint8Array; // sizePx*sizePx, row-major, origin at top-left
};

const maskBySymbolId = new Map<string, AlphaMask>();
const inflight = new Map<string, Promise<void>>();

const ensureSvgPixelSize = (svg: string, px: number): string => {
  // String-based injection to avoid DOM dependencies.
  const open = svg.match(/<svg\b[^>]*>/i);
  if (!open) return svg;
  let tag = open[0];

  const setAttr = (name: string, value: string) => {
    const re = new RegExp(`\\s${name}=(\"[^\"]*\"|'[^']*'|[^\\s>]+)`, 'i');
    if (re.test(tag)) {
      tag = tag.replace(re, ` ${name}="${value}"`);
    } else {
      tag = tag.replace(/>$/, ` ${name}="${value}">`);
    }
  };

  setAttr('width', String(px));
  setAttr('height', String(px));
  if (!/\spreserveAspectRatio=/i.test(tag)) {
    tag = tag.replace(/>$/, ` preserveAspectRatio="xMidYMid meet">`);
  }

  return svg.replace(open[0], tag);
};

const loadSvgImage = (svg: string, px: number): Promise<HTMLImageElement> => {
  const sized = ensureSvgPixelSize(svg, px);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load SVG image for alpha mask.'));
    img.src = url;
  });
};

export const primeSymbolAlphaMask = async (symbolId: string, svg: string, sizePx = 256): Promise<void> => {
  if (maskBySymbolId.has(symbolId)) return;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;

  const existing = inflight.get(symbolId);
  if (existing) return existing;

  const p = (async () => {
    const img = await loadSvgImage(svg, sizePx);
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, sizePx, sizePx);
    ctx.drawImage(img, 0, 0, sizePx, sizePx);
    const data = ctx.getImageData(0, 0, sizePx, sizePx).data;
    const alpha = new Uint8Array(sizePx * sizePx);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 1) alpha[j] = data[i + 3] ?? 0;
    maskBySymbolId.set(symbolId, { sizePx, alpha });
  })()
    .finally(() => {
      inflight.delete(symbolId);
    });

  inflight.set(symbolId, p);
  return p;
};

export const primeSymbolAlphaMasks = (symbols: Array<{ id: string; svg: string }>, sizePx = 256): void => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  for (const sym of symbols) {
    void primeSymbolAlphaMask(sym.id, sym.svg, sizePx);
  }
};

export const getSymbolAlphaAtUv = (symbolId: string, u: number, v: number): number | null => {
  const mask = maskBySymbolId.get(symbolId);
  if (!mask) return null;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;

  // WebGL UV convention is bottom-left, but ImageData is top-left.
  const x = Math.min(mask.sizePx - 1, Math.max(0, Math.floor(u * mask.sizePx)));
  const y = Math.min(mask.sizePx - 1, Math.max(0, Math.floor((1 - v) * mask.sizePx)));
  return mask.alpha[y * mask.sizePx + x] ?? 0;
};

