/**
 * TextRenderPass - WebGL2 text rendering with MSDF shader
 *
 * Renders text using the quad buffer and atlas texture from the WASM engine.
 * Uses Multi-channel Signed Distance Field (MSDF) for crisp text at any zoom.
 *
 * The quad buffer format is: [x, y, z, u, v, r, g, b, a] per vertex,
 * with 6 vertices per glyph (2 triangles).
 */

import {
  TEXT_MSDF_VERTEX_SOURCE,
  TEXT_MSDF_FRAGMENT_SOURCE,
  TEXT_FLOATS_PER_VERTEX,
  DEFAULT_MSDF_PX_RANGE,
} from '../shaders/textMsdf';

import type { WasmModule } from '@/engine/core/EngineRuntime';
import type { TextQuadBufferMeta, TextureBufferMeta } from '@/types/text';

// =============================================================================
// Types
// =============================================================================

export interface TextRenderInput {
  /** WASM module for memory access */
  module: WasmModule;
  /** View transformation */
  viewTransform: { scale: number; x: number; y: number };
  /** Canvas size in CSS pixels */
  canvasSizeCss: { width: number; height: number };
  /** Device pixel ratio */
  pixelRatio: number;
  /** Canvas size in device pixels (for uniforms) */
  canvasSizeDevice: { width: number; height: number };
}

type TextResources = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  atlasTexture: WebGLTexture;
  // Attribute locations
  aPosition: number;
  aTexcoord: number;
  aColor: number;
  // Uniform locations
  uViewScale: WebGLUniformLocation;
  uViewTranslate: WebGLUniformLocation;
  uCanvasSize: WebGLUniformLocation;
  uPixelRatio: WebGLUniformLocation;
  uAtlas: WebGLUniformLocation;
  uPxRange: WebGLUniformLocation;
};

// =============================================================================
// Shader Compilation Helpers
// =============================================================================

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'Shader compile failed';
    gl.deleteShader(shader);
    throw new Error(`Text shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create text program');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Program link failed';
    gl.deleteProgram(program);
    throw new Error(`Text program link error: ${log}`);
  }
  return program;
}

// =============================================================================
// TextRenderPass Class
// =============================================================================

export class TextRenderPass {
  private gl: WebGL2RenderingContext;
  private resources: TextResources | null = null;

  // Cache for change detection
  private lastQuadGeneration = -1;
  private lastQuadPtr = 0;
  private lastQuadFloatCount = 0;
  private lastAtlasGeneration = -1;
  private lastAtlasWidth = 0;
  private lastAtlasHeight = 0;
  private lastHeapBuffer: ArrayBuffer | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  /**
   * Initialize GPU resources (program, VAO, VBO, texture).
   * Call this once after construction.
   */
  public initialize(): void {
    if (this.resources) return;

    const { gl } = this;

    // Create shader program
    const program = createProgram(gl, TEXT_MSDF_VERTEX_SOURCE, TEXT_MSDF_FRAGMENT_SOURCE);

    // Get attribute locations
    const aPosition = gl.getAttribLocation(program, 'a_position');
    const aTexcoord = gl.getAttribLocation(program, 'a_texcoord');
    const aColor = gl.getAttribLocation(program, 'a_color');
    if (aPosition < 0 || aTexcoord < 0 || aColor < 0) {
      throw new Error('Missing text shader attributes');
    }

    // Get uniform locations
    const uViewScale = gl.getUniformLocation(program, 'u_viewScale');
    const uViewTranslate = gl.getUniformLocation(program, 'u_viewTranslate');
    const uCanvasSize = gl.getUniformLocation(program, 'u_canvasSize');
    const uPixelRatio = gl.getUniformLocation(program, 'u_pixelRatio');
    const uAtlas = gl.getUniformLocation(program, 'u_atlas');
    const uPxRange = gl.getUniformLocation(program, 'u_pxRange');
    if (!uViewScale || !uViewTranslate || !uCanvasSize || !uPixelRatio || !uAtlas || !uPxRange) {
      throw new Error('Missing text shader uniforms');
    }

    // Create VAO and VBO
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) throw new Error('Failed to create text VAO/VBO');

    // Configure vertex attributes
    // Format: [x, y, z, u, v, r, g, b, a] = 9 floats per vertex
    const stride = TEXT_FLOATS_PER_VERTEX * 4; // bytes

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    // a_position: vec3 at offset 0
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, stride, 0);

    // a_texcoord: vec2 at offset 12 (3 floats * 4 bytes)
    gl.enableVertexAttribArray(aTexcoord);
    gl.vertexAttribPointer(aTexcoord, 2, gl.FLOAT, false, stride, 3 * 4);

    // a_color: vec4 at offset 20 (5 floats * 4 bytes)
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 5 * 4);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Create atlas texture
    const atlasTexture = gl.createTexture();
    if (!atlasTexture) throw new Error('Failed to create atlas texture');

    // Configure texture parameters for MSDF
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.resources = {
      program,
      vao,
      vbo,
      atlasTexture,
      aPosition,
      aTexcoord,
      aColor,
      uViewScale,
      uViewTranslate,
      uCanvasSize,
      uPixelRatio,
      uAtlas,
      uPxRange,
    };
  }

  /**
   * Dispose of GPU resources.
   */
  public dispose(): void {
    if (!this.resources) return;

    const { gl } = this;
    const { program, vao, vbo, atlasTexture } = this.resources;

    gl.deleteTexture(atlasTexture);
    gl.deleteBuffer(vbo);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);

    this.resources = null;
  }

  /**
   * Update the quad VBO from engine memory if changed.
   * @returns Number of vertices to draw
   */
  public updateQuadBuffer(module: WasmModule, meta: TextQuadBufferMeta): number {
    if (!this.resources) return 0;
    if (meta.vertexCount === 0) return 0;

    const { gl } = this;
    const heapChanged = module.HEAPF32.buffer !== this.lastHeapBuffer;
    const metaChanged =
      meta.generation !== this.lastQuadGeneration ||
      meta.ptr !== this.lastQuadPtr ||
      meta.floatCount !== this.lastQuadFloatCount;

    if (!heapChanged && !metaChanged) {
      return meta.vertexCount;
    }

    // Read quad data from WASM memory
    const start = meta.ptr >>> 2;
    const view = module.HEAPF32.subarray(start, start + meta.floatCount);

    // Upload to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, view, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Update cache
    this.lastHeapBuffer = module.HEAPF32.buffer as ArrayBuffer;
    this.lastQuadGeneration = meta.generation;
    this.lastQuadPtr = meta.ptr;
    this.lastQuadFloatCount = meta.floatCount;

    return meta.vertexCount;
  }

  /**
   * Update the atlas texture from engine memory if changed.
   */
  public updateAtlasTexture(module: WasmModule, meta: TextureBufferMeta): void {
    if (!this.resources) return;
    if (meta.width === 0 || meta.height === 0) return;

    const { gl } = this;
    const metaChanged =
      meta.generation !== this.lastAtlasGeneration ||
      meta.width !== this.lastAtlasWidth ||
      meta.height !== this.lastAtlasHeight;

    if (!metaChanged) return;

    // Read atlas data from WASM memory
    const view = new Uint8Array(module.HEAPU8.buffer, meta.ptr, meta.byteCount);

    // Atlas has valid MSDF data - upload to GPU

    // Upload to GPU as RGBA texture (MSDF has 3 channels + alpha)
    gl.bindTexture(gl.TEXTURE_2D, this.resources.atlasTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      meta.width,
      meta.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      view,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Update cache
    this.lastAtlasGeneration = meta.generation;
    this.lastAtlasWidth = meta.width;
    this.lastAtlasHeight = meta.height;
  }

  /**
   * Render text quads.
   * Call after updateQuadBuffer and updateAtlasTexture.
   */
  public render(input: TextRenderInput, vertexCount: number): void {
    if (!this.resources || vertexCount === 0) return;

    const { gl } = this;
    const {
      program,
      vao,
      atlasTexture,
      uViewScale,
      uViewTranslate,
      uCanvasSize,
      uPixelRatio,
      uAtlas,
      uPxRange,
    } = this.resources;

    // Enable blending for text (we have alpha from the MSDF shader)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Disable depth test so text always renders on top
    gl.disable(gl.DEPTH_TEST);

    // Disable face culling to ensure quads are visible regardless of winding order
    gl.disable(gl.CULL_FACE);

    // Use text shader program
    gl.useProgram(program);

    // Set uniforms
    gl.uniform1f(uViewScale, input.viewTransform.scale);
    gl.uniform2f(uViewTranslate, input.viewTransform.x, input.viewTransform.y);
    gl.uniform2f(uCanvasSize, input.canvasSizeDevice.width, input.canvasSizeDevice.height);
    gl.uniform1f(uPixelRatio, input.pixelRatio);
    // MSDF pixel range (should match generation config)
    gl.uniform1f(uPxRange, DEFAULT_MSDF_PX_RANGE);

    // Bind atlas texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
    gl.uniform1i(uAtlas, 0);

    // Draw text quads
    gl.bindVertexArray(vao);

    // Draw text quads
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

    // Check for errors after draw
    const err2 = gl.getError();
    if (err2 !== 0) {
      console.error(`[DEBUG] TextRender drawArrays error: ${err2}`);
    }

    gl.bindVertexArray(null);

    // Clean up
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Check if the render pass has been initialized.
   */
  public isInitialized(): boolean {
    return this.resources !== null;
  }

  /**
   * Force re-upload of atlas texture on next update.
   * Call when the engine signals atlas is dirty.
   */
  public invalidateAtlas(): void {
    this.lastAtlasGeneration = -1;
  }

  /**
   * Force re-upload of quad buffer on next update.
   */
  public invalidateQuads(): void {
    this.lastQuadGeneration = -1;
  }
}

export default TextRenderPass;
