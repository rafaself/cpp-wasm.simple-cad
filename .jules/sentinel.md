## 2025-02-18 - Weak ID Generation Pattern
**Vulnerability:** Widespread use of `Date.now()` combined with `Math.random()` for generating entity IDs across the frontend.
**Learning:** Use of `Date.now()` for IDs creates predictability and collision risks. As we prioritize security over everything, we must use cryptographically secure UUIDs.
**Prevention:** Centralize ID generation in a utility (like `frontend/utils/uuid.ts`) and use `crypto.randomUUID()`. Consider adding a linter rule to forbid `Date.now()` for IDs.

## 2025-02-19 - Secret Injection via Build Config
**Vulnerability:** Unused `GEMINI_API_KEY` was being injected into the client bundle via Vite's `define` config.
**Learning:** Build tools like Vite replace strings at compile time. Defining `process.env.SECRET` in config hardcodes the value into the public JS bundle.
**Prevention:** Never map secrets in `vite.config.ts` `define` unless they are explicitly intended for public client-side use.

## 2025-05-20 - Weak PRNG Fallback in Workers
**Vulnerability:** `dxfWorker.ts` and `uuid.ts` fell back to `Math.random()` when `crypto.randomUUID()` was missing, which can happen in non-secure contexts (HTTP).
**Learning:** `crypto.getRandomValues()` is often available even when `randomUUID()` is not (e.g. in older browsers or non-secure contexts), offering a secure middle-ground fallback.
**Prevention:** Implement a tiered fallback strategy for UUID generation: `randomUUID` > `getRandomValues` > `Math.random`.
