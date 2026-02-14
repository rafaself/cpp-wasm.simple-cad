# Minimal WebGL2 Example

This example is a framework-free web integration for the extracted WASM engine.
It renders a deterministic 2D scene (Rect, Line, Arrow, Text), supports picking/selection, move/resize, and z-order changes.

## Prerequisites

- Engine WASM artifacts available at `engine-extracted/dist/wasm/engine.js` and `engine-extracted/dist/wasm/engine.wasm`
- Node.js 18+

Build WASM artifacts first (from repository root):

```bash
bash engine-extracted/scripts/build_wasm.sh
```

If `emcmake` is not available locally, use the Docker fallback:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/engine-extracted:/workspace" -w /workspace emscripten/emsdk:3.1.51 \
  bash -lc "emcmake cmake -S . -B build-wasm -DOUTPUT_DIR=dist/wasm && cmake --build build-wasm -j$(nproc)"
```

## Run (dev)

```bash
cd engine-extracted/examples/minimal-webgl2
npm install
npm run dev
```

`npm run dev` automatically syncs `engine-extracted/dist/wasm/*` into `examples/minimal-webgl2/public/wasm/*`.

## Build + preview

```bash
cd engine-extracted/examples/minimal-webgl2
npm run build
npm run preview
```

## Controls

- `click`: pick/select
- `drag`: move selected entity
- `Shift + drag` (bottom-right handle on selected rect): resize
- `[` / `]`: send backward / bring forward
- `Delete`: delete selected entity
- `R`: reset scene

## Notes

- WASM loading is explicit: `main.ts` fetches `/wasm/engine.wasm` directly and passes it to the Emscripten module factory.
- The example uses command batching for cold-path updates (scene reset/build, delete, view sync).
- Interactive movement uses direct engine APIs on the hot path.
