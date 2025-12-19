# Verification Fixtures

This folder contains **test fixtures** used by automated verification tests.

## DXF fixtures

### `color-schemes-test.dxf`

Used by: `frontend/features/import/utils/dxf/dxfColorScheme.test.ts`

Purpose:

- Provides a minimal DXF with multiple layers and multiple entity types so we can validate the **color scheme matrix** across both import modes:
  - Shapes import: `convertDxfToShapes()`
  - SVG import: `dxfToSvg()`

Contents (minimal coverage, not exhaustive):

- Multiple layers (at least one with a known base color)
- A basic LINE
- A basic CIRCLE
- A basic TEXT

If you add new DXF fixtures, keep them:

- Small (fast to parse)
- Deterministic (no timestamps/metadata dependencies)
- Focused on a single feature/regression

## World snapshot fixtures

### `world-snapshot-v2-min.json`

Used by: `frontend/tests/worldSnapshot.test.ts` (as a reference sample; the test itself encodes/decodes bytes)

Purpose:

- Documents the **shape subset** carried by snapshot `v2` (rect/line/polyline) without SVG/text payloads.
- Serves as a stable example for debugging import/export and migrators.

Note:

- `world-snapshot-v1-min.json` may still exist in some working copies due to Windows/OneDrive file permission quirks; treat it as deprecated.

## Benchmarks (deterministic scripts)

### `benchmark_world_snapshot.mjs`

Purpose:

- Measures the TS-side cost of building and encoding/decoding `WorldSnapshotV2` for large N.

Usage:

- `node frontend/verification/benchmark_world_snapshot.mjs 10000`
- `node frontend/verification/benchmark_world_snapshot.mjs 100000`
