import type { BufferMeta, WasmModule } from '@/engine/core/EngineRuntime';
import type { ViewTransform } from '@/types';

type LinePassResources = {
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

export type LineRenderInput = {
  module: WasmModule;
  lineMeta: BufferMeta;
  viewTransform: ViewTransform;
  canvasSizeCss: { width: number; height: number };
  canvasSizeDevice: { width: number; height: number };
  pixelRatio: number;
};

const floatsPerVertex = 7;

export class LinePass {
  private gl: WebGL2RenderingContext;
  private resources: LinePassResources | null = null;
  private lastHeapBuffer: ArrayBuffer | null = null;
  private lastLineMeta: BufferMeta | null = null;

  public constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  public isInitialized(): boolean {
    return this.resources !== null;
  }

  public initialize(): void {
    if (this.resources) return;
    const { gl } = this;

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

    const program = this.createProgram(gl, vertexSource, fragmentSource);
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('Failed to create WebGL buffers');

    const aPosition = gl.getAttribLocation(program, 'a_position');
    const aColor = gl.getAttribLocation(program, 'a_color');
    const uViewScale = gl.getUniformLocation(program, 'u_viewScale');
    const uViewTranslate = gl.getUniformLocation(program, 'u_viewTranslate');
    const uCanvasSize = gl.getUniformLocation(program, 'u_canvasSize');
    const uPixelRatio = gl.getUniformLocation(program, 'u_pixelRatio');
    if (
      aPosition < 0 ||
      aColor < 0 ||
      !uViewScale ||
      !uViewTranslate ||
      !uCanvasSize ||
      !uPixelRatio
    ) {
      throw new Error('Missing shader attributes/uniforms');
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, floatsPerVertex * 4, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, floatsPerVertex * 4, 3 * 4);
    gl.bindVertexArray(null);

    this.resources = {
      program,
      vao,
      vbo,
      aPosition,
      aColor,
      uViewScale,
      uViewTranslate,
      uCanvasSize,
      uPixelRatio,
    };
  }

  public dispose(): void {
    if (!this.resources) return;
    const { gl } = this;
    const { program, vao, vbo } = this.resources;
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    this.resources = null;
  }

  public updateBuffer(module: WasmModule, lineMeta: BufferMeta): number {
    if (!this.resources) return 0;
    const { gl } = this;

    const heapChanged = module.HEAPF32.buffer !== this.lastHeapBuffer;
    const metaChanged =
      !this.lastLineMeta ||
      lineMeta.generation !== this.lastLineMeta.generation ||
      lineMeta.ptr !== this.lastLineMeta.ptr ||
      lineMeta.floatCount !== this.lastLineMeta.floatCount ||
      lineMeta.vertexCount !== this.lastLineMeta.vertexCount;

    if (heapChanged || metaChanged) {
      const start = lineMeta.ptr >>> 2;
      const end = start + lineMeta.floatCount;
      const view = module.HEAPF32.subarray(start, end);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      this.lastHeapBuffer = module.HEAPF32.buffer as ArrayBuffer;
      this.lastLineMeta = { ...lineMeta };
    }

    return lineMeta.vertexCount;
  }

  public render(input: LineRenderInput, vertexCount: number): void {
    if (!this.resources || vertexCount === 0) return;
    const { gl } = this;
    const { width, height } = input.canvasSizeDevice;

    gl.useProgram(this.resources.program);
    gl.bindVertexArray(this.resources.vao);
    gl.uniform1f(this.resources.uViewScale, input.viewTransform.scale || 1);
    gl.uniform2f(
      this.resources.uViewTranslate,
      input.viewTransform.x || 0,
      input.viewTransform.y || 0,
    );
    gl.uniform2f(this.resources.uCanvasSize, width, height);
    gl.uniform1f(this.resources.uPixelRatio, input.pixelRatio);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.LINES, 0, vertexCount);

    gl.bindVertexArray(null);
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
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
  }

  private createProgram(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
  ): WebGLProgram {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
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
  }
}
