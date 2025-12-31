import { hexToRgb } from '@/utils/color';
import type { ViewTransform } from '@/types';

type GridPassResources = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  uViewScale: WebGLUniformLocation;
  uViewTranslate: WebGLUniformLocation;
  uCanvasSize: WebGLUniformLocation;
  uPixelRatio: WebGLUniformLocation;
  uMajorGridSize: WebGLUniformLocation;
  uMinorGridSize: WebGLUniformLocation;
  uMajorGridColor: WebGLUniformLocation;
  uMinorGridColor: WebGLUniformLocation;
  uShowDots: WebGLUniformLocation;
  uShowLines: WebGLUniformLocation;
  uShowMinor: WebGLUniformLocation;
  uLineWidth: WebGLUniformLocation;
  uDotRadius: WebGLUniformLocation;
  uMinorOpacity: WebGLUniformLocation;
};

export type GridSettings = {
  enabled: boolean;
  size: number;
  color: string;
  showDots: boolean;
  showLines: boolean;
  opacity?: number;
  lineWidth?: number;
  dotRadius?: number;
  // Phase 2: Subdivision support
  showSubdivisions?: boolean;
  subdivisionCount?: number; // 2, 4, 5, 10
};

export type GridRenderInput = {
  viewTransform: ViewTransform;
  canvasSizeDevice: { width: number; height: number };
  pixelRatio: number;
  settings: GridSettings;
};

export class GridPass {
  private gl: WebGL2RenderingContext;
  private resources: GridPassResources | null = null;

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
        // Fullscreen quad via triangle strip
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
      
      // Major grid (main grid)
      uniform float u_majorGridSize;
      uniform vec4 u_majorGridColor;
      
      // Minor grid (subdivisions)
      uniform float u_minorGridSize;
      uniform vec4 u_minorGridColor;
      uniform float u_minorOpacity;
      uniform bool u_showMinor;
      
      uniform bool u_showDots;
      uniform bool u_showLines;
      uniform float u_lineWidth;
      uniform float u_dotRadius;

      out vec4 outColor;

      // Calculate grid intersection distance and alpha
      float getGridAlpha(float worldX, float worldY, float gridSize, float pixelSize, bool dots, bool lines, float lineW, float dotR) {
        float gx = abs(mod(worldX + gridSize * 0.5, gridSize) - gridSize * 0.5);
        float gy = abs(mod(worldY + gridSize * 0.5, gridSize) - gridSize * 0.5);
        
        float alpha = 0.0;
        
        // Lines rendering
        if (lines) {
          float dLine = min(gx, gy);
          if (dLine < lineW) {
            alpha = max(alpha, 1.0 - smoothstep(lineW * 0.3, lineW, dLine));
          }
        }
        
        // Dots rendering
        if (dots) {
          float dDot = sqrt(gx * gx + gy * gy);
          if (dDot < dotR) {
            alpha = max(alpha, 1.0 - smoothstep(dotR * 0.5, dotR, dDot));
          }
        }
        
        return alpha;
      }

      // Check if point is on major grid (to avoid double-drawing)
      bool isOnMajorGrid(float worldX, float worldY, float majorSize, float threshold) {
        float gx = abs(mod(worldX + majorSize * 0.5, majorSize) - majorSize * 0.5);
        float gy = abs(mod(worldY + majorSize * 0.5, majorSize) - majorSize * 0.5);
        return gx < threshold || gy < threshold;
      }

      void main() {
        // Convert fragment coordinates to world space
        float px = gl_FragCoord.x;
        float py = gl_FragCoord.y;
        
        // CSS coordinates (0,0 top-left)
        float screenX = px / u_pixelRatio;
        float screenY = (u_canvasSize.y - py) / u_pixelRatio;
        
        // World coordinates
        float worldX = (screenX - u_viewTranslate.x) / u_viewScale;
        float worldY = -(screenY - u_viewTranslate.y) / u_viewScale;

        // Pixel size in world units
        float pixelSize = 1.0 / u_viewScale / u_pixelRatio;
        
        // Adaptive grid visibility based on screen space size
        float majorScreenSize = u_majorGridSize * u_viewScale;
        float minorScreenSize = u_minorGridSize * u_viewScale;
        
        // Fade thresholds (in screen pixels)
        float fadeStart = 8.0;
        float fadeEnd = 3.0;
        
        // Calculate visibility multipliers with smooth fade
        float majorVisibility = smoothstep(fadeEnd, fadeStart, majorScreenSize) > 0.0 ? 
                                 clamp((majorScreenSize - fadeEnd) / (fadeStart - fadeEnd), 0.0, 1.0) : 1.0;
        majorVisibility = majorScreenSize >= fadeEnd ? 1.0 : 0.0;
        
        float minorVisibility = u_showMinor && minorScreenSize >= fadeEnd ? 
                                 smoothstep(fadeEnd, fadeStart * 1.5, minorScreenSize) : 0.0;
        
        // Skip entirely if major grid is invisible
        if (majorScreenSize < fadeEnd) {
          discard;
        }
        
        float lineW = u_lineWidth * pixelSize;
        float dotR = u_dotRadius * pixelSize;
        
        vec4 finalColor = vec4(0.0);
        
        // Render minor grid first (underneath major)
        if (u_showMinor && minorVisibility > 0.0 && minorScreenSize >= fadeEnd) {
          // Skip if this point is on the major grid
          float majorThreshold = lineW * 2.0;
          if (!isOnMajorGrid(worldX, worldY, u_majorGridSize, majorThreshold)) {
            float minorAlpha = getGridAlpha(worldX, worldY, u_minorGridSize, pixelSize, 
                                            u_showDots, u_showLines, lineW * 0.7, dotR * 0.7);
            if (minorAlpha > 0.0) {
              float adjustedAlpha = minorAlpha * u_minorOpacity * minorVisibility;
              finalColor = vec4(u_minorGridColor.rgb, u_minorGridColor.a * adjustedAlpha);
            }
          }
        }
        
        // Render major grid (on top)
        float majorAlpha = getGridAlpha(worldX, worldY, u_majorGridSize, pixelSize, 
                                        u_showDots, u_showLines, lineW, dotR);
        if (majorAlpha > 0.0) {
          // Blend major over minor
          vec4 majorColor = vec4(u_majorGridColor.rgb, u_majorGridColor.a * majorAlpha);
          finalColor = mix(finalColor, majorColor, majorColor.a);
        }
        
        if (finalColor.a <= 0.001) discard;
        outColor = finalColor;
      }
    `;

    const program = this.createProgram(gl, vertexSource, fragmentSource);
    // Dummy VAO for attribute-less rendering
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer(); // Unused but required
    if (!vao || !vbo) throw new Error('Failed to create GridPass resources');

    const loc = (name: string) => gl.getUniformLocation(program, name) as WebGLUniformLocation;

    this.resources = {
      program,
      vao,
      vbo,
      uViewScale: loc('u_viewScale'),
      uViewTranslate: loc('u_viewTranslate'),
      uCanvasSize: loc('u_canvasSize'),
      uPixelRatio: loc('u_pixelRatio'),
      uMajorGridSize: loc('u_majorGridSize'),
      uMinorGridSize: loc('u_minorGridSize'),
      uMajorGridColor: loc('u_majorGridColor'),
      uMinorGridColor: loc('u_minorGridColor'),
      uShowDots: loc('u_showDots'),
      uShowLines: loc('u_showLines'),
      uShowMinor: loc('u_showMinor'),
      uLineWidth: loc('u_lineWidth'),
      uDotRadius: loc('u_dotRadius'),
      uMinorOpacity: loc('u_minorOpacity'),
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

  public render(input: GridRenderInput): void {
    const { settings } = input;

    // Skip if grid is disabled or neither dots nor lines are shown
    if (!settings.enabled) return;
    if (!settings.showDots && !settings.showLines) return;

    if (!this.resources) return;
    const { gl } = this;
    const res = this.resources;

    // Calculate adaptive grid sizes
    const { majorSize, minorSize, showMinor } = this.computeAdaptiveGridSizes(
      settings.size,
      input.viewTransform.scale,
      settings.showSubdivisions ?? false,
      settings.subdivisionCount ?? 5,
    );

    // Skip if grid would be too small on screen
    const screenGridSize = majorSize * input.viewTransform.scale;
    if (screenGridSize < 3) return;

    gl.useProgram(res.program);
    gl.bindVertexArray(res.vao);

    // View uniforms
    gl.uniform1f(res.uViewScale, input.viewTransform.scale);
    gl.uniform2f(res.uViewTranslate, input.viewTransform.x, input.viewTransform.y);
    gl.uniform2f(res.uCanvasSize, input.canvasSizeDevice.width, input.canvasSizeDevice.height);
    gl.uniform1f(res.uPixelRatio, input.pixelRatio);

    // Grid settings
    gl.uniform1f(res.uMajorGridSize, majorSize);
    gl.uniform1f(res.uMinorGridSize, minorSize);
    gl.uniform1i(res.uShowDots, settings.showDots ? 1 : 0);
    gl.uniform1i(res.uShowLines, settings.showLines ? 1 : 0);
    gl.uniform1i(res.uShowMinor, showMinor ? 1 : 0);
    gl.uniform1f(res.uLineWidth, settings.lineWidth ?? 1.0);
    gl.uniform1f(res.uDotRadius, settings.dotRadius ?? 2.0);
    gl.uniform1f(res.uMinorOpacity, 0.4); // Minor grid is dimmer

    // Parse color
    const color = this.parseColor(settings.color);
    const opacity = settings.opacity ?? 0.5;
    gl.uniform4f(res.uMajorGridColor, color.r, color.g, color.b, color.a * opacity);
    // Minor grid uses same hue but reduced opacity
    gl.uniform4f(res.uMinorGridColor, color.r, color.g, color.b, color.a * opacity * 0.5);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw fullscreen quad (4 vertices as triangle strip)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindVertexArray(null);
  }

  /**
   * Compute adaptive grid sizes based on zoom level.
   * The grid automatically scales to maintain visual clarity:
   * - When zoomed out, grid spacing increases (multiply by subdivision count)
   * - When zoomed in, grid spacing decreases (divide by subdivision count)
   */
  private computeAdaptiveGridSizes(
    baseSize: number,
    scale: number,
    showSubdivisions: boolean,
    subdivisionCount: number,
  ): { majorSize: number; minorSize: number; showMinor: boolean } {
    const screenBaseSize = baseSize * scale;

    // Target: keep major grid between 20-150 screen pixels
    const minScreenSize = 20;
    const maxScreenSize = 150;

    let majorSize = baseSize;
    let level = 0;

    // Scale up if too small
    while (majorSize * scale < minScreenSize && level < 10) {
      majorSize *= subdivisionCount;
      level++;
    }

    // Scale down if too large
    while (majorSize * scale > maxScreenSize && level > -10) {
      majorSize /= subdivisionCount;
      level--;
    }

    // Minor grid is always smaller by subdivision factor
    const minorSize = majorSize / subdivisionCount;

    // Only show minor grid if it would be visible (> 5 screen pixels)
    const minorScreenSize = minorSize * scale;
    const shouldShowMinor = showSubdivisions && minorScreenSize >= 5;

    return {
      majorSize,
      minorSize,
      showMinor: shouldShowMinor,
    };
  }

  private parseColor(c: string): { r: number; g: number; b: number; a: number } {
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
    // Default gray
    return { r: 0.5, g: 0.5, b: 0.5, a: 1.0 };
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
