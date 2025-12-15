## 2025-02-18 - Weak ID Generation Pattern
**Vulnerability:** Widespread use of `Date.now()` combined with `Math.random()` for generating entity IDs across the frontend.
**Learning:** Use of `Date.now()` for IDs creates predictability and collision risks. As we prioritize security over everything, we must use cryptographically secure UUIDs.
**Prevention:** Centralize ID generation in a utility (like `frontend/utils/uuid.ts`) and use `crypto.randomUUID()`. Consider adding a linter rule to forbid `Date.now()` for IDs.
