# AI Agent Workflow

## Operating Principles

1. **Context First**: Before editing, read `AGENTS.md` and `docs/ai/REPO_MAP.md`.
2. **Atomic Changes**: Make small, verifiable changes. Avoid "Big Bang" refactors.
3. **Verify continuously**: Run tests after every meaningful change.

## Workflow

### 1. Discovery
- Check `REPO_MAP.md` to locate relevant files.
- Search for existing patterns using `grep` or `glob`.
- **Do not invent new patterns**; mimic existing code.

### 2. Implementation
- **Frontend**:
  - Components go in `components/` or `features/<feature>/components/`.
  - State goes in `stores/`.
  - **Strictly follow** `DESIGN.md` for UI tokens.
- **Engine**:
  - C++ logic in `packages/engine`.
  - Expose to JS via `engine/bindings.cpp`.
- **Backend**:
  - Routes in `apps/api/app/`.

### 3. Verification
- **Frontend**: `pnpm test` (Unit), `pnpm build` (Compile).
- **Engine**: `make ctest` (C++ Tests).
- **Lint/Format**: `pnpm lint`, `pnpm format:check`.

### 4. Governance
- Check file sizes: `pnpm governance:check`.
- Ensure no boundary violations.

## Definition of Done
1. Code compiles.
2. Tests pass.
3. Linter passes.
4. No new "dead code" introduced.
5. Documentation updated if API changed.
