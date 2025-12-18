# DXF Conversion Testing (Frontend)

This folder contains the DXF conversion pipeline used by the import feature and its test suite.

## Goals (what we guarantee)

The tests here exist to ensure that:

- `convertDxfToShapes()` produces a valid, serializable set of `Shape` objects for the canvas model.
- `dxfToSvg()` produces a valid SVG string for “editable SVG import” that preserves layer grouping and basic styling.
- Common DXF features we support (LINE/CIRCLE/ARC/LWPOLYLINE/SPLINE/TEXT/MTEXT/INSERT) do not regress.
- Import safety constraints (entity limits, circular blocks) continue to work.
- Color scheme selection is applied consistently across import modes.

## What tests should (and should not) assert

Prefer asserting *invariants* over implementation details:

- ✅ Assert: output contains expected entity types, non-empty points, reasonable bounds, and required attributes.
- ✅ Assert: important style contracts (ByLayer/ByBlock resolution, color scheme mapping, linetype dash presence).
- ✅ Assert: normalization invariants (origin is shifted to zero-based coordinates for shapes import).
- ❌ Avoid: relying on the order of `result.shapes` unless order is a documented contract.
- ❌ Avoid: asserting exact SVG `viewBox` strings (padding/rounding are allowed to change).
- ❌ Avoid: asserting exact tessellation point-by-point; use bounds/point-count invariants.

## Test categories in this repo

- **Unit / Contract tests**: small synthetic `DxfData` objects that validate one behavior at a time.
  - Examples: `dxfToShapes.test.ts`, `dxfSpaceFilter.test.ts`, `dxfToSvg.test.ts`
- **Fixture-based matrix tests**: use a real `.dxf` file in `frontend/verification/` to validate end-to-end properties.
  - Example: `dxfColorScheme.test.ts`
- **Smoke / “fidelity” tests**: ensure that supported entities render without breaking (not pixel-perfect).
  - Example: `dxfToSvg.fidelity.test.ts`

## Fixtures

DXF fixtures live in `frontend/verification/`. See `frontend/verification/README.md`.

## Running the tests

From `frontend/`:

- `npx vitest run`

Note: if Vitest fails with a Windows `esbuild` spawn `EPERM` error while loading `vite.config.ts`, it’s usually caused by filesystem restrictions (e.g., OneDrive/Defender/Controlled Folder Access). In that case, move the repo out of OneDrive-controlled folders or allowlist the toolchain executables and re-run.

