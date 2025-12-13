# Sentinel's Journal

## 2025-12-12 - Centralized Secure ID Generation
**Vulnerability:** Weak ID generation using `Date.now()` and `Math.random()`, leading to potential collisions and predictability.
**Learning:** Frontend applications often overlook secure ID generation for non-cryptographic entities, but in CAD tools, collisions can cause data corruption.
**Prevention:** Use `frontend/utils/uuid.ts` which wraps `crypto.randomUUID()` for all new entity IDs.
