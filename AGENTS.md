# Project Agent Guidelines (AGENTS.md)

These instructions apply to any AI agent working in this repository.

## 0) Mission

- Improve the codebase while preserving intended behavior.
- Prefer small, safe, reviewable changes.
- Keep the project scalable and maintainable.

## 0.1) Current Direction (Project Context)

This repo is transitioning from a Canvas2D-first CAD MVP to a high-performance stack:

- **Frontend:** React + TypeScript (Vite). (Future: R3F/Three.js)
- **Core Engine:** **C++ → WebAssembly (Emscripten)**.
- **Non-negotiables:** Data-Oriented Design, deterministic tools, and performance-critical hot paths.

## 1) Non-negotiables

- Use TypeScript or Python types strictly; avoid `any` unless justified.
- Do not change product behavior unless explicitly requested.
- Do not delete features. Only remove dead code if proven unused.
- No breaking API changes without a migration plan.
- If uncertain, ask for clarification in comments or leave a TODO.
- Do not invent requirements, edge cases, or constraints not stated in the task.
- Avoid carrying over legacy configuration flags; work only with the currently agreed-upon inputs and options even if older flags still exist.

## 2) Engineering Principles

- **SRP** (Single Responsibility): one module/function = one reason to change.
- **DRY**: eliminate duplicated logic by centralizing.
- **KISS**: simplest solution that works.
- **YAGNI**: don't add abstractions for hypothetical future needs.
- **Clean boundaries**: UI vs domain vs infrastructure.

## 3) Architecture Rules

- Keep domain logic framework-agnostic (no React-specific logic in domain).
- Prefer pure functions for domain rules.
- Side effects (IO, network, storage) must be isolated in dedicated modules.
- Avoid circular dependencies.
- Favor explicit data flow over implicit coupling.
- Avoid introducing new external dependencies unless absolutely necessary.
- If a new dependency is required, please state the reason.

## 4) Code Style & Quality

- Respect the repo's current TypeScript configuration; do not enable `strict` (or other breaking compiler flags) unless explicitly requested.
- Prefer early returns; avoid deeply nested conditionals.
- Keep functions small and named by intent.
- Use meaningful names (no `data2`, `temp`, `handle2`).
- Add or update tests when behavior is critical or non-trivial.
- **Frontend IDs (Best Practice):** never generate persistent IDs with `Date.now()` or `Math.random()` alone. Prefer `crypto.randomUUID()` (with a safe fallback) or the project’s UUID helper (e.g. `frontend/utils/uuid`), and ensure IDs are unique across the current document.
- Interface names should be prefixed with `I` (e.g., `IUserService`).
- Private class members should be prefixed with an underscore (`_`).
- Always use strict equality (`===` and `!==`).

## 5) React-Specific Rules (if applicable)

- State must be immutable.
- Prefer a single source of truth.
- Keep components presentational when possible.
- Extract hooks for reusable stateful logic.
- Avoid rerender traps (unstable callbacks or objects).
- Do not mix domain logic directly into UI components.

## 6) CAD / Canvas App Rules (if applicable)

- Tools must be deterministic and reversible (support undo/redo).
- Separate clearly:
  - tool intent (user action)
  - model update (domain)
  - render (view)
- Every drawable element must be serializable to JSON.
- Never store computed UI-only values in the persisted model.

## 7) Safety & Performance

- Avoid heavy computations on the main thread when possible.
- Avoid unnecessary allocations in render or hot paths.
- Validate inputs; never trust external data.
- Prefer predictable performance over micro-optimizations.

## 7.1) WASM/C++ Performance Rules (High Priority)

When working on `cpp/` or JS↔WASM interop:

- **No allocations in hot paths:** frame step / mouse-drag loops must not heap-allocate.
- **Prefer POD / standard-layout structs** for shared-memory data. No `std::string`/`std::vector`/pointers inside shared structs.
- **Interop batching:** avoid chatty per-entity calls across the boundary; prefer batch APIs and shared buffers.
- **Memory stability:** resizing `std::vector` invalidates views. Use `reserve()`/fixed capacities (Phase 1) or stable arenas/slabs (later).
- **Generated artifacts:** treat `frontend/public/wasm/*` as build outputs; do not hand-edit.

## 8) Scope, Focus, and Inputs

- Focus only on the files, modules, or areas explicitly mentioned in the task.
- When code pointers (files, functions, identifiers) are provided in the prompt, treat them as authoritative and prioritize them.
- Avoid expanding scope to unrelated parts of the codebase without explicit justification.
- Do not explore or refactor broadly unless explicitly requested.

## 9) Change Discipline

When making changes, always:

1. Explain the problem being solved.
2. Explain the proposed plan or approach.
3. List the files changed.
4. Provide a short risk assessment.
5. Provide clear test or verification instructions.

For complex changes:

- Propose a step-by-step plan before implementation.
- Prefer multiple small, reviewable changes over a single large one.

## 10) Verification & Quality Gates

- When verification steps or validation criteria are provided in the prompt, treat them as the definition of correctness.
- A change should be considered correct only if it satisfies the provided verification steps.
- If verification cannot be performed, explicitly explain why.
- All verification files must be well-documented and placed in the appropriate `verification` folder (`frontend/verification` or `backend/verification`).

## 11) Definition of Done

- Builds successfully.
- Lints cleanly.
- Tests pass (or a clear explanation is provided for why no tests apply).
- No new warnings in console or logs.
- No regression in core user or API flows.

## 12) Optional Observations

- You may point out related bugs, technical debt, or improvements.
- Do not implement optional suggestions unless explicitly requested.

## 12.1) Backend (FastAPI) Rules (if applicable)

- Keep the API layer thin: request/response validation + orchestration only.
- Prefer Pydantic models for I/O; validate all external input.
- Isolate side effects (DB/files/network) behind dedicated modules/services.
- Avoid breaking API changes without a migration plan (versioning or compatibility layer).
- Add/adjust `pytest` tests for non-trivial backend behavior.
- Keep configuration in environment variables (and a single settings module); avoid hardcoding secrets.

## 13) Reporting (when requested)

- If the prompt requests a final report, create and save it as a file (not only in the chat output).
- Default report format is **Markdown (.md)** unless the prompt explicitly requests another format.
- Save reports under: `/resources/reports/` (create the folder if it does not exist).
- Naming must be **incremental** and stable:
  - `report_<N>.md` if no short task name is provided
  - `report_<N>_<short-task-name>.md` if a short task name is provided
- `<N>` must be the next available integer in the `reports/` folder (e.g., after `report_1*.md` and `report_2*.md`, the next is `report_3*.md`).
- `<short-task-name>` should be a brief, filesystem-safe slug (lowercase, words separated by `-`, no spaces, keep it short).
- Report content should follow the project's standard output format (problem, plan, changed files, risk, verification).

## 14) Testing Standards (High Priority)

Tests are a first-class deliverable in this project. When changing behavior that is critical or non-trivial, prefer adding or updating tests **before** broad refactors.

### 14.1) General expectations

- Keep tests deterministic: no reliance on wall-clock time, randomness, locale, filesystem ordering, or network.
- Prefer small, single-purpose tests with clear names and minimal setup.
- Avoid brittle assertions:
  - Do not depend on array order unless order is an explicit contract.
  - Do not assert exact serialized strings when the contract is structural (e.g., prefer parsing values and asserting invariants).
- Avoid `any`/`@ts-ignore` in tests. If types are missing, add minimal local types/guards in the test instead of bypassing TS.
- Avoid global mocks unless necessary; when used, reset/restore between tests.

### 14.2) Test types & how to choose

- **Unit/contract tests**: validate one behavior with synthetic inputs; preferred for domain logic.
- **Fixture-based tests**: validate end-to-end properties using real fixtures (e.g., DXF/PDF/SVG). Keep fixtures minimal and documented.
- **Smoke tests**: validate that a feature renders/executes without crashing; do not pretend they validate visual fidelity.

### 14.3) Fixtures & documentation

- Put fixtures under the appropriate `verification` folder (e.g., `frontend/verification/`).
- Every fixture must be documented in `frontend/verification/README.md` with:
  - which tests use it
  - what feature/regression it covers
  - which minimal entities/resources it contains
- Keep fixtures small, deterministic, and focused on a single feature/regression.

### 14.4) Running tests & environment constraints

- Default: run `npx vitest run` from `frontend/`.
- If tests cannot be executed due to environment/toolchain constraints (e.g., Windows `esbuild` spawn `EPERM` under OneDrive/Controlled Folder Access), make it explicit in the PR/summary and provide concrete remediation steps (move repo out of OneDrive-controlled folders or allowlist the toolchain executables).

### 14.5) Canonical testing guide

See:

- `docs/TESTING.md` (general guidelines)
- `docs/TESTING_FRONTEND.md` (frontend/Vitest specifics)
- `docs/TESTING_BACKEND.md` (backend/Pytest specifics)

## 15) Task Execution Protocol

- **Investigate First**: Whenever a task is requested, assume that investigation steps are required first.
- **Authorization Required**: Do not apply changes based on the investigation unless explicitly authorized by the developer.
- **Verification Allowed**: You are authorized to perform tests and create verification files without prior permission, provided that these actions **do not modify the base codebase**.

## Review guidelines

- Don't log PII.
- Verify that authentication middleware wraps every route.

## Project Structure

- **`frontend/`**: React / Vite frontend application.
- **`backend/`**: FastAPI backend application.
- **`cpp/`**: C++ → WebAssembly engine (Emscripten/CMake).

## Getting Started

### Backend (FastAPI)

- The API is available at `http://localhost:8000`.

### Frontend (React)

- The application is usually available at `http://localhost:3000` (or the port shown in the terminal).
- Tests can be run with `npx vitest run`.

### WASM (C++ → WebAssembly)

- Build outputs are emitted to `frontend/public/wasm/`.
- Default build command: `cd frontend && npm run build:wasm` (runs Docker + Emscripten toolchain).
