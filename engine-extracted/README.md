# Engine Extracted (Milestone 1)

This folder is a standalone extraction of the C++ engine from `packages/engine`, prepared to build native and WASM without depending on `apps/web` paths.

## Recon findings (source/build roots)

- Original engine root: `packages/engine`
- Original build entrypoint: `packages/engine/CMakeLists.txt`
- Core translation unit: `packages/engine/engine.cpp`
- Engine modules: `packages/engine/engine/**`
- WASM bindings: `packages/engine/engine/bindings.cpp`
- Native tests: `packages/engine/tests/**`
- Local config used by text pipeline: `packages/engine/msdfgen_config/**`
- Existing coupling removed in this milestone: default WASM output to `apps/web/public/wasm`

## What Milestone 1 does

- Creates a copy under `engine-extracted/` with normalized top-level layout (`src`, `include`, `bindings`, `scripts`, `docs`).
- Preserves current engine features and behavior (no feature/API cuts).
- Makes WASM output default to `engine-extracted/dist/wasm`.
- Adds `OUTPUT_DIR` override for custom artifact location.
- Keeps dependency approach as-is (`FetchContent`) for reproducible source-pinned builds.

See `docs/BUILD.md` for build instructions and `MILESTONE_1_REPORT.md` for execution details.
