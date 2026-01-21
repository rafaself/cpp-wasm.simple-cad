# AGENTS.md — Source of Truth

**THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR THE PROJECT ARCHITECTURE AND AGENT GOVERNANCE.**

> **Note for AI Agents:** If you identify inconsistencies, gaps, or improvement opportunities in this documentation, **propose changes** (with exact patch blocks). Documentation must evolve alongside the project.

> **Design System:** UI rules are defined in **`apps/web/project-guidelines.md`** and **`DESIGN.md`**. All UI work MUST follow it.

---

## 1. Vision and Philosophy

### Product

High-performance vector CAD editor with world-class UX (Figma-grade), extended by domain modules (initial focus: **Electrical**).

### Strategic Premise

* **Atlas** is the CAD/geometry/render engine (C++/WASM) and must remain **domain-agnostic**.
* **Electrical Core** is a separate domain kernel and must remain **CAD-engine-agnostic**.
* The application is a composition of independent kernels integrated via **strict interfaces and transactions**.

### Development Philosophy

| Principle                 | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| **State of the Art**      | Industry best practices only. Mediocre solutions are unacceptable.          |
| **Quality > Speed**       | Fewer excellent features > many mediocre features.                          |
| **Performance as Design** | Performance is decided at architecture level, not as late optimization.     |
| **Zero Compromise on UX** | Interactions must be instantaneous (< 16ms) and fluid.                      |
| **Strict Boundaries**     | Every module has clear ownership; cross-layer shortcuts are forbidden.      |
| **Planned Extensibility** | Architecture must allow more domains (hydraulic, civil, etc.) and 3D views. |

### Current Focus

* Solidify the **2D CAD foundation**: drawing, selection, transforms, text, persistence.
* Implement the **Electrical domain kernel** as an independent module integrated via strict contracts.
* Begin adopting **2.5D** (plan + elevation) with a clean path to **3D soon**, without rewriting the core.

---

## 2. Architecture: Engine-First + Domain Plugins (Strict)

The architecture follows the **Engine-First** model: **Atlas (C++/WASM) is the absolute authority over CAD document geometry and rendering buffers.**

Domain modules (e.g., Electrical) are separate kernels providing semantics, validation, and workflows.

### 2.1 Application Layers

1. **React (`apps/web` - Presentation Layer)**

   * Owns only UI state: active tool, viewport, preferences, panels/modals
   * Captures pointer/keyboard events and forwards them to runtime facades
   * **Must not own CAD entities, geometry, or canonical document state**
   * Must follow **`DESIGN.md`** for UI components, spacing, typography, and interaction behavior

2. **Runtime Facades (Boundary Layer)**

   * The **only allowed entry point** for feature code
   * Exposes:

     * `AtlasRuntime` (CAD/geometry/render/picking/transforms/persistence)
     * `DomainRuntime` (electrical domain commands/queries/validation)
     * `IntegrationRuntime` (composite transactions that touch both)
   * Enforces:

     * command transport rules (bulk vs hot path)
     * view synchronization
     * boundary checks (no direct engine instances outside `apps/web/engine/**`)

3. **Atlas (`packages/engine` - C++ Engine — CAD Source of Truth)**

   * CAD document state: entities, geometry, styles, layers, hierarchy
   * Selection, picking, snapping
   * Transform sessions (move/resize/rotate/vertex)
   * Text layout + quads
   * Render buffer generation for WebGL2
   * Persistence: strict binary snapshot
   * Target: **2.5D-capable geometry model (Vec3-ready)**; current core is still 2D while default view is 2D

4. **Electrical Core (Domain Kernel — Domain Source of Truth)**

   * Domain entities: components, pins, nets, wires semantic graph, rules, validation
   * Electrical-specific parameters (e.g., mounting heights, conductor properties, circuits)
   * Domain persistence (as extension blocks) + deterministic validation
   * Provides overlays/markers as domain outputs (not React re-renders on pointermove)

5. **Backend (`apps/api`)**

   * Provides authentication, cloud persistence, and heavy compute services.
   * STRICTLY decoupled from the Engine C++ source.
   * Interacts with Frontend via REST/WebSocket.

6. **WebGL2 Renderer (Graphics Backend)**

   * Stateless: consumes Atlas render buffers and draws
   * No geometry calculations, no entity state

### 2.2 Data Flow

```
User Input → React → Runtime Facades → (Atlas / Domain) → Events/Buffers → WebGL Draw
                                      ↓
                               Poll Events → UI Updates (cold path)
```

---

## 3. Canonical Ownership Model

### 3.1 Atlas Owns (Non-negotiable)

* All CAD geometry and styles
* Entity identity for CAD (`EntityId`)
* Selection state and picking tolerances
* Transform sessions and geometry math
* Render buffers (tessellation, overlays, text quads, grid)
* CAD snapshot format (strict versioning)

### 3.2 Electrical Core Owns (Non-negotiable)

* Electrical identity (`ComponentId`, `PinId`, `NetId`, etc.)
* Electrical connectivity graph and constraints
* Domain rules/validation (DRC), numbering, BOM, reports
* Domain parameters (including **semantic heights**)
* Domain extension payloads stored alongside CAD snapshot

### 3.3 Integration Owns

* **Atomic cross-kernel transactions**
* Global undo/redo coherence across Atlas + Domain
* Load/save orchestration across core snapshot + domain extension blocks

---

## 4. 2.5D Now, 3D Soon (No Technical Debt)

### 4.0 Units, Precision & Tolerances (Normative)

The project MUST adopt a single canonical measurement convention to avoid drift between UI, engine math, and domain validation.

**Canonical Length Unit (World Space):**
- Atlas operates in **World Units (WU)** as its canonical internal unit.
- External units (m/mm/cm/ft/in) MUST be converted at the **Runtime Facades / import/export** boundary, never inside Atlas.
- Current DXF import mapping assumes **1m = 100 WU**; if this mapping changes, update import adapters and tests together.
- Domain kernels MUST remain **engine-agnostic** and MUST NOT adopt Atlas WU as a canonical internal representation.
- Domain parameters that represent physical quantities (length/height/etc.) SHOULD be stored in domain-native units (prefer **SI**, e.g., meters)
  and converted to/from WU only at the **IntegrationRuntime / Runtime Facades / import-export** boundary.

**Numeric Precision:**
- Atlas MUST define and document which numeric type is canonical for geometry (e.g., `float` vs `double`) and keep it consistent.
- Any quantization/rounding policy for persistence MUST be explicit and deterministic.

**Tolerances (Picking/Snapping):**
- User-facing tolerances MUST be expressed in **pixels**, but computed **inside Atlas** using view parameters (scale, DPR, viewport).
- The frontend MUST NOT implement tolerance math or “equivalent pixel radius” calculations.
- Atlas MUST expose stable queries/commands for:
  - current picking tolerance (effective world-space epsilon for current view)
  - snapping radius (effective)

**Rounding / Display Rules:**
- UI formatting (decimals, unit suffix) is presentation-only and MUST NOT change canonical stored values.
- UI MAY store user preferences (e.g., grid step in mm), but the **effective** grid/snap step used by tools MUST be computed and enforced by Atlas.
- Preferences MUST be synchronized via Runtime Facades; the frontend MUST NOT implement independent “effective step” math.

---

### 4.1 Coordinate System & Angles (Normative) — Clarification

- **Screen Space**: pixels, **+Y Down**
- **World Space (Plan View)**: infinite plane, units = canonical world units (see §4.0), **+Y Down convention**
- **Angles**:
  - Public API: **Degrees**
  - Internal Engine: **Radians**
  - Positive rotation: **Clockwise (CW)** due to +Y Down

**Rule (Strict):**
- Feature code in `apps/web/**` MUST NOT implement canonical geometry math, picking tolerances, or deg↔rad conversions for authoritative state.
- Any unit/angle conversion required by UI (degrees display, mm input, etc.) MUST occur only in the **Runtime Facades / bindings layer**.
- Atlas-owned state MUST be set/query via the facade contract only (no “helper conversions” in tool handlers).

### 4.2 Geometry Model: 3D-capable, Used as 2.5D

Atlas must be **3D-capable in the data model**, even if the current view is 2D.

* Canonical geometry types MUST be Vec3-ready (x, y, z) or equivalent.
* The 2D editor is a **top-down projection**; Z is stored for dimensioning and future 3D visualization.
* The renderer may ignore Z in 2D view, but Z MUST remain authoritative in Atlas for 3D computations when used.

**Implementation note:** Core geometry records are still 2D (Point2). Z currently exists only in render vertices (draw order),
so Vec3-ready storage is required work and should not be assumed in feature code yet.

### 4.3 Heights: Geometric vs Semantic (Normative)

There are two height concepts:

1. **Geometric Z (Atlas, generic)**

* Used for: true 3D length, vertical transitions, future 3D view, collision/clearance.
* Stored as either:

  * constant elevation per entity/segment, or
  * per-vertex Z (only if required later)

2. **Semantic Height (Electrical Core, domain parameter)**

* Used for: mounting height, standards compliance, documentation.
* Example: a socket symbol may remain in plan geometry but have `mountingHeight=0.30m`.

**Rule:** Electrical semantics must not leak into Atlas. Atlas stores only generic geometry and generic per-entity extension storage (if present).

### 4.4 Conduit / Eletroduto Modeling (Recommended Baseline)

To avoid future rewrites:

* Horizontal runs: **constant elevation** per run/segment
* Elevation changes: explicit **transition entities** (riser/drop)

**Rationale:** this maps cleanly to later 3D visualization and avoids complex per-vertex Z editing edge cases.

---

## 5. Absolute Rules (Non-Negotiable)

### 5.0 Atlas Domain-Agnostic Rule (Strict)

**Atlas MUST remain strictly domain-agnostic.** This is the highest-priority architectural rule.

Implications (non-negotiable):

* Atlas MUST NOT encode or interpret any domain concepts (e.g., socket, circuit, net, pin, wire semantics, standards).
* Atlas MUST only handle generic CAD concerns: geometry, styles, layers, hierarchy, selection/picking/snapping, transforms, render buffers, persistence.
* Atlas MAY store generic fields (e.g., `elevationZ`, `drawOrder`) and opaque extension blocks, but MUST NOT interpret domain payloads.
* Domain kernels own all business rules and validation; Atlas may only validate structural integrity (e.g., snapshot version, bounds, finite floats).

### 5.1 Forbidden

| Violation                                             | Why it is critical                               |
| ----------------------------------------------------- | ------------------------------------------------ |
| Store CAD entity lists/geometry in Zustand/React      | Shadow state → desync                            |
| Compute CAD geometry/picking tolerances in JS         | Precision/behavior drift; breaks engine-first    |
| Serialize/build command objects on pointermove        | Hot-path allocations; latency and GC spikes      |
| Directly call native engine instances outside facades | Boundary breach; impossible governance           |
| Add compatibility shims/adapters/legacy bridges       | Creates divergent sources of truth and conflicts |
| Domain logic inside Atlas                             | Destroys domain pluggability                     |
| CAD internals inside Domain core                      | Destroys engine independence                     |

### 5.2 Mandatory

| Practice                                  | Justification                                           |
| ----------------------------------------- | ------------------------------------------------------- |
| All feature code uses Runtime Facades     | Enforces boundaries and contracts                       |
| Transform operations use session protocol | begin/update/commit; zero allocation on pointermove     |
| View sync is strict                       | Engine tolerances depend on current view parameters     |
| Cross-kernel operations are atomic        | Avoid split-brain state between CAD and Electrical      |
| Deterministic tests for critical logic    | Prevent regressions in transforms/picking/serialization |
| UI follows DESIGN.md                      | UI consistency and predictable UX                       |

### 5.3 Compatibility Policy (Strict)

This project is in active development.

* **No backward compatibility** for internal APIs, module paths, or runtime behavior.
* **No shims, adapters, deprecated re-exports, alias modules, or migration bridges**.
* If a refactor breaks call sites, fix call sites immediately.

Persistence:

* Atlas snapshot format is **strictly versioned**.
* Unsupported versions MUST fail fast (no in-engine migrations).
* Any future migrations, if ever needed, must be done by **offline tooling**, never by runtime compatibility layers.

---

## 6. Performance Requirements

### 6.0 Execution Model (WASM) (Normative)

Atlas execution model MUST be explicit to avoid incorrect assumptions in scheduling, polling, and renderer orchestration.

- Default assumption: **single-threaded WASM** execution unless explicitly enabled and documented otherwise.
- If pthreads/workers are introduced later:
  - event delivery semantics (ring buffer) MUST remain deterministic
  - synchronization points MUST be documented (what can run concurrently and what cannot)
  - CI must include at least one stress/perf test to validate no deadlocks and stable latency

### 6.1 Targets

| Metric                | Target         | Notes                                               |
| --------------------- | -------------- | --------------------------------------------------- |
| Frame time            | < 16ms (60fps) | Fluid interaction                                   |
| Input latency         | < 8ms          | Pointer-driven interactions must feel instantaneous |
| Picking               | No O(n) scans  | Spatial-indexed broad phase + narrow phase          |
| Bulk command apply    | < 1ms          | Binary command buffer processing                    |
| Render buffer rebuild | Incremental    | Rebuild only modified entities                      |

### 6.2 Hot Path Rules

**C++ (Atlas hot paths):**

* Forbidden: dynamic allocation, `std::string` churn, `std::vector` reallocation, `std::map` lookups
* Mandatory: POD structs for shared data, fixed-size buffers, arenas, cache-friendly layouts

**JS (interactive hot paths):**

* Forbidden: object creation, array spreads, closure creation inside pointermove
* Mandatory: direct WASM session calls, reuse buffers, typed arrays where applicable

---

## 7. View Synchronization (Normative)

Whenever viewport changes, the frontend MUST synchronize view parameters with Atlas.

* At minimum: `viewScale`
* If supported: viewport size, DPR, pan/offset

**Rule:** tolerances and hit testing are view-dependent. The frontend MUST NOT compute pixel tolerances itself.

---

## 8. Engine ↔ Frontend Communication (Normative)

### 8.1 JS → Atlas Transport (Hybrid)

Two sanctioned paths:

1. **Bulk/Cold Path: Binary Command Buffer**

* Use for commits, batch edits, non-per-frame changes.
* The runtime may offer ergonomic helpers, but the **WASM boundary must receive a binary buffer**.

2. **Hot Path: Direct WASM Session Calls**

* Pointermove MUST call `update*` methods directly.
* No command-object serialization on pointermove.

### 8.2 Atlas → JS Events (Polling Ring Buffer)

* Events are delivered via polling.
* Atlas stores events in a **fixed-size ring buffer (2048 slots)**.

**Overflow Semantics (Strict):**

* On overflow, Atlas clears the queue, sets an overflow flag, and returns a single `Overflow` event.
* The frontend MUST execute the Overflow Recovery Contract below.

### 8.3 Overflow Recovery Contract (Mandatory)

On receiving `Overflow`:

1. Pause normal reconciliation.
2. Perform **full resync** via Atlas + Domain queries (selection, properties, overlays, buffers).
3. Rebind WebGL resources if needed.
4. Acknowledge resync (e.g., `ackResync` or equivalent).
5. Resume polling.

---

## 9. Interactive Session Protocols (Strict)

### 9.1 Transform Sessions

Transform sessions are owned by Atlas.

* Frame 0: `beginTransform(...)`
* Frame 1..N: `updateTransform(...)` (hot path; no React state updates)
* Final: `commitTransform()` (transaction boundary)

**Rule:** All transform math lives in Atlas.

### 9.2 Composite Operations (Atlas + Domain)

Any user action that touches both CAD geometry and Electrical semantics MUST be executed as a **single atomic integration transaction**.

Examples:

* Insert electrical symbol: Atlas entities + Electrical component mapping
* Connect wire: Atlas geometry + Electrical net graph update
* Change conduit elevation: Atlas geometric Z + Electrical rules/validation

The integration layer must ensure:

* commit both or rollback both
* global undo/redo coherence

---

## 10. Persistence & Extension Blocks

### 10.1 Atlas Snapshot (Strict)

* Custom binary snapshot with **magic + version header**.
* Unsupported versions fail fast.

### 10.2 Domain Extension Blocks (Pluggable)

The global project save is composed as:

* `AtlasSnapshot` (CAD core)
* `DomainExtensionBlocks[]` where each block is:

  * `domainKey`
  * `domainVersion`
  * `payloadBytes`

**Rule:** Atlas does not interpret domain payloads.

### 10.3 Identity & Mapping

* Atlas owns `EntityId`.
* Electrical core owns `ComponentId/PinId/NetId`.
* Mapping lives in the Electrical core (or as a domain extension payload), referencing `EntityId`.

---

## 11. Code Quality Standards

### 11.1 General

* Type safety is mandatory.
* No hidden side effects in selectors.
* Deterministic behavior is mandatory for critical workflows.

### 11.2 C++

* Modern C++17/20
* RAII mandatory
* No raw `new/delete` in core hot paths
* POD structs for WASM-shared data

### 11.3 TypeScript

* Strict mode mandatory
* No unjustified `any`
* Prefer `unknown` + type guards
* Frontend feature code MUST not bypass runtime facades

### 11.4 Tests

* C++ tests via CTest
* Frontend tests via Vitest
* Deterministic tests required for:

  * transforms (including angle conventions)
  * picking tolerance behavior (viewScale)
  * overflow recovery behavior
  * snapshot save/load (version rejection)

---

## 12. Internationalization (i18n)

* UI display strings: **Portuguese (pt-BR)**
* Code internals: **English**
* All user-facing strings must be extractable (no inline hardcoding).

---

## 13. Documentation Topology (Mandatory)

| Document                           | Purpose                                                 |
| ---------------------------------- | ------------------------------------------------------- |
| `AGENTS.md`                        | Architecture + boundaries + governance (this file)      |
| `DESIGN.md`                        | UI rules, components, spacing, interaction patterns     |
| `docs/agents/engine-api.md`        | Atlas public API reference (WASM facade contract)       |
| `docs/agents/domain-api.md`        | Domain kernel API reference                             |
| `docs/agents/frontend-patterns.md` | React patterns, hot path rules, rendering orchestration |
| `docs/ENGINE_FIRST_GOVERNANCE.md`  | Boundary enforcement policy + CI gates                  |
| `docs/AGENT_RUNBOOK.md`            | Agent operating checklist                               |
| `docs/plans/2_5d_adoption_plan.md` | Canonical plan for introducing geometric Z without 3D viewport |

---

## 14. Governance Gates (CI-Required)

The following checks MUST pass before merge:

1. **Boundary checks**

* No direct engine instance usage outside `apps/web/engine/**`.
* No cross-kernel imports (Atlas ↔ Domain) outside runtime facades.

2. **Domain contamination checks**

* No domain identifiers or standards references inside `packages/engine/**` (enforced by CI scan on **source code**).
  - The scan MUST exclude docs/fixtures or use an explicit allowlist to avoid false positives.
  - Any exception MUST be justified and recorded (allowlist entry + rationale).
* No domain types or headers referenced by Atlas public headers.
* Domain kernels MUST NOT import Atlas internals (only facades/contracts).

3. **Hot path checks**

* Pointermove handlers must not allocate or create closures.
* Interactive sessions must use begin/update/commit.
* Add linting for `onPointerMove`/`pointermove` to flag per-event allocations (objects/arrays/spreads).
* Add a lightweight perf test to assert:
  * no React state updates on hot path
  * no command serialization on hot path
  * stable frame time budget under a defined scene baseline

4. **Doc drift checks**

* Runtime public APIs must match `engine-api.md` and manifests.

5. **Snapshot checks**

* Version mismatch must fail fast.

6. **Performance budget checks**

* Add a deterministic scene fixture and micro-benchmarks for:
  * picking query cost
  * transform update cost
  * render buffer incremental rebuild cost
* CI MUST fail if budgets regress beyond agreed thresholds (stored as numbers, not prose).

---

## 15. How to Run Checks

```bash
# Governance (budgets, boundaries, manifest)
cd apps/web && pnpm governance:check

# Doc drift guard
node tooling/governance/check_docs_references.js

# Regenerate engine API manifest (after bindings changes)
node tooling/governance/generate_engine_api_manifest.js

# Frontend tests
cd apps/web && pnpm test

# C++ tests
cd packages/engine/build_native && ctest --output-on-failure
```

---

## 16. Commands (General)

```bash
# Full build
make fbuild

# Dev (frontend only)
cd apps/web && pnpm dev

# Code size report
./tooling/scripts/loc-report.sh
```

---

## 17. Code Size Governance (SRP)

To maintain code quality and prevent monolithic files, the following size limits are enforced.

### File Size Thresholds

| Area                         | Review Threshold | Mandatory Refactor |
| ---------------------------- | ---------------- | ------------------ |
| C++ engine (`packages/engine/**`) | > 450 LOC        | > 800 LOC          |
| C++ tests (`packages/engine/tests/**`)   | > 600 LOC        | > 1000 LOC         |
| TS/TSX (`apps/web/**`)       | > 350 LOC        | > 600 LOC          |
| TS tests                     | > 400 LOC        | > 700 LOC          |

### Function Length Guardrails

* Review: any function > 80 LOC
* Mandatory refactor: any function > 120 LOC
* Exception: data-heavy switches with clear 1:1 mapping

### Forbidden Patterns

| Pattern              | Why Forbidden                 |
| -------------------- | ----------------------------- |
| `utils.ts` > 200 LOC | Becomes a dumping ground      |
| Manager > 500 LOC    | Hidden monolith               |
| Cross-layer imports  | Engine-first violation        |
| CAD state in Zustand | Breaks single source of truth |

Budgets and exceptions live in `tooling/governance/file_size_budget.json` and `tooling/governance/file_size_budget_exceptions.json`.
