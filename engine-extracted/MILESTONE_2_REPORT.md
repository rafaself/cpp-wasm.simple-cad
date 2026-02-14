# Milestone 2 Report

## Scope executed

Implemented Milestone 2 inside `engine-extracted/` only:

- WebGL2-only profile (WebGPU disabled)
- Minimal 2D profile as default (`ENGINE_PROFILE_MINIMAL_2D=ON`)
- Reduced exported WASM API surface for minimal profile
- Fail-fast handling for unsupported command ops
- Stable ordering with `elevationZ` + deterministic tie-breakers
- Minimal-profile native tests aligned and passing

## Removed / disabled in minimal profile

- WebGPU build/backend flag: `ENGINE_FEATURE_WEBGPU=OFF`
- Advanced shapes command ops:
  - `UpsertPolyline`
  - `UpsertCircle`
  - `UpsertPolygon`
- Draft command ops:
  - `BeginDraft`
  - `UpdateDraft`
  - `AppendDraftPoint`
  - `CommitDraft`
  - `CancelDraft`
- Rotate transform mode
- Vertex/edge drag transform modes
- In-canvas text editing command ops:
  - `SetTextCaret`
  - `SetTextSelection`
  - `InsertTextContent`
  - `DeleteTextContent`
  - `ReplaceTextContent`
  - `ApplyTextStyle`

## New build flags / profile controls

Added in `engine-extracted/CMakeLists.txt`:

- `ENGINE_PROFILE_MINIMAL_2D` (default `ON`)
- `ENGINE_FEATURE_WEBGPU`
- `ENGINE_FEATURE_POLYLINE`
- `ENGINE_FEATURE_CIRCLE`
- `ENGINE_FEATURE_POLYGON`
- `ENGINE_FEATURE_DRAFT`
- `ENGINE_FEATURE_ROTATE`
- `ENGINE_FEATURE_VERTEX_EDIT`
- `ENGINE_FEATURE_TEXT_EDITING`

When `ENGINE_PROFILE_MINIMAL_2D=ON`, excluded features are forced OFF.

## Build and test commands run

### Baseline verification (Step 0)

- Failed in this environment (network-restricted / missing emsdk in PATH):
  - `bash engine-extracted/scripts/build_native.sh`
  - `bash engine-extracted/scripts/build_wasm.sh`

### Native (passed)

```bash
cmake -S engine-extracted -B engine-extracted/build-m2-native -DCMAKE_BUILD_TYPE=Release \
  -DFETCHCONTENT_SOURCE_DIR_FREETYPE=$PWD/packages/engine/build_native/_deps/freetype-src \
  -DFETCHCONTENT_SOURCE_DIR_HARFBUZZ=$PWD/packages/engine/build_native/_deps/harfbuzz-src \
  -DFETCHCONTENT_SOURCE_DIR_MSDFGEN=$PWD/packages/engine/build_native/_deps/msdfgen-src \
  -DFETCHCONTENT_SOURCE_DIR_GOOGLETEST=$PWD/packages/engine/build_native/_deps/googletest-src
cmake --build engine-extracted/build-m2-native -j$(nproc)
ctest --test-dir engine-extracted/build-m2-native --output-on-failure
```

Result: `100% tests passed (18/18)` for minimal-profile test set.

### WASM (passed)

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/engine-extracted:/workspace" -w /workspace emscripten/emsdk:3.1.51 \
  bash -lc "emcmake cmake -S . -B build-m2-wasm -DOUTPUT_DIR=dist/wasm && cmake --build build-m2-wasm -j$(nproc)"
```

Artifacts produced:

- `engine-extracted/dist/wasm/engine.js`
- `engine-extracted/dist/wasm/engine.wasm`

## Remaining non-minimal code (intentional for low churn)

- Some advanced-shape/rotate/draft logic remains in shared core files and data types to avoid broad architectural churn in this milestone.
- Those paths are compile-time disabled or unreachable in the default minimal profile via:
  - CMake feature forcing
  - source list gating (rotate/draft implementation units replaced by stubs)
  - command dispatch fail-fast
  - bindings surface reduction
  - snapshot load rejection for unsupported entity types

## Changes outside `engine-extracted/`

- None.
