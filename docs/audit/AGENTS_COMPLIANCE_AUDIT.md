# AGENTS.md Compliance Audit (v2)

Prepared on: 2026-01-21  
Evidence captured on: 2026-01-21

Repo: `/home/rafa/dev/eletrocad-webapp`

---

## Repo Inventory

### Environment & Toolchain (local)
| Item | Observed | Evidence |
| --- | --- | --- |
| OS | Linux (WSL2) | Command: `uname -a` (scope: repo root) → `Linux rafa112025 6.6.87.2-microsoft-standard-WSL2 ...` |
| Node.js | v25.2.1 | Command: `node -v` (scope: repo root) → `v25.2.1` |
| pnpm | 10.26.2 | Command: `pnpm -v` (scope: repo root) → `10.26.2` |
| Python | Not installed | Command: `python --version` (scope: repo root) → `/bin/bash: line 1: python: command not found` |
| CMake/CTest | 3.28.3 | Commands: `cmake --version`, `ctest --version` (scope: repo root) → `cmake version 3.28.3` / `ctest version 3.28.3` |

### Project Types & Package Manager
- Frontend: React + TypeScript (Vite); Backend: FastAPI; Engine: C++ → WASM. Evidence: `README.md:7-11`.
- Primary package manager: pnpm. Evidence: `README.md:66-66`, `apps/web/package.json:5-5`.

### Top-Level Directories
- Evidence: command `ls` (scope: repo root) → `AGENTS.md`, `apps`, `packages`, `docs`, `tooling` (excerpt).

---

## Backend Audit Status

Status: **Not Executed (Not Started / Out of Scope for this run)**
- Reason: Local backend execution not attempted for this run; Python tooling missing locally.
- Commands attempted (scope: repo root):
  - `python --version` → `/bin/bash: line 1: python: command not found`
- Minimum steps to enable backend verification:
  - Install Python (README references FastAPI): `README.md:9-11`.
  - Create venv and install deps (README instructions): `README.md:55-61`.

**Note:** Any backend-related AGENTS requirements are marked **Unknown / Not Verified** in the matrix below.

---

## Audit Confidence Levels (Optional)
| Subsystem | Confidence | Rationale | Evidence |
| --- | --- | --- | --- |
| Web | Medium | Multiple local checks executed but failing; CI defined. | CI: `ci.yml:22-63`. Local commands: `pnpm -C apps/web typecheck`, `lint`, `test` outputs (see Phase 2). |
| Engine | Medium | CI defined; local build/tests not run (missing build dir). | CI: `ci.yml:64-80`. Local: `ls packages/engine/build_native` → `ls: cannot access 'packages/engine/build_native': No such file or directory`. |
| Backend | Low | CI defined; local tooling missing (Python); backend checks not executed locally for this run. | CI: `ci.yml:126-147`. Local: `python --version` failure. |
| Tooling/Governance | Medium | Governance scripts run locally with mixed results. | Commands in Phase 2. |

---

## Scope & Milestones (MVP vs Planned Gates)

| Gate Class | Requirements (examples) | Trigger | Evidence |
| --- | --- | --- | --- |
| MVP (Now) | Web typecheck/lint/tests, boundary enforcement, budgets, doc drift | Current CI gates | `ci.yml:22-63` |
| Planned (Future) | Electrical Core + integration transactions, domain persistence blocks | Phase 4 “Electrical Integration Contract” milestone | `docs/plans/2_5d_adoption_plan.md:279-286` |

Planned gates are marked in the matrix as **Planned / Not Yet Implemented** with a trigger.

---

## Audit Checklist + Conformance Matrix

| ID | Requirement (Normative) | Automatable | Verification Method | Evidence | Status | Notes / Risk | Remediation (Summary) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A-001 | AGENTS.md is the single source of truth for architecture/governance. | No | Doc review for conflicts | `AGENTS.md:1-4` and conflicting claim `apps/web/project-guidelines.md:1-3` | **Partial** | Conflicting “single source of truth” claims create governance ambiguity. | Update project-guidelines to defer to AGENTS.md. |
| A-002 | UI work MUST follow `apps/web/project-guidelines.md` and `DESIGN.md`. | Yes | Lint + governance scripts | Command: `pnpm -C apps/web lint` (scope: apps/web) → excerpt: `ColorInputs.tsx ... Raw color literals are forbidden...` | **Fail** | Token/arbitrary value violations indicate DESIGN.md noncompliance. | Migrate raw colors/arbitrary values to tokens; reduce allowlists. |
| A-003 | React owns only UI state; no CAD entities/geometry in Zustand/React. | Partial (tests) | Store review + tests | `apps/web/stores/useUIStore.ts:21-55`; `apps/web/tests/documentStoreGate.test.ts:28-45` | **Pass** | Current store scopes appear UI-only; gate test exists. | Keep enforcement. |
| A-004 | Feature code uses Runtime Facades only; no direct engine imports outside approved entrypoints/allowlist. | Yes (but flawed) | Boundary script + import scan | Boundary script logic: `tooling/governance/check_boundaries.js:123-134`; multiline import example: `apps/web/features/editor/colors/ColorRibbonControls.tsx:7-16` | **Fail** | Regex line-based scan misses multiline imports, allowing violations. | Replace with AST-based import analysis; fix violations or allowlist with rationale. |
| A-005 | No `runtime.engine.*` usage outside `apps/web/engine/**`. | Yes | Ripgrep scan | Command: `rg -n "runtime\.engine" apps/web || echo "0 matches"` (scope: repo root) → `0 matches` | **Pass** | No direct engine instance access found. | Continue enforcement. |
| A-006 | Atlas must remain domain-agnostic (no domain semantics in `packages/engine/**`). | Partial | Term scan | Command: `rg -n -i "electrical|eletro|circuit|conduit|eletroduto|netlist|bom|drc|socket" packages/engine | head -n 3` (scope: repo root) → `packages/engine/engine/render/vector_ir.h:1:#ifndef ELETROCAD_ENGINE_VECTOR_IR_H` | **Pass** | Scan-based only; no CI gate. | Add domain contamination scan in CI. |
| A-007 | Electrical Core exists and is CAD-engine-agnostic. | No | Repo structure + plan review | `docs/architecture/domain-api.md:1-13` (placeholder); `docs/plans/2_5d_adoption_plan.md:279-286` (Phase 4 Electrical Integration Contract) | **Planned / Not Yet Implemented** | Gate: Planned. Trigger: Phase 4 Electrical Integration Contract milestone. | Implement domain module + API contract when Phase 4 starts. |
| A-008 | IntegrationRuntime provides atomic cross-kernel transactions. | Partial | Code review | `apps/web/engine/core/IntegrationRuntime.ts:1-63` | **Partial** | Integration exists, but no concrete domain runtime implementation. | Add real domain runtime and integration transactions. |
| A-009 | Backend strictly decoupled from engine C++ source. | Partial | Code scan (no local backend toolchain) | Command: `rg -n "engine" apps/api/app -g '*.py'` (scope: repo root) → `apps/api/app/modules/engine/models/__init__.py:1` only | **Unknown / Not Verified** | Backend checks not executed locally for this run; decoupling not verified by backend tests. | Enable backend tooling and run backend checks. |
| B-001 | Unit/angle conversions MUST occur only in Runtime Facades/bindings (no canonical geometry math in feature code). | No | Code review | `apps/web/utils/viewportMath.ts:1-6`; `apps/web/features/editor/interactions/useInteractionManager.ts:133-145` | **Fail** | Feature layer computes screen↔world. | Move conversions into runtime facade. |
| B-002 | Picking tolerances computed inside Atlas; frontend MUST NOT compute world tolerance. | No | Code review | `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:166-168`; `apps/web/features/editor/interactions/handlers/TextHandler.tsx:220-221` | **Fail** | JS computes tolerance `10 / scale`. | Add engine API to query tolerance; remove JS math. |
| B-003 | Atlas MUST expose stable queries for picking tolerance / snapping radius. | No | API scan | Command: `rg -n "getPickingTolerance|getSnapTolerance" packages/engine/engine || echo "0 matches"` (scope: repo root) → `0 matches` | **Fail** | No explicit tolerance query API found. | Add facade methods for tolerance queries. |
| B-004 | Atlas numeric type for geometry documented & consistent. | Partial | Code + docs | `packages/engine/engine/core/types.h:39-65`; `docs/plans/2_5d_adoption_plan.md:30-33` | **Pass** | Float32 geometry documented. | Maintain consistency. |
| B-005 | Quantization/rounding policy for persistence MUST be explicit/deterministic. | No | Doc scan | Command: `rg -n "quantization|rounding|quantize" docs/architecture/engine-api.md || echo "0 matches"` (scope: repo root) → `0 matches` | **Partial** | Deterministic parsing exists but policy is undocumented. | Document rounding/quantization policy. |
| B-006 | Geometry model must be 3D-capable (Vec3-ready); core still 2D. | Partial | Code + docs | `packages/engine/engine/core/types.h:65-103`; `AGENTS.md:182-191` | **Partial** | elevationZ exists; Point2 still used. | Continue 2.5D plan. |
| C-001 | Hot path must avoid allocations/closures on pointermove. | No | Code review | `apps/web/features/editor/interactions/useInteractionManager.ts:133-145` | **Fail** | `buildContext` allocates objects per pointermove. | Use preallocated buffers or runtime conversion. |
| C-002 | Pointermove must not serialize command objects; use direct WASM session calls. | Partial (tests) | Tests + code | `apps/web/tests/perf/DraftingPerformance.test.ts:6-20`; `apps/web/features/editor/interactions/handlers/DraftingHandler.tsx:223-231` | **Pass** | Drafting update uses `updateDraft` and test asserts no per-move apply. | Extend coverage to other tools. |
| C-003 | Transform sessions use begin/update/commit protocol. | Partial | Code + tests | `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:197-209`; `apps/web/tests/interactions/SelectionHandler.test.ts:15-24` | **Pass** | Session protocol used in selection handler. | Ensure all tools follow. |
| C-004 | View sync is strict (viewScale/viewport sync to Atlas). | Yes | Code review | `apps/web/features/editor/components/EngineInteractionLayer.tsx:107-120` | **Pass** | SetViewScale dispatched on view changes. | Keep. |
| C-005 | Event ring buffer fixed size 2048; overflow semantics. | Yes | Code review | `packages/engine/engine/internal/engine_state.h:61-67`; `packages/engine/engine/impl/engine_event.cpp:88-97,333-341` | **Pass** | Overflow clears queue and emits Overflow event. | — |
| C-006 | Frontend implements Overflow Recovery Contract (full resync + ack + rebind). | Partial | Code review + non-existence scan | Resync: `apps/web/engine/core/useEngineEvents.ts:69-76`; `apps/web/engine/core/engineEventResync.ts:8-37`; No rebind step: Command `rg -n "rebind|rebindWebGL|rebindResources" apps/web/engine || echo "0 matches"` → `0 matches` | **Partial** | Resync + ack exist; WebGL rebind step not found. | Add explicit rebind in resync path. |
| D-001 | Snapshot format strictly versioned; unsupported versions fail fast. | Yes | Code review | `packages/engine/engine/persistence/snapshot.cpp:23-28` | **Pass** | Unsupported versions return `EngineError::UnsupportedVersion`. | Add tests for rejection. |
| D-002 | Domain Extension Blocks supported in persistence. | No | Code scan | Command: `rg -n "DomainExtension|extension block|domain extension" packages/engine/engine/persistence || echo "0 matches"` → `0 matches` | **Fail** | No extension block persistence found. | Implement extension blocks in snapshot format. |
| E-001 | TypeScript strict mode mandatory. | Yes | Config review | `apps/web/tsconfig.json:9-9` | **Pass** | Strict mode enabled. | — |
| E-002 | No unjustified `any`; prefer `unknown` + guards. | Partial | Code scan | `apps/web/components/TextCaretOverlay.tsx:176-180` (`window as any`) | **Partial** | `any` usage present. | Replace `any` with `unknown` + type guards. |
| E-003 | File size budgets match AGENTS and are enforced. | Yes | Config + governance | AGENTS thresholds: `AGENTS.md:564-569`; Governance thresholds: `tooling/governance/file_size_budget.json:1-6`; Enforcement failure: command `pnpm -C apps/web governance:budgets` output shows hard-cap violations. | **Fail** | Policy drift + hard-cap violations. | Align docs/config and refactor or add exceptions. |
| E-004 | Function length guardrails enforced (>80/120 LOC). | No | Script scan | Command: `rg -n "function length|function-length|max function" tooling/governance || echo "0 matches"` (scope: repo root) → `0 matches` | **Fail** | Guardrails not enforced by tooling. | Add lint/script to enforce function length. |
| F-001 | Frontend tests via Vitest. | Yes | CI + config | `apps/web/vitest.config.ts:6-12`; CI: `ci.yml:55-57` | **Pass** | Vitest configured and run in CI. | — |
| F-002 | C++ tests via CTest. | Yes | CI | `ci.yml:64-80` | **Pass** | CTest run in CI. | — |
| F-003 | Deterministic tests for transforms, picking tolerance, overflow recovery, snapshot version rejection. | Partial | Test review + non-existence scan | Overflow test: `packages/engine/tests/event_stream_test.cpp:55-71`; Transform tests: `apps/web/tests/rotation/angleNormalization.test.ts:12-164`; No version rejection tests: command `rg -n "UnsupportedVersion" packages/engine/tests apps/web/tests || echo "0 matches"` → `0 matches` | **Partial** | Missing snapshot version rejection tests; tolerance vs viewScale tests not explicit. | Add tests for version mismatch + viewScale tolerance. |
| G-001 | UI strings are pt-BR and extractable (no inline hardcoding). | No | Code review | Inline strings: `apps/web/features/editor/components/EditorTabs.tsx:25-45`; `apps/web/features/editor/components/ribbon/RibbonOverflowMenu.tsx:83-101` | **Fail** | Inline strings not routed through i18n labels. | Move to `apps/web/i18n/labels.ts`. |
| H-001 | Documentation topology files exist. | Partial | Doc review | `docs/architecture/engine-api.md:1-5`; `docs/architecture/domain-api.md:1-13` (placeholder); `docs/architecture/frontend-patterns.md:1-5`; `docs/api/ENGINE_API_MANIFEST.md:1-5`; `docs/governance/ENGINE_FIRST_GOVERNANCE.md:1-12`; `docs/governance/AGENT_RUNBOOK.md:1-17` | **Partial** | Domain API doc is placeholder. | Populate domain API doc. |
| I-001 | Boundary checks in CI (no engine usage outside facades). | Partial | CI + script | CI: `ci.yml:61-63`; Script: `tooling/governance/check_boundaries.js:123-134` | **Partial** | CI runs checker, but checker is insufficient (regex). | Replace with AST-based boundary checker. |
| I-002 | Domain contamination checks in CI. | No | Tooling scan | Command: `rg -n "domain contamination" tooling/governance || echo "0 matches"` (scope: repo root) → `0 matches` | **Fail** | No domain contamination scan present. | Add CI scan with allowlist. |
| I-003 | Hot path checks to flag pointermove allocations/closures. | Partial | Script review | `tooling/governance/check_hot_path.js:35-66` | **Partial** | Script only checks setState patterns; not allocations. | Add AST-based hot-path lint. |
| I-004 | Doc drift checks required. | Yes | CI + command | CI: `ci.yml:108-110`; Command: `node tooling/governance/check_docs_references.js` (scope: repo root) → `Doc reference check passed.` | **Pass** | Doc drift check exists and passes locally. | — |
| I-005 | Performance budget checks with deterministic fixture and CI gates. | Partial | Script + data | Command: `node tooling/governance/check_perf_budgets.js` → metrics pass; Placeholder results: `tooling/governance/perf_results.json:1-9` | **Partial** | Budgets pass but results are placeholders. | Implement real perf harness and update results. |
| I-006 | CI checks (typecheck, lint, format, tests, build, governance) must pass before merge. | Yes | CI + local execution | CI definitions: `ci.yml:46-63`; Local failures: `pnpm -C apps/web typecheck` output shows syntax error; `pnpm -C apps/web lint` output shows token violations; `pnpm -C apps/web test` output shows failures. | **Fail** | Local checks fail. | Fix lint/typecheck/tests. |

---

## Phase 2 — Automated Audit

### CI Verified vs Local Reproducibility
| Area | Verified in CI | Verified locally | Evidence |
| --- | --- | --- | --- |
| Web | Yes | Attempted — **Failed** | CI: `ci.yml:22-63`. Local: `pnpm -C apps/web typecheck` → `utils/analytics/ribbonAlignmentAudit.ts(235,21): error TS1005: ',' expected.`; `pnpm -C apps/web lint` → token errors; `pnpm -C apps/web test` → 5 failed files. |
| Engine | Yes | **Not verified locally** | CI: `ci.yml:64-80`. Local: `ls packages/engine/build_native` → `ls: cannot access 'packages/engine/build_native': No such file or directory`. |
| Backend | Yes | **Not verified locally (out of scope for this run)** | CI: `ci.yml:126-147`. Local: `python --version` → `/bin/bash: line 1: python: command not found`. |

### Command Evidence (Selected)
| Command (scope) | Result | Evidence (excerpt) |
| --- | --- | --- |
| `pnpm -C apps/web typecheck` (apps/web) | ❌ Fail | `utils/analytics/ribbonAlignmentAudit.ts(235,21): error TS1005: ',' expected.` |
| `pnpm -C apps/web lint` (apps/web) | ❌ Fail | `ColorInputs.tsx ... Raw color literals are forbidden ...` |
| `pnpm -C apps/web format:check` (apps/web) | ❌ Fail | `[error]   238 |   const TARGET_BODY_HEIGHT = 68` (syntax error in `ribbonAlignmentAudit.ts`) |
| `pnpm -C apps/web test` (apps/web) | ❌ Fail | `Test Files  5 failed | 53 passed (58)` |
| `pnpm -C apps/web governance:budgets` (apps/web) | ❌ Fail | `Hard cap violations: EngineRuntime.ts — 642 LOC ...` |
| `node tooling/governance/check_arbitrary_values.js` (repo root) | ❌ Fail | `apps/web/features/editor/components/ribbon/ribbonButtonState.ts:157` → `h-[52px]` |
| `node tooling/governance/check_legacy_tokens.js` (repo root) | ❌ Fail | `design/global.css:302` → `color: hsl(var(--color-text-muted));` |
| `node tooling/governance/check_docs_references.js` (repo root) | ✅ Pass | `Doc reference check passed.` |
| `node tooling/governance/check_boundaries.js` (repo root) | ✅ Pass (insufficient) | `Boundary checks passed.` |
| `node tooling/governance/check_engine_api_manifest.js` (repo root) | ✅ Pass | `Engine API manifest is up to date.` |
| `node tooling/governance/check_perf_budgets.js` (repo root) | ✅ Pass (placeholder) | `transform_update_us: 250 (budget 250)` |

---

## Phase 3 — Manual Audit by Risk Areas

### A) Architecture & Boundaries
- **Boundary enforcement gap:** Checker is line-based; multiline imports bypass detection. Evidence: `tooling/governance/check_boundaries.js:123-134` (line-based parsing) + multiline import in `apps/web/features/editor/colors/ColorRibbonControls.tsx:7-16`.
- **Engine-first violations:** Feature layer computes screen↔world and tolerance math. Evidence: `apps/web/utils/viewportMath.ts:1-6`, `apps/web/features/editor/interactions/useInteractionManager.ts:133-145`, `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:166-168`.
- **Domain kernel planned:** No concrete Electrical Core module present yet (planned gate). Evidence: command `rg --files -g '*domain*'` (scope: repo root) → `docs/architecture/domain-api.md`, `packages/engine/engine/domain/domain_extension.h`.

### B) Code Quality & Maintainability
- **Syntax error blocks typecheck/format:** Invalid identifier in analytics file. Evidence: command `pnpm -C apps/web typecheck` (excerpt in Phase 2).
- **Code size governance failures:** Hard-cap violations reported. Evidence: `pnpm -C apps/web governance:budgets` output.
- **Lint debt:** Raw color literals and arbitrary values. Evidence: `pnpm -C apps/web lint` excerpt in Phase 2.

### C) Agent-Friendliness
- **Governance ambiguity:** `apps/web/project-guidelines.md` claims “single source of truth,” conflicting with `AGENTS.md`. Evidence: `apps/web/project-guidelines.md:1-3` and `AGENTS.md:1-4`.

### D) UI/UX Consistency
- **Token governance failures:** `check_arbitrary_values` and `check_legacy_tokens` fail. Evidence: commands in Phase 2.
- **Inline strings bypass i18n:** Evidence: `apps/web/features/editor/components/EditorTabs.tsx:25-45` and `apps/web/features/editor/components/ribbon/RibbonOverflowMenu.tsx:83-101`.

### E) Repo Hygiene & Security Basics
- **Sensitive value in `.env`:** `SUDO_PASSWORD=123`. Evidence: `.env:1-1`.
- **`.env` should be ignored:** `.gitignore:76-80`.

---

## Phase 4 — Findings (Severity, Evidence, Remediation)

### Blocker
1) **Typecheck fails due to syntax error**
- **Evidence:** Command `pnpm -C apps/web typecheck` (apps/web) → `utils/analytics/ribbonAlignmentAudit.ts(235,21): error TS1005: ',' expected.`
- **Risk:** CI failure; blocks merge.
- **Fix:** Rename invalid identifier and re-run typecheck.
- **Owner:** Frontend.

2) **Lint fails with large design-token violations**
- **Evidence:** Command `pnpm -C apps/web lint` → `Raw color literals are forbidden ...` (excerpt in Phase 2).
- **Risk:** CI failure; design drift.
- **Fix:** Migrate raw colors/arbitrary values to semantic tokens.
- **Owner:** Frontend.

3) **Governance budgets hard-cap violations**
- **Evidence:** Command `pnpm -C apps/web governance:budgets` → hard-cap violations (see Phase 2).
- **Risk:** CI failure; SRP drift.
- **Fix:** Refactor oversized files or add documented exceptions.
- **Owner:** Frontend + Engine.

4) **Frontend tests failing (5 files, 11 tests)**
- **Evidence:** Command `pnpm -C apps/web test` → `Test Files  5 failed | 53 passed (58)` (excerpt in Phase 2).
- **Risk:** CI failure; regression risk.
- **Fix:** Align tests with current UI/i18n and logic changes.
- **Owner:** Frontend.

### High
5) **Feature layer computes screen↔world and tolerance math (engine-first violation)**
- **Evidence:** `apps/web/utils/viewportMath.ts:1-6`; `apps/web/features/editor/interactions/useInteractionManager.ts:133-145`; `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:166-168`.
- **Risk:** Precision drift, inconsistent tolerances.
- **Fix:** Move conversions/tolerance queries into runtime/engine APIs.
- **Owner:** Frontend + Engine.

6) **Boundary checker fails on multiline imports (regex-based)**
- **Evidence:** `tooling/governance/check_boundaries.js:123-134` (line-based import parsing); multiline import in `apps/web/features/editor/colors/ColorRibbonControls.tsx:7-16`.
- **Risk:** Undetected boundary violations.
- **Fix:** Replace regex with AST-based import analysis.
- **Owner:** Tooling.

7) **Hot path allocations in pointermove**
- **Evidence:** `apps/web/features/editor/interactions/useInteractionManager.ts:133-145` (allocates `screen`/`world` objects per move).
- **Risk:** GC spikes, latency.
- **Fix:** Use refs/preallocated buffers or runtime-native conversion.
- **Owner:** Frontend.

### Medium
8) **Persistence lacks domain extension blocks**
- **Evidence:** Command `rg -n "DomainExtension|extension block|domain extension" packages/engine/engine/persistence || echo "0 matches"` → `0 matches`.
- **Risk:** Domain data cannot persist alongside snapshots.
- **Fix:** Extend snapshot format with extension blocks.
- **Owner:** Engine.

9) **i18n violations (inline strings not extractable)**
- **Evidence:** `apps/web/features/editor/components/EditorTabs.tsx:25-45`; `apps/web/features/editor/components/ribbon/RibbonOverflowMenu.tsx:83-101`.
- **Risk:** Localization drift.
- **Fix:** Move strings to `apps/web/i18n/labels.ts`.
- **Owner:** Frontend.

10) **Perf budgets are placeholders**
- **Evidence:** `tooling/governance/perf_results.json:1-9` notes “Baseline placeholders”.
- **Risk:** Perf gates not meaningful.
- **Fix:** Implement perf harness and record real baselines.
- **Owner:** Engine/Perf.

11) **File size budgets differ from AGENTS.md**
- **Evidence:** `AGENTS.md:564-569` vs `tooling/governance/file_size_budget.json:1-6`.
- **Risk:** Governance drift.
- **Fix:** Align doc with config or update config to match doc.
- **Owner:** Governance.

### Low
12) **Governance ambiguity due to “single source of truth” conflict**
- **Evidence:** `apps/web/project-guidelines.md:1-3` vs `AGENTS.md:1-4`.
- **Risk:** Confusion for agents.
- **Fix:** Clarify in project-guidelines.
- **Owner:** Docs/Governance.

13) **`.env` contains a hardcoded placeholder password (governance debt)**
- **Evidence:** `.env:1-1` (`SUDO_PASSWORD=123`); `.gitignore:76-80` indicates `.env` should be ignored.
- **Risk:** Low immediate operational risk if no real credentials are used (not verified); normalizes unsafe habit.
- **Fix:** Rename to `.env.example` with no real secrets; ensure `.env` not tracked; add a lightweight CI warning/scan.
- **Owner:** DevOps/Security.

---

## Remediation Plan

### Quick Wins (0–2 days)
1) **Fix TypeScript syntax error**
- Steps: Rename invalid identifier in `apps/web/utils/analytics/ribbonAlignmentAudit.ts`.
- Acceptance: `pnpm -C apps/web typecheck` succeeds.

2) **Unblock failing tests**
- Steps: Update `CommandInput`/command capture tests and color ribbon tests.
- Acceptance: `pnpm -C apps/web test` passes (no failed files).

### Stabilization (1–2 weeks)
1) **Move screen↔world + tolerance math into runtime**
- Steps: Add runtime APIs for screen↔world conversion and tolerance queries; update handlers to use them.
- Acceptance criteria (machine-verifiable):
  - `rg -n "10\s*/\s*.*scale" apps/web/features || echo "0 matches"` → `0 matches`.
  - `rg -n "screenToWorld" apps/web/features || echo "0 matches"` → `0 matches`.
  - New tests verify tolerance from runtime at **3 distinct view scales** (e.g., 0.5, 1.0, 2.0) and assert no JS-side tolerance math.

2) **Boundary checker: AST-based import analysis**
- Steps: Replace regex scan with AST (TypeScript compiler API/ts-morph/ESLint rule).
- Acceptance: Checker detects multiline imports, aliased paths, and re-exports; add unit tests with fixtures.

3) **Resolve token governance failures**
- Steps: Replace raw colors/arbitrary Tailwind values with semantic tokens.
- Acceptance: `pnpm -C apps/web lint` and `node tooling/governance/check_arbitrary_values.js` pass.

4) **Align file size budgets**
- Steps: Choose source-of-truth (docs vs JSON) and update accordingly.
- Acceptance: `pnpm -C apps/web governance:budgets` passes or exceptions added with rationale.

### Hardening (2–6 weeks)
1) **Implement Electrical Core module + persistence blocks**
- Steps: Define DomainRuntime; implement extension blocks in snapshot format; add integration tests.
- Acceptance: Domain payloads persist and roundtrip with snapshots.

2) **Real perf baseline harness**
- Steps: Implement deterministic perf runner; update `perf_results.json` with measured values.
- Acceptance: `notes` field no longer contains “placeholder”; budgets reflect measured results.

3) **Add snapshot version rejection tests**
- Steps: Add tests asserting `UnsupportedVersion` on mismatched snapshot header.
- Acceptance: `rg -n "UnsupportedVersion" packages/engine/tests` returns new tests. (Previously `0 matches`.)

---

## Phase 5 — Enforcement (Stop Regressions)

### Boundary Checker (AST-based)
- **Requirement:** Replace regex scanning with AST parser (TypeScript compiler API / ts-morph / ESLint rule).
- **Why regex fails:** Line-based parsing misses multiline imports and cannot resolve alias or re-export paths.
- **Evidence:** Regex logic in `tooling/governance/check_boundaries.js:123-134` vs multiline import in `apps/web/features/editor/colors/ColorRibbonControls.tsx:7-16`.

### Pre-commit / Pre-push / CI Strategy
- **Pre-commit (fast):** format check on staged files, boundary check (AST-based), doc references, token checks on staged files.
- **Pre-push (optional):** `pnpm -C apps/web typecheck` and targeted tests.
- **CI (full):** lint, typecheck, tests, governance checks, engine build/test, backend checks.
- **Rationale:** Keep pre-commit fast to avoid developer friction; enforce full suite in CI.

### Minimal CI Secret Scan (new)
- **Proposal:** Add a lightweight CI warning scan for committed `.env` or common secret patterns, with allowlist support; upgrade to fail-on-detect when production credentials exist.
- **Example check:** `rg -n "(PASSWORD|API_KEY|SECRET|TOKEN|SUDO_PASSWORD)" . -g '!**/node_modules/**' -g '!.git/**'` + allowlist file.

---

## Documentation Patch Proposals (Required by AGENTS.md)

### 1) Clarify that AGENTS.md is repo-wide source of truth

**File:** `apps/web/project-guidelines.md`

```diff
*** Begin Patch
*** Update File: apps/web/project-guidelines.md
@@
-This document serves as the single source of truth for the project's architecture, folder structure, and coding standards. **All future development and AI prompts must adhere to these constraints.**
+This document defines frontend-specific guidelines and folder conventions for `apps/web`. **The repo-wide architecture and governance source of truth is `AGENTS.md`**, and this document must remain consistent with it.
*** End Patch
```

### 2) Make file size budget JSON the authoritative numeric source

**File:** `AGENTS.md`

```diff
*** Begin Patch
*** Update File: AGENTS.md
@@
-### File Size Thresholds
-
-| Area                         | Review Threshold | Mandatory Refactor |
-| ---------------------------- | ---------------- | ------------------ |
-| C++ engine (`packages/engine/**`) | > 450 LOC        | > 800 LOC          |
-| C++ tests (`packages/engine/tests/**`)   | > 600 LOC        | > 1000 LOC         |
-| TS/TSX (`apps/web/**`)       | > 350 LOC        | > 600 LOC          |
-| TS tests                     | > 400 LOC        | > 700 LOC          |
+### File Size Thresholds
+
+File size budgets are enforced by the governance config files:
+- `tooling/governance/file_size_budget.json`
+- `tooling/governance/file_size_budget_exceptions.json`
+
+These JSON files are the authoritative numeric thresholds; update them (and any related docs) together.
*** End Patch
```

**File:** `docs/governance/ENGINE_FIRST_GOVERNANCE.md`

```diff
*** Begin Patch
*** Update File: docs/governance/ENGINE_FIRST_GOVERNANCE.md
@@
-| Extension           | Soft | Hard | Notes                                     |
-| ------------------- | ---- | ---- | ----------------------------------------- |
-| `.cpp`, `.h`, `.hpp`| 450  | 800  | Mirrors SRP guardrails                    |
-| `.ts`, `.tsx`       | 350  | 600  | UI/bridge kept lean; engine-first focus   |
-| Tests `.ts`         | 400  | 700  | Deterministic tests, avoid bloat          |
+File size budgets are enforced by:
+- `tooling/governance/file_size_budget.json`
+- `tooling/governance/file_size_budget_exceptions.json`
+
+These JSON files are the authoritative numeric thresholds; update them (and any related docs) together.
*** End Patch
```

---

## Appendix — Evidence Pointers (Selected)
- **Screen↔world conversion in feature layer:** `apps/web/utils/viewportMath.ts:1-6` and `apps/web/features/editor/interactions/useInteractionManager.ts:133-145`.
- **Tolerance computed in JS:** `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:166-168`.
- **Overflow resync handling:** `apps/web/engine/core/useEngineEvents.ts:69-76`; `apps/web/engine/core/engineEventResync.ts:8-37`.
- **Snapshot version enforcement:** `packages/engine/engine/persistence/snapshot.cpp:23-28`.
