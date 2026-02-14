import './style.css';

const COMMAND_BUFFER_MAGIC = 0x43445745;
const COMMAND_VERSION = 4;

const PICK_MASK_ALL = 0xffffffff;
const SELECTION_MODE_REPLACE = 0;
const REORDER_ACTION_BRING_FORWARD = 3;
const REORDER_ACTION_SEND_BACKWARD = 4;

const PICK_TOLERANCE_PX = 8;
const MIN_RECT_WIDTH = 80;
const MIN_RECT_HEIGHT = 52;

enum CommandOp {
  ClearAll = 1,
  UpsertRect = 2,
  UpsertLine = 3,
  DeleteEntity = 5,
  SetViewScale = 10,
  UpsertArrow = 13,
  UpsertText = 14,
}

type KindLabel = 'RECT' | 'LINE' | 'ARROW' | 'TEXT';

interface BufferMeta {
  generation: number;
  vertexCount: number;
  capacity: number;
  floatCount: number;
  ptr: number;
}

interface TextureBufferMeta {
  generation: number;
  width: number;
  height: number;
  byteCount: number;
  ptr: number;
}

interface PickResult {
  id: number;
  kind: number;
  subTarget: number;
  subIndex: number;
  distance: number;
  hitX: number;
  hitY: number;
}

interface CadEngine {
  clear(): void;
  allocBytes(byteCount: number): number;
  freeBytes(ptr: number): void;
  applyCommandBuffer(ptr: number, byteCount: number): void;

  allocateEntityId(): number;

  getPositionBufferMeta(): BufferMeta;
  getLineBufferMeta(): BufferMeta;
  getTextQuadBufferMeta(): BufferMeta;
  getAtlasTextureMeta(): TextureBufferMeta;
  rebuildTextQuadBuffer(): void;
  isTextQuadsDirty(): boolean;
  isAtlasDirty(): boolean;
  clearAtlasDirty(): void;

  initializeTextSystem(): void;
  loadFont(fontId: number, fontDataPtr: number, dataSize: number): boolean;

  pickEx(x: number, y: number, tolerance: number, pickMask: number): PickResult;
  setSelection(idsPtr: number, idCount: number, mode: number): void;
  clearSelection(): void;
  reorderEntities(idsPtr: number, idCount: number, action: number, refId: number): void;

  setEntityPosition(entityId: number, x: number, y: number): void;
  setEntitySize(entityId: number, width: number, height: number): void;
}

interface EngineModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  HEAPU32: Uint32Array;
  CadEngine: new () => CadEngine;
}

type EngineFactory = (config?: Record<string, unknown>) => Promise<EngineModule>;

interface EncodedCommand {
  op: CommandOp;
  id: number;
  payload: Uint8Array;
}

interface RectEntity {
  id: number;
  kind: 'RECT';
  x: number;
  y: number;
  w: number;
  h: number;
  fill: [number, number, number, number];
  stroke: [number, number, number, number];
  strokeEnabled: number;
  strokeWidthPx: number;
  elevationZ: number;
}

interface LineEntity {
  id: number;
  kind: 'LINE';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: [number, number, number, number];
  enabled: number;
  strokeWidthPx: number;
  elevationZ: number;
}

interface ArrowEntity {
  id: number;
  kind: 'ARROW';
  ax: number;
  ay: number;
  bx: number;
  by: number;
  head: number;
  color: [number, number, number, number];
  strokeEnabled: number;
  strokeWidthPx: number;
  elevationZ: number;
}

interface TextEntity {
  id: number;
  kind: 'TEXT';
  x: number;
  y: number;
  content: string;
  fontId: number;
  fontSize: number;
  colorRGBA: number;
  elevationZ: number;
  approxWidth: number;
  approxHeight: number;
}

type SceneEntity = RectEntity | LineEntity | ArrowEntity | TextEntity;

interface DomainModel {
  tables: Array<{
    id: string;
    name: string;
    cardEntityId: number;
    headerTextEntityId: number;
    dividerLineEntityId: number;
    columns: Array<{ id: string; nameTextEntityId: number; typeTextEntityId: number }>;
  }>;
  relations: Array<{ id: string; fromColumnId: string; toColumnId: string; arrowEntityId: number }>;
}

interface DragState {
  pointerId: number;
  mode: 'move' | 'resize';
  entityId: number;
  startWorldX: number;
  startWorldY: number;
  startEntity: SceneEntity;
}

interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

interface GeometryGpuState {
  generation: number;
  vertexCount: number;
}

interface TextGpuState {
  generation: number;
  vertexCount: number;
  atlasGeneration: number;
}

interface RenderState {
  gl: WebGL2RenderingContext;
  shapeProgram: WebGLProgram;
  textProgram: WebGLProgram;

  shapeUniforms: {
    viewOrigin: WebGLUniformLocation;
    viewSize: WebGLUniformLocation;
  };

  textUniforms: {
    viewOrigin: WebGLUniformLocation;
    viewSize: WebGLUniformLocation;
    atlasSampler: WebGLUniformLocation;
  };

  geometryVao: WebGLVertexArrayObject;
  geometryVbo: WebGLBuffer;
  lineVao: WebGLVertexArrayObject;
  lineVbo: WebGLBuffer;
  textVao: WebGLVertexArrayObject;
  textVbo: WebGLBuffer;
  atlasTexture: WebGLTexture;

  geometryState: GeometryGpuState;
  lineState: GeometryGpuState;
  textState: TextGpuState;
}

interface AppState {
  module: EngineModule;
  engine: CadEngine;
  renderer: RenderState;

  canvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  overlayCtx: CanvasRenderingContext2D;
  debugPanel: HTMLDivElement;

  viewport: Viewport;
  dpr: number;

  entities: Map<number, SceneEntity>;
  domainModel: DomainModel;
  domainKeyByEntityId: Map<number, string>;

  pendingCommands: EncodedCommand[];

  selectedId: number;
  selectedKind: KindLabel | 'NONE';
  drag: DragState | null;

  mouseWorldX: number;
  mouseWorldY: number;
  lastPickDistance: number;

  needsRedraw: boolean;
}

const textEncoder = new TextEncoder();

void bootstrap();

async function bootstrap(): Promise<void> {
  const canvas = getElement<HTMLCanvasElement>('gl-canvas');
  const overlayCanvas = getElement<HTMLCanvasElement>('overlay-canvas');
  const debugPanel = getElement<HTMLDivElement>('debug-panel');
  const overlayCtx = overlayCanvas.getContext('2d');

  if (!overlayCtx) {
    throw new Error('Could not create 2D overlay context');
  }

  const gl = canvas.getContext('webgl2', {
    antialias: true,
    alpha: true,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    throw new Error('WebGL2 is not available in this browser/environment.');
  }

  const module = await loadEngineModule();
  const engine = new module.CadEngine();

  engine.initializeTextSystem();
  await loadDefaultFont(module, engine, '/fonts/OpenSans-Regular.ttf', 1);

  const renderer = createRenderer(gl);

  const state: AppState = {
    module,
    engine,
    renderer,

    canvas,
    overlayCanvas,
    overlayCtx,
    debugPanel,

    viewport: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      scale: 1,
    },
    dpr: 1,

    entities: new Map<number, SceneEntity>(),
    domainModel: { tables: [], relations: [] },
    domainKeyByEntityId: new Map<number, string>(),

    pendingCommands: [],

    selectedId: 0,
    selectedKind: 'NONE',
    drag: null,

    mouseWorldX: 0,
    mouseWorldY: 0,
    lastPickDistance: 0,

    needsRedraw: true,
  };

  const resize = (): void => {
    resizeCanvases(state);
    queueCommand(state, makeSetViewScaleCommand(state.viewport));
    state.needsRedraw = true;
  };

  resize();
  window.addEventListener('resize', resize);

  rebuildScene(state);
  installInputHandlers(state);
  updateDebugPanel(state);

  requestAnimationFrame(() => frame(state));
}

async function loadEngineModule(): Promise<EngineModule> {
  const moduleUrl = '/wasm/engine.js';
  const wasmUrl = '/wasm/engine.wasm';
  const wasmResponse = await fetch(wasmUrl);
  if (!wasmResponse.ok) {
    throw new Error(`Failed to fetch ${wasmUrl}: ${wasmResponse.status}`);
  }

  const wasmBinary = await wasmResponse.arrayBuffer();
  const moduleImport = (await import(/* @vite-ignore */ moduleUrl)) as { default: EngineFactory };

  return moduleImport.default({
    wasmBinary,
    locateFile: (path: string): string => {
      if (path === 'engine.wasm') {
        return wasmUrl;
      }
      return `/wasm/${path}`;
    },
  });
}

async function loadDefaultFont(module: EngineModule, engine: CadEngine, url: string, fontId: number): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch font ${url}: ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const ptr = engine.allocBytes(bytes.byteLength);
  if (ptr === 0) {
    throw new Error('allocBytes failed for font payload');
  }

  try {
    module.HEAPU8.set(bytes, ptr);
    const ok = engine.loadFont(fontId, ptr, bytes.byteLength);
    if (!ok) {
      throw new Error(`loadFont failed for fontId=${fontId}`);
    }
  } finally {
    engine.freeBytes(ptr);
  }
}

function createRenderer(gl: WebGL2RenderingContext): RenderState {
  const shapeProgram = createProgram(gl, SHAPE_VERTEX_SHADER, SHAPE_FRAGMENT_SHADER);
  const textProgram = createProgram(gl, TEXT_VERTEX_SHADER, TEXT_FRAGMENT_SHADER);

  const geometryVbo = ensureBuffer(gl.createBuffer(), 'geometryVbo');
  const lineVbo = ensureBuffer(gl.createBuffer(), 'lineVbo');
  const textVbo = ensureBuffer(gl.createBuffer(), 'textVbo');

  const geometryVao = ensureVao(gl.createVertexArray(), 'geometryVao');
  const lineVao = ensureVao(gl.createVertexArray(), 'lineVao');
  const textVao = ensureVao(gl.createVertexArray(), 'textVao');

  const atlasTexture = ensureTexture(gl.createTexture(), 'atlasTexture');

  bindColorVao(gl, geometryVao, geometryVbo, 7 * 4);
  bindColorVao(gl, lineVao, lineVbo, 7 * 4);
  bindTextVao(gl, textVao, textVbo, 9 * 4);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    gl,
    shapeProgram,
    textProgram,

    shapeUniforms: {
      viewOrigin: ensureUniform(gl.getUniformLocation(shapeProgram, 'u_viewOrigin'), 'shape.u_viewOrigin'),
      viewSize: ensureUniform(gl.getUniformLocation(shapeProgram, 'u_viewSize'), 'shape.u_viewSize'),
    },

    textUniforms: {
      viewOrigin: ensureUniform(gl.getUniformLocation(textProgram, 'u_viewOrigin'), 'text.u_viewOrigin'),
      viewSize: ensureUniform(gl.getUniformLocation(textProgram, 'u_viewSize'), 'text.u_viewSize'),
      atlasSampler: ensureUniform(gl.getUniformLocation(textProgram, 'u_atlas'), 'text.u_atlas'),
    },

    geometryVao,
    geometryVbo,
    lineVao,
    lineVbo,
    textVao,
    textVbo,
    atlasTexture,

    geometryState: { generation: -1, vertexCount: 0 },
    lineState: { generation: -1, vertexCount: 0 },
    textState: { generation: -1, vertexCount: 0, atlasGeneration: -1 },
  };
}

function bindColorVao(
  gl: WebGL2RenderingContext,
  vao: WebGLVertexArrayObject,
  vbo: WebGLBuffer,
  strideBytes: number,
): void {
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, strideBytes, 0);

  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strideBytes, 3 * 4);
}

function bindTextVao(
  gl: WebGL2RenderingContext,
  vao: WebGLVertexArrayObject,
  vbo: WebGLBuffer,
  strideBytes: number,
): void {
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, strideBytes, 0);

  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, strideBytes, 3 * 4);

  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, strideBytes, 5 * 4);
}

function resizeCanvases(state: AppState): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssWidth = Math.max(1, state.canvas.clientWidth);
  const cssHeight = Math.max(1, state.canvas.clientHeight);

  state.dpr = dpr;

  state.canvas.width = Math.round(cssWidth * dpr);
  state.canvas.height = Math.round(cssHeight * dpr);

  state.overlayCanvas.width = Math.round(cssWidth * dpr);
  state.overlayCanvas.height = Math.round(cssHeight * dpr);

  state.viewport.width = cssWidth;
  state.viewport.height = cssHeight;
  state.viewport.scale = 1;

  state.renderer.gl.viewport(0, 0, state.canvas.width, state.canvas.height);

  state.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.overlayCtx.clearRect(0, 0, cssWidth, cssHeight);
}

function frame(state: AppState): void {
  flushPendingCommands(state);

  let textQuadsRebuilt = false;
  if (state.engine.isTextQuadsDirty()) {
    state.engine.rebuildTextQuadBuffer();
    textQuadsRebuilt = true;
    state.needsRedraw = true;
  }

  const buffersChanged = syncGpuBuffers(state, textQuadsRebuilt);
  if (buffersChanged) {
    state.needsRedraw = true;
  }

  if (state.needsRedraw || state.drag !== null) {
    draw(state);
    drawSelectionOverlay(state);
    state.needsRedraw = false;
  }

  requestAnimationFrame(() => frame(state));
}

function syncGpuBuffers(state: AppState, textQuadsRebuilt: boolean): boolean {
  const { gl } = state.renderer;
  const { module, engine } = state;

  let changed = false;

  const geometryMeta = engine.getPositionBufferMeta();
  if (geometryMeta.generation !== state.renderer.geometryState.generation) {
    const geometryFloats = readF32(module, geometryMeta.ptr, geometryMeta.floatCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.renderer.geometryVbo);
    gl.bufferData(gl.ARRAY_BUFFER, geometryFloats, gl.DYNAMIC_DRAW);
    state.renderer.geometryState.generation = geometryMeta.generation;
    state.renderer.geometryState.vertexCount = geometryMeta.vertexCount;
    changed = true;
  }

  const lineMeta = engine.getLineBufferMeta();
  if (lineMeta.generation !== state.renderer.lineState.generation) {
    const lineFloats = readF32(module, lineMeta.ptr, lineMeta.floatCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.renderer.lineVbo);
    gl.bufferData(gl.ARRAY_BUFFER, lineFloats, gl.DYNAMIC_DRAW);
    state.renderer.lineState.generation = lineMeta.generation;
    state.renderer.lineState.vertexCount = lineMeta.vertexCount;
    changed = true;
  }

  const textMeta = engine.getTextQuadBufferMeta();
  if (
    textQuadsRebuilt ||
    textMeta.generation !== state.renderer.textState.generation ||
    textMeta.vertexCount !== state.renderer.textState.vertexCount
  ) {
    const textFloats = readF32(module, textMeta.ptr, textMeta.floatCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.renderer.textVbo);
    gl.bufferData(gl.ARRAY_BUFFER, textFloats, gl.DYNAMIC_DRAW);
    state.renderer.textState.generation = textMeta.generation;
    state.renderer.textState.vertexCount = textMeta.vertexCount;
    changed = true;
  }

  const atlasMeta = engine.getAtlasTextureMeta();
  if (atlasMeta.ptr !== 0 && atlasMeta.byteCount > 0) {
    const atlasDirty = engine.isAtlasDirty() || atlasMeta.generation !== state.renderer.textState.atlasGeneration;
    if (atlasDirty) {
      const atlasBytes = readU8(module, atlasMeta.ptr, atlasMeta.byteCount);
      gl.bindTexture(gl.TEXTURE_2D, state.renderer.atlasTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        atlasMeta.width,
        atlasMeta.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        atlasBytes,
      );
      gl.bindTexture(gl.TEXTURE_2D, null);
      state.renderer.textState.atlasGeneration = atlasMeta.generation;
      engine.clearAtlasDirty();
      changed = true;
    }
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return changed;
}

function draw(state: AppState): void {
  const { gl, shapeProgram, textProgram } = state.renderer;

  gl.clearColor(0.95, 0.97, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const vx = state.viewport.x;
  const vy = state.viewport.y;
  const vw = state.viewport.width;
  const vh = state.viewport.height;

  gl.useProgram(shapeProgram);
  gl.uniform2f(state.renderer.shapeUniforms.viewOrigin, vx, vy);
  gl.uniform2f(state.renderer.shapeUniforms.viewSize, vw, vh);

  if (state.renderer.geometryState.vertexCount > 0) {
    gl.bindVertexArray(state.renderer.geometryVao);
    gl.drawArrays(gl.TRIANGLES, 0, state.renderer.geometryState.vertexCount);
  }

  if (state.renderer.lineState.vertexCount > 0) {
    gl.bindVertexArray(state.renderer.lineVao);
    gl.drawArrays(gl.LINES, 0, state.renderer.lineState.vertexCount);
  }

  if (state.renderer.textState.vertexCount > 0 && state.renderer.textState.atlasGeneration >= 0) {
    gl.useProgram(textProgram);
    gl.uniform2f(state.renderer.textUniforms.viewOrigin, vx, vy);
    gl.uniform2f(state.renderer.textUniforms.viewSize, vw, vh);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state.renderer.atlasTexture);
    gl.uniform1i(state.renderer.textUniforms.atlasSampler, 0);

    gl.bindVertexArray(state.renderer.textVao);
    gl.drawArrays(gl.TRIANGLES, 0, state.renderer.textState.vertexCount);
  }

  gl.bindVertexArray(null);
  gl.useProgram(null);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function drawSelectionOverlay(state: AppState): void {
  const ctx = state.overlayCtx;
  const width = state.viewport.width;
  const height = state.viewport.height;

  ctx.clearRect(0, 0, width, height);

  if (state.selectedId === 0) {
    return;
  }

  const entity = state.entities.get(state.selectedId);
  if (!entity) {
    return;
  }

  const bounds = getEntityBounds(entity);
  const sx = bounds.minX - state.viewport.x;
  const sy = bounds.minY - state.viewport.y;
  const sw = bounds.maxX - bounds.minX;
  const sh = bounds.maxY - bounds.minY;

  ctx.save();
  ctx.strokeStyle = '#1d4ed8';
  ctx.fillStyle = 'rgba(29, 78, 216, 0.08)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.setLineDash([]);
  ctx.fillRect(sx, sy, sw, sh);

  if (entity.kind === 'RECT') {
    const handleX = entity.x + entity.w;
    const handleY = entity.y + entity.h;
    ctx.beginPath();
    ctx.arc(handleX - state.viewport.x, handleY - state.viewport.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
  }

  ctx.restore();
}

function installInputHandlers(state: AppState): void {
  const canvas = state.canvas;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    const world = eventToWorld(state, event.clientX, event.clientY);
    state.mouseWorldX = world.x;
    state.mouseWorldY = world.y;

    const pick = state.engine.pickEx(world.x, world.y, PICK_TOLERANCE_PX, PICK_MASK_ALL);
    state.lastPickDistance = pick.distance;

    if (pick.id === 0) {
      state.selectedId = 0;
      state.selectedKind = 'NONE';
      state.engine.clearSelection();
      state.drag = null;
      state.needsRedraw = true;
      updateDebugPanel(state);
      return;
    }

    state.selectedId = pick.id;
    state.selectedKind = toKindLabel(pick.kind);
    setEngineSelection(state, [pick.id]);

    const entity = state.entities.get(pick.id);
    if (!entity) {
      state.drag = null;
      state.needsRedraw = true;
      updateDebugPanel(state);
      return;
    }

    let dragMode: DragState['mode'] = 'move';

    if (event.shiftKey && entity.kind === 'RECT') {
      const brX = entity.x + entity.w;
      const brY = entity.y + entity.h;
      const dist = Math.hypot(world.x - brX, world.y - brY);
      if (dist <= 14) {
        dragMode = 'resize';
      }
    }

    state.drag = {
      pointerId: event.pointerId,
      mode: dragMode,
      entityId: pick.id,
      startWorldX: world.x,
      startWorldY: world.y,
      startEntity: cloneEntity(entity),
    };

    canvas.setPointerCapture(event.pointerId);
    state.needsRedraw = true;
    updateDebugPanel(state);
  });

  canvas.addEventListener('pointermove', (event) => {
    const world = eventToWorld(state, event.clientX, event.clientY);
    state.mouseWorldX = world.x;
    state.mouseWorldY = world.y;

    if (!state.drag) {
      state.needsRedraw = true;
      updateDebugPanel(state);
      return;
    }

    if (state.drag.pointerId !== event.pointerId) {
      return;
    }

    const entity = state.entities.get(state.drag.entityId);
    if (!entity) {
      state.drag = null;
      state.needsRedraw = true;
      updateDebugPanel(state);
      return;
    }

    const dx = world.x - state.drag.startWorldX;
    const dy = world.y - state.drag.startWorldY;

    if (state.drag.mode === 'resize' && entity.kind === 'RECT' && state.drag.startEntity.kind === 'RECT') {
      const start = state.drag.startEntity;
      const centerX = start.x + start.w * 0.5;
      const centerY = start.y + start.h * 0.5;
      const newWidth = Math.max(MIN_RECT_WIDTH, start.w + dx);
      const newHeight = Math.max(MIN_RECT_HEIGHT, start.h + dy);

      state.engine.setEntitySize(entity.id, newWidth, newHeight);

      entity.w = newWidth;
      entity.h = newHeight;
      entity.x = centerX - newWidth * 0.5;
      entity.y = centerY - newHeight * 0.5;

      state.needsRedraw = true;
      updateDebugPanel(state);
      return;
    }

    if (state.drag.mode === 'move') {
      applyMoveDelta(state, entity.id, dx, dy);
      state.needsRedraw = true;
      updateDebugPanel(state);
    }
  });

  const finishPointer = (event: PointerEvent): void => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) {
      return;
    }

    state.drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    state.needsRedraw = true;
    updateDebugPanel(state);
  };

  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Delete') {
      if (state.selectedId !== 0) {
        queueCommand(state, makeDeleteCommand(state.selectedId));
        removeEntityAndMappings(state, state.selectedId);
        state.selectedId = 0;
        state.selectedKind = 'NONE';
        state.engine.clearSelection();
        state.needsRedraw = true;
        updateDebugPanel(state);
      }
      event.preventDefault();
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      rebuildScene(state);
      state.needsRedraw = true;
      updateDebugPanel(state);
      event.preventDefault();
      return;
    }

    if (state.selectedId === 0) {
      return;
    }

    if (event.key === ']') {
      reorderSelection(state, REORDER_ACTION_BRING_FORWARD);
      state.needsRedraw = true;
      updateDebugPanel(state);
      event.preventDefault();
      return;
    }

    if (event.key === '[') {
      reorderSelection(state, REORDER_ACTION_SEND_BACKWARD);
      state.needsRedraw = true;
      updateDebugPanel(state);
      event.preventDefault();
    }
  });
}

function reorderSelection(state: AppState, action: number): void {
  if (state.selectedId === 0) {
    return;
  }

  withU32Array(state, [state.selectedId], (ptr, count) => {
    state.engine.reorderEntities(ptr, count, action, 0);
  });
}

function applyMoveDelta(state: AppState, entityId: number, dx: number, dy: number): void {
  const entity = state.entities.get(entityId);
  const start = state.drag?.startEntity;

  if (!entity || !start) {
    return;
  }

  if (entity.kind === 'RECT' && start.kind === 'RECT') {
    entity.x = start.x + dx;
    entity.y = start.y + dy;
    const centerX = entity.x + entity.w * 0.5;
    const centerY = entity.y + entity.h * 0.5;
    state.engine.setEntityPosition(entity.id, centerX, centerY);
    return;
  }

  if (entity.kind === 'LINE' && start.kind === 'LINE') {
    entity.x0 = start.x0 + dx;
    entity.y0 = start.y0 + dy;
    entity.x1 = start.x1 + dx;
    entity.y1 = start.y1 + dy;
    const centerX = (entity.x0 + entity.x1) * 0.5;
    const centerY = (entity.y0 + entity.y1) * 0.5;
    state.engine.setEntityPosition(entity.id, centerX, centerY);
    return;
  }

  if (entity.kind === 'ARROW' && start.kind === 'ARROW') {
    entity.ax = start.ax + dx;
    entity.ay = start.ay + dy;
    entity.bx = start.bx + dx;
    entity.by = start.by + dy;
    const centerX = (entity.ax + entity.bx) * 0.5;
    const centerY = (entity.ay + entity.by) * 0.5;
    state.engine.setEntityPosition(entity.id, centerX, centerY);
    return;
  }

  if (entity.kind === 'TEXT' && start.kind === 'TEXT') {
    entity.x = start.x + dx;
    entity.y = start.y + dy;
    submitCommands(state, [makeUpsertTextCommand(entity)]);
  }
}

function updateDebugPanel(state: AppState): void {
  const selectedDomainKey = state.domainKeyByEntityId.get(state.selectedId) ?? '-';
  const interaction = state.drag ? (state.drag.mode === 'resize' ? 'resize' : 'move') : 'idle';

  state.debugPanel.textContent = [
    'Minimal WebGL2 + WASM Example',
    '',
    `mouse.world: (${state.mouseWorldX.toFixed(1)}, ${state.mouseWorldY.toFixed(1)})`,
    `selected.id: ${state.selectedId || '-'}`,
    `selected.kind: ${state.selectedKind}`,
    `selected.domainKey: ${selectedDomainKey}`,
    `pick.distance: ${state.lastPickDistance.toFixed(2)}`,
    `interaction: ${interaction}`,
    '',
    'Controls:',
    'click = pick/select',
    'drag = move',
    'Shift+drag (rect BR) = resize',
    '[ / ] = z-order backward/forward',
    'Delete = delete selected',
    'R = reset scene',
  ].join('\n');
}

function rebuildScene(state: AppState): void {
  state.entities.clear();
  state.domainKeyByEntityId.clear();
  state.pendingCommands = [];

  const rectUsers = createRectEntity(state, {
    x: 120,
    y: 120,
    w: 280,
    h: 176,
    fill: [0.91, 0.95, 1.0, 0.95],
    stroke: [0.14, 0.3, 0.56, 1.0],
    strokeWidthPx: 2.0,
    elevationZ: 2,
  });

  const lineUsers = createLineEntity(state, {
    x0: 120,
    y0: 164,
    x1: 400,
    y1: 164,
    color: [0.14, 0.3, 0.56, 1.0],
    strokeWidthPx: 1.5,
    elevationZ: 2,
  });

  const usersTitle = createTextEntity(state, {
    x: 136,
    y: 152,
    content: 'users',
    fontSize: 20,
    colorRGBA: 0x17324dff,
    elevationZ: 3,
  });

  const usersColumnName = createTextEntity(state, {
    x: 136,
    y: 196,
    content: 'id',
    fontSize: 15,
    colorRGBA: 0x1f2937ff,
    elevationZ: 3,
  });

  const usersColumnType = createTextEntity(state, {
    x: 250,
    y: 196,
    content: 'uuid',
    fontSize: 15,
    colorRGBA: 0x475569ff,
    elevationZ: 3,
  });

  const rectOrders = createRectEntity(state, {
    x: 300,
    y: 168,
    w: 290,
    h: 186,
    fill: [0.98, 0.92, 0.86, 0.95],
    stroke: [0.59, 0.24, 0.09, 1.0],
    strokeWidthPx: 2.0,
    elevationZ: 3,
  });

  const lineOrders = createLineEntity(state, {
    x0: 300,
    y0: 212,
    x1: 590,
    y1: 212,
    color: [0.59, 0.24, 0.09, 1.0],
    strokeWidthPx: 1.5,
    elevationZ: 3,
  });

  const ordersTitle = createTextEntity(state, {
    x: 316,
    y: 200,
    content: 'orders',
    fontSize: 20,
    colorRGBA: 0x52210fff,
    elevationZ: 4,
  });

  const ordersColumnName = createTextEntity(state, {
    x: 316,
    y: 244,
    content: 'user_id',
    fontSize: 15,
    colorRGBA: 0x1f2937ff,
    elevationZ: 4,
  });

  const ordersColumnType = createTextEntity(state, {
    x: 466,
    y: 244,
    content: 'uuid',
    fontSize: 15,
    colorRGBA: 0x475569ff,
    elevationZ: 4,
  });

  const relationArrow = createArrowEntity(state, {
    ax: 404,
    ay: 204,
    bx: 296,
    by: 252,
    head: 16,
    color: [0.1, 0.36, 0.28, 1.0],
    strokeWidthPx: 2.0,
    elevationZ: 5,
  });

  state.domainModel = {
    tables: [
      {
        id: 'table.users',
        name: 'users',
        cardEntityId: rectUsers.id,
        headerTextEntityId: usersTitle.id,
        dividerLineEntityId: lineUsers.id,
        columns: [
          {
            id: 'table.users.column.id',
            nameTextEntityId: usersColumnName.id,
            typeTextEntityId: usersColumnType.id,
          },
        ],
      },
      {
        id: 'table.orders',
        name: 'orders',
        cardEntityId: rectOrders.id,
        headerTextEntityId: ordersTitle.id,
        dividerLineEntityId: lineOrders.id,
        columns: [
          {
            id: 'table.orders.column.user_id',
            nameTextEntityId: ordersColumnName.id,
            typeTextEntityId: ordersColumnType.id,
          },
        ],
      },
    ],
    relations: [
      {
        id: 'relation.orders_user_id_to_users_id',
        fromColumnId: 'table.orders.column.user_id',
        toColumnId: 'table.users.column.id',
        arrowEntityId: relationArrow.id,
      },
    ],
  };

  for (const table of state.domainModel.tables) {
    state.domainKeyByEntityId.set(table.cardEntityId, table.id);
    state.domainKeyByEntityId.set(table.headerTextEntityId, `${table.id}.header`);
    state.domainKeyByEntityId.set(table.dividerLineEntityId, `${table.id}.divider`);
    for (const column of table.columns) {
      state.domainKeyByEntityId.set(column.nameTextEntityId, `${column.id}.name`);
      state.domainKeyByEntityId.set(column.typeTextEntityId, `${column.id}.type`);
    }
  }

  for (const relation of state.domainModel.relations) {
    state.domainKeyByEntityId.set(relation.arrowEntityId, relation.id);
  }

  queueCommand(state, makeClearCommand());
  queueCommand(state, makeSetViewScaleCommand(state.viewport));

  for (const entity of state.entities.values()) {
    queueCommand(state, makeUpsertCommand(entity));
  }

  flushPendingCommands(state);

  state.selectedId = 0;
  state.selectedKind = 'NONE';
  state.drag = null;
  state.lastPickDistance = 0;
  state.needsRedraw = true;
}

function makeUpsertCommand(entity: SceneEntity): EncodedCommand {
  switch (entity.kind) {
    case 'RECT':
      return makeUpsertRectCommand(entity);
    case 'LINE':
      return makeUpsertLineCommand(entity);
    case 'ARROW':
      return makeUpsertArrowCommand(entity);
    case 'TEXT':
      return makeUpsertTextCommand(entity);
  }
}

function createRectEntity(
  state: AppState,
  init: Omit<RectEntity, 'id' | 'kind' | 'strokeEnabled'>,
): RectEntity {
  const entity: RectEntity = {
    id: state.engine.allocateEntityId(),
    kind: 'RECT',
    strokeEnabled: 1,
    ...init,
  };
  state.entities.set(entity.id, entity);
  return entity;
}

function createLineEntity(
  state: AppState,
  init: Omit<LineEntity, 'id' | 'kind' | 'enabled'>,
): LineEntity {
  const entity: LineEntity = {
    id: state.engine.allocateEntityId(),
    kind: 'LINE',
    enabled: 1,
    ...init,
  };
  state.entities.set(entity.id, entity);
  return entity;
}

function createArrowEntity(
  state: AppState,
  init: Omit<ArrowEntity, 'id' | 'kind' | 'strokeEnabled'>,
): ArrowEntity {
  const entity: ArrowEntity = {
    id: state.engine.allocateEntityId(),
    kind: 'ARROW',
    strokeEnabled: 1,
    ...init,
  };
  state.entities.set(entity.id, entity);
  return entity;
}

function createTextEntity(
  state: AppState,
  init: Omit<TextEntity, 'id' | 'kind' | 'fontId' | 'approxWidth' | 'approxHeight'>,
): TextEntity {
  const approxWidth = estimateTextWidth(init.content, init.fontSize);
  const approxHeight = init.fontSize * 1.4;

  const entity: TextEntity = {
    id: state.engine.allocateEntityId(),
    kind: 'TEXT',
    fontId: 1,
    approxWidth,
    approxHeight,
    ...init,
  };

  state.entities.set(entity.id, entity);
  return entity;
}

function makeClearCommand(): EncodedCommand {
  return {
    op: CommandOp.ClearAll,
    id: 0,
    payload: new Uint8Array(0),
  };
}

function makeDeleteCommand(entityId: number): EncodedCommand {
  return {
    op: CommandOp.DeleteEntity,
    id: entityId,
    payload: new Uint8Array(0),
  };
}

function makeSetViewScaleCommand(view: Viewport): EncodedCommand {
  const payload = new ArrayBuffer(20);
  const viewData = new DataView(payload);
  let offset = 0;
  offset = writeF32(viewData, offset, view.x);
  offset = writeF32(viewData, offset, view.y);
  offset = writeF32(viewData, offset, view.scale);
  offset = writeF32(viewData, offset, view.width);
  writeF32(viewData, offset, view.height);

  return {
    op: CommandOp.SetViewScale,
    id: 0,
    payload: new Uint8Array(payload),
  };
}

function makeUpsertRectCommand(rect: RectEntity): EncodedCommand {
  const payload = new ArrayBuffer(60);
  const view = new DataView(payload);
  let offset = 0;

  offset = writeF32(view, offset, rect.x);
  offset = writeF32(view, offset, rect.y);
  offset = writeF32(view, offset, rect.w);
  offset = writeF32(view, offset, rect.h);

  offset = writeF32(view, offset, rect.fill[0]);
  offset = writeF32(view, offset, rect.fill[1]);
  offset = writeF32(view, offset, rect.fill[2]);
  offset = writeF32(view, offset, rect.fill[3]);

  offset = writeF32(view, offset, rect.stroke[0]);
  offset = writeF32(view, offset, rect.stroke[1]);
  offset = writeF32(view, offset, rect.stroke[2]);
  offset = writeF32(view, offset, rect.stroke[3]);

  offset = writeF32(view, offset, rect.strokeEnabled);
  offset = writeF32(view, offset, rect.strokeWidthPx);
  writeF32(view, offset, rect.elevationZ);

  return {
    op: CommandOp.UpsertRect,
    id: rect.id,
    payload: new Uint8Array(payload),
  };
}

function makeUpsertLineCommand(line: LineEntity): EncodedCommand {
  const payload = new ArrayBuffer(44);
  const view = new DataView(payload);
  let offset = 0;

  offset = writeF32(view, offset, line.x0);
  offset = writeF32(view, offset, line.y0);
  offset = writeF32(view, offset, line.x1);
  offset = writeF32(view, offset, line.y1);

  offset = writeF32(view, offset, line.color[0]);
  offset = writeF32(view, offset, line.color[1]);
  offset = writeF32(view, offset, line.color[2]);
  offset = writeF32(view, offset, line.color[3]);

  offset = writeF32(view, offset, line.enabled);
  offset = writeF32(view, offset, line.strokeWidthPx);
  writeF32(view, offset, line.elevationZ);

  return {
    op: CommandOp.UpsertLine,
    id: line.id,
    payload: new Uint8Array(payload),
  };
}

function makeUpsertArrowCommand(arrow: ArrowEntity): EncodedCommand {
  const payload = new ArrayBuffer(48);
  const view = new DataView(payload);
  let offset = 0;

  offset = writeF32(view, offset, arrow.ax);
  offset = writeF32(view, offset, arrow.ay);
  offset = writeF32(view, offset, arrow.bx);
  offset = writeF32(view, offset, arrow.by);
  offset = writeF32(view, offset, arrow.head);

  offset = writeF32(view, offset, arrow.color[0]);
  offset = writeF32(view, offset, arrow.color[1]);
  offset = writeF32(view, offset, arrow.color[2]);
  offset = writeF32(view, offset, arrow.color[3]);

  offset = writeF32(view, offset, arrow.strokeEnabled);
  offset = writeF32(view, offset, arrow.strokeWidthPx);
  writeF32(view, offset, arrow.elevationZ);

  return {
    op: CommandOp.UpsertArrow,
    id: arrow.id,
    payload: new Uint8Array(payload),
  };
}

function makeUpsertTextCommand(text: TextEntity): EncodedCommand {
  const contentBytes = textEncoder.encode(text.content);
  const runCount = 1;
  const payloadSize = 28 + runCount * 24 + contentBytes.length + 4;
  const payload = new ArrayBuffer(payloadSize);
  const view = new DataView(payload);
  const bytes = new Uint8Array(payload);

  let offset = 0;
  offset = writeF32(view, offset, text.x);
  offset = writeF32(view, offset, text.y);
  offset = writeF32(view, offset, 0); // rotation

  view.setUint8(offset, 0); // boxMode AutoWidth
  view.setUint8(offset + 1, 0); // align Left
  view.setUint8(offset + 2, 0);
  view.setUint8(offset + 3, 0);
  offset += 4;

  offset = writeF32(view, offset, 0); // constraintWidth
  offset = writeU32(view, offset, runCount);
  offset = writeU32(view, offset, contentBytes.length);

  offset = writeU32(view, offset, 0);
  offset = writeU32(view, offset, contentBytes.length);
  offset = writeU32(view, offset, text.fontId);
  offset = writeF32(view, offset, text.fontSize);
  offset = writeU32(view, offset, text.colorRGBA);

  view.setUint8(offset, 0); // style flags
  view.setUint8(offset + 1, 0);
  view.setUint8(offset + 2, 0);
  view.setUint8(offset + 3, 0);
  offset += 4;

  bytes.set(contentBytes, offset);
  offset += contentBytes.length;

  writeF32(view, offset, text.elevationZ);

  return {
    op: CommandOp.UpsertText,
    id: text.id,
    payload: bytes,
  };
}

function queueCommand(state: AppState, command: EncodedCommand): void {
  state.pendingCommands.push(command);
}

function flushPendingCommands(state: AppState): void {
  if (state.pendingCommands.length === 0) {
    return;
  }

  submitCommands(state, state.pendingCommands);
  state.pendingCommands = [];
}

function submitCommands(state: AppState, commands: readonly EncodedCommand[]): void {
  if (commands.length === 0) {
    return;
  }

  const bytes = encodeCommandBuffer(commands);
  const ptr = state.engine.allocBytes(bytes.byteLength);
  if (ptr === 0) {
    throw new Error('allocBytes failed for command buffer');
  }

  try {
    state.module.HEAPU8.set(bytes, ptr);
    state.engine.applyCommandBuffer(ptr, bytes.byteLength);
  } finally {
    state.engine.freeBytes(ptr);
  }
}

function encodeCommandBuffer(commands: readonly EncodedCommand[]): Uint8Array {
  const totalPayloadBytes = commands.reduce((sum, cmd) => sum + cmd.payload.byteLength, 0);
  const totalBytes = 16 + commands.length * 16 + totalPayloadBytes;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  offset = writeU32(view, offset, COMMAND_BUFFER_MAGIC);
  offset = writeU32(view, offset, COMMAND_VERSION);
  offset = writeU32(view, offset, commands.length);
  offset = writeU32(view, offset, 0);

  for (const cmd of commands) {
    offset = writeU32(view, offset, cmd.op);
    offset = writeU32(view, offset, cmd.id);
    offset = writeU32(view, offset, cmd.payload.byteLength);
    offset = writeU32(view, offset, 0);

    bytes.set(cmd.payload, offset);
    offset += cmd.payload.byteLength;
  }

  return bytes;
}

function setEngineSelection(state: AppState, ids: number[]): void {
  withU32Array(state, ids, (ptr, count) => {
    state.engine.setSelection(ptr, count, SELECTION_MODE_REPLACE);
  });
}

function withU32Array(
  state: AppState,
  values: number[],
  callback: (ptr: number, count: number) => void,
): void {
  if (values.length === 0) {
    callback(0, 0);
    return;
  }

  const byteLength = values.length * 4;
  const ptr = state.engine.allocBytes(byteLength);
  if (ptr === 0) {
    throw new Error('allocBytes failed for u32 array');
  }

  try {
    state.module.HEAPU32.set(values, ptr >>> 2);
    callback(ptr, values.length);
  } finally {
    state.engine.freeBytes(ptr);
  }
}

function removeEntityAndMappings(state: AppState, entityId: number): void {
  state.entities.delete(entityId);
  state.domainKeyByEntityId.delete(entityId);

  for (const table of state.domainModel.tables) {
    table.columns = table.columns.filter((column) => {
      return column.nameTextEntityId !== entityId && column.typeTextEntityId !== entityId;
    });
  }

  state.domainModel.relations = state.domainModel.relations.filter((rel) => rel.arrowEntityId !== entityId);
}

function estimateTextWidth(content: string, fontSize: number): number {
  return Math.max(40, content.length * fontSize * 0.58);
}

function getEntityBounds(entity: SceneEntity): { minX: number; minY: number; maxX: number; maxY: number } {
  switch (entity.kind) {
    case 'RECT':
      return {
        minX: entity.x,
        minY: entity.y,
        maxX: entity.x + entity.w,
        maxY: entity.y + entity.h,
      };
    case 'LINE': {
      const minX = Math.min(entity.x0, entity.x1);
      const minY = Math.min(entity.y0, entity.y1);
      const maxX = Math.max(entity.x0, entity.x1);
      const maxY = Math.max(entity.y0, entity.y1);
      return {
        minX: minX - 6,
        minY: minY - 6,
        maxX: maxX + 6,
        maxY: maxY + 6,
      };
    }
    case 'ARROW': {
      const minX = Math.min(entity.ax, entity.bx);
      const minY = Math.min(entity.ay, entity.by);
      const maxX = Math.max(entity.ax, entity.bx);
      const maxY = Math.max(entity.ay, entity.by);
      return {
        minX: minX - entity.head,
        minY: minY - entity.head,
        maxX: maxX + entity.head,
        maxY: maxY + entity.head,
      };
    }
    case 'TEXT':
      return {
        minX: entity.x,
        minY: entity.y - entity.approxHeight,
        maxX: entity.x + entity.approxWidth,
        maxY: entity.y + entity.approxHeight * 0.2,
      };
  }
}

function eventToWorld(state: AppState, clientX: number, clientY: number): { x: number; y: number } {
  const rect = state.canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;

  return {
    x: state.viewport.x + localX,
    y: state.viewport.y + localY,
  };
}

function toKindLabel(pickKind: number): KindLabel | 'NONE' {
  switch (pickKind) {
    case 1:
      return 'RECT';
    case 3:
      return 'LINE';
    case 6:
      return 'ARROW';
    case 7:
      return 'TEXT';
    default:
      return 'NONE';
  }
}

function cloneEntity(entity: SceneEntity): SceneEntity {
  return JSON.parse(JSON.stringify(entity)) as SceneEntity;
}

function readF32(module: EngineModule, ptr: number, floatCount: number): Float32Array {
  if (ptr === 0 || floatCount === 0) {
    return new Float32Array(0);
  }

  const start = ptr >>> 2;
  return module.HEAPF32.subarray(start, start + floatCount);
}

function readU8(module: EngineModule, ptr: number, byteCount: number): Uint8Array {
  if (ptr === 0 || byteCount === 0) {
    return new Uint8Array(0);
  }

  return module.HEAPU8.subarray(ptr, ptr + byteCount);
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element as T;
}

function ensureBuffer(buffer: WebGLBuffer | null, label: string): WebGLBuffer {
  if (!buffer) {
    throw new Error(`Failed to create ${label}`);
  }
  return buffer;
}

function ensureVao(vao: WebGLVertexArrayObject | null, label: string): WebGLVertexArrayObject {
  if (!vao) {
    throw new Error(`Failed to create ${label}`);
  }
  return vao;
}

function ensureTexture(texture: WebGLTexture | null, label: string): WebGLTexture {
  if (!texture) {
    throw new Error(`Failed to create ${label}`);
  }
  return texture;
}

function ensureUniform(location: WebGLUniformLocation | null, label: string): WebGLUniformLocation {
  if (!location) {
    throw new Error(`Missing uniform ${label}`);
  }
  return location;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create WebGL program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!linked) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown link error';
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(`Program link failed: ${log}`);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!compiled) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown compile error';
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${log}`);
  }

  return shader;
}

function writeU32(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value >>> 0, true);
  return offset + 4;
}

function writeF32(view: DataView, offset: number, value: number): number {
  view.setFloat32(offset, value, true);
  return offset + 4;
}

const SHAPE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

uniform vec2 u_viewOrigin;
uniform vec2 u_viewSize;

out vec4 v_color;

void main() {
  vec2 normalized = (a_position.xy - u_viewOrigin) / u_viewSize;
  float clipX = normalized.x * 2.0 - 1.0;
  float clipY = 1.0 - normalized.y * 2.0;
  gl_Position = vec4(clipX, clipY, a_position.z, 1.0);
  v_color = a_color;
}
`;

const SHAPE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

const TEXT_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;

uniform vec2 u_viewOrigin;
uniform vec2 u_viewSize;

out vec2 v_uv;
out vec4 v_color;

void main() {
  vec2 normalized = (a_position.xy - u_viewOrigin) / u_viewSize;
  float clipX = normalized.x * 2.0 - 1.0;
  float clipY = 1.0 - normalized.y * 2.0;
  gl_Position = vec4(clipX, clipY, a_position.z, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const TEXT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

uniform sampler2D u_atlas;
out vec4 fragColor;

float median(float a, float b, float c) {
  return max(min(a, b), min(max(a, b), c));
}

void main() {
  vec3 sampleMsdf = texture(u_atlas, v_uv).rgb;
  float sd = median(sampleMsdf.r, sampleMsdf.g, sampleMsdf.b) - 0.5;
  float width = max(fwidth(sd), 0.0001);
  float alpha = clamp(sd / width + 0.5, 0.0, 1.0);
  fragColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;
