import type { ViewTransform } from '@/types';
import type { BufferMeta, WasmModule } from '@/engine/runtime/EngineRuntime';

import { computeTriangleBatches, type TriangleBatch } from './triBatching';

type RendererResources = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  aPosition: number;
  aColor: number;
  uViewScale: WebGLUniformLocation;
  uViewTranslate: WebGLUniformLocation;
  uCanvasSize: WebGLUniformLocation;
  uPixelRatio: WebGLUniformLocation;
};

type SsaaResources = {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  blitProgram: WebGLProgram;
  blitVao: WebGLVertexArrayObject;
  blitVbo: WebGLBuffer;
  uSource: WebGLUniformLocation;
};

type RenderInput = {
  module: WasmModule;
  positionMeta: BufferMeta;
  viewTransform: ViewTransform;
  canvasSizeCss: { width: number; height: number };
  clearColor: { r: number; g: number; b: number; a: number };
};

const floatsPerVertex = 7;

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

const createProgram = (gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram => {
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

const initMainResources = (gl: WebGL2RenderingContext): RendererResources => {
  const vertexSource = `#version 300 es
    precision highp float;
    in vec3 a_position;
    in vec4 a_color;
    uniform float u_viewScale;
    uniform vec2 u_viewTranslate;
    uniform vec2 u_canvasSize;
    uniform float u_pixelRatio;
    out vec4 vColor;
    void main() {
      vColor = a_color;
      vec2 screen;
      screen.x = a_position.x * u_viewScale + u_viewTranslate.x;
      screen.y = -a_position.y * u_viewScale + u_viewTranslate.y;
      screen *= u_pixelRatio;
      vec2 clip = vec2(
        (screen.x / u_canvasSize.x) * 2.0 - 1.0,
        1.0 - (screen.y / u_canvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    in vec4 vColor;
    out vec4 outColor;
    void main() {
      outColor = vColor;
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) throw new Error('Failed to create WebGL buffers');

  const aPosition = gl.getAttribLocation(program, 'a_position');
  const aColor = gl.getAttribLocation(program, 'a_color');
  const uViewScale = gl.getUniformLocation(program, 'u_viewScale');
  const uViewTranslate = gl.getUniformLocation(program, 'u_viewTranslate');
  const uCanvasSize = gl.getUniformLocation(program, 'u_canvasSize');
  const uPixelRatio = gl.getUniformLocation(program, 'u_pixelRatio');
  if (aPosition < 0 || aColor < 0 || !uViewScale || !uViewTranslate || !uCanvasSize || !uPixelRatio) {
    throw new Error('Missing shader attributes/uniforms');
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, floatsPerVertex * 4, 0);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, floatsPerVertex * 4, 3 * 4);
  gl.bindVertexArray(null);

  return { program, vao, vbo, aPosition, aColor, uViewScale, uViewTranslate, uCanvasSize, uPixelRatio };
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
    new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]),
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

export class Webgl2TessellatedRenderer {
  private gl: WebGL2RenderingContext;
  private resources: RendererResources;
  private ssaa: SsaaResources;

  private lastHeapBuffer: ArrayBuffer | null = null;
  private lastPositionMeta: BufferMeta | null = null;
  private lastBatches: TriangleBatch[] = [];
  private offscreenSize: { width: number; height: number } = { width: 0, height: 0 };

  // Supersampling scale factor (coverage-style AA). 1 disables SSAA.
  private readonly aaScale: number;

  public constructor(private canvas: HTMLCanvasElement, opts?: { aaScale?: number }) {
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, alpha: true });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.resources = initMainResources(gl);
    this.ssaa = initSsaaResources(gl);
    this.aaScale = Math.max(1, Math.floor(opts?.aaScale ?? 2));
  }

  public dispose(): void {
    const { gl } = this;
    const { program, vao, vbo } = this.resources;
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);

    const { framebuffer, texture, blitProgram, blitVao, blitVbo } = this.ssaa;
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    gl.deleteBuffer(blitVbo);
    gl.deleteVertexArray(blitVao);
    gl.deleteProgram(blitProgram);
  }

  private ensureCanvasSize(input: RenderInput): { width: number; height: number; pixelRatio: number } {
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

    if (this.offscreenSize.width === targetW && this.offscreenSize.height === targetH) return this.offscreenSize;

    gl.bindTexture(gl.TEXTURE_2D, this.ssaa.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, targetW, targetH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ssaa.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.ssaa.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.offscreenSize = { width: targetW, height: targetH };
    return this.offscreenSize;
  }

  private uploadIfNeeded(input: RenderInput): Float32Array {
    const { module, positionMeta } = input;
    const heapChanged = module.HEAPF32.buffer !== this.lastHeapBuffer;
    const metaChanged =
      !this.lastPositionMeta ||
      positionMeta.generation !== this.lastPositionMeta.generation ||
      positionMeta.ptr !== this.lastPositionMeta.ptr ||
      positionMeta.floatCount !== this.lastPositionMeta.floatCount ||
      positionMeta.vertexCount !== this.lastPositionMeta.vertexCount;

    const start = positionMeta.ptr >>> 2;
    const end = start + positionMeta.floatCount;
    const view = module.HEAPF32.subarray(start, end);

    if (heapChanged || metaChanged) {
      const { gl } = this;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      this.lastBatches = computeTriangleBatches(view, floatsPerVertex);
      this.lastHeapBuffer = module.HEAPF32.buffer as ArrayBuffer;
      this.lastPositionMeta = { ...positionMeta };
    }

    return view;
  }

  public render(input: RenderInput): void {
    const { gl } = this;
    const { width, height, pixelRatio } = this.ensureCanvasSize(input);
    const { width: offW, height: offH } = this.ensureOffscreen(width, height);

    // Upload VBO + compute batches (only when buffer/meta changes).
    this.uploadIfNeeded(input);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    // Render into SSAA target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aaScale > 1 ? this.ssaa.framebuffer : null);
    gl.viewport(0, 0, offW, offH);
    gl.clearColor(input.clearColor.r, input.clearColor.g, input.clearColor.b, input.clearColor.a);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.resources.program);
    gl.bindVertexArray(this.resources.vao);
    gl.uniform1f(this.resources.uViewScale, input.viewTransform.scale || 1);
    gl.uniform2f(this.resources.uViewTranslate, input.viewTransform.x || 0, input.viewTransform.y || 0);
    gl.uniform2f(this.resources.uCanvasSize, offW, offH);
    gl.uniform1f(this.resources.uPixelRatio, pixelRatio * (this.aaScale > 1 ? this.aaScale : 1));

    // Batching: preserve original triangle order while toggling blend state only when needed.
    for (const batch of this.lastBatches) {
      if (batch.blended) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } else {
        gl.disable(gl.BLEND);
      }
      gl.drawArrays(gl.TRIANGLES, batch.firstVertex, batch.vertexCount);
    }

    gl.bindVertexArray(null);

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
}

