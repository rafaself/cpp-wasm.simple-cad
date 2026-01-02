# Selection + Transform Audit Report

1) Executive Summary
- Resize via handles moves instead of resizes. Certainty: High.
- Resize flip is not modeled as a first-class behavior (no handle swap / negative scale). Certainty: Medium.
- Shift aspect ratio during resize is not implemented in the engine resize path. Certainty: High.
- Shape vs selection overlay lag is likely due to unsynchronized render loops (WebGL RAF vs React RAF). Certainty: Medium (needs runtime measurement).
- Shift axis lock cannot switch during a drag because lock is decided once. Certainty: High.

2) Environment & Baseline
- Command: `cd frontend && pnpm typecheck` -> PASS (no output, exit 0).
- Command: `cd frontend && pnpm lint` -> FAIL (115 errors, 132 warnings). Note: eslint warns TS 5.8.3 unsupported by typescript-estree.
- Command: `cd frontend && pnpm test` -> PASS (297 tests). Note: pdfjs warning about legacy build in Node env.

3) Expected Behavior (Figma-like Spec)
- Resize: dragging a handle resizes; dragging inside the box moves.
- Flip: allowed when crossing the opposite side while resizing.
- Shift: preserves aspect ratio while resizing.
- Move/Overlay: selection overlay stays visually locked to the shape (no perceptible lag).
- Shift axis lock: lock to dominant axis but allow switching if dominance changes past a threshold (hysteresis).

4) Evidence Matrix
| Problem | Reproduction | Evidence (logs/code) | Root Cause | Certainty |
| --- | --- | --- | --- | --- |
| Resize drags move instead of resize | Select a rect, drag a corner handle -> shape moves | Selection handler always begins `TransformMode.Move` regardless of pick subTarget: `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:93` and logs show `mode: TransformMode.Move` `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:107` | Tool dispatch ignores `PickSubTarget.ResizeHandle` (handles are picked in engine) and always begins move | High |
| Resize flip not supported | Attempt to drag past opposite side (when resize is enabled) | Resize uses anchor + min/max with positive w/h; no state for negative scale or handle swap: `cpp/engine/interaction/interaction_session.cpp:574` | Resize math clamps to positive width/height and does not update active handle when crossing, so flip semantics are not modeled | Medium |
| Shift aspect ratio during resize | Hold Shift while resizing | Resize path does not inspect modifiers or enforce ratio: `cpp/engine/interaction/interaction_session.cpp:574` (no shift handling) | Engine resize path ignores modifiers; no ratio constraint | High |
| Lag between shape and selection overlay during move | Move a shape quickly; overlay appears to trail | WebGL rendering and overlay updates run on independent RAF loops: `frontend/engine/core/CanvasController.ts:168` and `frontend/features/editor/components/ShapeOverlay.tsx:53` | Desynchronized update loops; overlay re-render depends on React state updates and can lag 1+ frames | Medium (needs frame delta logs) |
| Axis lock cannot switch mid-drag | Hold Shift, start horizontal then move vertically past dominance | Axis lock is set once when None and never updated: `cpp/engine/interaction/interaction_session.cpp:385` | Axis lock does not re-evaluate dominance or apply hysteresis | High |

5) Proposed Fixes (SEM IMPLEMENTAR)
- Resize vs Move
  - Approach: Use pick subTarget to select transform mode. If `ResizeHandle`, start `TransformMode.Resize`; if `Vertex`, use `VertexDrag`; if `Edge`, use `EdgeDrag`; else `Move`.
  - Files: `frontend/features/editor/interactions/handlers/SelectionHandler.tsx` and `frontend/types/picking.ts`.
  - Risks: Must keep engine-first (no JS geometry). Also ensure handle order matches engine (0=BL,1=BR,2=TR,3=TL) from `cpp/engine/impl/engine_overlay.cpp:142`.

- Resize flip
  - Approach: In engine resize path, allow handle index to switch when crossing anchor (logical flip). Option A: track sign of (worldX - anchorX, worldY - anchorY) and update `session_.vertexIndex` to corresponding handle. Option B: keep a signed scale in session and use it to adjust handle mapping on commit.
  - Files: `cpp/engine/interaction/interaction_session.cpp`, `cpp/engine/impl/engine_overlay.cpp`.
  - Risks: Must keep pick/handle order consistent; also update snap guides to new handle index to avoid jump.

- Shift aspect ratio
  - Approach: Implement ratio constraint in engine resize path when `Shift` is pressed. Use original bounds from snapshot, compute aspect = w/h, then project dragged point onto constrained line (preserve anchor corner). Apply before snapping or after snapping depending on spec; prefer after snap to avoid jitter, but validate with UX.
  - Files: `cpp/engine/interaction/interaction_session.cpp`, plus tests in `cpp/tests` for resize-with-shift.
  - Risks: Interaction with snap and zoom; need hysteresis to avoid jitter when near square.

- Move/Overlay lag
  - Approach: Align overlay updates with render loop. Options: (1) Drive overlay from CanvasController loop by exposing a tick signal in a store, or (2) move overlay drawing into WebGL (single source of frame timing), or (3) use `useSyncExternalStore` with engine generation to reduce React scheduling delays.
  - Files: `frontend/features/editor/components/ShapeOverlay.tsx`, `frontend/engine/core/CanvasController.ts`, `frontend/engine/core/useEngineEvents.ts`.
  - Risks: Avoid extra allocations in hot paths; ensure overlay remains engine-authoritative.

- Shift axis lock switchable
  - Approach: Replace one-time lock with dynamic dominance + hysteresis. Example: lock X if |dx| > |dy| * k and |dx| > threshold; switch to Y if |dy| > |dx| * k and exceeds threshold. Store last lock and allow switch only when crossed.
  - Files: `cpp/engine/interaction/interaction_session.cpp`.
  - Risks: Must keep snapping consistent with axis lock changes to avoid snap jumps.

6) Action Plan (PRs/Fases)
- PR1: Selection tool dispatch
  - Tasks: Use pick subTarget to select Move vs Resize vs Vertex/Edge drag.
  - Acceptance: Dragging handles resizes; dragging inside moves; no JS geometry.
  - Regression checklist: selection tests + add new SelectionHandler tests for handle -> Resize.

- PR2: Engine resize constraints
  - Tasks: Add Shift aspect ratio + flip handle switching in engine resize path.
  - Acceptance: Resize preserves ratio with Shift; crossing anchor flips without jitter; no negative sizes in final model unless explicitly modeled.
  - Regression checklist: new C++ tests for resize ratio + flip; update any golden snapshots.

- PR3: Overlay synchronization
  - Tasks: Align overlay tick with render loop or engine generation; add optional debug counters to compare overlay vs render frame.
  - Acceptance: No visible lag between shape and selection overlay during fast moves.
  - Regression checklist: add integration test or perf harness for overlay update frequency.

- PR4: Axis lock hysteresis
  - Tasks: Implement dynamic axis dominance with thresholds in move path.
  - Acceptance: Shift axis lock can switch when dominance changes; no oscillation.
  - Regression checklist: update C++ tests to cover switch behavior.

7) Test Plan
- Unit
  - SelectionHandler chooses TransformMode.Resize on handle picks.
  - InteractionSession resize enforces aspect ratio with Shift.
  - Axis lock switch with hysteresis (engine test).

- Integration
  - Drag handle corner -> resize (not move).
  - Resize crossing anchor -> flip (handle swap behavior visible).
  - Shift-resize preserves aspect ratio from original bounds.
  - Fast move -> overlay stays aligned (no frame lag > 1 frame).
  - Shift axis lock switches when dominance crosses threshold.

- E2E/Manual
  - Zoom/pan + resize with snapping enabled.
  - Mixed selection (single vs multi) and handle behavior.

8) Appendix
- Key code snippets

```ts
// SelectionHandler: always Move regardless of pick subTarget
runtime.beginTransform(
  activeIds,
  TransformMode.Move,
  res.id,
  res.subIndex,
  screen.x,
  screen.y,
  ctx.viewTransform.x,
  ctx.viewTransform.y,
  ctx.viewTransform.scale,
  ctx.canvasSize.width,
  ctx.canvasSize.height,
  modifiers,
);
```
Source: `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:93`

```cpp
// Axis lock is decided once and never updated while Shift stays down
if (!shiftDown) {
    session_.axisLock = AxisLock::None;
} else if (session_.axisLock == AxisLock::None) {
    session_.axisLock = (std::abs(screenDx) >= std::abs(screenDy)) ? AxisLock::X : AxisLock::Y;
}
```
Source: `cpp/engine/interaction/interaction_session.cpp:385`

```cpp
// Resize uses anchor + min/max, no ratio constraint or handle switching
const float minX = std::min(anchorX, worldX);
const float maxX = std::max(anchorX, worldX);
const float w = std::max(1e-3f, maxX - minX);
```
Source: `cpp/engine/interaction/interaction_session.cpp:604`

- Existing debug logs (no code changes required)
  - Pointer + capture logs: `frontend/features/editor/components/EngineInteractionLayer.tsx:34`
  - Selection pick + transform logs: `frontend/features/editor/interactions/handlers/SelectionHandler.tsx:43`

- Suggested temporary instrumentation (if needed for lag)
  - Add `cadDebugLog('overlay', ...)` in `ShapeOverlay` to emit selection bounds and current render frame id.
  - Add `cadDebugLog('render', ...)` in `CanvasController` to emit engine generation per RAF.

