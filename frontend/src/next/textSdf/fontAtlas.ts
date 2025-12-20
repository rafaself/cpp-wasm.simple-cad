import * as THREE from 'three';

export type FontStyleKey = {
  fontFamily: string;
  bold: boolean;
  italic: boolean;
};

export type GlyphUv = {
  codepoint: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};

export type FontAtlas = {
  texture: THREE.DataTexture;
  glyphs: Map<number, GlyphUv>;
  cellPx: number;
  atlasWidth: number;
  atlasHeight: number;
};

const atlasCache = new Map<string, Promise<FontAtlas>>();

const keyOf = (style: FontStyleKey, cellPx: number): string => {
  return `${style.fontFamily}|${style.bold ? 'b' : 'n'}${style.italic ? 'i' : 'n'}|${cellPx}`;
};

const buildFontCss = (style: FontStyleKey, fontPx: number): string => {
  const weight = style.bold ? '700' : '400';
  const italic = style.italic ? 'italic' : 'normal';
  // Use a safe fallback stack; this is not fully deterministic across machines (Phase 3 limitation).
  return `${italic} ${weight} ${fontPx}px ${style.fontFamily}, Arial, sans-serif`;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

type DistPass = {
  w: number;
  h: number;
  dist: Float32Array;
};

const runChamferDistanceTransform = ({ w, h, dist }: DistPass): void => {
  const idx = (x: number, y: number) => y * w + x;
  const sqrt2 = Math.SQRT2;

  // Forward pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      let best = dist[i];
      if (x > 0) best = Math.min(best, dist[idx(x - 1, y)] + 1);
      if (y > 0) best = Math.min(best, dist[idx(x, y - 1)] + 1);
      if (x > 0 && y > 0) best = Math.min(best, dist[idx(x - 1, y - 1)] + sqrt2);
      if (x + 1 < w && y > 0) best = Math.min(best, dist[idx(x + 1, y - 1)] + sqrt2);
      dist[i] = best;
    }
  }

  // Backward pass
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = idx(x, y);
      let best = dist[i];
      if (x + 1 < w) best = Math.min(best, dist[idx(x + 1, y)] + 1);
      if (y + 1 < h) best = Math.min(best, dist[idx(x, y + 1)] + 1);
      if (x + 1 < w && y + 1 < h) best = Math.min(best, dist[idx(x + 1, y + 1)] + sqrt2);
      if (x > 0 && y + 1 < h) best = Math.min(best, dist[idx(x - 1, y + 1)] + sqrt2);
      dist[i] = best;
    }
  }
};

const buildGlyphSdfCell = (ctx: CanvasRenderingContext2D, ch: string, cellPx: number, spreadPx: number, fontCss: string): Uint8Array => {
  const w = cellPx;
  const h = cellPx;
  const size = w * h;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.font = fontCss;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, w / 2, h / 2);

  const img = ctx.getImageData(0, 0, w, h);
  const mask = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const a = img.data[i * 4 + 3];
    mask[i] = a > 127 ? 1 : 0;
  }

  const INF = 1e9;
  const distIn = new Float32Array(size);
  const distOut = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    if (mask[i]) {
      distIn[i] = 0;
      distOut[i] = INF;
    } else {
      distIn[i] = INF;
      distOut[i] = 0;
    }
  }

  runChamferDistanceTransform({ w, h, dist: distIn });
  runChamferDistanceTransform({ w, h, dist: distOut });

  const out = new Uint8Array(size);
  const denom = 2 * Math.max(1, spreadPx);
  for (let i = 0; i < size; i++) {
    const signed = (distOut[i] - distIn[i]) / denom;
    const sdf = clamp01(0.5 + signed);
    out[i] = Math.round(sdf * 255);
  }
  return out;
};

export const getFontAtlas = (style: FontStyleKey, opts?: { cellPx?: number }): Promise<FontAtlas> => {
  const cellPx = opts?.cellPx ?? 64;
  const key = keyOf(style, cellPx);
  const cached = atlasCache.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<FontAtlas> => {
    const start = 32;
    const end = 126;
    const glyphCount = end - start + 1;
    const cols = 16;
    const rows = Math.ceil(glyphCount / cols);
    const atlasWidth = cols * cellPx;
    const atlasHeight = rows * cellPx;

    const canvas = document.createElement('canvas');
    canvas.width = cellPx;
    canvas.height = cellPx;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to create 2D context for SDF font atlas.');

    const spreadPx = Math.floor(cellPx / 4);
    const fontCss = buildFontCss(style, Math.floor(cellPx * 0.8));

    const atlas = new Uint8Array(atlasWidth * atlasHeight);
    const glyphs = new Map<number, GlyphUv>();

    for (let cp = start; cp <= end; cp++) {
      const i = cp - start;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x0 = col * cellPx;
      const y0 = row * cellPx;
      const cell = buildGlyphSdfCell(ctx, String.fromCharCode(cp), cellPx, spreadPx, fontCss);

      for (let y = 0; y < cellPx; y++) {
        const dstRow = (y0 + y) * atlasWidth + x0;
        const srcRow = y * cellPx;
        atlas.set(cell.subarray(srcRow, srcRow + cellPx), dstRow);
      }

      glyphs.set(cp, {
        codepoint: cp,
        u0: x0 / atlasWidth,
        v0: y0 / atlasHeight,
        u1: (x0 + cellPx) / atlasWidth,
        v1: (y0 + cellPx) / atlasHeight,
      });
    }

    const texture = new THREE.DataTexture(atlas, atlasWidth, atlasHeight, THREE.RedFormat, THREE.UnsignedByteType);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    return { texture, glyphs, cellPx, atlasWidth, atlasHeight };
  })();

  atlasCache.set(key, promise);
  return promise;
};

