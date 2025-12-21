import type { TessellatedRenderer } from './tessellatedRenderer';
import type { TessellatedBackend } from './tessellatedBackend';

import { Webgl2TessellatedRenderer } from './webgl2/webgl2TessellatedRenderer';
import { WebgpuTessellatedRenderer } from './webgpu/webgpuTessellatedRenderer';

export const createTessellatedRenderer = async (
  canvas: HTMLCanvasElement,
  backend: TessellatedBackend,
  opts?: { aaScale?: number },
): Promise<TessellatedRenderer> => {
  if (backend === 'webgpu') {
    return WebgpuTessellatedRenderer.create(canvas, opts);
  }
  return new Webgl2TessellatedRenderer(canvas, opts);
};

