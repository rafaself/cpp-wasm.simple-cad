# Frontend Reboot + Corrections Plan (Engine Kept)

Date: 2026-01-25
Owner: Engineering

## Purpose
Deliver a controlled "frontend reboot" without discarding the engine/C++ core. The plan combines the earlier incremental correction steps (engine-first, hot path, view sync, pick throttling, and moving geometry to Atlas) with a structured frontend cleanup that reduces coupling and restores governance rules.

## Why this plan
The engine/C++ layer appears structurally sound and aligned with the architecture. The main issues are in the frontend interaction layer:
- UI code performs authoritative geometry math (violating engine-first).
- Hot path (pointermove) allocates and reads DOM layout per event.
- View sync to runtime is inconsistent or missing.
- Interaction handlers are oversized and entangled.

Rewriting the entire frontend would discard working pieces and regress on features already implemented. A staged reboot-in-place preserves the engine while replacing the most problematic UI subsystems, minimizing risk and improving velocity.

## Guiding constraints (non-negotiable)
- All geometry/picking/transform math must run in Atlas via runtime facades.
- Pointermove hot path must not allocate or read layout.
- View parameters must be synchronized to runtime on every change.
- No shims or compatibility adapters; fix call sites directly.
- UI must follow DESIGN.md and apps/web/project-guidelines.md.

## Scope
In scope:
- Input pipeline and interaction layer.
- View sync and viewport conversions.
- Hover pick throttling.
- Handle hit-testing and resize geometry moved into Atlas.
- Governance checks and tests.
- Refactoring oversized handlers into smaller modules.

Out of scope:
- Engine/C++ feature rewrites.
- Domain kernel changes (electrical).
- Backend changes.

## Plan overview (two tracks, interleaved)
Track A: Correctness and performance compliance (engine-first + hot-path).
Track B: Frontend reboot-in-place (simplify and modularize interaction layer).

Both tracks are executed in phases below. Each phase includes objectives, changes, acceptance criteria, and rationale.

---

## Phase 0 - Baseline and inventory (1-2 days)
Objective:
- Create a precise map of violations and dependencies so the reboot is targeted, not speculative.

Actions:
1) Inventory all places doing screen/world conversion in UI.
   - Search for viewportMath usage and direct math in handlers.
   - Identify screens where conversions are needed for display-only (overlay rendering).
2) Inventory all pointermove handlers and list per-event allocations/layout reads.
3) Inventory all pick calls (pickExSmart, pickEx).
4) List oversized interaction modules (over size limits).

Deliverables:
- A short report in docs/reports/frontend-interaction-audit.md listing:
  - File paths and line ranges of violations.
  - Short description of each violation.
  - Suggested target runtime API (if missing).

Acceptance:
- Report contains all known hot-path and engine-first violations.

Rationale:
Prevents over-engineering and ensures fixes focus on the true bottlenecks.

---

## Phase 1 - View sync and conversion authority (3-5 days)
Objective:
- Make runtime viewport the single source of truth.
- Eliminate UI-based canonical conversions.

Actions:
1) Add a single view-sync path:
   - On viewTransform/canvasSize change, call runtime.viewport.setViewTransform.
   - Ensure it happens before any input events use runtime tolerances.
2) Replace UI conversion helpers:
   - Remove `utils/viewportMath.ts` usage in non-render display logic.
   - Keep worldToScreen only for overlay display (read-only projection).
3) Remove fallbacks that compute screen↔world in UI when runtime is missing.
   - Instead: short-circuit until runtime ready.
   - For tests, use fake runtime with deterministic conversions.
4) Update any tests that depended on viewportMath.

Files likely touched:
- apps/web/features/editor/components/EngineInteractionLayer.tsx
- apps/web/features/editor/hooks/interaction/usePanZoom.ts
- apps/web/utils/viewportMath.ts (restrict usage)
- apps/web/engine/core/runtime/ViewportSystem.ts (ensure API supports needs)
- apps/web/tests runtime/view tests

Acceptance:
- No runtime conversions are performed in UI handlers.
- Runtime viewport has current transform on every frame.
- All pointer events that need conversions use runtime.viewport.

Rationale:
Fixes view-dependent tolerances and eliminates divergence between UI and engine math.

---

## Phase 2 - Hot-path zero-alloc pipeline (4-6 days)
Objective:
- Ensure pointermove is allocation-free and does not read layout.

Actions:
1) Introduce an InputEventContext cache:
   - Pre-allocate an object and mutate fields per event.
   - Avoid creating new point objects each move.
2) Cache DOMRect:
   - Compute rect on pointerdown or resize.
   - Reuse rect on pointermove.
3) Remove per-event debug closures:
   - Use guarded logging that does not allocate when disabled.
4) Ensure hot path never calls getBoundingClientRect.

Files likely touched:
- apps/web/features/editor/interactions/useInteractionManager.ts
- apps/web/features/editor/components/EngineInteractionLayer.tsx
- apps/web/utils/dev/hotPathTiming.ts

Acceptance:
- No allocations in pointermove (validated with perf markers or lints).
- No getBoundingClientRect calls in pointermove.

Rationale:
Hot path stability is a core UX requirement and key to reducing bugs.

---

## Phase 3 - Hover pick throttling (2-3 days)
Objective:
- Reduce pick load while maintaining responsive hover feedback.

Actions:
1) Wire usePickThrottle into SelectionHandler hover flow.
2) Wire usePickThrottle into TextHandler hover flow (if applicable).
3) Ensure throttled pick returns last known stable result when throttled.
4) Add metrics or debug counters to confirm throttle usage.

Files likely touched:
- apps/web/features/editor/interactions/handlers/SelectionHandler.tsx
- apps/web/features/editor/interactions/handlers/TextHandler.tsx
- apps/web/hooks/usePickThrottle.ts (if enhancements needed)

Acceptance:
- Hover pick does not run on every pointermove when throttling is enabled.
- UI remains responsive, no visual regressions.

Rationale:
Large scenes should not degrade UI responsiveness due to constant pick calls.

---

## Phase 4 - Move handle hit-testing into Atlas (5-8 days)
Objective:
- Remove UI hit-testing math for handles and grips.

Actions:
1) Add runtime APIs for handle hit-testing:
   - API accepts world point + view tolerance; returns handle id/subTarget.
2) Replace JS hit-testing in SelectionHandler with runtime call.
3) Delete JS handle hit-test math and tests that rely on it.
4) Add engine tests to validate hit-test correctness.

Files likely touched:
- packages/engine (new API)
- apps/web/engine/core/runtime/SelectionSystem.ts
- apps/web/features/editor/interactions/handlers/SelectionHandler.tsx
- tests in engine and web

Acceptance:
- No direct handle hit-test math in UI.
- Hit-test results stable across zoom levels.

Rationale:
Hit-testing is authoritative geometry logic and must live in Atlas.

---

## Phase 5 - Move side-resize geometry into Atlas (5-8 days)
Objective:
- Remove JS side-resize geometry math.

Actions:
1) Add a transform session path for side-resize in Atlas if missing.
2) Replace `sideResizeGeometry.ts` usage with runtime transform sessions.
3) Delete `sideResizeGeometry.ts` and related tests.
4) Add engine tests for side-resize with flip/symmetric behavior.

Files likely touched:
- packages/engine (transform logic)
- apps/web/features/editor/interactions/handlers/SelectionHandler.tsx
- apps/web/features/editor/interactions/handlers/sideResizeGeometry.ts (delete)

Acceptance:
- Side-resize math runs exclusively in Atlas.
- UI only routes input to runtime.

Rationale:
Ensures consistent behavior, avoids drift between JS and C++.

---

## Phase 6 - Frontend reboot-in-place (modularize interactions) (1-2 weeks)
Objective:
- Untangle interaction layer to reduce coupling and file size.

Actions:
1) Extract a new "interaction core" module:
   - Input pipeline (pointer, key, wheel) in one place.
   - Tool state machine separate from UI overlay rendering.
2) Split oversized handlers:
   - SelectionHandler into: selection input, transform session, overlay state.
   - DraftingHandler into: draft state, commit rules, UI overlay.
3) Introduce per-tool "services":
   - Each tool has a service interface calling runtime only.
4) Consolidate shared logic:
   - Modifier mask, pointer state, drag detection in a single module.
5) Rewire UI overlays:
   - Overlays read state, never compute geometry.

Deliverables:
- Smaller modules under apps/web/features/editor/interactions/ or a new folder.
- Updated imports and minimal coupling.

Acceptance:
- All interaction modules meet size governance.
- Handlers are thin coordinators, not geometry engines.

Rationale:
This is the "frontend reboot" without losing features. It removes the "teia" by restoring separation of concerns.

---

## Phase 7 - Governance enforcement (3-5 days)
Objective:
- Prevent regressions after cleanup.

Actions:
1) Add lints/guards for pointermove allocations and DOM reads.
2) Add static scan for forbidden viewport math usage in UI handlers.
3) Add tests for:
   - View sync correctness (runtime viewport receives updates).
   - Hot path invariants (no state updates, no allocations).
   - Pick throttling behavior.
4) Update docs to reflect new interaction architecture.

Files likely touched:
- tooling/governance/*
- docs/architecture/frontend-patterns.md
- docs/governance/ENGINE_FIRST_GOVERNANCE.md
- tests in apps/web

Acceptance:
- CI blocks violations.
- Docs align with current architecture.

Rationale:
Reboot only sticks if rules are enforced automatically.

---

## Execution order (recommended)
1) Phase 0: audit and map.
2) Phase 1: view sync (unblocks most inconsistencies).
3) Phase 2: hot path zero-alloc.
4) Phase 3: pick throttling.
5) Phase 4: handle hit-test in Atlas.
6) Phase 5: side-resize in Atlas.
7) Phase 6: modularize interactions.
8) Phase 7: governance gates and docs.

---

## Risks and mitigations
Risk: Breaking behavior during migration.
- Mitigation: Add feature flags for new paths; keep old path for a short period only if required.

Risk: Engine API changes ripple across UI.
- Mitigation: Update call sites immediately (no shims); update tests alongside.

Risk: Performance regression during refactor.
- Mitigation: Add perf markers before changes and validate after each phase.

---

## Success criteria
- No geometry math in UI handlers.
- Pointermove path is allocation-free and layout-read-free.
- Runtime is always synced with view parameters.
- Interaction modules are size-compliant and isolated.
- Frontend development velocity improves (fewer regressions, easier debugging).

---

## Optional fallback: "Mini-frontend" cutover
If reboot-in-place is still too costly:
1) Build a minimal editor shell with only selection + draw line + pan/zoom.
2) Reuse existing engine runtime and renderer.
3) Incrementally port tools from old UI.
This should be considered only if Phase 1-3 fails to stabilize the app.

