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

## 2) Engineering Principles
- **SRP** (Single Responsibility): one module/function = one reason to change.
- **DRY**: eliminate duplicated logic by centralizing.
- **KISS**: simplest solution that works.
- **YAGNI**: don’t add abstractions for hypothetical future needs.
- **Clean boundaries**: UI vs domain vs infrastructure.

## 3) Architecture Rules
- Keep domain logic framework-agnostic (no React-specific logic in domain).
- Prefer pure functions for domain rules.
- Side effects (IO, network, storage) must be isolated in dedicated modules.
- Avoid circular dependencies.

## 4) Code Style & Quality
- Use TypeScript types strictly; avoid `any` unless justified.
- Prefer early returns; avoid deeply nested conditionals.
- Keep functions small and named by intent.
- Use meaningful names (no `data2`, `temp`, `handle2`).
- Add/update tests when behavior is critical.

## 5) React-Specific Rules (if applicable)
- State must be immutable.
- Prefer single source of truth.
- Keep components presentational when possible.
- Extract hooks for reusable stateful logic.
- Avoid rerender traps (unstable callbacks/objects).

## 6) CAD/Canvas App Rules (if applicable)
- Tools must be deterministic and reversible (support undo/redo).
- Separate:
  - tool intent (user action)
  - model update (domain)
  - render (view)
- Every drawable element must be serializable to JSON.
- Never store computed UI-only values in the persisted model.

## 7) Safety & Performance
- Avoid heavy computations on the main thread when possible.
- Avoid unnecessary allocations in render loops.
- Validate inputs; never trust external data.

## 8) Change Discipline
When making changes, always:
1. Explain the problem
2. Explain the plan
3. List changed files
4. Provide a short risk assessment
5. Provide test instructions

## 9) Definition of Done
- Builds successfully
- Lints cleanly
- Tests pass (or explain why no tests)
- No new warnings in console
- No regression in UX flows

## Structure

- **`frontend/`**: Contains the React/Vite frontend application.
- **`backend/`**: Contains the FastAPI backend application.

## Getting Started

### Backend (FastAPI)

- The API will be available at `http://localhost:8000`.

### Frontend (React)

- Usually, the application will be available at `http://localhost:3000` (or the port shown in the terminal).