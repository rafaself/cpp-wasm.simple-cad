## 2025-02-18 - Weak ID Generation Pattern
**Vulnerability:** Widespread use of `Date.now()` combined with `Math.random()` for generating entity IDs across the frontend.
**Learning:** Developers prioritized convenience over security/robustness. This pattern leads to predictable IDs and potential collisions in tight loops.
**Prevention:** Centralize ID generation in a utility (like `frontend/utils/uuid.ts`) and use `crypto.randomUUID()`. Consider adding a linter rule to forbid `Date.now()` for IDs.
