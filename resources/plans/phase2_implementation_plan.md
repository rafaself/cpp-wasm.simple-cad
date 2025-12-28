# Phase 2 Implementation Plan: Engine Features

This plan details the steps to strictly implement the features required to complete Phase 2 of the Architecture Audit: **Grid Rendering** and **Engine-based Draft System**.

## 1. Grid Rendering in Engine (Priority: High, Complexity: Medium)

**Objective:** Render the background grid directly in the C++ engine's line buffer instead of using CSS/SVG/Canvas overrides. This ensures performance and proper layering.

### 1.1 C++ Implementation (`engine.h`, `engine.cpp`)

- [ ] Define `GridOptions` struct or use existing `SnapOptions` (already has `gridSize` and `gridEnabled`).
- [ ] Create private method `void addGridToBuffers() const`.
  - Calculate visible world bounds based on `viewScale` (assuming 0,0 center or viewport offset if available - _Note: Engine currently assumes explicit View Transform is managed by frontend projecting to clip space, but for grid generation we need to know "where we are". We might need to pass viewport bounds or translation to the engine, or just generate a large enough grid if the view is centered._ **Decision:** Add `setViewOffset(x, y)` command or just pass viewport bounds calculate in FE to a `drawGrid` command? Better: The Engine _should_ know the view transform. We added `SetViewScale`. We likely need `SetViewOffset` or `SetViewRect` to know what grid lines to draw.)
  - _Refinement:_ The current `SetViewScale` only passes scale. We need the translation (pan) to know which grid lines to draw.
- [ ] **Action:** Add `sx, sy` (scroll x/y) to `SetViewScalePayload` (rename to `SetViewTransform`) or add explicit `SetViewOffset`.
- [ ] Implement `addGridToBuffers`:
  - Loop through X and Y lines within the visible range.
  - Push vertices to `lineVertices` with a specific grid color (e.g., `#E0E0E0`).
- [ ] Call `addGridToBuffers()` at the start of `rebuildRenderBuffers()`.

### 1.2 Frontend Integration

- [ ] Update `EngineInteractionLayer.tsx` to sync full view transform (x, y, scale) to engine, not just scale.
- [ ] Remove any existing React/CSS grid implementations.

---

## 2. Engine-based Draft System (Priority: High, Complexity: High)

**Objective:** Move the state of the "shape being drawn" (Draft) from React (`useState`) to C++ `CadEngine`.

### 2.1 C++ Architecture (`engine.h`, `engine.cpp`)

- [ ] Define `DraftState` struct:
  ```cpp
  struct DraftState {
      bool active = false;
      EntityKind kind;
      Point2 start;
      Point2 current;
      std::vector<Point2> polyPoints; // For polyline/polygon
      // Style props (color, stroke, etc.)
  };
  ```
- [ ] Add `DraftState draft_` member to `CadEngine`.
- [ ] Implement public API methods:
  - `void beginDraft(EntityKind kind, float x, float y, float r, float g, float b, float a, float strokeWidth)`.
  - `void updateDraft(float x, float y)`.
  - `std::uint32_t commitDraft()`: Creates the real entity from draft state, resets draft, returns new ID.
  - `void cancelDraft()`: Resets draft state.
- [ ] Implement Rendering:
  - Create `void addDraftToBuffers() const`.
  - Call it in `rebuildRenderBuffers()` _after_ all other entities (overlay on top).
  - Logic to generate geometry based on `draft_.kind` (similar to `upsertRect`, `upsertLine` logic but using transient data).

### 2.2 Bindings (`bindings.cpp`)

- [ ] Expose new methods to JS/TS.

### 2.3 Frontend Migration (`useDraftHandler.ts`)

- [ ] Refactor `useDraftHandler` to stop using `useState<Draft>`.
- [ ] Map pointer events to `runtime.beginDraft`, `runtime.updateDraft`, `runtime.commitDraft`.
- [ ] Remove `Draft` type definition from frontend.

---

## Execution Sequence

1.  **Step 1: Grid Foundation.** Update `CommandOp` to support View Translation (needed for Grid). Implement Grid rendering in C++.
2.  **Step 2: Grid Frontend.** Hook up the frontend to sync View Translation. Verify Grid works.
3.  **Step 3: Draft Backend.** Implement `DraftState` and methods in C++.
4.  **Step 4: Draft Rendering.** Implement draft geometry generation in `rebuildRenderBuffers`.
5.  **Step 5: Draft Frontend.** Switch `useDraftHandler` to use the engine.
