import type { Layer, Point, Shape, ViewTransform } from '@/types';
import { getEffectiveFillColor, isFillEffectivelyEnabled, isStrokeEffectivelyEnabled } from '@/utils/shapeColors';
import { isShapeInteractable } from '@/utils/visibility';
import { QuadTree } from '@/utils/spatial';
import { createPickIdMaps, encodePickId, getShapeIdFromPixel } from './pickId';

type PickInput = {
  screen: Point;
  world: Point;
  toleranceWorld: number;
  viewTransform: ViewTransform;
  canvasSize: { width: number; height: number };
  shapes: Record<string, Shape>;
  shapeOrder: string[];
  layers: Layer[];
  spatialIndex: QuadTree;
  activeFloorId?: string;
  activeDiscipline: 'architecture';
};

type GpuResources = {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  framebuffer: WebGLFramebuffer;
  texture: WebGLTexture;
  uViewScale: WebGLUniformLocation;
  uViewTranslate: WebGLUniformLocation;
  uCanvasSize: WebGLUniformLocation;
  uIdColor: WebGLUniformLocation;
  aPosition: number;
};

const buildQueryRect = (world: Point, toleranceWorld: number) => ({
  x: world.x - toleranceWorld,
  y: world.y - toleranceWorld,
  width: toleranceWorld * 2,
  height: toleranceWorld * 2,
});

const toOrderedCandidates = (
  candidates: Shape[],
  shapes: Record<string, Shape>,
  shapeOrder: string[],
): Shape[] => {
  const orderIndex = new Map<string, number>();
  let nextIndex = 0;
  for (const id of shapeOrder) {
    if (orderIndex.has(id)) continue;
    orderIndex.set(id, nextIndex++);
  }
  const missing = Object.keys(shapes)
    .filter((id) => !orderIndex.has(id))
    .sort((a, b) => a.localeCompare(b));
  for (const id of missing) {
    orderIndex.set(id, nextIndex++);
  }

  return [...candidates].sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
};

const collectSegmentVertices = (out: number[], a: Point, b: Point, halfWidthWorld: number) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len <= 1e-6) return;

  const nx = -dy / len;
  const ny = dx / len;
  const ox = nx * halfWidthWorld;
  const oy = ny * halfWidthWorld;

  const v0x = a.x + ox;
  const v0y = a.y + oy;
  const v1x = b.x + ox;
  const v1y = b.y + oy;
  const v2x = b.x - ox;
  const v2y = b.y - oy;
  const v3x = a.x - ox;
  const v3y = a.y - oy;

  out.push(
    v0x, v0y,
    v1x, v1y,
    v2x, v2y,
    v2x, v2y,
    v3x, v3y,
    v0x, v0y,
  );
};

const sampleQuadratic = (start: Point, control: Point, end: Point, segments = 12): Point[] => {
  const pts: Point[] = [];
  const steps = Math.max(2, Math.floor(segments));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
      y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
    });
  }
  return pts;
};

const collectPolylineVertices = (out: number[], points: Point[], halfWidthWorld: number) => {
  if (points.length < 2) return;
  for (let i = 0; i < points.length - 1; i += 1) {
    collectSegmentVertices(out, points[i]!, points[i + 1]!, halfWidthWorld);
  }
};

const rectFillVertices = (x: number, y: number, w: number, h: number): Float32Array => new Float32Array([
  x, y,
  x + w, y,
  x + w, y + h,
  x, y,
  x + w, y + h,
  x, y + h,
]);

const rectStrokeVertices = (x: number, y: number, w: number, h: number, halfWidthWorld: number): Float32Array => {
  const out: number[] = [];
  collectSegmentVertices(out, { x, y }, { x: x + w, y }, halfWidthWorld);
  collectSegmentVertices(out, { x: x + w, y }, { x: x + w, y: y + h }, halfWidthWorld);
  collectSegmentVertices(out, { x: x + w, y: y + h }, { x, y: y + h }, halfWidthWorld);
  collectSegmentVertices(out, { x, y: y + h }, { x, y }, halfWidthWorld);
  return new Float32Array(out);
};

const toWorldHalfWidth = (strokeWidthPx: number | undefined, viewScale: number): number => {
  const safeScale = Math.max(1e-6, viewScale || 1);
  const widthPx = Math.max(1, Math.round(strokeWidthPx ?? 1));
  return widthPx / safeScale / 2;
};

const shouldFillShape = (shape: Shape, layer: Layer | null): boolean => {
  const fillEnabled = isFillEffectivelyEnabled(shape, layer);
  if (!fillEnabled) return false;
  const fillColor = getEffectiveFillColor(shape, layer);
  return fillColor.toLowerCase() !== 'transparent';
};

export class GpuPicker {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private resources: GpuResources | null = null;
  private width = 0;
  private height = 0;
  private pixel = new Uint8Array(4);

  public constructor() {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) return;

    const resources = initResources(gl);
    if (!resources) return;

    this.canvas = canvas;
    this.gl = gl;
    this.resources = resources;
  }

  public dispose(): void {
    if (!this.gl || !this.resources) return;
    const { gl } = this;
    const { program, vao, buffer, framebuffer, texture } = this.resources;
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
    this.resources = null;
    this.gl = null;
    this.canvas = null;
  }

  public pick(input: PickInput): string | null {
    if (!this.gl || !this.resources || !this.canvas) return null;

    const { width, height } = input.canvasSize;
    if (width <= 0 || height <= 0) return null;

    this.ensureSize(width, height);

    const { gl } = this;
    const { program, vao, buffer, framebuffer, uViewScale, uViewTranslate, uCanvasSize, uIdColor, aPosition } = this.resources;

    const readX = Math.floor(input.screen.x);
    const readY = Math.floor(height - input.screen.y - 1);
    if (readX < 0 || readY < 0 || readX >= width || readY >= height) return null;

    const queryRect = buildQueryRect(input.world, input.toleranceWorld);
    const rawCandidates = input.spatialIndex
      .query(queryRect)
      .map((shape) => input.shapes[shape.id])
      .filter(Boolean) as Shape[];

    if (rawCandidates.length === 0) return null;

    const layerById = new Map(input.layers.map((layer) => [layer.id, layer] as const));
    const interactableCandidates = rawCandidates.filter((shape) => {
      const layer = layerById.get(shape.layerId);
      if (!layer || !layer.visible || layer.locked) return false;
      return isShapeInteractable(shape, {
        activeFloorId: input.activeFloorId ?? 'terreo',
        activeDiscipline: input.activeDiscipline,
      });
    });

    if (interactableCandidates.length === 0) return null;

    const ordered = toOrderedCandidates(interactableCandidates, input.shapes, input.shapeOrder);
    const { toPickId, toShapeId } = createPickIdMaps(ordered.map((shape) => shape.id));

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(uViewScale, input.viewTransform.scale || 1);
    gl.uniform2f(uViewTranslate, input.viewTransform.x || 0, input.viewTransform.y || 0);
    gl.uniform2f(uCanvasSize, width, height);

    for (const shape of ordered) {
      const pickId = toPickId.get(shape.id);
      if (!pickId) continue;
      const idColor = encodePickId(pickId);
      gl.uniform4f(uIdColor, idColor[0], idColor[1], idColor[2], idColor[3]);

      const layer = layerById.get(shape.layerId) ?? null;
      const strokeEnabled = isStrokeEffectivelyEnabled(shape, layer);
      const fillEnabled = shouldFillShape(shape, layer);
      const halfWidthWorld = toWorldHalfWidth(shape.strokeWidth, input.viewTransform.scale || 1);

      if (shape.type === 'rect' && shape.x !== undefined && shape.y !== undefined && shape.width !== undefined && shape.height !== undefined) {
        if (fillEnabled) {
          const verts = rectFillVertices(shape.x, shape.y, shape.width, shape.height);
          gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
          gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
        }
        if (strokeEnabled && halfWidthWorld > 0) {
          const verts = rectStrokeVertices(shape.x, shape.y, shape.width, shape.height, halfWidthWorld);
          if (verts.length) {
            gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
            gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
          }
        }
        continue;
      }

      if (
        shape.type === 'arrow' ||
        shape.type === 'measure'
      ) {
        if (!strokeEnabled || halfWidthWorld <= 0) continue;
        const points = shape.points ?? [];
        if (points.length < 2) continue;
        const out: number[] = [];
        collectPolylineVertices(out, points, halfWidthWorld);
        if (out.length) {
          const verts = new Float32Array(out);
          gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
          gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
        }
      }
    }

    gl.readPixels(readX, readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return getShapeIdFromPixel(this.pixel, toShapeId);
  }

  private ensureSize(width: number, height: number): void {
    if (!this.gl || !this.canvas || !this.resources) return;
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.resources.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
}

const initResources = (gl: WebGL2RenderingContext): GpuResources | null => {
  const vertexSource = `#version 300 es
    in vec2 a_position;
    uniform float u_viewScale;
    uniform vec2 u_viewTranslate;
    uniform vec2 u_canvasSize;
    void main() {
      vec2 screen;
      screen.x = a_position.x * u_viewScale + u_viewTranslate.x;
      screen.y = -a_position.y * u_viewScale + u_viewTranslate.y;
      vec2 clip = vec2(
        (screen.x / u_canvasSize.x) * 2.0 - 1.0,
        1.0 - (screen.y / u_canvasSize.y) * 2.0
      );
      gl_Position = vec4(clip, 0.0, 1.0);
    }
  `;
  const fragmentSource = `#version 300 es
    precision highp float;
    uniform vec4 u_idColor;
    out vec4 outColor;
    void main() {
      outColor = u_idColor;
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  if (!program) return null;

  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  if (!vao || !buffer || !framebuffer || !texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const aPosition = gl.getAttribLocation(program, 'a_position');
  const uViewScale = gl.getUniformLocation(program, 'u_viewScale');
  const uViewTranslate = gl.getUniformLocation(program, 'u_viewTranslate');
  const uCanvasSize = gl.getUniformLocation(program, 'u_canvasSize');
  const uIdColor = gl.getUniformLocation(program, 'u_idColor');
  if (aPosition < 0 || !uViewScale || !uViewTranslate || !uCanvasSize || !uIdColor) return null;

  return {
    program,
    vao,
    buffer,
    framebuffer,
    texture,
    uViewScale,
    uViewTranslate,
    uCanvasSize,
    uIdColor,
    aPosition,
  };
};

const createProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!linked) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
};

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!compiled) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};
