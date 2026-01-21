# 2.5D Adoption Plan (Atlas Z Axis Enablement)

Status: Draft
Owner: TBD
Created: 2026-01-21

## 1. Objective

Enable canonical geometric Z persistence and querying in Atlas while keeping the viewport fully 2D (top-down projection).
No 3D rendering or navigation is introduced in this plan.

## 2. Scope

### 2.1 In Scope
- Canonical geometric Z stored and persisted by Atlas.
- WASM + Runtime Facades updated to create/read/update Z.
- Strict snapshot versioning with Z layout changes.
- Picking, snapping, transforms updated to follow normative Z rules.
- Integration contract with Electrical Core (geometric Z vs semantic height).
- Deterministic tests for Z invariants and snapshot behavior.

### 2.2 Out of Scope
- 3D rendering, camera, or navigation.
- UI workflows for direct visual Z editing (future phase).
- Runtime compatibility or migration (forbidden).

## 3. Definitions (Normative)

- **Geometric Z (geomZ):** Canonical elevation stored in Atlas for each persisted entity. Used for geometry truth and future 3D.
- **Implementation field name:** `elevationZ` is the storage field representing geomZ in persisted entity records.
- **Draw Order (drawOrder):** Visual stacking order for 2D rendering. Independent from geomZ.
- **Semantic Height:** Domain parameter owned by Electrical Core (mounting height, standards). Not stored in Atlas.
- **Render Vertex Z:** Per-vertex value used by the renderer for draw order or batching. Not geometric Z.
- **Active Plane Elevation:** Current tool elevation used as the default Z for new geometry and snaps (default 0).
  - Ownership: tool/interaction state in UI or runtime, but geomZ application MUST be performed in Atlas via facades.
  - There MUST NOT be two authoritative sources; if cached in Atlas sessions, it MUST be derived from facade input.

## 4. Normative Rules (2D View Behavior)

### 4.1 Picking and Selection
- Picking and hit-testing MUST ignore geomZ while the view is 2D.
- Selection results MUST be based on XY-only tolerances owned by Atlas.

### 4.2 Snapping
Baseline policy (mandatory for first release):
- Candidate discovery MUST ignore geomZ.
- Snapped XY MUST be the computed snap solution in XY derived from the chosen snap target (vertex/edge/midpoint/grid/etc.).
- Result geomZ MUST be the Active Plane Elevation (default 0).
- The only way to copy target geomZ is an explicit command (e.g., "match target elevation").
- "Match target elevation" MUST be exposed only as an explicit tool mode/modifier routed via facades; it MUST NOT be an implicit default.

### 4.3 Creation, Duplication, and Import
- Creation default: new persisted entities MUST take geomZ = Active Plane Elevation at creation time.
- Duplicate/copy/paste MUST preserve geomZ bit-exact from the source entity and MUST NOT rebind to Active Plane Elevation.
- Import adapters MUST assign geomZ deterministically (default 0 unless explicitly specified by import metadata).

### 4.4 Transforms
- Move/translate MUST apply to XY; geomZ changes ONLY via explicit elevation APIs.
- Rotate/scale MUST operate in XY only and MUST preserve geomZ exactly.
- Transform math lives in Atlas; JS must not compute canonical geometry.

### 4.5 Draw Order and Rendering
- drawOrder remains the only 2D stacking authority.
- geomZ MUST NOT affect draw order or visual stacking in 2D.
- Render vertex Z MUST remain a rendering concern only.
- Render vertex Z MUST NOT be used as input to any canonical query/command.

### 4.6 Persistence and Compatibility
- Snapshot layout changes MUST be explicit and versioned.
- Older snapshot versions MUST fail fast; no runtime migration.
- Unsupported versions MUST fail fast with a specific error code/event for frontend handling.
- Unsupported versions MUST emit a single canonical event (e.g., `SnapshotVersionUnsupported`) including foundVersion and expected/supported version information.
- Snapshot load MUST reject corrupted records (invalid counts/sizes or NaN/Inf fields).

### 4.7 Persisted vs Ephemeral Entities
- All rules in section 4 apply to persisted CAD entities.
- Ephemeral overlays/previews may carry render-only depth but MUST NOT persist geomZ unless committed via Atlas.

### 4.8 Elevation Sanity (Normative)
- elevationZ uses the same canonical world units (WU) as XY and MUST be finite (no NaN/Inf).
- If a safe numeric range is required for stability, it MUST be documented and enforced.

## 5. Baseline Representation Decision (Locked)

### 5.1 Decision
- Keep **Point2** for XY.
- Add **elevationZ (float)** at the entity record level.
- Constant elevation per entity is the baseline.
- For composite/group entities, geomZ is defined at the persisted entity record level; children preserve their own geomZ unless the entity type explicitly defines inherited elevation (must be documented per type).

### 5.2 Out of Scope for Baseline
- Per-vertex Z is OUT OF SCOPE for initial enablement.
- Future per-vertex Z may be introduced only via explicit transition entities
  or a dedicated 3D polyline type, not by retrofitting current polyline data.

### 5.3 Rationale
- Minimizes structural churn while enforcing canonical Z.
- Avoids per-vertex Z complexity and hot-path overhead.
- Aligns with AGENTS.md guidance: elevation changes use explicit transitions.

## 6. Contract Changes (WASM + Runtime Facades)

- Binary layouts MUST include geomZ in **all persisted entity records** (no optional Z fields).
- Binary layouts MUST be fixed-size/packed as defined in the manifest; no branching decode in hot paths.
- Versioned schemas MUST be updated in `engine-api.md` and manifest.
- Pointermove paths MUST remain session calls with no allocations or serialization.
- JS helpers may exist but MUST not introduce new object churn on hot paths.
- Minimum elevation API surface (names are placeholders):
  - `getEntityGeomZ(EntityId) -> float`
  - `setEntityGeomZ(EntityId, z) -> void` (cold path / command buffer)
  - `setActivePlaneElevation(z) -> void` (optional; if cached, must be derived from facade input)
- `setEntityGeomZ` MUST be cold-path, undoable as a single atomic command, and MUST NOT be invoked from pointermove/update loops.

## 7. Implementation Phases and Acceptance Criteria

### Phase 0: Audit and Design Lock
**Changes:**
- Inventory all 2D point usage in Atlas and WASM schemas.
- Confirm baseline decision (Point2 + elevationZ per entity).
- Identify any caches/buffers that assume 2D-only state.

**Done means:**
- Written impact map and a signed-off representation decision.
- No unresolved open questions about baseline Z semantics.

### Phase 1: Atlas Data Model Enablement
**Changes:**
- Extend entity records with elevationZ (default 0).
- Update entity manager, picking, selection, and transform systems to preserve geomZ.
- Add internal APIs to read/write geomZ explicitly.

**Done means:**
- All persisted entities carry geomZ and it is preserved across all 2D operations.
- Picking and selection ignore geomZ per normative rules.

### Phase 2: Persistence + Snapshot Versioning
**Changes:**
- Snapshot layout includes elevationZ for entities.
- Snapshot version bump; no compatibility shims.
- Update serializers/deserializers and version checks.

**Done means:**
- Save/load round-trip preserves geomZ.
- Old versions fail fast deterministically with a specific error code/event.

### Phase 3: WASM + Runtime Facades
**Changes:**
- Update command buffers and schemas to include elevationZ.
- Update runtime facades to pass geomZ without optional fields.
- Update API manifest and doc drift checks.

**Done means:**
- JS can create and edit entities with geomZ via facades.
- No hot-path allocations introduced.

### Phase 4: Electrical Integration Contract
**Changes:**
- Define integration transactions: geometric Z + semantic height.
- Ensure atomic commit/rollback across Atlas and Electrical.

**Done means:**
- Cross-kernel operations are atomic and consistent.
- Tests validate geomZ vs semantic height separation.

### Phase 5: Hardening and Governance
**Changes:**
- Update docs: `docs/agents/engine-api.md`, `docs/agents/domain-api.md`, `docs/agents/frontend-patterns.md`.
- Update governance checks and manifest regeneration.
- Add a deterministic scene fixture (stored in repo) and numeric performance budgets:
  - Baseline fixture (example): 10k lines, 2k texts, 1k polylines.
  - Thresholds (placeholder values, must be calibrated): transform update <= 250 us, picking query <= 300 us, incremental rebuild <= 2 ms.
- Run performance budgets and regression tests.

**Done means:**
- All governance gates pass.
- No perf regression in hot paths.

## 8. Mandatory Tests and Invariants

- **Round-trip invariant:** sequences of 2D transforms preserve geomZ bit-exact in all 2D operations.
- **Snap invariant:** snapping never leaks target geomZ unless explicitly requested.
- **Snapshot invariant:** save/load preserves geomZ; unsupported versions fail fast.
- **Overflow recovery:** full resync does not lose geomZ.

## 9. Risks and Mitigations

- **Risk:** Confusion between geomZ and drawOrder.
  - **Mitigation:** strict naming (`geomZ`, `drawOrder`), doc updates, tests.
- **Risk:** Performance regressions from added fields.
  - **Mitigation:** measure allocations and perf, keep hot path allocation-free.
- **Risk:** WASM/JS contract drift.
  - **Mitigation:** update manifest, doc drift checks, and schema tests.
- **Risk:** Active plane elevation ownership drift (UI vs engine).
  - **Mitigation:** define ownership (tool/UI state), apply only via Atlas facades, avoid duplicated sources.

## 10. Global Acceptance Criteria

- Geometric Z is canonical in Atlas and persisted in snapshots.
- Draw order remains the only 2D stacking authority.
- WASM/JS APIs support geomZ without optional fields or hot-path allocations.
- Governance checks pass and perf budgets hold.

## 11. Impact and Inventory Appendix (Checklist)

- Entity records (RectRec, LineRec, PolyRec, CircleRec, PolygonRec, ArrowRec, TextRec).
- Entity manager storage and history records.
- Picking system, snapping system, and tolerance calculations.
- Transform sessions (begin/update/commit).
- Bounds caches and hit-test caches (AABB and selection overlays).
- Text anchors and caret layout (ensure geomZ does not affect 2D layout).
- Render buffer generation (render vertex Z vs geomZ).
- Snapshot serialization/deserialization and version constants.
- WASM command buffer layouts and protocol definitions.
- Runtime facades in `apps/web/engine/**` and integration runtime.
- Tests: transform, picking, snapping, snapshot, overflow recovery.
