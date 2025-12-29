import { getEngineRuntime } from './singleton';
import type { TessellatedRenderer } from '@/engine/renderer/types';
import { Webgl2TessellatedRenderer } from '@/engine/renderer/webgl2/webgl2TessellatedRenderer';
import type { ViewTransform } from '@/types';
import type { BufferMeta } from './EngineRuntime';

export class CanvasController {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: TessellatedRenderer | null = null;
  private rafId: number | null = null;
  private viewTransform: ViewTransform = { x: 0, y: 0, scale: 1 };
  private canvasSize: { width: number; height: number } = { width: 0, height: 0 };
  private clearColor = { r: 0x0b / 255, g: 0x10 / 255, b: 0x21 / 255, a: 1 };

  public async setCanvas(canvas: HTMLCanvasElement | null): Promise<void> {
    if (this.canvas === canvas) return;

    // Cleanup old
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = canvas;

    if (!canvas) return;

    // Initialize new
    const runtime = await getEngineRuntime();
    if (!this.canvas) return; // Canvas might have changed while waiting

    try {
      this.renderer = new Webgl2TessellatedRenderer(canvas, { aaScale: 2 });
      this.start();
    } catch (e) {
      console.error('[CanvasController] Renderer init failed', e);
    }
  }

  public updateView(transform: ViewTransform, size: { width: number; height: number }): void {
    this.viewTransform = transform;
    this.canvasSize = size;
  }

  public start(): void {
    if (this.rafId !== null) return;
    this.loop();
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public dispose(): void {
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = null;
  }

  private loop = async () => {
    if (!this.renderer || !this.canvas) {
      this.rafId = null;
      return;
    }

    const runtime = await getEngineRuntime();

    const meta = runtime.getPositionBufferMeta();

    // Engine-native text: rebuild quad buffer (if supported) and feed meta to renderer.
    if (runtime.isTextQuadsDirty() !== false) { // Default to true if missing
       runtime.rebuildTextQuadBuffer();
    }

    const textQuadMeta = runtime.getTextQuadBufferMeta();
    const textAtlasMeta = runtime.getAtlasTextureMeta();

    this.renderer.render({
      module: runtime.module,
      positionMeta: meta as BufferMeta,
      viewTransform: this.viewTransform,
      canvasSizeCss: this.canvasSize,
      clearColor: this.clearColor,
      textQuadMeta: textQuadMeta && textAtlasMeta?.width ? textQuadMeta : undefined,
      textAtlasMeta: textQuadMeta && textAtlasMeta?.width ? textAtlasMeta : undefined,
    });

    this.rafId = requestAnimationFrame(this.loop);
  };
}
