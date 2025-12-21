import type { ViewTransform } from '@/types';
import type { BufferMeta, WasmModule } from '@/engine/runtime/EngineRuntime';

export type TessellatedRenderInput = {
  module: WasmModule;
  positionMeta: BufferMeta;
  viewTransform: ViewTransform;
  canvasSizeCss: { width: number; height: number };
  clearColor: { r: number; g: number; b: number; a: number };
};

export interface TessellatedRenderer {
  render(input: TessellatedRenderInput): void;
  dispose(): void;
}

