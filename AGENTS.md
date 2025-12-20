# Project Agent Guidelines (AGENTS.md)

These instructions apply to any AI agent working in this repository.

## 0) Mission

- Improve the codebase while preserving intended behavior.
- Prefer small, safe, reviewable changes.
- Keep the project scalable and maintainable.

## 0.1) Current Direction (Project Context)

This repo is transitioning from a Canvas2D-first CAD MVP to a high-performance stack:

# Project Agent Contract (core)

These are mandatory, non-negotiable guidelines that apply to every AI agent and automated process operating in this repository.

## Mission
- Improve the codebase while preserving intended behavior.
- Prefer small, safe, reviewable changes.

## Non-negotiables (applies to all tasks)
- MUST NOT change product behavior unless explicitly requested and approved.
- MUST NOT introduce breaking API or serialization changes without an explicit migration plan.
- MUST use types (TypeScript/Python/C++) appropriately; avoid `any` or equivalent unless justified and documented.
- MUST surface uncertainties with: "I need clarification on X before proceeding." and create a TODO or issue when necessary.

## Agent Operating Model (mandatory flow)
1. Investigate: gather minimal necessary files, tests, and failing evidence.
2. Plan: produce a concise plan with steps and files to change.
3. Authorize: wait for explicit developer approval when required by Change Classification.
4. Implement: make focused edits, preferring minimal surface area changes.
5. Verify: run available tests or provide explicit verification instructions.

## Change Discipline (what each change MUST include)
- Problem: one-sentence summary.
- Plan: short list of steps to implement.
- Files changed: explicit file paths.
- Risk: short assessment (low/medium/high) and mitigations.
- Verification: exact commands or tests to run.

## Agent Anti-Patterns (MUST NOT)
- MUST NOT refactor broadly for style or taste without request.
- MUST NOT rename public symbols or files without explicit approval.
- MUST NOT invent requirements or silently assume unstated constraints.
- MUST NOT fix unrelated issues discovered during work unless approved.

## Definition of Done (for code changes)
- Build succeeds where applicable.
- Lint passes or a clear justification is provided.
- Tests pass (or a clear reason and verification steps are documented).
- No new console warnings for the changed scope.
- A concise changelog entry or PR description that follows Change Discipline.

## Module Routing Rules (how to load additional context)
- The core `AGENTS.md` is mandatory and MUST be loaded for every task.
- Load domain modules from `docs/agents/` when the task scope matches the module title.
  - Example: tasks touching `frontend/` or UI behavior MUST load `docs/agents/30_frontend-react.md`.
  - Example: tasks touching `cpp/` or `frontend/public/wasm/` MUST load `docs/agents/50_wasm-cpp.md`.
- Agents MUST NOT assume they will read all files. Load only the modules required by the task.
- When in doubt, load: `00_operating-model.md`, `10_engineering-principles.md`, and `20_architecture-rules.md`.

## Where additional rules live
- Domain- and task-specific rules live under `docs/agents/` as single-responsibility modules.
- Module filenames are numbered and descriptive; load them as needed.

## What I will change / What I will not change (prompt hooks)
- When proposing edits, always include: "What I will change" and "What I will not change".

## Verification and Reporting
- When a report or artifact is requested, follow repository reporting rules in `docs/agents/80_reporting.md`.

## Last-resort guidance
- If a task requires a behavior change classified as "Requires explicit approval" in the modules, STOP and ask for approval.

Files under `docs/agents/` contain the full domain rules; consult them selectively based on Module Routing Rules.

--
(End of core agent contract)