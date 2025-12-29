# Agent Runbook

Operate with smallest safe steps, no product behavior changes unless explicitly requested.

## Core Rules
- Engine is SSOT: never mirror geometry/state in JS; use EngineRuntime facades only.
- Keep changes small and test-backed; prefer scripts/automation over manual edits.
- Do not touch Embind/API surfaces without manifest updates and call-site proof.

## Default Checklist (per task)
- Read `AGENTS.md` + `docs/ENGINE_FIRST_GOVERNANCE.md` relevant sections.
- Run governance: `cd frontend && pnpm governance:check`.
- Run doc drift guard: `node scripts/check_docs_references.js`.
- Run tests appropriate to scope (`pnpm test`, `ctest`, or targeted suites).
- If bindings changed: `node scripts/generate_engine_api_manifest.js`.
- Summarize changes + commands run; list any ambiguities explicitly.

## Safety Practices
- Avoid refactors unless required; prefer adapters/test utilities.
- Keep batches small; isolate deletions or structural changes by theme.
- Never introduce new state duplication across layers.
- In hot paths, avoid allocations and new closures.

## Reporting
- Provide: files touched, commands run, behavior assertions, remaining risks/ambiguities.
- Note any skipped checks with rationale and next steps.
