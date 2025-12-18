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

