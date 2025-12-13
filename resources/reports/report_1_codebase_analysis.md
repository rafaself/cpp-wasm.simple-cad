# Codebase Analysis Report

**Date:** 2024-05-23
**Analyst:** Jules (Senior Frontend Engineer)
**Scope:** Entire Codebase (Focus on Frontend Architecture)

## 1. Executive Summary

The application is a functional CAD-like editor with a React/Zustand/Canvas stack. While it successfully implements complex features like snapping, history (undo/redo), and spatial indexing, the architecture is suffering from significant technical debt. The primary issues are **Monolithic State Management**, **Performance Bottlenecks** in the render loop, and **Scalability concerns** due to tightly coupled logic (God Objects/Hooks).

The "Feature-Based Architecture" described in the guidelines is only partially implemented, with core logic (tools, interactions) still centralized in massive files rather than distributed modules.

## 2. Critical Issues

### A. Architecture & Scalability
1.  **Monolithic Data Store (`useDataStore.ts`)**:
    *   **Violation:** The store handles Shapes, Layers, History, Selection logic, Diagram nodes, and Electrical elements. This violates the Single Responsibility Principle (SRP).
    *   **Impact:** Any change to the store structure risks breaking unrelated features. Testing is difficult.
2.  **"God Hook" Interaction Logic (`useCanvasInteraction.ts`)**:
    *   **Violation:** This single file (~700 lines) contains the logic for *every* tool (Pen, Rect, Electrical, Move, Rotate).
    *   **Impact:** Adding a new tool requires modifying this central file, violating the Open/Closed Principle. It makes the file unreadable and prone to regression bugs.
3.  **Missing Infrastructure (`uuid.ts`)**:
    *   **Violation:** The codebase relies on `Date.now().toString()` for ID generation in multiple places (`useDataStore`, `useCanvasInteraction`, `DynamicOverlay`).
    *   **Impact:** High risk of ID collisions during batch operations, automated testing, or rapid user actions. `frontend/utils/uuid.ts` is referenced in project memory but does not exist in the file system.

### B. State Management & Performance
1.  **Render Loop Inefficiency (`DynamicOverlay.tsx`)**:
    *   **Issue:** The component calls `const dataStore = useDataStore();` without a selector.
    *   **Impact:** `DynamicOverlay` re-renders on *every single change* to the store (e.g., changing a layer color, locking a shape), even if it doesn't affect the overlay. This is a major performance anti-pattern in Zustand.
2.  **High-Frequency State Updates**:
    *   **Issue:** `useUIStore` stores `mousePos`. `useCanvasInteraction` updates this on every `mousemove`.
    *   **Impact:** Any component subscribing to `useUIStore` (without selectors) will re-render at 60fps.
3.  **Complex Manual Subscriptions (`StaticCanvas.tsx`)**:
    *   **Issue:** To avoid re-renders, `StaticCanvas` implements a complex manual subscription to `useDataStore`.
    *   **Impact:** While performant, the logic is brittle. It manually checks for deep equality and visible set changes. This logic duplicates React's reconciliation job and is error-prone.

### C. Code Quality & Type Safety
1.  **Type Confusion (`ToolType`)**:
    *   **Issue:** The `ToolType` type mixes *Objects* ('rect', 'circle') with *Actions* ('move', 'rotate', 'pan').
    *   **Impact:** This leads to confusing `if/else` logic where we check `if (tool === 'move')` inside shape creation blocks.
2.  **Hardcoded Magic Strings**:
    *   **Issue:** Layer names ('Desenho', 'Eletrodutos') and IDs are hardcoded in the store initialization and logic.
    *   **Impact:** Internationalization or customization of layers is impossible without code changes.

## 3. Reasoning & Evidence

*   **Evidence for A.2:** `useCanvasInteraction.ts` has a `handleMouseDown` function that contains specific `if (ui.activeTool === 'electrical-symbol')` blocks alongside `if (ui.activeTool === 'polyline')`. This proves tight coupling.
*   **Evidence for B.1:** `DynamicOverlay.tsx:21`: `const dataStore = useDataStore();`. This triggers a re-render on any store update.
*   **Evidence for A.3:** `grep "Date.now()"` reveals usage in `DynamicOverlay.tsx` (Radius Modal), `useDataStore.ts` (Add Layer), and `useCanvasInteraction.ts` (Shape creation).

## 4. Suggested Refactors

### Phase 1: Safety & Cleanup (Immediate)
1.  **Implement `frontend/utils/uuid.ts`**: Replace all `Date.now()` calls with `crypto.randomUUID()` (or a polyfill).
2.  **Fix `DynamicOverlay` Subscription**: Change `useDataStore()` to `useDataStore(s => ({ shapes: s.shapes, ... }))` using `shallow` comparison, or strictly select only what is needed for the ghost rendering.

### Phase 2: Architecture (High Value)
1.  **Abstract Tools**: Create a `Tool` interface.
    ```typescript
    interface Tool {
      onMouseDown(e: MouseEvent): void;
      onMouseMove(e: MouseEvent): void;
      onMouseUp(e: MouseEvent): void;
      renderOverlay(ctx: CanvasRenderingContext2D): void;
    }
    ```
    Move logic from `useCanvasInteraction` into `frontend/features/editor/tools/RectangleTool.ts`, `MoveTool.ts`, etc.
2.  **Split Stores**:
    *   `useShapeStore`: Only shapes and spatial index.
    *   `useSelectionStore`: Selected IDs.
    *   `useProjectStore`: Layers, Metadata.
    *   This reduces render impact when updating one part of the state.

## 5. Proposed Code Structure (Clean)

```typescript
// frontend/features/editor/tools/ToolRegistry.ts
class ToolRegistry {
  tools: Record<string, Tool> = {};

  register(name: string, tool: Tool) { this.tools[name] = tool; }
  get(name: string) { return this.tools[name] ?? new SelectTool(); }
}

// frontend/features/editor/interaction/useCanvasInteraction.ts (Refactored)
const useCanvasInteraction = () => {
    const activeToolName = useUIStore(s => s.activeTool);
    const tool = toolRegistry.get(activeToolName);

    const handleMouseDown = (e) => tool.onMouseDown(e);
    // ... logic delegates to specific tool class ...
}
```

## 6. Summary

The codebase needs a significant structural refactor to support further growth. Continuing to add features to `useDataStore` and `useCanvasInteraction` will result in unmaintainable code and performance degradation. The immediate priority should be fixing the ID generation and optimizing the `DynamicOverlay` render loop.
