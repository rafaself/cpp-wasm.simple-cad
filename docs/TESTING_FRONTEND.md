# Testing Guide (Frontend)

This document covers frontend-specific testing practices for the React/Vite/Vitest stack.

## How to run

- `cd frontend`
- `npx vitest run`

## What to test

- Domain utilities and conversion logic with **unit/contract tests** (prefer synthetic inputs).
- UI components with focused tests only when the behavior is non-trivial and stable to assert.
- Import/conversion pipelines with **fixture-based tests** when synthetic inputs are insufficient.

## Assertion style (stability rules)

- Prefer invariants over exact strings:
  - Parse values (e.g., SVG `viewBox`) and assert structural contracts.
- Avoid output-order dependence:
  - Select results by predicate (type/id/layer/text) instead of indexing `[0]`.
- For tessellated geometry:
  - Use bounds/threshold assertions, not point-by-point equality.

## Fixtures

- Place fixtures under `frontend/verification/`.
- Document each fixture in `frontend/verification/README.md`.
- Keep fixtures minimal, deterministic, and targeted.

## Common Windows environment blocker: `esbuild` spawn `EPERM`

If Vitest fails to load `vite.config.ts` with `Error: spawn EPERM`, it is usually caused by filesystem restrictions (often OneDrive sync folders, Defender “Controlled folder access”, or corporate endpoint protection).

Recommended fixes:

- Move the repo out of OneDrive-controlled directories (preferred).
- Or allowlist `node.exe` and the local `esbuild.exe` used by the toolchain.

