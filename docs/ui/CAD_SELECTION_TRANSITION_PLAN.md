# CAD-like Selection Transition Plan: Polygons (3+ sides)

> **Status**: Implemented (Phase 1 & 2)
> **Created**: 2026-01-23
> **Scope**: Migrate polygons from 4-side bounding-box selection to true-contour CAD-like selection

---

## Executive Summary

This document provides a comprehensive analysis and implementation plan to transition polygon selection from a Figma-like bounding-box model to a CAD/AutoCAD-like model where:
- Selection outline follows the **true polygon contour**
- Editing uses **grips on real vertices/edges**, not bbox corners
- All geometry operations are **WCS-first** (World Coordinate System)

---

## A) Current-State Audit (with evidence)

### A.1) Selection Pipeline Map

#### A.1.1) Where bbox/AABB/OBB/handles are computed

| Component | File | Description |
|-----------|------|-------------|
| **OrientedHandleMeta** | `apps/web/engine/core/protocol.ts:250-279` | Pre-rotated 4-corner bounding box computed by C++ engine |
| **EntityAabb** | `apps/web/engine/core/protocol.ts:281-287` | Axis-aligned bounding box for broad-phase |
| **EntityTransform** | `apps/web/engine/core/protocol.ts:289-297` | Position, size, rotation (center-based) |
| **getOrientedHandleMeta()** | `apps/web/engine/core/runtime/SelectionSystem.ts:149-154` | Fetches 4-corner OBB from engine |
| **getSelectionBounds()** | `apps/web/engine/core/runtime/SelectionSystem.ts:156-161` | Fetches AABB for multi-selection |

**Key Finding**: The C++ engine computes `OrientedHandleMeta` which provides **4 pre-rotated corners** representing a bounding box, regardless of the polygon's actual vertex count.

#### A.1.2) How overlay is rendered

**File**: `apps/web/features/editor/components/ShapeOverlay.tsx`

The rendering logic at lines 266-448 shows:

```typescript
// Line 270-273: "vertex-only" entities
const isVertexOnly =
  entityKind === EntityKind.Line ||
  entityKind === EntityKind.Arrow ||
  entityKind === EntityKind.Polyline;
```

**Critical Issue**: `EntityKind.Polygon` (value `8` per `apps/web/engine/types.ts:6`) is **NOT** in the `isVertexOnly` list. Therefore:

- **Lines/Arrows/Polylines** → Use legacy `getSelectionOutlineMeta()` + `getSelectionHandleMeta()` → Shows true contour with vertex handles
- **Polygons** → Use `OrientedHandleMeta` → Shows 4-corner rectangular bounding box

**Current Polygon Overlay Rendering** (lines 276-327):
1. Fetches `orientedMeta = runtime.getOrientedHandleMeta()`
2. Renders a 4-point polygon outline (BL, BR, TR, TL)
3. Renders 4 corner resize handles
4. Renders 1 rotate handle (if enabled)

#### A.1.3) Hit-testing flow (hover/select)

**File**: `apps/web/engine/core/runtime/PickSystem.ts`

```typescript
// Line 21-37: pickEx returns PickResult
public pickEx(x, y, tolerance, pickMask): PickResult {
  const res = this.engine.pickEx(x, y, tolerance, pickMask);
  return res;
}
```

**PickResult structure** (`apps/web/types/picking.ts:27-35`):
```typescript
interface PickResult {
  id: EntityId;           // 0 = miss
  kind: PickEntityKind;   // Rect, Circle, Line, Polyline, Polygon, Arrow, Text
  subTarget: PickSubTarget; // None, Body, Edge, Vertex, ResizeHandle, RotateHandle
  subIndex: number;       // -1 if N/A, vertex/edge index otherwise
  distance: number;       // Infinity for miss
  hitX?: number;
  hitY?: number;
}
```

**Current Picking for Polygons** (C++ engine-side):
- The engine already supports `PickSubTarget.Vertex` and `PickSubTarget.Edge`
- For polygons, picking returns `subTarget` and `subIndex` correctly
- However, the frontend doesn't utilize vertex/edge picking for polygons due to the bbox overlay

#### A.1.4) Transform flow

**File**: `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx`

Transform mode selection (lines 255-270):
```typescript
if (res.subTarget === PickSubTarget.ResizeHandle) {
  mode = TransformMode.Resize;
} else if (res.subTarget === PickSubTarget.RotateHandle) {
  mode = TransformMode.Rotate;
} else if (res.subTarget === PickSubTarget.Vertex) {
  mode = TransformMode.VertexDrag;  // ← Already supported!
} else if (res.subTarget === PickSubTarget.Edge) {
  // Lines/arrows: Move entire entity
  // Others: EdgeDrag mode
  mode = isLineOrArrow(res.kind) ? TransformMode.Move : TransformMode.EdgeDrag;
}
```

**TransformMode enum** (`apps/web/engine/core/interactionSession.ts:5-12`):
```typescript
enum TransformMode {
  Move = 0,
  VertexDrag = 1,   // ← Already exists
  EdgeDrag = 2,     // ← Already exists
  Resize = 3,
  Rotate = 4,
  SideResize = 5,
}
```

**Key Finding**: The transform system **already supports VertexDrag and EdgeDrag modes**, but they're not exposed for polygons because:
1. Polygon overlay shows bbox handles, not vertex handles
2. Polygon picking doesn't return vertex/edge hits from the overlay (only from geometry)

---

### A.2) Snap Pipeline Map

#### A.2.1) Candidate generation

**File**: `apps/web/engine/core/runtime/TransformSystem.ts:149-169`

```typescript
public setSnapOptions(
  enabled: boolean,
  gridEnabled: boolean,
  gridSize: number,
  tolerancePx: number,
  endpointEnabled: boolean,
  midpointEnabled: boolean,
  centerEnabled: boolean,
  nearestEnabled: boolean,
): void {
  this.engine.setSnapOptions?.(...);
}
```

Snap candidate generation happens **entirely in the C++ engine**. The frontend only configures options.

#### A.2.2) Distance evaluation

Performed in C++ engine. The frontend receives snap overlay via:

```typescript
public getSnapOverlayMeta(): OverlayBufferMeta {
  return this.engine.getSnapOverlayMeta();
}
```

#### A.2.3) Resolution/commit

**File**: `apps/web/features/editor/components/ShapeOverlay.tsx:181-217`

Snap guides are rendered from `OverlayBufferMeta` during active interactions:
```typescript
if (interactionActive) {
  const snapMeta = runtime.getSnapOverlayMeta();
  const snap = decodeOverlayBuffer(runtime.module.HEAPU8, snapMeta);
  // Render snap segments/polylines in red (#ff5d5d)
}
```

#### A.2.4) Coordinate spaces used

| Step | Coordinate Space | Location |
|------|------------------|----------|
| Candidate generation | WCS | C++ engine |
| Distance evaluation | WCS | C++ engine |
| Threshold definition | Screen pixels → converted to WCS | `ViewportSystem.getSnapTolerance()` |
| Result delivery | WCS (via overlay buffer) | C++ → Frontend |
| Visualization | WCS → Screen (via `worldToScreen()`) | ShapeOverlay.tsx |

**Status**: Snapping is already WCS-first and deterministic. ✓

---

### A.3) Precision and Drift Risks

#### A.3.1) Screen-space rounding

**File**: `apps/web/utils/viewportMath.ts`

```typescript
export const screenToWorld = (point: Point, transform: ViewTransform): Point => ({
  x: (point.x - transform.x) / transform.scale,
  y: -(point.y - transform.y) / transform.scale,
});
```

**Risk Level**: LOW
- Conversions are straightforward division/multiplication
- No explicit rounding
- Scale factor is preserved as `number` (64-bit float)

#### A.3.2) Double transforms/re-rotations

**Current Issue**: The frontend does **not** re-rotate polygon vertices. Instead:
- Engine provides pre-rotated `OrientedHandleMeta` corners
- Frontend directly uses these WCS points

**For Polylines (existing vertex-based)**:
- Engine provides vertex positions via `getSelectionOutlineMeta()` and `getSelectionHandleMeta()`
- Frontend just transforms WCS → Screen for rendering

**Risk Level**: LOW (no frontend geometry math)

#### A.3.3) Inconsistent WCS vs local vs screen conversions

**File**: `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:88-151`

The `findSideHandle()` method performs local-space calculations:
```typescript
// Project World Point to Local Space
const dx = worldPoint.x - transform.posX;
const dy = worldPoint.y - transform.posY;
const rad = -(transform.rotationDeg * Math.PI) / 180;
const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
```

**Risk Level**: MEDIUM
- This is frontend geometry math (violates engine-first principle)
- Only used for side-handle detection on rectangles
- Should be moved to engine for consistency

#### A.3.4) Tolerance handling

**File**: `apps/web/engine/core/runtime/ViewportSystem.ts:85-101`

```typescript
getPickingTolerance(screenTolerancePx: number = 10): number {
  return screenTolerancePx / (this.currentTransform.scale || 1);
}
```

**Status**: Tolerances are correctly converted from screen pixels to WCS. ✓

---

### A.4) Performance Hotspots

#### A.4.1) Vertex count scaling

**Current**: Polygon vertex count doesn't affect selection overlay (uses 4-corner bbox).

**After transition**: Selection outline will have N vertices for N-sided polygon.
- 3-24 sides typical (per `InlinePolygonInput.tsx:24-25`)
- Rendering N points is O(N) but N ≤ 24 is negligible

#### A.4.2) Per-frame/per-pointermove computations

**File**: `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx:389-513`

`onPointerMove()` performs:
1. `findSideHandle()` - local space math (O(1))
2. `runtime.pickExSmart()` - O(log n) via spatial index
3. `decodeOverlayBuffer()` - O(primitives) for debug logging only
4. Cursor state updates - O(1)

**Hotpath Safety**:
- Uses `pickExSmart` which wraps `pickEx` with profiling
- Selection IDs are cached (`SelectionSystem._cachedSelectionIds`)
- No React state updates during pointermove

#### A.4.3) Spatial indexing

**Current**: The C++ engine implements spatial indexing internally.
- `pickEx()` is O(log n) per `docs/architecture/engine-api.md:433`
- No quadtree/R-tree in frontend (correct architecture)

**File**: `apps/web/utils/pickResultCache.ts`
- LRU cache with spatial grid hashing
- 100 entries, 50ms TTL
- Invalidates on document generation change

---

## B) Proposed "No-Debt" Architecture (WCS-first)

### B.1) Design Principles

1. **Single Source of Truth**: All polygon geometry (vertices, edges) is computed **only** by the C++ engine
2. **WCS-first**: All API contracts use WCS coordinates; screen conversion happens only at render time
3. **Engine Provides, Frontend Renders**: No geometry math in TypeScript
4. **Grips Reference Real Geometry**: Grips are tied to vertex/edge indices, not bbox corners

### B.2) Proposed API Contracts

#### B.2.1) Polygon Contour Query

**New Engine API** (C++ → WASM binding):

```cpp
// Returns polygon vertices in WCS for selection outline rendering
// For EntityKind::Polygon, returns the N vertices of the polygon
// For other shapes, returns the existing outline behavior
OverlayBufferMeta getPolygonContourMeta(EntityId id);
```

**Frontend Usage**:
```typescript
// In SelectionSystem or new PolygonSystem
getPolygonContourWCS(entityId: EntityId): OverlayBufferMeta {
  if (!this.engine.getPolygonContourMeta) {
    // Fallback: use existing getSelectionOutlineMeta
    return this.engine.getSelectionOutlineMeta();
  }
  return this.engine.getPolygonContourMeta(entityId);
}
```

#### B.2.2) Grip Positions Query

**New Engine API**:

```cpp
// Returns grip positions for entity
// For polygons: N vertex grips + optional N edge midpoint grips
struct GripMeta {
  uint32_t generation;
  uint32_t vertexCount;
  uint32_t edgeCount;       // 0 if edges not requested
  uint32_t floatCount;      // vertexCount*2 + edgeCount*2
  uintptr_t verticesPtr;    // [x0,y0, x1,y1, ...] in WCS
  uintptr_t edgeMidpointsPtr; // [x0,y0, x1,y1, ...] in WCS (if edgeCount > 0)
};

GripMeta getEntityGripsMeta(EntityId id, bool includeEdges);
```

**Frontend Contract**:
```typescript
interface GripWCS {
  kind: 'vertex' | 'edge-midpoint' | 'center';
  positionWCS: { x: number; y: number };
  index: number;  // vertex or edge index
}

getGripsWCS(entityId: EntityId, includeEdges: boolean): GripWCS[] {
  const meta = this.engine.getEntityGripsMeta(entityId, includeEdges);
  // Decode from WASM memory
  return decodeGrips(this.module.HEAPU8, meta);
}
```

#### B.2.3) Geometric Extents (Broad-Phase)

**Existing API** (already available):
```typescript
getEntityAabb(entityId: EntityId): EntityAabb {
  // Returns { minX, minY, maxX, maxY, valid }
  return this.pickSystem.getEntityAabb(entityId);
}
```

**Usage**: Broad-phase filtering for spatial queries, NOT for selection overlay.

#### B.2.4) Grip Hit-Test

**Enhancement to existing pickEx**:

The engine already returns `PickSubTarget.Vertex` and `subIndex` for polygon vertex hits. No new API needed, but we need to ensure:

1. Polygon vertices are included in hit-test candidates
2. Hit-test priority: Grips > Edges > Body

**Priority Rules** (engine-side):
```
1. ResizeHandle / RotateHandle (for bbox-based shapes) - distance < 8px
2. Vertex grip (for vertex-based shapes) - distance < 8px
3. Edge / Edge-midpoint grip - distance < 6px
4. Body interior - point-in-polygon test
5. Nearest contour (for stroke hit-testing) - distance < strokeWidth/2 + 4px
```

#### B.2.5) Contour Hit-Test

Already supported via `pickEx()`:
- Returns `PickSubTarget.Edge` with `subIndex` for edge index
- Returns `PickSubTarget.Body` for interior hits

#### B.2.6) Apply Grip Drag

**Existing API** (already available):
```typescript
beginTransform(
  ids: EntityId[],
  mode: TransformMode,        // VertexDrag or EdgeDrag
  specificId: EntityId,
  vertexIndex: number,        // Which vertex/edge
  screenX, screenY,
  viewX, viewY, viewScale,
  viewWidth, viewHeight,
  modifiers
): void

updateTransform(screenX, screenY, ...): void
commitTransform(): CommitResult | null
cancelTransform(): void
```

**Contract for Polygon Vertex Drag**:
- `mode = TransformMode.VertexDrag`
- `vertexIndex = picked vertex index`
- Engine moves only that vertex, updates adjacent edges
- Snapping applies during `updateTransform()`

**Contract for Polygon Edge Drag (Phase 2)**:
- `mode = TransformMode.EdgeDrag`
- `vertexIndex = edge index (edge between vertex[i] and vertex[(i+1)%n])`
- Engine moves both endpoint vertices
- Default motion: perpendicular offset to edge direction (CAD-like)
- Shift modifier: free drag

### B.3) Grip Edit Session State Machine

```
                    ┌─────────────────────────────────────────────────┐
                    │                                                 │
                    ▼                                                 │
┌──────────┐   pointerdown    ┌──────────────┐    commit/cancel    ┌─┴────────┐
│   IDLE   │ ───────────────► │   DRAGGING   │ ──────────────────► │   IDLE   │
└──────────┘   (grip hit)     └──────────────┘    (pointerup/esc)  └──────────┘
                                     │
                                     │ pointermove
                                     ▼
                              ┌──────────────┐
                              │  UPDATE      │
                              │  (snap ctx)  │
                              └──────────────┘
                                     │
                                     └──────► (continues)
```

**State Variables**:
```typescript
type GripEditSession = {
  active: boolean;
  entityId: EntityId;
  gripKind: 'vertex' | 'edge-midpoint';
  gripIndex: number;
  basePointWCS: { x: number; y: number };  // Original position
  snapContext: {
    enabled: boolean;
    activeSnapTarget: SnapTarget | null;
  };
};
```

### B.4) Deterministic Tie-Break Rules

When multiple entities are under the cursor:

1. **Distance Priority**: Closest entity wins (by distance from cursor to geometry)
2. **Sub-target Priority**: Grips > Edges > Body
3. **Z-order**: Higher z-order (later in draw order) wins for equal distance
4. **Selection Bias**: Currently selected entities have slight priority (+2px effective tolerance)
5. **Most Recent**: For truly equal candidates, most recently interacted entity wins

### B.5) True Contour Definition

For polygons in this application:

| Property | Definition |
|----------|------------|
| **Contour** | The N vertices of the regular polygon, connected by straight edges |
| **Fill Boundary** | Same as contour (closed polygon) |
| **Stroke Centerline** | Same as contour |
| **Stroke Outer Boundary** | Contour offset by `strokeWidth/2` (not used for selection) |
| **Selection Outline** | Contour (stroke centerline) |
| **Hit-test Distance** | Distance to nearest edge + tolerance for stroke width |

**Joins/Caps**: Polygons are closed shapes, so:
- No end caps
- Joins are at vertices (miter by default)
- Selection hit-test uses the centerline, not the rendered stroke boundary

---

## C) Performance Plan

### C.1) Spatial Indexing / Broad-Phase

**Current State**: The C++ engine implements internal spatial indexing.
- `pickEx()` is O(log n)
- Broad-phase AABB filtering is engine-internal

**No Change Required**: The engine's spatial index handles polygon vertices internally.

### C.2) Caching + Invalidation

#### C.2.1) Polygon Contour Cache

**Location**: New cache in `SelectionSystem` or dedicated `PolygonOverlayCache`

```typescript
class PolygonContourCache {
  private cache = new Map<EntityId, {
    generation: number;
    vertices: Float32Array;
  }>();

  get(entityId: EntityId, currentGen: number): Float32Array | null {
    const entry = this.cache.get(entityId);
    if (entry && entry.generation === currentGen) {
      return entry.vertices;
    }
    return null;
  }

  set(entityId: EntityId, generation: number, vertices: Float32Array): void {
    this.cache.set(entityId, { generation, vertices });
  }

  invalidate(entityId: EntityId): void {
    this.cache.delete(entityId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
```

**Invalidation Triggers**:
- `EntityChanged` event with `ChangeMask.Geometry`
- `EntityDeleted` event
- `SelectionChanged` event (clear all)
- Document load/clear

#### C.2.2) Grip Position Cache

Similar caching strategy, keyed by `(entityId, generation, includeEdges)`.

### C.3) Grip Budget + Progressive Disclosure

**Strategy for High-Vertex Shapes**:

| Vertex Count | Grip Display |
|--------------|--------------|
| 3-12 | All vertex grips visible |
| 13-24 | Vertex grips visible, edge midpoints hidden by default |
| 25+ | Show only selected vertex grip + adjacent 2, others as dots |

**Zoom-Gated Disclosure**:
```typescript
const GRIP_DISPLAY_THRESHOLD_PX = 20; // Minimum screen distance between grips

function shouldShowAllGrips(vertexCount: number, scale: number, avgEdgeLength: number): boolean {
  const screenEdgeLength = avgEdgeLength * scale;
  return screenEdgeLength >= GRIP_DISPLAY_THRESHOLD_PX;
}
```

**Explicit Edit Mode** (Phase 3):
- Double-click polygon → Enter "Edit Vertices" mode
- Shows all grips regardless of zoom
- ESC exits mode

### C.4) Render Efficiency

#### C.4.1) Memoization

`ShapeOverlay.tsx` already uses `useMemo` with dependencies:
```typescript
const overlayContent = useMemo(() => {
  // ...
}, [
  canvasSize, engineResizeEnabled, overlayTick,
  isEditingAppearance, isTextEditing, runtime,
  selectionCount, selectionIds, viewTransform,
]);
```

**Enhancement**: Add `entityGeneration` to dependencies when rendering polygon contours:
```typescript
const polygonGen = runtime.getStats()?.generation ?? 0;
// Include in deps
```

#### C.4.2) Minimize Pointer-Move Work

**Current**: `onPointerMove` in SelectionHandler is already optimized:
- Uses cached selection IDs
- No React state updates
- Pick cache reduces redundant engine calls

**After Transition**:
- Grip hit-testing uses existing `pickEx()` (no new per-frame work)
- Contour rendering updates only on `overlayTick` change (not per-frame)

### C.5) Observability / Debug

**Dev-Only Visualization** (extend existing CAD_DEBUG system):

```typescript
// In ShapeOverlay.tsx debug section
if (isCadDebugEnabled('grips')) {
  // Show all snap candidates as cyan dots
  snapCandidates.forEach((c, i) => {
    debugElements.push(
      <circle key={`snap-cand-${i}`} cx={c.screenX} cy={c.screenY} r={3} fill="#00bcd4" />
    );
  });

  // Show active snap target as green
  if (activeSnap) {
    debugElements.push(
      <circle key="snap-active" cx={activeSnap.screenX} cy={activeSnap.screenY} r={5} fill="#4caf50" />
    );
  }

  // Show hit-test winner reason
  cadDebugLog('grips', 'hit-winner', () => ({
    entityId: pick.id,
    subTarget: PickSubTarget[pick.subTarget],
    subIndex: pick.subIndex,
    distance: pick.distance,
    reason: 'closest-vertex', // or 'z-order', 'selection-bias', etc.
  }));
}
```

---

## D) Best Action Plan (Phased)

### Phase 1: Polygon Contour Selection + Vertex Grips

**Goal**: Replace bbox overlay with true contour, add vertex grip rendering and interaction.

**Rationale**: This is the minimum viable CAD-like selection. Vertex editing is the most common polygon manipulation.

#### D.1.1) Engine Changes (C++ - `packages/engine/`)

| File | Change |
|------|--------|
| `engine/impl/engine_overlay.cpp` | Add `getPolygonContourMeta(EntityId)` returning polygon vertices |
| `engine/impl/engine_overlay.cpp` | Add `getEntityGripsMeta(EntityId, bool)` returning vertex positions |
| `engine/bindings.cpp` | Expose new functions to WASM |
| `engine/interaction/pick_system.cpp` | Ensure polygon vertex picking returns correct `subTarget=Vertex` and `subIndex` |

**Estimated Files**: 3-4 C++ files

#### D.1.2) Frontend Changes (TypeScript - `apps/web/`)

| File | Change |
|------|--------|
| `engine/core/protocol.ts` | Add `GripMeta` type definition |
| `engine/core/runtime/SelectionSystem.ts` | Add `getPolygonContourWCS()` and `getGripsWCS()` |
| `features/editor/components/ShapeOverlay.tsx` | Update polygon rendering: use contour + vertex grips instead of bbox |
| `engine/types.ts` | No change (EntityKind.Polygon = 8 already exists) |

**Detailed ShapeOverlay Changes**:

```typescript
// Line ~270: Update condition
const isVertexBased =
  entityKind === EntityKind.Line ||
  entityKind === EntityKind.Arrow ||
  entityKind === EntityKind.Polyline ||
  entityKind === EntityKind.Polygon;  // ← ADD THIS

// For polygons, render true contour instead of oriented bbox
if (entityKind === EntityKind.Polygon) {
  // Get polygon vertices from engine
  const contourMeta = runtime.getPolygonContourMeta?.(entityId);
  if (contourMeta) {
    const contour = decodeOverlayBuffer(runtime.module.HEAPU8, contourMeta);
    // Render polygon outline
    contour.primitives.forEach((prim, idx) => {
      const pts = renderPoints(prim, contour.data);
      const pointsAttr = pts.map(p => `${p.x},${p.y}`).join(' ');
      selectionElements.push(
        <polygon key={`sel-contour-${idx}`} points={pointsAttr} ... />
      );
    });

    // Render vertex grips
    const gripsMeta = runtime.getEntityGripsMeta?.(entityId, false);
    if (gripsMeta) {
      const grips = decodeGrips(runtime.module.HEAPU8, gripsMeta);
      grips.forEach((grip, i) => {
        const screenPos = worldToScreen(grip.positionWCS, viewTransform);
        selectionElements.push(
          <rect key={`grip-${i}`} x={screenPos.x - hh} y={screenPos.y - hh} ... />
        );
      });
    }
  }
}
```

#### D.1.3) Interaction Changes

| File | Change |
|------|--------|
| `features/editor/interactions/handlers/SelectionHandler.tsx` | Update `onPointerDown` to handle polygon vertex picks → begin VertexDrag |

**SelectionHandler Changes**:

```typescript
// In onPointerDown, after pickExSmart:
if (res.kind === PickEntityKind.Polygon && res.subTarget === PickSubTarget.Vertex) {
  // Polygon vertex grip hit → begin vertex drag
  runtime.beginTransform(
    [res.id],
    TransformMode.VertexDrag,
    res.id,
    res.subIndex,  // Vertex index
    screen.x, screen.y,
    ...viewParams,
    modifiers
  );
  this.state = { kind: 'transform', startScreen: screen, mode: TransformMode.VertexDrag };
  return;
}
```

#### D.1.4) Acceptance Criteria

- [ ] Selecting a polygon shows its true N-sided contour, not a 4-corner bbox
- [ ] Vertex grips appear at each polygon vertex
- [ ] Hovering over a vertex grip shows move cursor
- [ ] Dragging a vertex grip moves only that vertex
- [ ] Snapping works during vertex drag
- [ ] ESC cancels vertex drag, restoring original position
- [ ] Undo reverses vertex drag as single operation
- [ ] Multi-selection of polygons shows group AABB (unchanged)

### Phase 2: Edge/Midpoint Grips + Edge Drag

**Goal**: Add edge midpoint grips and perpendicular edge drag editing.

**Rationale**: Edge manipulation is the second most common polygon edit operation in CAD.

#### D.2.1) Engine Changes

| File | Change |
|------|--------|
| `engine/impl/engine_overlay.cpp` | Extend `getEntityGripsMeta` to include edge midpoints when requested |
| `engine/interaction/interaction_session_update.cpp` | Implement EdgeDrag for polygons: move both endpoints, default perpendicular motion |

**Edge Drag Behavior**:
```cpp
// When EdgeDrag mode is active for polygon:
// 1. Calculate edge direction vector
// 2. Calculate perpendicular vector (normal)
// 3. Project mouse delta onto perpendicular
// 4. Move both endpoints by projected delta
// If Shift held: free drag (move both endpoints by raw delta)
```

#### D.2.2) Frontend Changes

| File | Change |
|------|--------|
| `features/editor/components/ShapeOverlay.tsx` | Render edge midpoint grips (smaller, different style) |
| `features/editor/interactions/handlers/SelectionHandler.tsx` | Handle edge/midpoint picks → begin EdgeDrag |

**Midpoint Grip Styling**:
```typescript
// Vertex grips: 8x8 white square with primary stroke
// Edge midpoint grips: 6x6 white diamond with primary stroke
<rect
  key={`edge-grip-${i}`}
  x={screenPos.x - 3}
  y={screenPos.y - 3}
  width={6}
  height={6}
  transform={`rotate(45, ${screenPos.x}, ${screenPos.y})`}
  className="fill-white stroke-primary"
/>
```

#### D.2.3) Acceptance Criteria

- [ ] Edge midpoint grips appear at each edge center (Phase 2 enabled)
- [ ] Dragging edge midpoint moves entire edge perpendicular to its direction
- [ ] Shift+drag edge allows free movement
- [ ] Adjacent vertices update correctly
- [ ] Polygon remains valid (no self-intersection check needed for regular polygons)

### Phase 3: Snap Hardening + Performance Tuning

**Goal**: Ensure snap system works correctly with polygon vertices, optimize performance.

#### D.3.1) Snap Enhancements

| Change | Description |
|--------|-------------|
| Polygon vertices as snap candidates | Engine already does this; verify it works |
| Polygon edge midpoints as snap candidates | Add if not present |
| Snap to polygon center | Add center snap option |
| Visual snap indicator | Show snap type (endpoint, midpoint, center) |

#### D.3.2) Performance Tuning

| Task | Description |
|------|-------------|
| Profile polygon overlay rendering | Ensure no regressions from bbox → contour |
| Grip budget implementation | Implement zoom-gated grip display |
| Cache hit rate monitoring | Add metrics to verify cache effectiveness |

#### D.3.3) Acceptance Criteria

- [ ] Snapping to polygon vertices works during any drag operation
- [ ] Snapping to polygon edge midpoints works
- [ ] Snap indicator shows correct type
- [ ] No performance regression in selection overlay rendering
- [ ] Grip display adapts to zoom level for high-vertex polygons

### Phase 4: Regression Hardening + Polish

**Goal**: Comprehensive testing and edge case handling.

#### D.4.1) Tasks

- Convex/concave polygon handling (if applicable - currently only regular polygons)
- Zoom extreme testing (very zoomed in/out)
- Large polygon stress testing (24 sides)
- Multi-selection interaction testing
- Undo/redo comprehensive testing
- Grid snap interaction testing

#### D.4.2) Documentation

- Update `docs/architecture/handle-index-contract.md` with polygon grip indices
- Update `docs/architecture/engine-api.md` with new APIs
- Add grip system to `AGENTS.md` architecture rules

---

## E) Testing Strategy

### E.1) Unit Tests (Geometry/Grip Computation)

**Location**: `apps/web/tests/` or `packages/engine/tests/`

| Test | Description |
|------|-------------|
| `polygon-contour.test.ts` | Verify contour vertices match polygon definition |
| `polygon-grips.test.ts` | Verify grip positions at vertices and edge midpoints |
| `grip-decode.test.ts` | Verify WASM buffer decoding produces correct grip array |

**Example**:
```typescript
describe('Polygon Contour', () => {
  it('returns correct vertex count for hexagon', async () => {
    const runtime = await EngineRuntime.create();
    // Create hexagon at (100, 100) with radius 50
    const id = runtime.allocateEntityId();
    runtime.apply([{
      op: CommandOp.UpsertPolygon,
      id,
      polygon: { cx: 100, cy: 100, width: 100, height: 100, sides: 6, ... }
    }]);

    const contour = runtime.getPolygonContourWCS(id);
    expect(contour.vertexCount).toBe(6);
  });
});
```

### E.2) Interaction Tests (Hit-Test Priority, Grip Sessions)

| Test | Description |
|------|-------------|
| `grip-priority.test.ts` | Vertex grip takes priority over edge over body |
| `grip-edit-session.test.ts` | Begin/update/commit/cancel flow works correctly |
| `shift-multiselect.test.ts` | Shift+click adds to selection |
| `esc-cancel.test.ts` | ESC cancels active edit |

### E.3) Manual Regression Matrix

| Scenario | Test Steps | Expected |
|----------|------------|----------|
| **Zoom Extremes** | Select polygon, zoom to 10%, then 500% | Grips remain hittable, contour renders correctly |
| **Rotation** | Create rotated polygon, select | Contour follows rotation, grips at correct positions |
| **Convex Polygon** | Create triangle (3 sides) | 3 vertex grips, triangular contour |
| **Many-sided Polygon** | Create 24-sided polygon | Grips may be condensed at low zoom |
| **Multi-selection** | Select 2 polygons | Group AABB shown (existing behavior) |
| **Snap Toggle** | Drag vertex with snap on/off | Snapping works when enabled |
| **Grid Snap** | Drag vertex with grid snap | Vertex snaps to grid |
| **No Drift** | Drag vertex, release at same point | No position change |
| **Large Polygons** | Create polygon with radius 10000 | No numeric precision issues |
| **Undo/Redo** | Drag vertex, undo, redo | Position restores correctly |

---

## F) Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Engine API changes break frontend | Medium | High | Version protocol, fail-fast validation |
| Performance regression in overlay rendering | Low | Medium | Profile before/after, cache contours |
| Grip display cluttered for many-sided polygons | Medium | Low | Implement grip budget/zoom-gating |
| Edge drag math errors | Low | Medium | Comprehensive unit tests, compare with CAD reference |
| Snap system interaction issues | Low | Medium | Test matrix covers snap scenarios |

---

## G) Feature Flag Rollout

### G.1) Flag Definition

**File**: `apps/web/stores/useSettingsStore.ts`

```typescript
featureFlags: {
  enableEngineResize: boolean;
  enablePolygonContourSelection: boolean;  // ← NEW
  enablePolygonEdgeGrips: boolean;         // ← NEW (Phase 2)
}
```

### G.2) Rollout Plan

| Phase | Flag | Default | Description |
|-------|------|---------|-------------|
| Dev | `enablePolygonContourSelection` | `true` | Enable for development testing |
| Staging | `enablePolygonContourSelection` | `true` | Enable for QA |
| Production | `enablePolygonContourSelection` | `false` | Disabled until Phase 1 complete |
| Phase 1 Complete | `enablePolygonContourSelection` | `true` | Enable for all users |
| Phase 2 | `enablePolygonEdgeGrips` | `false` | Disable until Phase 2 complete |

### G.3) Rollback Plan

If issues arise in production:
1. Set `enablePolygonContourSelection: false` in settings
2. Users see bbox selection (existing behavior)
3. No data loss (polygon geometry unchanged)
4. Investigate and fix
5. Re-enable when fixed

---

## H) Files to Touch Summary

### Engine (C++ - `packages/engine/`)

| File | Phase | Change Type |
|------|-------|-------------|
| `engine/impl/engine_overlay.cpp` | 1, 2 | New APIs |
| `engine/bindings.cpp` | 1, 2 | WASM exports |
| `engine/interaction/pick_system.cpp` | 1 | Verify vertex picking |
| `engine/interaction/interaction_session_update.cpp` | 2 | EdgeDrag implementation |
| `engine/interaction/interaction_constants.h` | 1 | Grip index constants |

### Frontend (`apps/web/`)

| File | Phase | Change Type |
|------|-------|-------------|
| `engine/core/protocol.ts` | 1 | Type definitions |
| `engine/core/runtime/SelectionSystem.ts` | 1 | New methods |
| `features/editor/components/ShapeOverlay.tsx` | 1, 2 | Render polygon contour + grips |
| `features/editor/interactions/handlers/SelectionHandler.tsx` | 1, 2 | Handle grip interactions |
| `stores/useSettingsStore.ts` | 1 | Feature flags |
| `docs/architecture/handle-index-contract.md` | 1 | Documentation |
| `docs/architecture/engine-api.md` | 1 | Documentation |

---

## I) Appendix: Current Code References

### I.1) Key Type Definitions

```typescript
// apps/web/engine/types.ts
enum EntityKind {
  Rect = 1,
  Line = 2,
  Polyline = 3,
  Circle = 7,
  Polygon = 8,  // ← Target entity type
  Arrow = 9,
}

// apps/web/types/picking.ts
enum PickSubTarget {
  None = 0,
  Body = 1,
  Edge = 2,
  Vertex = 3,  // ← Used for grip picking
  ResizeHandle = 4,
  RotateHandle = 5,
  TextBody = 6,
  TextCaret = 7,
}

// apps/web/engine/core/interactionSession.ts
enum TransformMode {
  Move = 0,
  VertexDrag = 1,  // ← Already exists for vertex editing
  EdgeDrag = 2,    // ← Already exists for edge editing
  Resize = 3,
  Rotate = 4,
  SideResize = 5,
}
```

### I.2) Current Overlay Decision Logic

**File**: `apps/web/features/editor/components/ShapeOverlay.tsx:266-448`

```typescript
// Current logic (simplified):
if (selectionCount > 1) {
  // Multi-select: show group AABB
} else {
  const isVertexOnly = entityKind === Line || Arrow || Polyline;

  if (orientedMeta.valid && !isVertexOnly) {
    // Use 4-corner OBB (CURRENT PATH FOR POLYGONS)
  } else if (isVertexOnly) {
    // Use vertex-based outline + handles
  } else {
    // Fallback AABB
  }
}
```

### I.3) Polygon Geometry Model

**File**: `apps/web/engine/core/commandTypes.ts:119`

```typescript
type PolygonPayload = CirclePayload & { sides: number };

// Where CirclePayload is:
type CirclePayload = {
  cx: number;     // Center X (WCS)
  cy: number;     // Center Y (WCS)
  width: number;  // Diameter X
  height: number; // Diameter Y
  rotation: number;
  // ... style properties
};
```

Polygons are defined as **regular N-gons** with:
- Center point (cx, cy)
- Bounding diameter (width, height) - typically equal for regular polygons
- Rotation angle
- Number of sides (3-24)

Vertex positions are computed from these parameters in the engine.

---

*End of Plan Document*
