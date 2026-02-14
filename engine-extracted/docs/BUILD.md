# Build Guide

## Build profiles

- Default: `ENGINE_PROFILE_MINIMAL_2D=ON`
- Minimal profile keeps: Rect/Line/Arrow/Text, pick, move/resize, `elevationZ` ordering, snapshot, undo/redo.
- Minimal profile disables: WebGPU, polyline/circle/polygon, draft, rotate, vertex/edge edit, in-canvas text editing commands.

Optional full profile (if needed):

```bash
cmake -S engine-extracted -B engine-extracted/build-full -DENGINE_PROFILE_MINIMAL_2D=OFF
cmake --build engine-extracted/build-full
```

## Prerequisites

- CMake >= 3.20
- C++20 compiler toolchain
- For WASM: Emscripten SDK (`emcmake` in `PATH`) or Docker
- First configure fetches FreeType/HarfBuzz/msdfgen/GoogleTest with `FetchContent`

## Native build

```bash
cmake -S engine-extracted -B engine-extracted/build
cmake --build engine-extracted/build
ctest --test-dir engine-extracted/build --output-on-failure
```

Helper script:

```bash
./engine-extracted/scripts/build_native.sh
RUN_TESTS=1 ./engine-extracted/scripts/build_native.sh
```

## WASM build

```bash
emcmake cmake -S engine-extracted -B engine-extracted/build-wasm -DOUTPUT_DIR=engine-extracted/dist/wasm
cmake --build engine-extracted/build-wasm
```

Docker fallback:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/engine-extracted:/workspace" -w /workspace emscripten/emsdk:3.1.51 \
  bash -lc "emcmake cmake -S . -B build-wasm -DOUTPUT_DIR=dist/wasm && cmake --build build-wasm -j$(nproc)"
```

Helper script:

```bash
./engine-extracted/scripts/build_wasm.sh
```

## Artifacts

Default:

- `engine-extracted/dist/wasm/engine.js`
- `engine-extracted/dist/wasm/engine.wasm`

Override:

```bash
emcmake cmake -S engine-extracted -B engine-extracted/build-wasm -DOUTPUT_DIR=/absolute/path/to/output
cmake --build engine-extracted/build-wasm
```

## Troubleshooting

- `emcmake` missing: activate emsdk (`source /path/to/emsdk/emsdk_env.sh`)
- `FetchContent` download failures: ensure network access or provide `FETCHCONTENT_SOURCE_DIR_*` overrides
- WebGPU is intentionally disabled (`ENGINE_FEATURE_WEBGPU=OFF`)
