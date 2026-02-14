# Milestone 1 Report — Engine Extraction

## Scope completed

Milestone 1 extracted the current engine into `engine-extracted/` and made its build standalone for native and WASM outputs without app-path defaults.

## What was extracted

From `packages/engine` into `engine-extracted`:

- Core C++ engine sources:
  - `engine.cpp` -> `src/engine.cpp`
  - `engine/**` -> `src/engine/**` (except bindings)
- WASM bindings:
  - `engine/bindings.cpp` -> `bindings/bindings.cpp`
- Native tests:
  - `tests/**` -> `tests/**`
- Local text config:
  - `msdfgen_config/**` -> `src/msdfgen_config/**`
- Public header mirror:
  - `include/engine/engine.h`
  - `include/engine/engine_protocol_types.h`
  - `include/engine/plugin/engine_plugin_api.h`
  - `include/engine/domain/domain_extension.h`

Added extraction-specific assets:

- `CMakeLists.txt` (standalone)
- `scripts/build_native.sh`
- `scripts/build_wasm.sh`
- `docs/BUILD.md`
- `README.md`

## Standalone build changes made

- Rebased build paths to extracted layout (`src/`, `bindings/`).
- Removed hardcoded WASM default output coupling to `apps/web/public/wasm`.
- Default WASM output is now `engine-extracted/dist/wasm`.
- Added `OUTPUT_DIR` override support in extracted CMake.
- Kept dependency strategy unchanged (`FetchContent`), preserving behavior/features.

## Remaining coupling (if any)

No runtime coupling to `apps/web` remains.

Build-time dependencies still required:

- Internet access for first `FetchContent` dependency pulls (FreeType, HarfBuzz, msdfgen, GoogleTest), or
- local mirrors/source overrides for offline builds.
- Emscripten toolchain (`emcmake`) for direct WASM builds.

These are expected toolchain/dependency requirements, not app-path coupling.

## Verification commands and results

### Native configure/build

Direct configure command (expected in normal online environments):

```bash
cmake -S engine-extracted -B engine-extracted/build
```

Result in this environment: failed due DNS/network restriction resolving GitHub during `FetchContent`.

Fallback configure used (passed) with local source overrides:

```bash
cmake -S engine-extracted -B engine-extracted/build \
  -DFETCHCONTENT_SOURCE_DIR_FREETYPE=$PWD/packages/engine/build_native/_deps/freetype-src \
  -DFETCHCONTENT_SOURCE_DIR_HARFBUZZ=$PWD/packages/engine/build_native/_deps/harfbuzz-src \
  -DFETCHCONTENT_SOURCE_DIR_MSDFGEN=$PWD/packages/engine/build_native/_deps/msdfgen-src \
  -DFETCHCONTENT_SOURCE_DIR_GOOGLETEST=$PWD/packages/engine/build_native/_deps/googletest-src
```

Build command (passed):

```bash
cmake --build engine-extracted/build -j$(nproc)
```

CTest command executed:

```bash
ctest --test-dir engine-extracted/build --output-on-failure
```

Result: 8 failing tests out of 234.

These failures were cross-checked against rebuilt original `packages/engine/build_native` and match existing baseline behavior for the same failing cases.

### WASM configure/build

Requested direct command:

```bash
emcmake cmake -S engine-extracted -B engine-extracted/build-wasm -DOUTPUT_DIR=engine-extracted/dist/wasm
```

Result in this environment: `emcmake` not installed locally.

Containerized Emscripten fallback (passed):

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/engine-extracted:/workspace" -w /workspace emscripten/emsdk:3.1.51 \
  bash -lc "emcmake cmake -S . -B build-wasm -DOUTPUT_DIR=dist/wasm && cmake --build build-wasm -j$(nproc)"
```

Produced artifacts:

- `engine-extracted/dist/wasm/engine.js`
- `engine-extracted/dist/wasm/engine.wasm`

## Changes outside `engine-extracted/`

None.
