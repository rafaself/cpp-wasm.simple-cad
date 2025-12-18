# Testing Guide (General)

This document defines the **general** testing standards for this repo. Stack-specific details live in:

- `docs/TESTING_FRONTEND.md`
- `docs/TESTING_BACKEND.md`

## Principles

- **Deterministic**: a test must pass/fail for the same reason every time.
- **Contract-driven**: assert what the system guarantees, not incidental implementation details.
- **Typed**: avoid `any` and `@ts-ignore`. Add minimal type helpers/guards if needed.
- **Fast feedback**: prefer unit/contract tests; use fixtures only where they add confidence.

## What to assert (examples)

### Prefer invariants over exact strings

- Good: parse `viewBox` and assert `width > 0` and padding rules if that’s the contract.
- Avoid: `expect(svg).toContain('viewBox=\"-3 -3 66 66\"')` unless the exact value is a defined API contract.

### Avoid relying on ordering

- Good: locate outputs by predicate (type, id, layer, text content).
- Avoid: `result.shapes[0]` unless order is explicitly guaranteed.

### Tessellated geometry

When a converter tessellates curves (ARC/SPLINE/bulge), avoid point-by-point exact comparisons.

- Prefer: bounds checks, point count thresholds, and “contains expected endpoints” checks.

## Fixture-based tests

Fixtures live under `frontend/verification/` or `backend/verification/`.

Rules:

- Keep fixtures **small** and **focused**.
- Document each fixture in the corresponding `verification/README.md`.
- Do not add fixtures with embedded timestamps or non-deterministic metadata.

## Stack-specific guides

- Frontend: `docs/TESTING_FRONTEND.md`
- Backend: `docs/TESTING_BACKEND.md`

## Adding a new test (checklist)

- What is the **contract** being protected?
- Can it be a unit/contract test (synthetic input) instead of a fixture?
- Are assertions stable (no ordering/string brittleness)?
- Is the test deterministic (no time/random/network)?
- If using a fixture, is it documented and minimal?
