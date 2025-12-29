# Engine-First Governance

The C++ engine is the only source of truth. Governance keeps the boundaries and budgets explicit so that engine authority cannot be eroded by accidental JS creep or oversized files.

## Budgets (soft vs. hard)
- Soft caps warn; hard caps fail CI unless an approved exception exists.
- Limits are defined in `scripts/file_size_budget.json`.
- Exceptions (with rationale) live in `scripts/file_size_budget_exceptions.json`; update this file instead of sprinkling inline ignores.

| Extension | Soft | Hard | Notes |
| --- | --- | --- | --- |
| `.cpp`, `.h`, `.hpp` | 450 LOC | 800 LOC | Mirrors SRP refactor guardrails. |
| `.ts`, `.tsx` | 350 LOC | 600 LOC | UI/bridge files stay lean; engine-first orchestration only. |

## Boundary Rules
- No `runtime.engine.*` usage outside `frontend/engine/**` unless explicitly allowlisted in `scripts/boundary_rules.json`.
- `frontend/features/**` must not import engine internals directly; they must go through the EngineRuntime facade or an approved transitional allowlist entry in `scripts/boundary_rules.json`.
- Any new violation without an allowlist entry fails CI.

## Engine API Manifest
- `scripts/generate_engine_api_manifest.js` parses all `cpp/**/bindings*.cpp` exports and writes:
  - `docs/engine_api_manifest.json` (machine readable, includes `sourceHash`)
  - `docs/ENGINE_API_MANIFEST.md` (human summary)
- `scripts/check_engine_api_manifest.js` compares the recorded `sourceHash` against current bindings. CI fails if bindings changed without regenerating the manifest.

## Local Commands
- `pnpm governance:budgets` — Enforce file-size budgets (hard fail on hard-cap violations).
- `pnpm governance:boundaries` — Enforce runtime/feature boundaries using `scripts/boundary_rules.json`.
- `pnpm governance:manifest` — Drift check for the Embind manifest (`sourceHash` gate).
- `pnpm governance:check` — Runs all of the above (used in CI).

## Exception Policy
- Prefer fixing violations. Use exceptions only for tracked, time-bound debt with a clear rationale.
- Document the reason directly in `scripts/file_size_budget_exceptions.json` or `scripts/boundary_rules.json`.
- When removing/refactoring debt, also remove the corresponding exception entry.

## CI Expectations
- Hard-cap breaches or undocumented boundary violations fail CI.
- Soft-cap breaches emit warnings; if a soft breach is intentional, record it in the exceptions file with justification.
- Bindings changes must be accompanied by regenerated manifest files or CI fails the drift check.
