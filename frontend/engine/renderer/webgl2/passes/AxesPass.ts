import { hexToRgb } from '@/utils/color';
import type { ViewTransform } from '@/types';

type AxesPassResources = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  uViewScale: WebGLUniformLocation;
  uViewTranslate: WebGLUniformLocation;
  uCanvasSize: WebGLUniformLocation;
  uPixelRatio: WebGLUniformLocation;
  uXColor: WebGLUniformLocation;
  uYColor: WebGLUniformLocation;
  uXDashed: WebGLUniformLocation;
  uYDashed: WebGLUniformLocation;
};

export type AxesSettings = {
  show: boolean;
  xColor: string;
  yColor: string;
  xDashed: boolean;
  yDashed: boolean;
};

export type AxesRenderInput = {
  viewTransform: ViewTransform;
  canvasSizeDevice: { width: number; height: number };
  pixelRatio: number;
  settings: AxesSettings;
};

export class AxesPass {
  private gl: WebGL2RenderingContext;
  private resources: AxesPassResources | null = null;

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
      out vec2 v_uv;
      void main() {
        // Fullscreen triangle strip or quad
        // 0: -1,-1
        // 1:  1,-1
        // 2: -1, 1
        // 3:  1, 1
        float x = float((gl_VertexID & 1) << 1) - 1.0;
        float y = float((gl_VertexID & 2)) - 1.0;
        v_uv = vec2(x, y) * 0.5 + 0.5;
        gl_Position = vec4(x, y, 0.0, 1.0);
      }
    `;

    const fragmentSource = `#version 300 es
      precision highp float;
      
      uniform float u_viewScale;
      uniform vec2 u_viewTranslate;
      uniform vec2 u_canvasSize;
      uniform float u_pixelRatio;
      
      uniform vec4 u_xColor;
      uniform vec4 u_yColor;
      uniform bool u_xDashed;
      uniform bool u_yDashed;

      out vec4 outColor;

      void main() {
        // Pixel coordinates (0,0 bottom-left)
        float px = gl_FragCoord.x;
        float py = gl_FragCoord.y;
        
        // CSS coordinates (0,0 top-left)
        float screenX = px / u_pixelRatio;
        float screenY = (u_canvasSize.y - py) / u_pixelRatio; 

        // World coordinates
        // screenX = worldX * scale + tx  => worldX = (screenX - tx) / scale
        // screenY = -worldY * scale + ty => worldY = -(screenY - ty) / scale
        float worldX = (screenX - u_viewTranslate.x) / u_viewScale;
        float worldY = -(screenY - u_viewTranslate.y) / u_viewScale;

        // Pixel size in world units
        float pixelSize = 1.0 / u_viewScale / u_pixelRatio;

        // Line width in world units (e.g. 1.5 physical pixels)
        float lineWidth = 1.5 * pixelSize;

        float alphaX = 0.0;
        float alphaY = 0.0;

        // X Axis (Y=0)
        float dX = abs(worldY);
        if (dX < lineWidth) {
          alphaX = 1.0 - smoothstep(lineWidth * 0.5, lineWidth, dX);
          if (u_xDashed) {
             float dashLen = 10.0 / u_viewScale; // 10 screen pixels
             float gapLen = 10.0 / u_viewScale;
             float period = dashLen + gapLen;
             if (mod(abs(worldX), period) > dashLen) alphaX = 0.0;
          }
        }

        // Y Axis (X=0)
        float dY = abs(worldX);
        if (dY < lineWidth) {
          alphaY = 1.0 - smoothstep(lineWidth * 0.5, lineWidth, dY);
          if (u_yDashed) {
             float dashLen = 10.0 / u_viewScale; 
             float gapLen = 10.0 / u_viewScale;
             float period = dashLen + gapLen;
             if (mod(abs(worldY), period) > dashLen) alphaY = 0.0;
          }
        }

        vec4 color = vec4(0.0);
        
        // Simple composite
        if (alphaX > 0.0) {
          color = mix(color, u_xColor, alphaX);
        }
        if (alphaY > 0.0) {
          // If already colored by X, blend or overwrite?
          // Let's overwrite / max for center cross visibility
          color = mix(color, u_yColor, alphaY);
        }

        if (color.a <= 0.0) discard;
        outColor = color;
      }
    `;

    const program = this.createProgram(gl, vertexSource, fragmentSource);
    // Dummy VAO for attribute-less rendering
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer(); // Unused
    if (!vao || !vbo) throw new Error('Failed to create resources');

    const loc = (name: string) => gl.getUniformLocation(program, name) as WebGLUniformLocation;

    this.resources = {
      program,
      vao,
      vbo,
      uViewScale: loc('u_viewScale'),
      uViewTranslate: loc('u_viewTranslate'),
      uCanvasSize: loc('u_canvasSize'),
      uPixelRatio: loc('u_pixelRatio'),
      uXColor: loc('u_xColor'),
      uYColor: loc('u_yColor'),
      uXDashed: loc('u_xDashed'),
      uYDashed: loc('u_yDashed'),
    };
  }

  public dispose(): void {
    if (!this.resources) return;
    const { gl } = this;
    gl.deleteProgram(this.resources.program);
    gl.deleteVertexArray(this.resources.vao);
    gl.deleteBuffer(this.resources.vbo);
    this.resources = null;
  }

  public render(input: AxesRenderInput): void {
    if (!input.settings.show) return;
    if (!this.resources) return;
    const { gl } = this;
    const res = this.resources;

    gl.useProgram(res.program);
    gl.bindVertexArray(res.vao);

    gl.uniform1f(res.uViewScale, input.viewTransform.scale);
    gl.uniform2f(res.uViewTranslate, input.viewTransform.x, input.viewTransform.y);
    gl.uniform2f(res.uCanvasSize, input.canvasSizeDevice.width, input.canvasSizeDevice.height);
    gl.uniform1f(res.uPixelRatio, input.pixelRatio);

    const parseColor = (c: string) => {
      // Try rgba parsing
      const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/i.exec(c);
      if (m) {
        return {
          r: parseInt(m[1], 10) / 255,
          g: parseInt(m[2], 10) / 255,
          b: parseInt(m[3], 10) / 255,
          a: m[4] ? parseFloat(m[4]) : 1.0,
        };
      }
      // Fallback to hexToRgb
      const rgb = hexToRgb(c);
      if (rgb) {
        return { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: 1.0 };
      }
      return { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };
    };

    const xc = parseColor(input.settings.xColor);
    const yc = parseColor(input.settings.yColor);

    gl.uniform4f(res.uXColor, xc.r, xc.g, xc.b, xc.a);
    gl.uniform4f(res.uYColor, yc.r, yc.g, yc.b, yc.a);
    gl.uniform1i(res.uXDashed, input.settings.xDashed ? 1 : 0);
    gl.uniform1i(res.uYDashed, input.settings.yDashed ? 1 : 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Draw 4 vertices (Triangle Strip)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.bindVertexArray(null);
  }

  private createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(vs)!);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(fs)!);

    const p = gl.createProgram()!;
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)!);
    
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return p;
  }
}
