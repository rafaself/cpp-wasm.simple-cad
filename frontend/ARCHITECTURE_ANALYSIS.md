# System Overview & Analysis

## 1. System Overview

*   **Source of Truth**: `useDataStore.ts` (Zustand).
    *   State: `shapes`, `layers`, `spatialIndex` (QuadTree), `history` (patches).
    *   Persistence: In-memory for session; serialization to JSON structure.
*   **Rendering Flow**:
    *   **Data Layer**: Updates in `useDataStore` trigger subscribers.
    *   **Static Layer (`StaticCanvas`)**: Subscribes to `useDataStore`. Uses `spatialIndex` to query visible shapes. optimized with `visibleIdsRef` to avoid re-rendering unchanged frames. Renders "committed" shapes.
    *   **Dynamic Layer (`DynamicOverlay`)**: Subscribes to `useUIStore` (selection, tool) and `useCanvasInteraction` (drag state). Renders ghosts, selection handles, and active tool drafts (lines, rects being drawn).
    *   **Drawing Logic**: Centralized in `renderers/` (`ShapeRenderer`, `SelectionRenderer`, `GhostRenderer`). `ShapeRenderer` handles the 2D Context calls.
*   **Interaction Model**:
    *   **God Hook**: `useCanvasInteraction.ts` attached to `DynamicOverlay`. Handles all pointer events (`down`, `move`, `up`, `wheel`).
    *   **State Machine**: Implicit state machine via `isDragging`, `activeTool`, `startPoint` refs.
    *   **Coordinate System**: Cartesian (Y-Up). `screenToWorld` / `worldToScreen` transforms centralized in `geometry.ts`. Canvas context is scaled `(scale, -scale)` to match.

## 2. Bug & Risk Report

| Severity | Issue | Module | Root Cause | Impact | Fix |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0** | **SVG Rendering Performance** | `ShapeRenderer.ts` | `applyStrokeColorToSvg` runs regex on every frame for every symbol. | Massive CPU usage, FPS drop with many symbols. | Cache tinted SVG strings. |
| **P1** | **Connection Sync Bottleneck** | `useDataStore.ts` | `syncConnections` iterates ALL shapes (O(N)) on every update (even drag). | Drag lag with many shapes. | Optimize topology check (skip for non-connectables). |
| **P1** | **QuadTree Thrashing** | `useCanvasInteraction.ts` | `data.syncQuadTree()` (full rebuild) called on `mouseUp` unnecessarily. | Lag spike after every edit. | Remove redundant calls; rely on incremental `updateShape`. |
| **P2** | **Text Wrapping Perf** | `geometry.ts` | `getWrappedLines` re-calculates on every render. | CPU churn for text-heavy drawings. | Memoize `getWrappedLines`. |
| **P2** | **UX Regression Risk** | `useCanvasInteraction.ts` | Disabling sync during drag breaks rubber-banding. | Connections snap instead of follow. | Keep sync but optimize it, or accept P1 perf hit for UX. |
| **P3** | **Memory Leak Risk** | `ShapeRenderer.ts` | Caches (Image/String) are unbounded. | Memory growth over long sessions. | Implement LRU or size limit for caches. |

## 3. Performance Audit

*   **Hotspot 1: `renderShape` -> `applyStrokeColorToSvg`**
    *   *Cost:* High (Regex on large strings).
    *   *Frequency:* Every frame per visible symbol.
    *   *Fix:* Cache result.
*   **Hotspot 2: `syncConnections`**
    *   *Cost:* O(N) where N = total shapes.
    *   *Frequency:* Every mouse move during drag.
    *   *Fix:* Incremental updates or spatial query for connections.
*   **Hotspot 3: `syncQuadTree`**
    *   *Cost:* O(N*logN) rebuild.
    *   *Frequency:* `mouseUp` (Drag end).
    *   *Fix:* Remove.

## 4. Tooling Consistency Review

*   **Creation Lifecycle**:
    *   `Rect`/`Circle`: Drag to create.
    *   `Polyline`: Click-Click-Enter.
    *   `Conduit`: Click-Click (Node-to-Node).
    *   *Verdict:* Mostly consistent per domain (CAD vs Diagram).
*   **Math Duplication**:
    *   `getShapeBounds` and `getShapeBoundingBox` overlap in logic but return different formats. `getShapeBounds` handles rotation/arcs better.
    *   Rotation logic duplicated in `rotateSelected` (store) and `DynamicOverlay` (ghost).

## 5. Proposed Fix Plan

1.  **Architecture Analysis**: Document findings (Done).
2.  **Safe Performance Fixes**:
    *   Implement **LRU-bounded Cache** for `applyStrokeColorToSvg` in `ShapeRenderer.ts`.
    *   Implement **LRU-bounded Cache** for `getWrappedLines` in `geometry.ts`.
    *   Remove redundant `syncQuadTree()` in `useCanvasInteraction.ts`.
3.  **Risk Mitigation**:
    *   Do *not* disable `syncConnections` during drag to preserve rubber-banding (UX priority).
    *   Accept O(N) for now, but ensure `syncConnections` isn't running *multiple* times per frame.
4.  **Verification**:
    *   Verify SVG caching works and doesn't leak.
    *   Verify text wrapping is correct.
