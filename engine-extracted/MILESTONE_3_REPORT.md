# Milestone 3 Report

## Scope

Milestone 3 was implemented inside `engine-extracted/` only.

## Added/Updated

### Example app

- `engine-extracted/examples/minimal-webgl2/index.html`
- `engine-extracted/examples/minimal-webgl2/src/main.ts`
- `engine-extracted/examples/minimal-webgl2/src/style.css`
- `engine-extracted/examples/minimal-webgl2/package.json`
- `engine-extracted/examples/minimal-webgl2/package-lock.json`
- `engine-extracted/examples/minimal-webgl2/tsconfig.json`
- `engine-extracted/examples/minimal-webgl2/vite.config.ts`
- `engine-extracted/examples/minimal-webgl2/scripts/sync-wasm.mjs`
- `engine-extracted/examples/minimal-webgl2/README.md`
- `engine-extracted/examples/minimal-webgl2/public/fonts/OpenSans-Regular.ttf`
- `engine-extracted/examples/minimal-webgl2/public/wasm/.gitignore`
- `engine-extracted/examples/minimal-webgl2/public/wasm/.gitkeep`

### Integration docs

- `engine-extracted/docs/INTEGRATION.md`

## Behavior implemented

- Explicit WASM loading from static assets (`/wasm/engine.js`, `/wasm/engine.wasm`) with runtime dynamic import + explicit wasm fetch.
- WebGL2 renderer with three passes:
  - shape triangles (`getPositionBufferMeta`)
  - line pass (`getLineBufferMeta`)
  - text MSDF pass (`rebuildTextQuadBuffer`, `getTextQuadBufferMeta`, atlas upload via `getAtlasTextureMeta`)
- Deterministic startup scene:
  - overlapping table cards (rectangles)
  - divider lines
  - relation arrow
  - multiple text labels
- Picking + selection (`pickEx`) and debug panel output.
- Move drag (rect/line/arrow; text via upsert command refresh).
- Simple resize (`Shift + drag` on selected rect bottom-right handle).
- Z-order keybinds:
  - `[` -> `SendBackward`
  - `]` -> `BringForward`
- Delete selected (`Delete`) and reset scene (`R`).
- Command batching implemented for cold-path updates (scene build/reset/delete/view sync).

## Commands executed and results

From repository root:

1. Native build:

```bash
bash engine-extracted/scripts/build_native.sh
```

Result: **PASS** (build completed; warnings only).

2. WASM build via direct script:

```bash
bash engine-extracted/scripts/build_wasm.sh
```

Result: `emcmake not found` in current shell.

3. WASM build via documented Docker fallback:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/engine-extracted:/workspace" -w /workspace emscripten/emsdk:3.1.51 \
  bash -lc "emcmake cmake -S . -B build-wasm -DOUTPUT_DIR=dist/wasm && cmake --build build-wasm -j$(nproc)"
```

Result: **PASS** (`dist/wasm/engine.js` + `dist/wasm/engine.wasm` built).

From `engine-extracted/examples/minimal-webgl2`:

4. Install dependencies:

```bash
npm install
```

Result: **PASS**.

5. Example production build:

```bash
npm run build
```

Result: **PASS** (`sync:wasm` executed, Vite build successful).

6. Type check:

```bash
npm run check
```

Result: **PASS**.

## Manual validation

Manual browser interaction was not executed in this CLI-only run.

What is implemented and ready to verify interactively (per README controls):

- load + render scene (rect/line/arrow/text)
- click selection + debug panel
- drag move
- shift-resize rect
- z-order with `[` and `]`
- delete + reset

## Changes outside `engine-extracted/`

None.
