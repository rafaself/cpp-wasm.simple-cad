# 30_frontend-react

Applies when: tasks touch `frontend/`, UI components, styling, or client-side behavior.

React & Frontend rules (imperative)
- State MUST be treated as immutable.
- Prefer a single source of truth for application state.
- Components MUST be presentational where possible; extract hooks for reusable stateful logic.
- Do not mix domain logic directly into UI components; use selectors or domain adapters.
- Avoid rerender traps caused by unstable callbacks or object literals; memoize where appropriate.
- Do not store derived state; compute during render or via selectors.

Code style & conventions
- Respect the repo TypeScript configuration. DO NOT enable breaking TS flags without explicit approval.
- Interface names SHOULD follow the project convention (prefix `I`) unless otherwise specified.
- Frontend IDs: prefer `crypto.randomUUID()` or the project UUID helper; avoid `Date.now()`/`Math.random()` alone.
- Prefer early returns and small, intention-revealing function names.

Testing & verification
- Add or update tests when behavior is critical. Use `npx vitest run` from `frontend/` to run tests.
