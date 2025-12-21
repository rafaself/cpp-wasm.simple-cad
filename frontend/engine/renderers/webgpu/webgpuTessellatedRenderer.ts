import type { TessellatedRenderer, TessellatedRenderInput } from '../tessellatedRenderer';
import { computeTriangleBatches, type TriangleBatch } from '../webgl2/triBatching';

type WebgpuResources = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;

  vertexBuffer: GPUBuffer;
  vertexCapacityBytes: number;

  uniforms: GPUBuffer;

  pipelineOpaque: GPURenderPipeline;
  pipelineBlend: GPURenderPipeline;
  bindGroup: GPUBindGroup;

  ssaaScale: number;
  ssaaTexture: GPUTexture | null;
  ssaaView: GPUTextureView | null;
  ssaaSize: { width: number; height: number };
  ssaaSampler: GPUSampler;
  blitPipeline: GPURenderPipeline;
  blitBindGroup: GPUBindGroup | null;

  pickTexture: GPUTexture | null;
  pickView: GPUTextureView | null;
  pickSize: { width: number; height: number };
  pickPipeline: GPURenderPipeline;
  pickBindGroup: GPUBindGroup;
  pickReadback: GPUBuffer;
};

const floatsPerVertex = 7;

const createShaderModule = (device: GPUDevice, code: string): GPUShaderModule => {
  return device.createShaderModule({ code });
};

const getDpr = (): number => {
  if (typeof window === 'undefined') return 1;
  return Math.max(1, window.devicePixelRatio || 1);
};

const nextPow2 = (v: number): number => {
  let x = Math.max(1, v | 0);
  x -= 1;
  x |= x >> 1;
  x |= x >> 2;
  x |= x >> 4;
  x |= x >> 8;
  x |= x >> 16;
  return x + 1;
};

export class WebgpuTessellatedRenderer implements TessellatedRenderer {
  private lastHeapBuffer: ArrayBuffer | null = null;
  private lastMeta: TessellatedRenderInput['positionMeta'] | null = null;
  private batches: TriangleBatch[] = [];

  private constructor(private canvas: HTMLCanvasElement, private r: WebgpuResources) {}

  public static async create(canvas: HTMLCanvasElement, opts?: { aaScale?: number }): Promise<WebgpuTessellatedRenderer> {
    const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
    if (!gpu) throw new Error('WebGPU not available');

    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU adapter unavailable');

    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('Failed to create WebGPU canvas context');

    const format = gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });

    const uniforms = device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const initialVertexCapacityBytes = 4 * 1024;
    const vertexBuffer = device.createBuffer({
      size: initialVertexCapacityBytes,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    const vertex = createShaderModule(
      device,
      `
        struct Uniforms {
          viewScale: f32,
          _pad0: f32,
          viewTranslate: vec2<f32>,
          canvasSize: vec2<f32>,
          pixelRatio: f32,
          _pad1: f32,
        };
        @group(0) @binding(0) var<uniform> u: Uniforms;

        struct VSIn {
          @location(0) pos: vec3<f32>,
          @location(1) col: vec4<f32>,
        };

        struct VSOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) col: vec4<f32>,
        };

        @vertex fn main(input: VSIn) -> VSOut {
          var out: VSOut;
          out.col = input.col;
          var screen: vec2<f32>;
          screen.x = input.pos.x * u.viewScale + u.viewTranslate.x;
          screen.y = -input.pos.y * u.viewScale + u.viewTranslate.y;
          screen = screen * u.pixelRatio;
          let clip = vec2<f32>(
            (screen.x / u.canvasSize.x) * 2.0 - 1.0,
            1.0 - (screen.y / u.canvasSize.y) * 2.0
          );
          out.pos = vec4<f32>(clip, 0.0, 1.0);
          return out;
        }
      `,
    );

    const fragment = createShaderModule(
      device,
      `
        @fragment fn main(@location(0) col: vec4<f32>) -> @location(0) vec4<f32> {
          return col;
        }
      `,
    );

    const makePipeline = (blended: boolean): GPURenderPipeline => {
      return device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
          module: vertex,
          entryPoint: 'main',
          buffers: [
            {
              arrayStride: floatsPerVertex * 4,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 3 * 4, format: 'float32x4' },
              ],
            },
          ],
        },
        fragment: {
          module: fragment,
          entryPoint: 'main',
          targets: [
            blended
              ? {
                  format: 'rgba8unorm',
                  blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  },
                }
              : { format: 'rgba8unorm' },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
      });
    };

    const pipelineOpaque = makePipeline(false);
    const pipelineBlend = makePipeline(true);

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniforms } }],
    });

    // SSAA blit (fullscreen triangle list via vertex_index).
    const blitShader = createShaderModule(
      device,
      `
        @group(0) @binding(0) var u_source: texture_2d<f32>;
        @group(0) @binding(1) var u_sampler: sampler;

        struct VSOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) uv: vec2<f32>,
        };

        @vertex fn vs(@builtin(vertex_index) vid: u32) -> VSOut {
          var positions = array<vec2<f32>, 6>(
            vec2<f32>(-1.0, -1.0),
            vec2<f32>( 1.0, -1.0),
            vec2<f32>(-1.0,  1.0),
            vec2<f32>(-1.0,  1.0),
            vec2<f32>( 1.0, -1.0),
            vec2<f32>( 1.0,  1.0),
          );
          let p = positions[vid];
          var out: VSOut;
          out.pos = vec4<f32>(p, 0.0, 1.0);
          out.uv = (p + vec2<f32>(1.0, 1.0)) * 0.5;
          return out;
        }

        @fragment fn fs(input: VSOut) -> @location(0) vec4<f32> {
          return textureSample(u_source, u_sampler, input.uv);
        }
      `,
    );

    const blitBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const blitPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [blitBindGroupLayout] }),
      vertex: { module: blitShader, entryPoint: 'vs' },
      fragment: { module: blitShader, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const ssaaSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    // Picking pass: write triangle index to RGBA8, then read 1 pixel.
    const pickVertex = createShaderModule(
      device,
      `
        struct Uniforms {
          viewScale: f32,
          _pad0: f32,
          viewTranslate: vec2<f32>,
          canvasSize: vec2<f32>,
          pixelRatio: f32,
          _pad1: f32,
        };
        @group(0) @binding(0) var<uniform> u: Uniforms;

        struct VSIn {
          @location(0) pos: vec3<f32>,
        };

        struct VSOut {
          @builtin(position) pos: vec4<f32>,
          @location(0) @interpolate(flat) triId: u32,
        };

        @vertex fn main(@builtin(vertex_index) vid: u32, input: VSIn) -> VSOut {
          var out: VSOut;
          var screen: vec2<f32>;
          screen.x = input.pos.x * u.viewScale + u.viewTranslate.x;
          screen.y = -input.pos.y * u.viewScale + u.viewTranslate.y;
          screen = screen * u.pixelRatio;
          let clip = vec2<f32>(
            (screen.x / u.canvasSize.x) * 2.0 - 1.0,
            1.0 - (screen.y / u.canvasSize.y) * 2.0
          );
          out.pos = vec4<f32>(clip, 0.0, 1.0);
          out.triId = (vid / 3u) + 1u;
          return out;
        }
      `,
    );
    const pickFragment = createShaderModule(
      device,
      `
        fn encode(id: u32) -> vec4<f32> {
          let r = (id & 255u);
          let g = ((id >> 8u) & 255u);
          let b = ((id >> 16u) & 255u);
          let a = ((id >> 24u) & 255u);
          return vec4<f32>(f32(r) / 255.0, f32(g) / 255.0, f32(b) / 255.0, f32(a) / 255.0);
        }
        @fragment fn main(@location(0) @interpolate(flat) triId: u32) -> @location(0) vec4<f32> {
          return encode(triId);
        }
      `,
    );
    const pickPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: pickVertex,
        entryPoint: 'main',
        buffers: [{ arrayStride: floatsPerVertex * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }],
      },
      fragment: { module: pickFragment, entryPoint: 'main', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    const pickBindGroup = bindGroup;
    const pickReadback = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const r: WebgpuResources = {
      device,
      context,
      format,
      vertexBuffer,
      vertexCapacityBytes: initialVertexCapacityBytes,
      uniforms,
      pipelineOpaque,
      pipelineBlend,
      bindGroup,
      ssaaScale: Math.max(1, Math.floor(opts?.aaScale ?? 2)),
      ssaaTexture: null,
      ssaaView: null,
      ssaaSize: { width: 0, height: 0 },
      ssaaSampler,
      blitPipeline,
      blitBindGroup: null,
      pickTexture: null,
      pickView: null,
      pickSize: { width: 0, height: 0 },
      pickPipeline,
      pickBindGroup,
      pickReadback,
    };

    return new WebgpuTessellatedRenderer(canvas, r);
  }

  public dispose(): void {
    // WebGPU resources rely on GC; explicitly destroy large buffers/textures.
    this.r.vertexBuffer.destroy();
    this.r.uniforms.destroy();
    this.r.ssaaTexture?.destroy();
    this.r.pickTexture?.destroy();
    this.r.pickReadback.destroy();
  }

  private ensureCanvasSize(input: TessellatedRenderInput): { width: number; height: number; pixelRatio: number } {
    const dpr = getDpr();
    const width = Math.max(1, Math.floor(input.canvasSizeCss.width * dpr));
    const height = Math.max(1, Math.floor(input.canvasSizeCss.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.r.context.configure({ device: this.r.device, format: this.r.format, alphaMode: 'premultiplied' });
    }
    return { width, height, pixelRatio: dpr };
  }

  private ensureVertexBuffer(byteCount: number): void {
    if (byteCount <= this.r.vertexCapacityBytes) return;
    this.r.vertexBuffer.destroy();
    const cap = nextPow2(byteCount);
    this.r.vertexBuffer = this.r.device.createBuffer({
      size: cap,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.r.vertexCapacityBytes = cap;
  }

  private ensureSsaa(width: number, height: number): { width: number; height: number } {
    const scale = this.r.ssaaScale;
    if (scale <= 1) return { width, height };

    const targetW = width * scale;
    const targetH = height * scale;
    if (this.r.ssaaSize.width === targetW && this.r.ssaaSize.height === targetH) return this.r.ssaaSize;

    this.r.ssaaTexture?.destroy();
    this.r.ssaaTexture = this.r.device.createTexture({
      size: { width: targetW, height: targetH },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.r.ssaaView = this.r.ssaaTexture.createView();
    this.r.ssaaSize = { width: targetW, height: targetH };
    this.r.blitBindGroup = this.r.device.createBindGroup({
      layout: this.r.blitPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.r.ssaaView },
        { binding: 1, resource: this.r.ssaaSampler },
      ],
    });
    return this.r.ssaaSize;
  }

  private uploadIfNeeded(input: TessellatedRenderInput): Float32Array {
    const { module, positionMeta } = input;
    const heapChanged = module.HEAPF32.buffer !== this.lastHeapBuffer;
    const metaChanged =
      !this.lastMeta ||
      positionMeta.generation !== this.lastMeta.generation ||
      positionMeta.ptr !== this.lastMeta.ptr ||
      positionMeta.floatCount !== this.lastMeta.floatCount ||
      positionMeta.vertexCount !== this.lastMeta.vertexCount;

    const start = positionMeta.ptr >>> 2;
    const end = start + positionMeta.floatCount;
    const view = module.HEAPF32.subarray(start, end);
    const bytes = positionMeta.floatCount * 4;

    if (heapChanged || metaChanged) {
      this.ensureVertexBuffer(bytes);
      this.r.device.queue.writeBuffer(this.r.vertexBuffer, 0, view);
      this.batches = computeTriangleBatches(view, floatsPerVertex);
      this.lastHeapBuffer = module.HEAPF32.buffer as ArrayBuffer;
      this.lastMeta = { ...positionMeta };
    }

    return view;
  }

  public render(input: TessellatedRenderInput): void {
    const { device } = this.r;
    const { width, height, pixelRatio } = this.ensureCanvasSize(input);
    const ssaa = this.ensureSsaa(width, height);

    this.uploadIfNeeded(input);

    const pixelRatioScaled = pixelRatio * (this.r.ssaaScale > 1 ? this.r.ssaaScale : 1);
    device.queue.writeBuffer(
      this.r.uniforms,
      0,
      new Float32Array([
        input.viewTransform.scale || 1,
        0,
        input.viewTransform.x || 0,
        input.viewTransform.y || 0,
        ssaa.width,
        ssaa.height,
        pixelRatioScaled,
        0,
      ]),
    );

    const encoder = device.createCommandEncoder();

    const colorView = (this.r.ssaaScale > 1 ? this.r.ssaaView : this.r.context.getCurrentTexture().createView())!;
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          clearValue: input.clearColor,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.setVertexBuffer(0, this.r.vertexBuffer);
    pass.setBindGroup(0, this.r.bindGroup);

    for (const batch of this.batches) {
      pass.setPipeline(batch.blended ? this.r.pipelineBlend : this.r.pipelineOpaque);
      pass.draw(batch.vertexCount, 1, batch.firstVertex, 0);
    }
    pass.end();

    if (this.r.ssaaScale > 1 && this.r.blitBindGroup) {
      const outView = this.r.context.getCurrentTexture().createView();
      const blit = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: outView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: input.clearColor,
          },
        ],
      });
      blit.setPipeline(this.r.blitPipeline);
      blit.setBindGroup(0, this.r.blitBindGroup);
      blit.draw(6, 1, 0, 0);
      blit.end();
    }

    device.queue.submit([encoder.finish()]);
  }

  public async pickTriangle(input: TessellatedRenderInput, screen: { x: number; y: number }): Promise<number | null> {
    // This pass is intentionally triangle-level (no shape mapping yet).
    const { device } = this.r;
    const { width, height, pixelRatio } = this.ensureCanvasSize(input);
    const x = Math.floor(screen.x * pixelRatio);
    const y = Math.floor(height - screen.y * pixelRatio - 1);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;

    if (this.r.pickSize.width !== width || this.r.pickSize.height !== height) {
      this.r.pickTexture?.destroy();
      this.r.pickTexture = device.createTexture({
        size: { width, height },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      this.r.pickView = this.r.pickTexture.createView();
      this.r.pickSize = { width, height };
    }

    this.uploadIfNeeded(input);
    device.queue.writeBuffer(
      this.r.uniforms,
      0,
      new Float32Array([
        input.viewTransform.scale || 1,
        0,
        input.viewTransform.x || 0,
        input.viewTransform.y || 0,
        width,
        height,
        pixelRatio,
        0,
      ]),
    );

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.r.pickView!,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.r.pickPipeline);
    pass.setVertexBuffer(0, this.r.vertexBuffer);
    pass.setBindGroup(0, this.r.pickBindGroup);
    for (const batch of this.batches) {
      pass.draw(batch.vertexCount, 1, batch.firstVertex, 0);
    }
    pass.end();

    encoder.copyTextureToBuffer(
      { texture: this.r.pickTexture!, origin: { x, y } },
      { buffer: this.r.pickReadback, bytesPerRow: 256 },
      { width: 1, height: 1 },
    );
    device.queue.submit([encoder.finish()]);

    await this.r.pickReadback.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(this.r.pickReadback.getMappedRange()).slice(0, 4);
    this.r.pickReadback.unmap();
    const id = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
    if (!id) return null;
    return id - 1;
  }
}
