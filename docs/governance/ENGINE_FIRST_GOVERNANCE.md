# Engine-First Governance (Canonical Policy)

Engine is the single source of truth. Governance makes that non-negotiable via documented rules and automation.

## Architecture Invariants
- Engine owns document state: entities, geometry, styles, selection, history/undo, text layout, render buffers.
- Frontend owns only UI/transient state: tool mode, viewport, preferences, modals, pointer/key tracking.
- Forbidden: canonical geometry/state in JS stores; `runtime.engine.*` access outside `apps/web/engine/**`; direct engine-internal imports from `apps/web/features/**`.
- EngineRuntime facade is the boundary: consume typed subsystems (text/pick/draft/transform/io/…) instead of touching native instances.

## Budgets (soft vs. hard)
- Limits live in `tooling/governance/file_size_budget.json`; exceptions with rationale in `tooling/governance/file_size_budget_exceptions.json`.
- Soft caps warn; hard caps fail CI unless an explicit exception entry exists.

File size budgets are enforced by:
- `tooling/governance/file_size_budget.json`
- `tooling/governance/file_size_budget_exceptions.json`

These JSON files are the authoritative numeric thresholds; update them (and any related docs) together.

## Boundary Rules
- No `runtime.engine.*` usage outside `apps/web/engine/**` (enforced by `tooling/governance/check_boundaries.js` + `tooling/governance/boundary_rules.json`).
- `apps/web/features/**` cannot import engine internals directly; use EngineRuntime facades or add a temporary, justified allowlist entry.
- Any new violation without allowlisting fails CI.

## Engine API Manifest
- `tooling/governance/generate_engine_api_manifest.js` produces:
  - `docs/api/engine_api_manifest.json` (machine-readable with `sourceHash`)
  - `docs/api/ENGINE_API_MANIFEST.md` (human summary)
- `tooling/governance/check_engine_api_manifest.js` compares current bindings with the recorded `sourceHash`; CI fails on drift.

## Performance Budgets
- Budgets live in `tooling/governance/perf_budgets.json`.
- Baselines live in `tooling/governance/perf_results.json`.
- Fixture spec lives in `tooling/perf/fixtures/atlas_baseline_v4.json`.
- `tooling/governance/check_perf_budgets.js` verifies results are within budget.

## Doc Drift Check
- `tooling/governance/check_docs_references.js` ensures referenced paths in `AGENTS.md` and this document exist. CI fails if drift is detected.

## Local Commands
- `cd apps/web && pnpm governance:budgets` — file-size budgets.
- `cd apps/web && pnpm governance:boundaries` — boundary enforcement.
- `cd apps/web && pnpm governance:manifest` — Embind manifest drift.
- `cd apps/web && pnpm governance:perf` — perf budget check.
- `cd apps/web && pnpm governance:check` — runs all governance checks.
- `node tooling/governance/check_docs_references.js` — doc reference guard.

## Exception Policy
- Prefer fixes; use exceptions sparingly with clear rationale and owner in the exceptions file.
- Remove exceptions as soon as debt is paid.

## PR Checklist (summary)
- Governance: `pnpm governance:check` + `node tooling/governance/check_docs_references.js`.
- Tests: `pnpm test` (frontend) and `ctest` (cpp).
- Manifest: regenerate if bindings changed.
- Boundaries: no `runtime.engine.*` leaks; no document state in JS stores; respect budgets or record justified exceptions.
