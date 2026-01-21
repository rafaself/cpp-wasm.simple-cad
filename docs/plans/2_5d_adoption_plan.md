# 2.5D Adoption Plan (Atlas Z Axis Enablement)

Status: Reviewed (Ready for Implementation)
Owner: TBD
Created: 2026-01-21
Last Reviewed: 2026-01-21

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
- **Numeric representation:** `elevationZ` is **IEEE-754 binary32 (float32)**, stored **little-endian** in snapshots (consistent with existing XY coordinate storage). This guarantees "bit-exact" semantics across platforms/compilers.
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
- Input validation MUST occur at:
  - `setEntityGeomZ` facade call (reject with `InvalidOperation`)
  - Snapshot deserialization (reject with `InvalidPayloadSize` or dedicated `InvalidElevation` error)
  - Command buffer parsing for any creation/update command
- Tests MUST verify NaN/Inf injection is rejected at all three boundaries.

### 4.9 Topological Operations (Normative)
- In 2D top-down mode, topological operations (trim/extend/split/fillet/boolean) MUST use projected XY intersections and MUST ignore geomZ for intersection computation.
- If the operation modifies an existing entity, the result MUST preserve the primary operand's geomZ bit-exact.
- If the operation creates new persisted geometry, the result MUST use geomZ = Active Plane Elevation unless a tool contract explicitly specifies otherwise.
- geomZ MUST NOT be interpolated between operands.
- geomZ MUST NOT implicitly inherit from the snap target.

**Implementation requirement (mandatory for tool authors):**
- Every topological operation MUST document its geomZ policy in the tool contract before implementation.
- Policies MUST be one of:
  1. **Preserve primary:** result inherits geomZ from the primary operand (e.g., trim keeps trimmed entity's Z).
  2. **Active plane:** result uses current Active Plane Elevation (e.g., fillet arc uses active plane).
  3. **Explicit parameter:** tool accepts explicit Z as input (must be documented).
- Tests MUST verify geomZ policy compliance for each topological tool.

**Multi-operand disambiguation (boolean/split/etc.):**
- For operations where "primary operand" is ambiguous (e.g., boolean union, split with multiple cuts), the tool contract MUST explicitly define:
  - Which entity is considered "primary" for geomZ inheritance, OR
  - That the result uses Active Plane Elevation when no clear primary exists.
- Default rule when contract is silent: **Active Plane Elevation** (safest, most predictable).
- This removes gray area and prevents PR-time disputes.

### 4.10 Default Elevation for Pre-Z Entities (Normative)
- Pre-v4 fixtures/assets MUST be upgraded **offline** by injecting `elevationZ = 0.0f` and rewriting as v4.
- The offline upgrader is the **only** mechanism for v3→v4 conversion; runtime migration is forbidden.
- After upgrade, the snapshot MUST be saved as v4; mixed-version snapshots are forbidden.
- **Runtime v3 loads remain fail-fast.** The engine MUST NOT silently accept v3 snapshots or inject defaults at load time.
- Any attempt to load a v3 snapshot at runtime MUST emit `SnapshotVersionUnsupported` and abort.

## 5. Baseline Representation Decision (Locked)

### 5.1 Decision
- Keep **Point2** for XY.
- Add **elevationZ (float)** at the entity record level.
- Constant elevation per entity is the baseline.
- **Group entities do not impose elevation by inheritance.** `elevationZ` is a property of each persisted entity record, not a scene-graph attribute.
- Elevation commands applied to a group/selection act explicitly on the selected members (no implicit propagation).
- During standard transform sessions (move/rotate/scale), geomZ is preserved for all involved entities (including children).
- Any Z change for a group/selection MUST occur only via explicit elevation commands:
  - Recommended mode: apply `geomZ := geomZ + deltaZ` to all members.
  - Absolute set mode is allowed only if explicitly documented per tool.

### 5.2 Out of Scope for Baseline
- Per-vertex Z is OUT OF SCOPE for initial enablement.
- Future per-vertex Z may be introduced only via explicit transition entities
  or a dedicated 3D polyline type, not by retrofitting current polyline data.

### 5.3 Rationale
- Minimizes structural churn while enforcing canonical Z.
- Avoids per-vertex Z complexity and hot-path overhead.
- Aligns with AGENTS.md guidance: elevation changes use explicit transitions.

### 5.4 Struct Packing Validation (Mandatory)

**C++ Compile-Time Validation:**
- All modified entity records MUST have `static_assert(sizeof(...))` and `static_assert(offsetof(..., elevationZ))` validating expected byte layout.
- Snapshot byte size constants in `snapshot_internal.h` MUST be updated atomically with struct changes.
- CI MUST fail if sizeof/offsetof assertions fail at compile time.
- Example validation pattern:
  ```cpp
  static_assert(sizeof(RectRec) == EXPECTED_RECT_REC_SIZE, "RectRec size mismatch");
  static_assert(offsetof(RectRec, elevationZ) == EXPECTED_ELEVATION_OFFSET, "elevationZ offset mismatch");
  ```

**End-to-End Binary Layout Validation (C++ → WASM → TS):**
- `static_assert` only validates C++ layout; the real risk is "C++ ok, TS offsets wrong".
- Manifest/schema tests MUST validate offsets and sizes end-to-end:
  - C++ struct layout → snapshot writer → WASM boundary → TS reader
- A **roundtrip binary struct decode test** MUST exist for each entity type:
  - Create entity in C++ with known elevationZ value
  - Serialize to snapshot
  - Deserialize in TS/WASM boundary
  - Assert elevationZ matches original value bit-exact
- These tests MUST run in CI and fail on any offset/size mismatch.

## 6. Contract Changes (WASM + Runtime Facades)

- Binary layouts MUST include geomZ in **all persisted entity records** (no optional Z fields).
- Binary layouts MUST be fixed-size/packed as defined in the manifest; no branching decode in hot paths.
- New fields (elevationZ) MUST respect packed/aligned layout; offsets and sizes MUST be validated via `static_assert(sizeof/offsetof)` in C++ and manifest/schema checks.
- Versioned schemas MUST be updated in `engine-api.md` and manifest.
- Pointermove paths MUST remain session calls with no allocations or serialization.
- JS helpers may exist but MUST not introduce new object churn on hot paths.
- Minimum elevation API surface (names are placeholders):
  - `tryGetEntityGeomZ(EntityId) -> { ok: bool, z: float }` or equivalent
  - `setEntityGeomZ(EntityId, z) -> void` (cold path / command buffer)
  - `setActivePlaneElevation(z) -> void` (optional; if cached, must be derived from facade input)
- `setEntityGeomZ` MUST be cold-path, undoable as a single atomic command, and MUST NOT be invoked from pointermove/update loops.

### 6.1 Elevation API Behavioral Contracts (Normative)
- `tryGetEntityGeomZ(EntityId)`:
  - MUST return `{ ok: false, z: 0 }` for nonexistent entities.
  - MUST return `{ ok: true, z: <value> }` for valid entities.
  - Callers MUST check `ok` before using `z`; silent fallback to 0 is forbidden in feature code.
  - Rationale: returning 0 for invalid ID masks bugs and creates silent failures.
- `setEntityGeomZ(EntityId, z)`:
  - MUST validate Z is finite; reject NaN/Inf with `InvalidOperation` error.
  - MUST emit `InvalidEntityId` error/event if entity does not exist (no silent no-op).
  - MUST be undoable as a single atomic command in the history stack.
  - MUST emit `EntityGeomZChanged` event with `{entityId, oldZ, newZ}` on success.
  - **Cache/dirty behavior:**
    - MUST mark entity as dirty for persistence and history (snapshot must capture change).
    - MUST NOT trigger render buffer rebuild (geomZ does not affect 2D rendering).
    - This prevents performance regression if someone "simplifies" the dirty-flag pipeline later.
- `setEntitiesGeomZ(ids[], z)` (batch API, optional):
  - MAY be added if batch elevation changes are common.
  - Same validation and error rules apply per entity.
  - MUST be undoable as a single atomic batch command.
  - MUST report which IDs failed (if any) without aborting valid ones.
- `setActivePlaneElevation(z)`:
  - MUST validate Z is finite; reject NaN/Inf.
  - Affects only subsequent entity creation, not existing entities.
  - MUST NOT emit per-entity events; this is session state only.

## 7. Implementation Phases and Acceptance Criteria

### Phase 0: Audit and Design Lock
**Changes:**
- Inventory all 2D point usage in Atlas and WASM schemas.
- Confirm baseline decision (Point2 + elevationZ per entity).
- Identify any caches/buffers that assume 2D-only state.

**Done means:**
- Written impact map and a signed-off representation decision.
- No unresolved open questions about baseline Z semantics.
- Phase 0 audit report captured in `docs/reports/2_5d_phase0_audit.md`.

### Phase 1: Atlas Data Model Enablement
**Changes:**
- Extend entity records with elevationZ (default 0).
- Update entity manager, picking, selection, and transform systems to preserve geomZ.
- Update **all history-related structures** to preserve elevationZ for undo/redo:
  - `TransformSnapshot` (transform sessions)
  - Any "clone entity state" or "copy record into history" mechanisms
  - Command undo payloads that capture entity state
- Add internal APIs to read/write geomZ explicitly.
- Add `static_assert` validation for all modified struct sizes and offsets.

**History Invariant (mandatory):**
- Any mechanism that captures entity state for later restoration (undo, redo, history stack) MUST include elevationZ.
- This is a **semantic invariant**, not just a struct field requirement.
- Audit all code paths that snapshot/restore entity state to ensure elevationZ is preserved.

**Done means:**
- All persisted entities carry geomZ and it is preserved across all 2D operations.
- Picking and selection ignore geomZ per normative rules.
- Any sequence of operations→undo→redo preserves elevationZ bit-exact.
- All struct packing assertions pass at compile time.

### Phase 2: Persistence + Snapshot Versioning
**Changes:**
- Snapshot layout includes elevationZ for entities.
- Snapshot version bump (v3 → v4); no compatibility shims.
- Update serializers/deserializers and version checks.
- Provide an offline fixture/asset upgrader to update repository-managed fixtures/dev files to the new snapshot version (inject `elevationZ = 0` or default).
  - This is **not** runtime migration; it is offline tooling only.

**Offline Upgrader Specification:**
- CLI invocation: `node tooling/upgrade_fixtures.js --to-version 4 [glob patterns]`
- Upgrader MUST:
  - Accept glob patterns for target files (default: `**/*.esnp`)
  - Inject `elevationZ = 0.0f` for all entities in v3 snapshots
  - Write output as v4 snapshot (in-place or to output directory)
  - Report upgraded/skipped/failed counts to stdout
  - Exit non-zero on any failure
- Upgrader MUST NOT:
  - Modify files that are already v4 or newer
  - Perform any semantic transformations beyond adding default elevationZ

**CI Gate (post-deployment):**
- `check_fixture_versions.js` MUST fail if any v3 fixtures remain in repo after v4 is deployed.
- This gate prevents accidental regression to old snapshot format.

**Done means:**
- Save/load round-trip preserves geomZ.
- Old versions fail fast deterministically with a specific error code/event.
- Offline upgrader exists and all repo fixtures are upgraded.
- CI gate enforces no v3 fixtures post-deployment.

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
- Update docs: `docs/architecture/engine-api.md`, `docs/architecture/domain-api.md`, `docs/architecture/frontend-patterns.md`.
- Update governance checks and manifest regeneration.
- Add a deterministic scene fixture (stored in repo) and numeric performance budgets:
  - Baseline fixture (example): 10k lines, 2k texts, 1k polylines.
  - Thresholds (placeholder values, must be calibrated): transform update <= 250 us, picking query <= 300 us, incremental rebuild <= 2 ms.
- Run performance budgets and regression tests.

**Done means:**
- All governance gates pass.
- No perf regression in hot paths.

## 8. Mandatory Tests and Invariants

### 8.1 Core Invariants
- **Round-trip invariant:** sequences of 2D transforms preserve geomZ bit-exact in all 2D operations.
- **Snap invariant:** snapping never leaks target geomZ unless explicitly requested.
- **Snapshot invariant:** save/load preserves geomZ; unsupported versions fail fast.
- **Overflow recovery:** full resync does not lose geomZ.
- **History invariant:** any mechanism that captures/restores entity state (undo, redo, history) MUST preserve elevationZ bit-exact.
- **Binary layout invariant:** C++ struct layout MUST match TS decoder expectations end-to-end.

### 8.2 Required Test Cases
| Test Name | Location | Description |
|-----------|----------|-------------|
| `elevationZ_roundtrip_invariant` | `tests/transform/` | Transform→undo→redo preserves elevationZ bit-exact |
| `elevationZ_snapshot_roundtrip` | `tests/persistence/` | Save→load preserves elevationZ for all entity types |
| `elevationZ_nan_inf_rejection` | `tests/validation/` | setEntityGeomZ rejects NaN/Inf; snapshot load rejects corrupt Z |
| `elevationZ_default_zero` | `tests/persistence/` | New entities created without explicit Z have elevationZ=0 |
| `elevationZ_copy_paste_preserve` | `tests/interaction/` | Duplicate/copy preserves source geomZ bit-exact |
| `elevationZ_snap_no_leak` | `tests/interaction/` | Snapping never copies target geomZ unless explicit mode |
| `elevationZ_picking_ignores_z` | `tests/picking/` | Entities at different Z but same XY are all pickable |
| `elevationZ_transform_preserves_z` | `tests/transform/` | Move/rotate/scale in 2D preserve geomZ exactly |
| `old_version_fails_fast` | `tests/persistence/` | Loading v3 snapshot in v4 engine emits `SnapshotVersionUnsupported` |
| `struct_packing_validation` | C++ compile-time | static_assert validates sizeof/offsetof for all modified structs |
| `binary_layout_e2e_roundtrip` | `tests/integration/` | Per-entity-type: C++ create→serialize→WASM→TS decode→assert elevationZ matches |
| `tryGetEntityGeomZ_invalid_id` | `tests/api/` | tryGetEntityGeomZ returns `{ok: false}` for invalid/deleted entity IDs |
| `setEntityGeomZ_invalid_id_error` | `tests/api/` | setEntityGeomZ emits error event for invalid entity ID (no silent no-op) |
| `topological_op_geomZ_policy` | `tests/tools/` | Each topological tool (trim/extend/fillet) follows documented geomZ policy |

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

### 11.1 C++ Engine Files
- Entity records (RectRec, LineRec, PolyRec, CircleRec, PolygonRec, ArrowRec, TextRec) in `core/types.h`.
- Entity manager storage in `entity/entity_manager.h`.
- **TransformSnapshot** in `history/history_types.h` (must add elevationZ field).
- Picking system in `interaction/pick_system.h` (ensure geomZ ignored).
- Snapping system in `interaction/snap_solver.cpp` (ensure geomZ ignored).
- Transform sessions in `interaction/interaction_session.h` (preserve geomZ).
- Bounds caches and hit-test caches (AABB and selection overlays).
- Text anchors and caret layout (ensure geomZ does not affect 2D layout).
- Render buffer generation in `render/render.cpp` (render vertex Z vs geomZ).
- Snapshot serialization/deserialization in `persistence/` and version constants in `snapshot_internal.h`.
- WASM command buffer layouts in `command/command_dispatch.cpp`.

### 11.2 TypeScript/Runtime Files
- Runtime facades in `apps/web/engine/**`.
- Command buffer encoding in `apps/web/engine/core/commandBuffer.ts`.
- Protocol types in `apps/web/engine/core/protocol.ts`.
- WASM types in `apps/web/engine/core/wasm-types.ts`.

### 11.3 Tooling and Governance
- Offline fixture upgrader: `tooling/upgrade_fixtures.js` (new).
- Fixture version check: `tooling/governance/check_fixture_versions.js` (new).
- API manifest regeneration: `tooling/governance/generate_engine_api_manifest.js`.

### 11.4 Tests
- Transform tests: undo/redo elevationZ preservation.
- Picking tests: geomZ ignored in 2D.
- Snapping tests: geomZ not leaked.
- Snapshot tests: round-trip, version rejection.
- Overflow recovery tests: geomZ preserved after resync.

## 12. Implementation Validation Checklist

### 12.1 CI Gates to Enforce

| Gate | Script | Trigger |
|------|--------|---------|
| Struct packing validation | C++ `static_assert` in `types.h` | Build failure |
| Snapshot version rejection | `check_snapshot_version.js` | PR merge blocked |
| API manifest drift | `check_engine_api_manifest.js` | PR merge blocked |
| Boundary enforcement | `check_boundaries.js` | PR merge blocked |
| Perf budget regression | `check_perf_budgets.js` (new) | PR merge blocked |
| Fixture version check | `check_fixture_versions.js` (new) | PR merge blocked after v4 |

### 12.2 Metrics to Measure

| Metric | Baseline | Budget | How to Measure |
|--------|----------|--------|----------------|
| Transform update latency | (calibrate) | ≤ 250 µs | Perf fixture with 10k entities |
| Picking query latency | (calibrate) | ≤ 300 µs | Perf fixture with 10k entities |
| Entity record sizeof | Current | Current + 4 bytes | `static_assert` |
| Snapshot size growth | Current | ≤ +4 bytes/entity | Fixture comparison |

### 12.3 Final Success Criteria

- [ ] All entity types (Rect, Line, Poly, Circle, Polygon, Arrow, Text) have elevationZ field
- [ ] TransformSnapshot includes elevationZ
- [ ] Snapshot version bumped to 4
- [ ] v3 snapshots fail fast with `SnapshotVersionUnsupported` event
- [ ] Offline upgrader exists and CI validates no v3 fixtures post-deploy
- [ ] `getEntityGeomZ`/`setEntityGeomZ` facades exist with documented contracts
- [ ] NaN/Inf validation at all input boundaries
- [ ] All tests in Section 8.2 pass
- [ ] Perf budgets hold on calibrated fixture
- [ ] Doc drift checks pass (`engine-api.md` updated)
