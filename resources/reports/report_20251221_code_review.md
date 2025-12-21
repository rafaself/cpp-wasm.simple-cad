# Code Review Report: EletroCAD WebApp

**Date:** December 21, 2025
**Reviewer:** AI Agent (Senior Software Engineer Persona)
**Focus:** Architecture, Code Quality, Security, Performance, and AGENTS.md Compliance.

## A) Executive Summary

**Overall Health:** ⚠️ **Yellow (Caution)**

The project demonstrates a high-quality, high-performance architectural core (C++/WASM/React-Three-Fiber), effectively leveraging modern web technologies for CAD. The core engineering principles (Zero-copy, standard layout structs) are well-implemented in the engine.

However, the project faces significant risks in **Frontend Maintainability** (God Object Store) and **Backend Maturity** (Skeletal). The `useDataStore.ts` is a critical accumulation of technical debt that will impede future feature development.

**Top 5 Risks:**
1.  **"God Store" Pattern:** `frontend/stores/useDataStore.ts` is overly complex, mixing state, logic, history, and serialization. This violates SRP (AGENTS.md Rule 10).
2.  **Backend Gap:** The backend is currently a placeholder. Security (Auth), persistence, and multi-user features are non-existent.
3.  **WASM Integration Testing:** Frontend tests heavily mock the WASM layer, potentially masking integration bugs.
4.  **CORS Security:** Backend allows `*` origins and methods, which is insecure for production.
5.  **Type Safety Gaps:** Occasional use of `any` (e.g., `updateSharedElectricalProperties`) reduces type safety.

**Top 3 Recommendations (High Impact):**
1.  **Refactor `useDataStore`:** Split into domain-specific slices (e.g., `createConnectionSlice`, `createHistorySlice`) to restore maintainability.
2.  **Harden Backend:** Implement a proper FastAPI structure with Pydantic models, secure CORS, and Auth middleware.
3.  **Native Integration Tests:** Add a small suite of browser-based E2E tests (e.g., Playwright) to verify the actual WASM loading and rendering path.

---

## B) Compliance with AGENTS.md

| Category | Status | Notes |
| :--- | :---: | :--- |
| **00 Operating Model** | ✅ | Structure supports "Investigate -> Plan -> Implement" flow. |
| **10 Engineering Principles** | ⚠️ | SRP violation in `useDataStore.ts`. KISS applies well to C++ engine. |
| **20 Architecture Rules** | ✅ | Good separation of Domain (C++) and UI (React). Zero-copy rules followed. |
| **30 Frontend React** | ⚠️ | State mutation logic inside Store is complex. |
| **50 WASM/C++** | ✅ | **Excellent.** No heap allocations in hot paths observed. POD structs used. |
| **60 Testing Standards** | ⚠️ | Frontend tests mock too much. Native C++ tests are good. |
| **70 Security** | ❌ | Backend lacks auth/security controls. CORS is permissive. |

---

## C) Findings by Category

### 1. Architecture & Code Quality

**Finding 1.1: "God Object" State Store (Critical)**
*   **Where:** `frontend/stores/useDataStore.ts`
*   **Problem:** This file handles shape management, layer operations, history (undo/redo), spatial indexing sync, and electrical logic. It is too large and cohesive.
*   **AGENTS.md Violation:** Rule 10 (SRP).
*   **Recommendation:** Refactor using Zustand's slice pattern. Separate `ElectricalSlice`, `LayerSlice`, `HistorySlice`, and `GeometrySlice`.

**Finding 1.2: WASM Zero-Copy Implementation (Positive)**
*   **Where:** `frontend/src/components/CadViewer.tsx` & `cpp/engine`
*   **Observation:** The use of `SharedArrayBuffer` (implied) or direct memory access via `HEAPF32` into `THREE.InterleavedBufferAttribute` is world-class. It avoids serialization overhead.
*   **Recommendation:** Maintain this pattern strictly.

**Finding 1.3: Unsafe Type Usage**
*   **Where:** `frontend/stores/useDataStore.ts` (`updateSharedElectricalProperties`)
*   **Problem:** Usage of `diff: Record<string, any>`.
*   **Recommendation:** Define a partial type for `ElectricalElement` metadata or use Generics.

### 2. Security

**Finding 2.1: Permissive CORS**
*   **Where:** `backend/app/main.py`
*   **Problem:** `allow_origins=["*"]` allows any site to call the API.
*   **Risk:** High (CSRF/Data Exfiltration).
*   **Recommendation:** Restrict to specific frontend domains/ports (e.g., `http://localhost:5173`).

### 3. Testing

**Finding 3.1: Heavy Mocking in Frontend**
*   **Where:** `frontend/tests/engineRuntime.test.ts`
*   **Problem:** Tests verify that *mocks are called*, not that the *engine works*.
*   **Recommendation:** Create an integration test that actually loads the WASM module (using a headless browser runner or a test-specific entry point) to verify the full bridge.

---

## D) Action Plan (PRs)

I recommend the following sequence of Pull Requests to address the findings safely.

### PR #1 (P0): Backend Security Hardening
*   **Objective:** Fix immediate security risks in the backend foundation.
*   **Changes:**
    *   Update `backend/app/main.py` to restrict CORS to `localhost:3000` and `localhost:5173`.
    *   Add a basic Auth placeholder (middleware) to establish the pattern.
*   **Risk:** Low.

### PR #2 (P1): Refactor `useDataStore` - Phase 1 (Slices)
*   **Objective:** Break the monolith store to improve maintainability.
*   **Changes:**
    *   Create `frontend/stores/slices/layerSlice.ts`.
    *   Create `frontend/stores/slices/historySlice.ts`.
    *   Migrate logic from `useDataStore.ts` to these slices.
    *   Compose them back in `useDataStore.ts`.
*   **Risk:** Medium (Regression in state logic). **Requires thorough regression testing.**

### PR #3 (P1): Fix Type Safety
*   **Objective:** Remove `any` from critical paths.
*   **Changes:**
    *   Define strict types for `ElectricalElement` updates.
    *   Refactor `updateSharedElectricalProperties` to use these types.
*   **Risk:** Low.

---

## E) Backlog (Nice-to-Have)

*   **P2:** Implement E2E tests with Playwright for the Canvas.
*   **P2:** Add backend structure (Routers, Controllers, Services).
*   **P3:** Add a `Makefile` at the root to orchestrate frontend/backend/wasm builds.

