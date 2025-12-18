# Testing Guide (Backend)

This document covers backend-specific testing practices for the FastAPI/Pytest stack.

## How to run

From `backend/` (adapt to your backend layout):

- `pytest`

If the backend doesn’t have tests yet, add them in the closest existing convention (or create `backend/tests/` when explicitly requested).

## What to test

- **Domain rules**: pure unit tests (no FastAPI app, no IO).
- **API layer**: thin tests that validate request/response validation and orchestration (FastAPI TestClient).
- **Side effects** (DB/files/network): isolate behind services and test with fakes/mocks; avoid hitting real external systems in unit tests.

## Determinism & isolation

- No network calls in unit tests.
- No dependency on time/randomness without controlled injection/fakes.
- Ensure tests can run in parallel when possible (avoid shared mutable global state).

## Test structure (suggested)

- Unit tests: `backend/tests/unit/`
- API tests: `backend/tests/api/`
- Fixtures/helpers: `backend/tests/_helpers/` (keep helpers small and explicit)

