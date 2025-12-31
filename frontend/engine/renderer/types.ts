import type { BufferMeta, WasmModule } from '@/engine/core/EngineRuntime';
import type { ViewTransform } from '@/types';
import type { TextQuadBufferMeta, TextureBufferMeta } from '@/types/text';

/** Grid visual settings for rendering */
export type GridRenderSettings = {
  enabled: boolean;
  size: number;
  color: string;
  showDots: boolean;
  showLines: boolean;
  opacity?: number;
  lineWidth?: number;
  dotRadius?: number;
  // Subdivision support (Phase 2)
  showSubdivisions?: boolean;
  subdivisionCount?: number; // 2, 4, 5, 10
};

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
  /** Optional grid settings */
  gridSettings?: GridRenderSettings;
  /** Optional axes settings */
  axesSettings?: {
    show: boolean;
    xColor: string;
    yColor: string;
    xDashed: boolean;
    yDashed: boolean;
  };
};

export interface TessellatedRenderer {
  render(input: TessellatedRenderInput): void;
  dispose(): void;
}
