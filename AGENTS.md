# Project Agent Guidelines (AGENTS.md)

These instructions apply to any AI agent working in this repository.

## 0) Mission
- Improve the codebase while preserving intended behavior.
- Prefer small, safe, reviewable changes.
- Keep the project scalable and maintainable.

## 1) Non-negotiables
- Do not change product behavior unless explicitly requested.
- Do not delete features. Only remove dead code if proven unused.
- No breaking API changes without a migration plan.
- If uncertain, ask for clarification in comments or leave a TODO.
- Do not invent requirements, edge cases, or constraints not stated in the task.

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

## 4) Code Style & Quality
- Prefer TypeScript types strictly; avoid `any` unless justified.
- Respect the repo's current TypeScript configuration; do not enable `strict` (or other breaking compiler flags) unless explicitly requested.
- Prefer early returns; avoid deeply nested conditionals.
- Keep functions small and named by intent.
- Use meaningful names (no `data2`, `temp`, `handle2`).
- Add or update tests when behavior is critical or non-trivial.

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

## Project Structure

- **`frontend/`**: React / Vite frontend application.
- **`backend/`**: FastAPI backend application.

## Getting Started

### Backend (FastAPI)
- The API is available at `http://localhost:8000`.

### Frontend (React)
- The application is usually available at `http://localhost:3000` (or the port shown in the terminal).
