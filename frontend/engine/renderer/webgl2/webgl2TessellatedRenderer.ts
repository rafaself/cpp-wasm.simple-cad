import { GeometryPass } from './passes/GeometryPass';
import { TextRenderPass } from './passes/TextRenderPass';
import { AxesPass } from './passes/AxesPass';
import { GridPass } from './passes/GridPass';

import type { TessellatedRenderer, TessellatedRenderInput } from '../types';

type SsaaResources = {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  blitProgram: WebGLProgram;
  blitVao: WebGLVertexArrayObject;
  blitVbo: WebGLBuffer;
  uSource: WebGLUniformLocation;
};

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Shader compile failed';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
};

const createProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram => {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Program link failed';
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
};

const initSsaaResources = (gl: WebGL2RenderingContext): SsaaResources => {
  const blitVertex = `#version 300 es
    precision highp float;
    in vec2 a_pos;
    out vec2 v_uv;
    void main() {
      v_uv = (a_pos + 1.0) * 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;
  const blitFragment = `#version 300 es
    precision highp float;
    uniform sampler2D u_source;
    in vec2 v_uv;
    out vec4 outColor;
    void main() {
      outColor = texture(u_source, v_uv);
    }
  `;

  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  if (!framebuffer || !texture) throw new Error('Failed to create SSAA targets');

  const blitProgram = createProgram(gl, blitVertex, blitFragment);
  const blitVao = gl.createVertexArray();
  const blitVbo = gl.createBuffer();
  if (!blitVao || !blitVbo) throw new Error('Failed to create blit buffers');

  const uSource = gl.getUniformLocation(blitProgram, 'u_source');
  const aPos = gl.getAttribLocation(blitProgram, 'a_pos');
  if (!uSource || aPos < 0) throw new Error('Missing blit uniforms/attributes');

  gl.bindVertexArray(blitVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, blitVbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { framebuffer, texture, blitProgram, blitVao, blitVbo, uSource };
};

export class Webgl2TessellatedRenderer implements TessellatedRenderer {
  private gl: WebGL2RenderingContext;
  private ssaa: SsaaResources;
  private gridPass: GridPass;
  private geometryPass: GeometryPass;
  private textPass: TextRenderPass;
  private axesPass: AxesPass;
  private offscreenSize: { width: number; height: number } = { width: 0, height: 0 };

  // Supersampling scale factor (coverage-style AA). 1 disables SSAA.
  private readonly aaScale: number;

  public constructor(
    private canvas: HTMLCanvasElement,
    opts?: { aaScale?: number },
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
      alpha: true,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.ssaa = initSsaaResources(gl);
    this.gridPass = new GridPass(gl);
    this.geometryPass = new GeometryPass(gl);
    this.textPass = new TextRenderPass(gl);
    this.axesPass = new AxesPass(gl);
    this.aaScale = Math.max(1, Math.floor(opts?.aaScale ?? 2));
  }

  public dispose(): void {
    const { gl } = this;

    // Dispose resources managed directly here (SSAA)
    const { framebuffer, texture, blitProgram, blitVao, blitVbo } = this.ssaa;
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    gl.deleteBuffer(blitVbo);
    gl.deleteVertexArray(blitVao);
    gl.deleteProgram(blitProgram);

    // Dispose passes
    this.gridPass.dispose();
    this.geometryPass.dispose();
    this.textPass.dispose();
    this.axesPass.dispose();
  }

  private ensureCanvasSize(input: TessellatedRenderInput): {
    width: number;
    height: number;
    pixelRatio: number;
  } {
    const dpr = typeof window !== 'undefined' ? Math.max(1, window.devicePixelRatio || 1) : 1;
    const width = Math.max(1, Math.floor(input.canvasSizeCss.width * dpr));
    const height = Math.max(1, Math.floor(input.canvasSizeCss.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return { width, height, pixelRatio: dpr };
  }

  private ensureOffscreen(width: number, height: number): { width: number; height: number } {
    const { gl } = this;
    const scale = this.aaScale;
    if (scale <= 1) return { width, height };

    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const targetW = Math.min(max, width * scale);
    const targetH = Math.min(max, height * scale);

    if (this.offscreenSize.width === targetW && this.offscreenSize.height === targetH)
      return this.offscreenSize;

    gl.bindTexture(gl.TEXTURE_2D, this.ssaa.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, targetW, targetH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ssaa.framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.ssaa.texture,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.offscreenSize = { width: targetW, height: targetH };
    return this.offscreenSize;
  }

  public render(input: TessellatedRenderInput): void {
    const { gl } = this;
    const { width, height, pixelRatio } = this.ensureCanvasSize(input);
    const { width: offW, height: offH } = this.ensureOffscreen(width, height);

    // Initialize passes on first use
    if (!this.geometryPass.isInitialized()) this.geometryPass.initialize();

    // Update buffers
    this.geometryPass.updateBuffer(input.module, input.positionMeta);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    // Render into SSAA target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aaScale > 1 ? this.ssaa.framebuffer : null);
    gl.viewport(0, 0, offW, offH);
    gl.clearColor(input.clearColor.r, input.clearColor.g, input.clearColor.b, input.clearColor.a);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const effectivePixelRatio = pixelRatio * (this.aaScale > 1 ? this.aaScale : 1);

    // -------------------------------------------------------------------------
    // Grid Rendering (background - before entities)
    // -------------------------------------------------------------------------
    if (input.gridSettings && input.gridSettings.enabled) {
      if (!this.gridPass.isInitialized()) this.gridPass.initialize();
      this.gridPass.render({
        viewTransform: input.viewTransform,
        canvasSizeDevice: { width: offW, height: offH },
        pixelRatio: effectivePixelRatio,
        settings: input.gridSettings,
      });
    }

    // -------------------------------------------------------------------------
    // Geometry Pass (document entities)
    // -------------------------------------------------------------------------
    this.geometryPass.render({
      module: input.module,
      positionMeta: input.positionMeta,
      viewTransform: input.viewTransform,
      canvasSizeCss: input.canvasSizeCss,
      canvasSizeDevice: { width: offW, height: offH },
      pixelRatio: effectivePixelRatio,
    });

    // -------------------------------------------------------------------------
    // Axes Rendering
    // -------------------------------------------------------------------------
    if (input.axesSettings && input.axesSettings.show) {
      if (!this.axesPass.isInitialized()) this.axesPass.initialize();
      this.axesPass.render({
        viewTransform: input.viewTransform,
        canvasSizeDevice: { width: offW, height: offH },
        pixelRatio: effectivePixelRatio,
        settings: input.axesSettings,
      });
    }

    // -------------------------------------------------------------------------
    // Text Rendering (if text metadata is provided)
    // -------------------------------------------------------------------------
    if (input.textQuadMeta && input.textAtlasMeta) {
      this.renderText(input, offW, offH, pixelRatio);
    }

    if (this.aaScale <= 1) return;

    // Blit SSAA texture to screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.ssaa.blitProgram);
    gl.bindVertexArray(this.ssaa.blitVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ssaa.texture);
    gl.uniform1i(this.ssaa.uSource, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Render text using the TextRenderPass.
   * Called from render() when text metadata is provided.
   */
  private renderText(
    input: TessellatedRenderInput,
    canvasWidth: number,
    canvasHeight: number,
    pixelRatio: number,
  ): void {
    if (!input.textQuadMeta || !input.textAtlasMeta) return;

    // Initialize text pass on first use
    if (!this.textPass.isInitialized()) {
      this.textPass.initialize();
    }

    // Update buffers from WASM memory
    const vertexCount = this.textPass.updateQuadBuffer(input.module, input.textQuadMeta);
    this.textPass.updateAtlasTexture(input.module, input.textAtlasMeta);

    // Render text
    const effectivePixelRatio = pixelRatio * (this.aaScale > 1 ? this.aaScale : 1);
    this.textPass.render(
      {
        module: input.module,
        viewTransform: {
          scale: input.viewTransform.scale || 1,
          x: input.viewTransform.x || 0,
          y: input.viewTransform.y || 0,
        },
        canvasSizeCss: input.canvasSizeCss,
        pixelRatio: effectivePixelRatio,
        canvasSizeDevice: { width: canvasWidth, height: canvasHeight },
      },
      vertexCount,
    );
  }
}
