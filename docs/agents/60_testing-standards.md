# 60_testing-standards

Applies when: tasks involve adding, changing, or verifying tests.

General rules (imperative)
- Tests MUST be deterministic: avoid wall-clock time, randomness, network, or filesystem-order reliance.
- Prefer small, single-purpose tests with clear names.
- Avoid brittle assertions; prefer structural/contracts checks instead of exact serialized strings unless that is the contract.
- Avoid `any` or `@ts-ignore` in tests; add minimal local types or guards instead.
- Avoid global mocks where possible; when used, reset/restore between tests.

Test types & guidance
- Unit/contract tests: preferred for domain logic.
- Fixture-based tests: use for end-to-end properties; fixtures MUST be small and documented in the appropriate `verification` folder.
- Smoke tests: verify a feature does not crash; do not overstate coverage.

Running tests
- Frontend (TS/WASM Integration): `npx vitest run` from `frontend/`.
- C++ engine (native): run from `cpp/build_native/` via CMake/CTest.
- Backend (Python): run `pytest` from `backend/`.
