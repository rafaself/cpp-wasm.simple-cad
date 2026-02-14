# Frontend ↔ Engine Integration Contract (Minimal 2D)

This document defines the integration contract for `engine-extracted/` with `ENGINE_PROFILE_MINIMAL_2D=ON`.

## 1) Initialization

Expected static assets:

- `dist/wasm/engine.js`
- `dist/wasm/engine.wasm`

Recommended browser bootstrap (explicit, no hidden bundler behavior):

1. Import `engine.js` dynamically.
2. Fetch `engine.wasm` from a known static URL.
3. Pass `wasmBinary` + `locateFile` to the factory.
4. Create `new CadEngine()` once.

Example pattern:

```ts
const moduleUrl = '/wasm/engine.js';
const wasmUrl = '/wasm/engine.wasm';
const wasmBinary = await fetch(wasmUrl).then((r) => r.arrayBuffer());
const { default: createModule } = await import(/* @vite-ignore */ moduleUrl);
const module = await createModule({
  wasmBinary,
  locateFile: (path: string) => (path === 'engine.wasm' ? wasmUrl : `/wasm/${path}`),
});
const engine = new module.CadEngine();
```

Text pipeline setup:

1. `engine.initializeTextSystem()`
2. Load font bytes in JS
3. Allocate engine memory (`allocBytes`), copy bytes into `HEAPU8`, call `loadFont(fontId, ptr, size)`, then `freeBytes(ptr)`

## 2) Command Submission (Batch Contract)

### Binary protocol framing (EWDC v4)

- Header (16 bytes):
  - `magic` (`0x43445745`, "EWDC")
  - `version` (`4`)
  - `commandCount`
  - `reserved`
- Per command header (16 bytes):
  - `op`
  - `id`
  - `payloadByteCount`
  - `reserved`
- Followed by payload bytes.

### Submission flow

1. Encode one batch (`Uint8Array`) with N commands.
2. `ptr = engine.allocBytes(batch.byteLength)`
3. `module.HEAPU8.set(batch, ptr)`
4. `engine.applyCommandBuffer(ptr, batch.byteLength)`
5. `engine.freeBytes(ptr)`

### Batching rule

- Cold path (scene build/reset/delete/commit updates): **batch commands**.
- Hot path (pointermove transform): use **direct APIs** (`setEntityPosition`, `setEntitySize`, or transform session APIs).

## 3) Render Buffer Consumption

### Geometry buffers

- `getPositionBufferMeta()` => triangles
- `getLineBufferMeta()` => lines

`BufferMeta` fields:

- `generation`, `vertexCount`, `floatCount`, `ptr`

Layout:

- Geometry/line vertex stride: **7 floats**
- Format: `x, y, z, r, g, b, a`

Read from WASM memory:

```ts
const f32 = module.HEAPF32.subarray(ptr >> 2, (ptr >> 2) + floatCount);
```

### Text buffers

- `isTextQuadsDirty()` => if true, call `rebuildTextQuadBuffer()`
- `getTextQuadBufferMeta()` => quad triangles
- `getAtlasTextureMeta()` => atlas texture bytes
- `isAtlasDirty()` / `clearAtlasDirty()` => texture upload gate

Text vertex layout:

- Stride: **9 floats**
- Format: `x, y, z, u, v, r, g, b, a`

Atlas texture layout:

- RGBA8 bytes (MSDF in RGB; alpha channel present)

Recommended draw order in WebGL2:

1. Shape triangles
2. Line pass
3. Text quads + atlas sampling (MSDF fragment shader)

## 4) Picking + Selection Contract

### Picking

Use:

- `pick(x, y, tolerance)` for id-only
- `pickEx(x, y, tolerance, pickMask)` for rich result (`id`, `kind`, `subTarget`, `distance`, `hitX`, `hitY`)

Coordinates:

- Pass world coordinates consistent with your projection/view contract.
- Keep engine view synchronized (`SetViewScale`) so tolerance remains coherent.

### Selection

- For replace selection:
  1. allocate temporary `u32[]` in WASM
  2. call `setSelection(idsPtr, idCount, mode)` with mode `Replace=0`
  3. free temporary memory
- Empty click: `clearSelection()`

## 5) Move / Resize Contract

Recommended pattern:

- Move:
  - pointerdown pick/select
  - pointermove -> direct `setEntityPosition(entityId, centerX, centerY)`
- Resize (rect-like):
  - pointermove -> direct `setEntitySize(entityId, width, height)`

For advanced editing tools, use transform sessions (`beginTransform/updateTransform/commitTransform`) when needed.

## 6) Z-Order Contract (`elevationZ` / ordering)

Stable ordering in minimal profile is deterministic and respects `elevationZ` semantics plus deterministic tie-breakers.

Practical integration API for user actions:

- `reorderEntities(idsPtr, idCount, action, refId)`
- Actions:
  - `BringToFront=1`
  - `SendToBack=2`
  - `BringForward=3`
  - `SendBackward=4`

Use keybindings like `[` / `]` to trigger reorder commands.

## 7) Snapshot + Fail-Fast Expectations

Available APIs:

- `saveSnapshot()`
- `loadSnapshotFromPtr(ptr, byteCount)`
- `getSnapshotBufferMeta()` / `getFullSnapshotMeta()`

Contract:

- Snapshot protocol/version mismatches are fail-fast at engine parsing time.
- Frontend integration should treat load failures as terminal for that payload and request a valid snapshot.

## 8) JSON Domain Model Sync Strategy

Use JSON domain state as business truth (example: tables/columns/relations), and map to engine entity IDs.

Recommended mapping table:

- `domainTableId -> rectEntityId`
- `domainColumnId -> textEntityId` (name/type rows)
- `domainRelationId -> arrowEntityId`

Maintain both directions:

- domain→engine for command targeting
- engine→domain for pick resolution (`entityId` from `pickEx` to domain key)

Update pattern:

1. Apply domain transaction in JS (immutable or mutable store).
2. Build one command batch reflecting resulting visual state.
3. Submit to engine.
4. On pick/select, resolve domain object via reverse mapping.

## 9) Minimal Event Loop (Recommended)

1. Collect user intent.
2. Queue cold-path commands (batch).
3. Flush batch once per frame (or transaction boundary).
4. For hot drag updates use direct APIs.
5. If text dirty, rebuild text quads.
6. Pull buffer metas; upload GPU buffers only on generation/dirty changes.
7. Draw WebGL2 passes.

This keeps integration deterministic and avoids unnecessary per-frame command serialization.
