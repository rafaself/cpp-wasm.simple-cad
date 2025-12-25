import type { BufferMeta, WasmModule } from '@/engine/core/EngineRuntime';
import type { TextQuadBufferMeta, TextureBufferMeta } from '@/types/text';
import type { ViewTransform } from '@/types';

export type TessellatedRenderInput = {
  module: WasmModule;
  positionMeta: BufferMeta;
  viewTransform: ViewTransform;
  canvasSizeCss: { width: number; height: number };
  clearColor: { r: number; g: number; b: number; a: number };
  /** Optional text quad buffer metadata (for text rendering) */
  textQuadMeta?: TextQuadBufferMeta;
  /** Optional atlas texture metadata (for text rendering) */
  textAtlasMeta?: TextureBufferMeta;
};

export interface TessellatedRenderer {
  render(input: TessellatedRenderInput): void;
  dispose(): void;
}
