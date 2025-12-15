# CODEBASE AUDIT REPORT

## 1. Executive Summary
**Health Assessment:** 🟡 **Moderate Risk**
The application is a functional Client-Side Monolith with a solid React/Zustand foundation. However, it faces imminent **scalability cliffs** due to inefficient rendering patterns (`DynamicOverlay`) and a naive import pipeline (`pdfToShapes`). The "God Hook" pattern in the editor core (`useCanvasInteraction`) threatens long-term maintainability. The Backend is currently a placeholder, offering a clean slate for future logic migration.

**Main Risks:**
1.  **Performance**: The editor will likely freeze with >500 shapes due to aggressive re-rendering.
2.  **Maintainability**: Centralized interaction logic is becoming unmanageable (~900 LOC single file).
3.  **Correctness**: Snapping ignores rotation, and PDF import ignores clipping, leading to "wrong" geometry.

---

## 2. High-Impact Issues (Priority)

### A. The "Render Storm" in `DynamicOverlay`
- **Where**: `frontend/features/editor/components/canvas/DynamicOverlay.tsx`
- **What**: The component subscribes to the *entire* `shapes` store: `const shapes = useDataStore(s => s.shapes)`.
- **Why**: Every time *any* property of *any* shape changes (e.g., dragging one line), this overlay re-renders. Since it contains the `useCanvasInteraction` hook (which also has internal state), this triggers a cascade of unnecessary checks and virtual DOM diffing.
- **Risk**: **High**. Limits the canvas to a few hundred items before lag becomes noticeable.
- **Direction**: Use `useShallow` or fine-grained selectors. Better yet, move interaction logic out of the render loop and use `useDataStore.getState()` inside event handlers, only subscribing to `selectedShapeIds` and `activeTool` for the overlay rendering itself.

### B. Snapping Logic Ignores Rotation
- **Where**: `frontend/features/editor/snapEngine/detectors.ts` (`getEndpoints`, `getMidpoints`)
- **What**: The snap point detectors return the raw `(x, y)` and corners of unrotated shapes, completely ignoring `shape.rotation`.
- **Why**: Users cannot accurately snap to rotated objects. The snap markers will appear "floating" in empty space where the unrotated corners would be.
- **Risk**: **High** (UX/Correctness). Makes the tool unusable for professional precision work.
- **Direction**: Apply `rotatePoint` to the calculated endpoints/midpoints using the shape's center and rotation angle.

### C. PDF Import is Main-Thread Blocking & Lossy
- **Where**: `frontend/features/import/utils/pdfToShapes.ts`
- **What**:
    1.  Runs synchronously on the main thread. Large PDFs will freeze the browser.
    2.  Ignores PDF Clipping Paths (`W`, `W*` operators), causing masked elements to be fully visible (messy imports).
    3.  Creates a separate `Shape` entity for every text character or path segment, leading to entity explosion (50k+ shapes).
- **Risk**: **High**. Loading a real-world architectural plan will likely crash the tab or degrade performance to 0 FPS.
- **Direction**:
    1.  Move parsing to a Web Worker.
    2.  Implement `ClipPath` support or rasterize complex clipped areas.
    3.  Group related paths into a single `Shape` (e.g., `CompoundPath`) to reduce React/Zustand overhead.

---

## 3. Medium / Low Priority Improvements

### Backend
- **Status**: Skeleton. `backend/app/modules/engine` is empty.
- **Action**: Currently no risk, but huge opportunity cost. Future heavy geometry (e.g., `pdfToShapes` complex clipping) should move here to leverage Python/C++ libs (like `fitz` or `shapely`) instead of JS on the client.

### State Management
- **Issue**: `useDataStore.ts` is becoming a domain monolith, mixing "Session State" (`activeLayerId`, `frame`) with "Domain Data" (`shapes`, `connections`).
- **Action**: Split `SessionState` (active selection, view options) from `DocumentState` (shapes, layers).

### Documentation Drift
- **Issue**: `frontend/project-guidelines.md` references a monolithic `useAppStore` and incorrect file extensions (`.ts` vs `.tsx` for components).
- **Action**: Update documentation to reflect the actual multi-store architecture (`useDataStore`, `useUIStore`).

### Testing
- **Issue**: `frontend/tests/` contains only 4 files. Critical logic like `useCanvasInteraction` is untested. `geometry.test.ts` marks known bugs in Arc bounds.
- **Action**: Add golden tests for Geometry and Unit tests for `snapEngine`.

---

## 4. Patterns & Smells Observed

1.  **The "God Hook" (`useCanvasInteraction.ts`)**:
    - Handles inputs, tools, selection, snapping, and transformation in one file.
    - **Smell**: Tight Coupling. Changes to "Snapping" require editing the same file as "Text Editing".
    - **Fix**: Composition. `useSelectionTool`, `useDrawTool`, `useSnap`.

2.  **Duplicated Geometry Logic**:
    - `geometry.ts` and `snapEngine/detectors.ts` both implement logic to find corners/centers.
    - **Smell**: Don't Repeat Yourself (DRY).
    - **Fix**: `snapEngine` should consume `geometry.ts` primitives.

3.  **Magic Numbers**:
    - `10` (hit tolerance), `5` (snap threshold) scattered across `geometry.ts`, `useCanvasInteraction.ts`, and `snapEngine`.
    - **Smell**: Hard to configure/tune.
    - **Fix**: Centralize in `frontend/config/constants.ts`.

---

## 5. Suggested Refactor Roadmap

### Phase 1: Safe Cleanups (Next Week)
- [ ] **Fix Snapping Rotation**: Update `detectors.ts` to respect `shape.rotation`.
- [ ] **Fix Overlay Perf**: Optimization `DynamicOverlay` to not subscribe to `shapes`.
- [ ] **Docs**: Update `project-guidelines.md`.
- [ ] **Constants**: Extract magic numbers to a config file.

### Phase 2: Structural Improvements (Next Month)
- [ ] **Decompose `useCanvasInteraction`**: Split into `useSelection`, `useTransformation`, and `useToolManager`.
- [ ] **Worker Import**: Move `pdfToShapes` to a Web Worker.
- [ ] **Geometry Tests**: Fix known bugs in Arc bounds and add rigorous tests.

### Phase 3: Architectural Bets (Long Term)
- [ ] **Hybrid Import**: Move PDF processing to Backend (Python `PyMuPDF`) for perfect rendering and optimizations before sending JSON to frontend.
- [ ] **Render Engine**: If React DOM is too slow for >5k shapes, migrate `StaticCanvas` to use a WebGL renderer (e.g., PixiJS) while keeping React for UI overlays.
