---
description: Layer system architecture (ByLayer) and styles.
---

# Layer system architecture

This document summarizes the style resolution rules used by the CAD editor.

## Source of truth

- `Layer`: defines default style, visibility, and locking.
- `Shape`: references `layerId` and may inherit style via `colorMode`.

Relevant files:

- `frontend/types/index.ts`
- `frontend/utils/shapeColors.ts`

## Rules

1) Every element belongs to a layer (`shape.layerId`).
2) Effective style is resolved by:
   - the layer (when `colorMode.* === 'layer'`)
   - the shape (when `colorMode.* === 'custom'`)
3) Visibility/locking always respect the layer:
   - invisible layer -> do not render
   - locked layer -> do not edit/select (tool-dependent)

## UI intent

- Changing a shape color switches mode to `custom`.
- "Apply Layer" resets mode to `layer`.

## Note for WebGL/WASM migration

- Keep style resolution deterministic and data-driven.
- For performance, consider a numeric style table (e.g. `styleId`) instead of per-entity strings.
