# Report 18 — AutoCAD-style marquee selection (window vs crossing)

## Problem

The "select" tool only supported point-pick. For CAD workflows, users expect AutoCAD-style marquee selection:

- Drag **left → right**: **WINDOW** selection (only objects fully inside the rectangle).
- Drag **right → left**: **CROSSING** selection (objects intersecting the rectangle).

## Plan / Approach

1. Implement a drag-threshold-based selection rectangle in the interactive pointer layer (above the WebGL canvas).
2. Decide selection mode using drag direction (client X delta).
3. Query the spatial index using the rectangle bounds and filter candidates by:
   - layer visibility/lock
   - domain visibility rules (`isShapeInteractable`)
   - geometry predicate (`isShapeInSelection(shape, rect, mode)`)
4. Render a lightweight SVG marquee overlay with distinct visuals per mode.

## Changes

- `frontend/src/components/EngineInteractionLayer.tsx`
  - Adds `SelectionBox` state, updates pointer move/up handling for marquee selection in `activeTool === 'select'`.
  - Uses **WINDOW**/**CROSSING** behavior based on drag direction.
  - Draws the marquee overlay in screen space (SVG), using blue (window) and green (crossing).

## Risk assessment

- Low/medium: event handling runs in the same pointer layer used for other tools; regressions would show up as broken selection/pan behavior.
- The implementation intentionally selects on mouse-up (not live while dragging), which avoids expensive per-frame selection churn but differs from some CAD apps that live-preview the selection set.

## Verification

- `cd frontend && npx vitest run`
- `cd frontend && npm run build`

