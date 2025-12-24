import type { TessellatedRenderer } from './tessellatedRenderer';

import { Webgl2TessellatedRenderer } from './webgl2/webgl2TessellatedRenderer';

export const createTessellatedRenderer = async (
  canvas: HTMLCanvasElement,
  opts?: { aaScale?: number },
): Promise<TessellatedRenderer> => {
  // Always return WebGL2 renderer.
  // The 'backend' parameter is removed as WebGL2 is now the single source of truth.
  return new Webgl2TessellatedRenderer(canvas, opts);
};
