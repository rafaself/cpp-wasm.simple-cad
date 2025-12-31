import { Webgl2TessellatedRenderer } from '@/engine/renderer/webgl2/webgl2TessellatedRenderer';
import type { AxesSettings } from '@/engine/renderer/webgl2/passes/AxesPass';
import type { GridRenderSettings } from '@/engine/renderer/types';

import { getEngineRuntime } from './singleton';

import type { BufferMeta, EngineRuntime } from './EngineRuntime';
import type { TessellatedRenderer } from '@/engine/renderer/types';
import type { ViewTransform } from '@/types';

export class CanvasController {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: TessellatedRenderer | null = null;
  private runtime: EngineRuntime | null = null;
  private rafId: number | null = null;
  private viewTransform: ViewTransform = { x: 0, y: 0, scale: 1 };
  private canvasSize: { width: number; height: number } = { width: 0, height: 0 };
  private clearColor = { r: 0x0b / 255, g: 0x10 / 255, b: 0x21 / 255, a: 1 };
  private axesSettings?: AxesSettings;
  private gridSettings?: GridRenderSettings;
  private visibilityHandler = () => {
    if (document.hidden) {
      this.stop();
    } else if (this.renderer && this.canvas) {
      this.start();
    }
  };

  public async setCanvas(canvas: HTMLCanvasElement | null): Promise<void> {
    if (this.canvas === canvas) return;

    // Cleanup old
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.canvas = canvas;
    if (!canvas) {
      this.runtime = null;
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      return;
    }

    if (!canvas) return;

    // Initialize new
    this.runtime = await getEngineRuntime();
    if (!this.canvas) return; // Canvas might have changed while waiting

    try {
      this.renderer = new Webgl2TessellatedRenderer(canvas, { aaScale: 2 });
      document.addEventListener('visibilitychange', this.visibilityHandler);
      this.start();
    } catch (e) {
      console.error('[CanvasController] Renderer init failed', e);
    }
  }

  public updateView(transform: ViewTransform, size: { width: number; height: number }): void {
    this.viewTransform = transform;
    this.canvasSize = size;
  }

  public setAxesSettings(settings: AxesSettings): void {
    this.axesSettings = settings;
  }

  public setGridSettings(settings: GridRenderSettings): void {
    this.gridSettings = settings;
  }

  public setClearColor(color: { r: number; g: number; b: number; a: number }): void {
    this.clearColor = color;
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
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  private loop = () => {
    if (!this.renderer || !this.canvas || !this.runtime) {
      this.rafId = null;
      return;
    }

    if (document.hidden || this.canvasSize.width === 0 || this.canvasSize.height === 0) {
      this.rafId = null;
      return;
    }

    const meta = this.runtime.getPositionBufferMeta();

    // Engine-native text: rebuild quad buffer (if supported) and feed meta to renderer.
    if (this.runtime.isTextQuadsDirty() !== false) {
      // Default to true if missing
      this.runtime.rebuildTextQuadBuffer();
    }

    const textQuadMeta = this.runtime.getTextQuadBufferMeta();
    const textAtlasMeta = this.runtime.getAtlasTextureMeta();

    this.renderer.render({
      module: this.runtime.module,
      positionMeta: meta as BufferMeta,
      viewTransform: this.viewTransform,
      canvasSizeCss: this.canvasSize,
      clearColor: this.clearColor,

      textQuadMeta: textQuadMeta && textAtlasMeta?.width ? textQuadMeta : undefined,
      textAtlasMeta: textQuadMeta && textAtlasMeta?.width ? textAtlasMeta : undefined,
      gridSettings: this.gridSettings,
      axesSettings: this.axesSettings,
    });

    this.rafId = requestAnimationFrame(this.loop);
  };
}
