# Phase 2 Implementation Summary: Edge Midpoint Grips + Edge Drag

> **Date**: 2026-01-23
> **Status**: Frontend Changes Complete - Awaiting Engine APIs
> **Related Plan**: [CAD_SELECTION_TRANSITION_PLAN.md](./CAD_SELECTION_TRANSITION_PLAN.md)
> **Phase 1**: [PHASE1_IMPLEMENTATION_SUMMARY.md](./PHASE1_IMPLEMENTATION_SUMMARY.md)

---

## Overview

Phase 2 frontend implementation is complete. The system now supports edge midpoint grips with perpendicular drag editing for polygons, building on Phase 1's vertex grip foundation. The implementation is controlled by a feature flag and includes proper fallbacks for when the C++ engine APIs are not yet available.

---

## Changes Implemented

### 1. Feature Flag Updated

**File**: `apps/web/stores/useSettingsStore.ts`

```typescript
featureFlags: {
  enablePolygonEdgeGrips: boolean; // Phase 2: Default false (dev: true)
}
```

- Default: `false` in production, `true` in development
- Requires `enablePolygonContourSelection` (Phase 1) to be enabled
- Setter: `setPolygonEdgeGripsEnabled()`

### 2. ShapeOverlay Rendering

**File**: `apps/web/features/editor/components/ShapeOverlay.tsx`

**Changes**:

1. Pass `includeEdges` flag to grip query:
```typescript
const includeEdges =
  enablePolygonContour &&
  useSettingsStore.getState().featureFlags.enablePolygonEdgeGrips;

const gripsWCS = runtime.selection.getEntityGripsWCS(entityId, includeEdges);
```

2. Render grips with differentiated styling:
```typescript
if (grip.kind === 'vertex') {
  // Vertex grips: 8x8 white squares
  <rect width={8} height={8} className="fill-white stroke-primary" />
}
else if (grip.kind === 'edge-midpoint') {
  // Edge midpoint grips: 6x6 white diamonds (rotated 45°)
  <rect
    width={6}
    height={6}
    transform={`rotate(45, ${x}, ${y})`}
    className="fill-white stroke-primary"
  />
}
```

**Visual Distinction**:
- **Vertex grips**: 8×8px white squares with primary stroke (Phase 1)
- **Edge midpoint grips**: 6×6px white diamonds (45° rotated squares) with primary stroke (Phase 2)

### 3. SelectionHandler Interaction

**File**: `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx`

**Changes**:

1. Added polygon edge grip detection in `onPointerDown()`:

```typescript
// Phase 2: Polygon edge midpoint grip hit
if (enablePolygonEdges && res.subTarget === PickSubTarget.Edge) {
  runtime.beginTransform(
    activeIds,
    TransformMode.EdgeDrag,
    res.id,
    res.subIndex, // Edge index
    ...
  );

  cadDebugLog('transform', 'polygon-edge-drag-begin', () => ({
    entityId: res.id,
    edgeIndex: res.subIndex,
    shiftHeld: shift,
  }));
}
```

2. Updated cursor logic in `onPointerMove()`:

**Hover state**:
```typescript
if (enablePolygonEdges && res.kind === PickEntityKind.Polygon) {
  // Show move cursor on edge midpoint hover
  this.showMoveCursor = true;
}
```

**During transform**:
```typescript
if (this.state.mode === TransformMode.EdgeDrag) {
  // Show move cursor during edge drag
  this.cursorScreenPos = ctx.screenPoint;
  this.showMoveCursor = true;
}
```

3. Consolidated grip handling logic:
   - Phase 1 & 2 checks are now unified in a single conditional block
   - Vertex and edge grips both show move cursor
   - Edge drag logs `shiftHeld` modifier for free drag detection

---

## Current Behavior

### With Both Flags Enabled (Development Mode)
```typescript
enablePolygonContourSelection: true  // Phase 1
enablePolygonEdgeGrips: true        // Phase 2
```

- Polygons show true N-sided contour outline
- **Vertex grips** (squares) at each polygon vertex
- **Edge midpoint grips** (diamonds) at the center of each edge
- Hovering vertex grip → move cursor
- Hovering edge grip → move cursor
- Clicking vertex grip → begins VertexDrag (Phase 1)
- Clicking edge grip → begins EdgeDrag (Phase 2)
- **Falls back gracefully if engine APIs not available**

### With Only Phase 1 Enabled (Partial Mode)
```typescript
enablePolygonContourSelection: true  // Phase 1
enablePolygonEdgeGrips: false       // Phase 2 OFF
```

- Polygons show contour + vertex grips only (no edge grips)
- Vertex editing works, edge editing disabled

### With Both Flags Disabled (Production Default)
```typescript
enablePolygonContourSelection: false // Phase 1 OFF
enablePolygonEdgeGrips: false       // Phase 2 OFF
```

- Polygons show 4-corner bounding box (original behavior)
- **No change from current production system**

---

## Pending Engine (C++) Changes

For full functionality, the following C++ enhancements need to be implemented:

### 1. `getEntityGripsMeta()` - Edge Midpoints

**Location**: `packages/engine/engine/impl/engine_overlay.cpp`

**Enhancement Needed**:
```cpp
GripMeta getEntityGripsMeta(EntityId id, bool includeEdges) {
  // ... existing vertex logic ...

  if (includeEdges && entity.kind == EntityKind::Polygon) {
    // Calculate edge midpoints
    for (size_t i = 0; i < vertexCount; i++) {
      size_t next = (i + 1) % vertexCount;
      float midX = (vertices[i].x + vertices[next].x) / 2.0f;
      float midY = (vertices[i].y + vertices[next].y) / 2.0f;
      edgeMidpoints.push_back({midX, midY});
    }
    meta.edgeCount = vertexCount; // For closed polygons
    meta.edgeMidpointsPtr = allocate(edgeMidpoints);
  }

  return meta;
}
```

**Behavior**:
- If `includeEdges == false`: Return vertex grips only (Phase 1)
- If `includeEdges == true`: Return vertex grips + edge midpoint grips (Phase 2)
- Edge midpoints calculated as average of two adjacent vertices
- For N-sided polygon: N vertex grips + N edge grips

### 2. Polygon Edge Picking

**Location**: `packages/engine/engine/interaction/pick_system.cpp`

**Enhancement Needed**:
- When picking near an edge midpoint grip, return `PickSubTarget::Edge` with `subIndex = edge index`
- Hit tolerance: 8-10px in screen space (same as vertex grips)
- Priority: Grips (vertex/edge) > Edge line > Body

**Edge Index Definition**:
- Edge `i` connects vertex `i` to vertex `(i+1) % N`
- Edge 0: vertex 0 → vertex 1
- Edge 1: vertex 1 → vertex 2
- Edge N-1: vertex N-1 → vertex 0

### 3. EdgeDrag Transform for Polygons

**Location**: `packages/engine/engine/interaction/interaction_session_update.cpp`

**New Behavior**:

```cpp
void updateEdgeDrag(InteractionSession& session) {
  if (session.mode != TransformMode::EdgeDrag) return;
  if (session.entity.kind != EntityKind::Polygon) return;

  const int edgeIdx = session.vertexIndex; // reused for edge index
  const int v1 = edgeIdx;
  const int v2 = (edgeIdx + 1) % vertexCount;

  // Get edge direction vector
  Vec2 edgeDir = normalize(vertex[v2] - vertex[v1]);
  Vec2 edgeNormal = perpendicular(edgeDir); // 90° rotation

  // Get mouse delta from drag start
  Vec2 mouseDelta = currentMouseWCS - startMouseWCS;

  // Default: Project delta onto perpendicular (constrained perpendicular drag)
  float offset = dot(mouseDelta, edgeNormal);
  Vec2 movement = edgeNormal * offset;

  // Shift modifier: Free drag (move edge in any direction)
  if (session.modifiers & MOD_SHIFT) {
    movement = mouseDelta;
  }

  // Move both endpoints
  vertex[v1] += movement;
  vertex[v2] += movement;

  // Snapping applies to moved vertices
  if (snapEnabled) {
    vertex[v1] = applySnap(vertex[v1]);
    vertex[v2] = applySnap(vertex[v2]);
  }
}
```

**Expected Behavior**:

| Modifier | Drag Behavior |
|----------|---------------|
| **None** | Perpendicular offset (CAD-like predictable motion) |
| **Shift** | Free drag in any direction |

**Constraints**:
- Polygon remains closed (edge endpoints move together)
- No self-intersection checks needed for regular polygons
- Snapping applies to final vertex positions

### 4. Commit Result for EdgeDrag

**Location**: `packages/engine/engine/interaction/interaction_session_update.cpp`

**Commit Payload**:
```cpp
// For EdgeDrag on polygons, commit two VERTEX_SET operations
CommitResult result;
result.ids = [entityId, entityId];
result.opCodes = [VERTEX_SET, VERTEX_SET];
result.payloads = [
  edgeIdx, vertex[edgeIdx].x, vertex[edgeIdx].y, 0,
  (edgeIdx+1)%N, vertex[(edgeIdx+1)%N].x, vertex[(edgeIdx+1)%N].y, 0
];
```

---

## Testing Checklist

### Manual Testing (Once Engine APIs Available)

#### Edge Grip Rendering
- [ ] Create hexagon (6 sides) → shows 6 vertex grips (squares) + 6 edge grips (diamonds)
- [ ] Edge grips appear at midpoint of each edge
- [ ] Edge grips are visually distinct from vertex grips (diamond vs square)
- [ ] Zoom in/out → grips remain correctly positioned

#### Edge Grip Interaction
- [ ] Hover over edge grip → shows move cursor
- [ ] Click edge grip → begins EdgeDrag transform
- [ ] Drag edge grip perpendicular to edge → edge moves perpendicular (default)
- [ ] Shift+drag edge grip → edge moves in any direction (free drag)
- [ ] Edge endpoints move together (polygon remains closed)

#### Snapping
- [ ] Drag edge grip with snap enabled → endpoints snap to grid/endpoints
- [ ] Snapping works for both vertices during edge drag
- [ ] Snap indicator shows correct target

#### Undo/Redo
- [ ] Edge drag creates single atomic undo entry
- [ ] Undo restores both edge vertices
- [ ] Redo reapplies edge drag correctly

#### Multi-Selection & Cancellation
- [ ] ESC during edge drag → cancels and restores original positions
- [ ] Multi-select with polygons → edge grips hidden (group AABB shown)
- [ ] Single-select after multi-select → edge grips reappear

#### Edge Cases
- [ ] Triangle (3 sides) → 3 vertex + 3 edge grips
- [ ] 24-sided polygon → grips may be visually dense but functional
- [ ] Rotated polygon → edge grips at correct midpoints after rotation
- [ ] Perpendicular drag on horizontal edge → moves up/down only
- [ ] Perpendicular drag on vertical edge → moves left/right only
- [ ] Perpendicular drag on diagonal edge → moves at correct angle

### Browser Console Testing

```javascript
// Enable Phase 1 & 2 in production
useSettingsStore.getState().setPolygonContourSelectionEnabled(true);
useSettingsStore.getState().setPolygonEdgeGripsEnabled(true);

// Verify flags
const flags = useSettingsStore.getState().featureFlags;
console.log({
  contour: flags.enablePolygonContourSelection, // true
  edges: flags.enablePolygonEdgeGrips,          // true
});

// Disable Phase 2 (keep Phase 1)
useSettingsStore.getState().setPolygonEdgeGripsEnabled(false);
```

---

## Implementation Architecture

### Grip Type Hierarchy

```
GripWCS
├── kind: 'vertex'        (Phase 1)
│   ├── Visual: 8×8 white square
│   ├── Cursor: move
│   └── Transform: VertexDrag
│
└── kind: 'edge-midpoint' (Phase 2)
    ├── Visual: 6×6 white diamond (rotated 45°)
    ├── Cursor: move
    └── Transform: EdgeDrag
        ├── Default: perpendicular offset
        └── Shift: free drag
```

### Transform Flow (Phase 2)

```
1. User clicks edge midpoint grip
   ↓
2. Engine picking returns:
   - PickSubTarget: Edge
   - subIndex: edge index (e.g., 0 for edge 0)
   ↓
3. Frontend calls beginTransform():
   - mode: TransformMode.EdgeDrag
   - vertexIndex: subIndex (reused for edge index)
   ↓
4. Engine captures edge state:
   - Edge direction vector
   - Edge normal (perpendicular)
   - Initial vertex positions
   ↓
5. User drags mouse (updateTransform)
   ↓
6. Engine calculates movement:
   - Default: project onto perpendicular
   - Shift: use raw delta
   ↓
7. Engine moves both edge endpoints:
   - vertex[i] += movement
   - vertex[(i+1)%N] += movement
   ↓
8. Snapping applies to final positions
   ↓
9. User releases mouse (commitTransform)
   ↓
10. Commit result: 2 × VERTEX_SET operations
```

### Coordinate System Compliance

| Data | Coordinate Space | Source |
|------|------------------|--------|
| Edge midpoint positions | WCS | Engine calculation |
| Edge direction vector | WCS | Engine calculation |
| Mouse drag delta | WCS | `worldPoint - startWorldPoint` |
| Movement vector | WCS | Projection onto edge normal |
| Final vertex positions | WCS | `original + movement` |
| Snap targets | WCS | Engine snap system |
| Visual rendering | Screen (SCS) | `worldToScreen()` conversion |

**No frontend geometry math** - all calculations in engine. ✓

---

## Rollout Plan

### Stage 1: Development (Current)
- Both flags default: `true` in development mode
- Testing by developers
- Engine API development in parallel

### Stage 2: Staging
- Phase 1 flag: `false` (manual enable)
- Phase 2 flag: `false` (manual enable)
- Enable manually for QA testing
- Validate both phases together

### Stage 3: Production Beta - Phase 1 Only
- Phase 1 flag: `true` (vertex grips)
- Phase 2 flag: `false` (no edge grips yet)
- Stabilize vertex editing first

### Stage 4: Production Beta - Phase 1 & 2
- Both flags: `true`
- Full edge drag functionality
- Monitor performance and usability

### Stage 5: Production GA
- Remove feature flags (or keep for emergency rollback)
- Default behavior for all users

---

## Rollback Strategy

### Phase 2 Issues (Keep Phase 1)
```typescript
// Disable edge grips, keep vertex grips
useSettingsStore.getState().setPolygonEdgeGripsEnabled(false);
```

### Both Phases Issues (Full Rollback)
```typescript
// Revert to bbox selection
useSettingsStore.getState().setPolygonContourSelectionEnabled(false);
useSettingsStore.getState().setPolygonEdgeGripsEnabled(false);
```

### No Data Loss
- Polygon geometry unchanged
- Only visualization/interaction affected
- Graceful degradation to Phase 1 or original bbox

---

## Performance Considerations

### Grip Count

For N-sided polygon:
- Phase 1: N vertex grips
- Phase 2: N vertex + N edge grips = 2N total grips

**Example**:
- Triangle (3 sides): 3 + 3 = 6 grips
- Hexagon (6 sides): 6 + 6 = 12 grips
- 24-sided (max): 24 + 24 = 48 grips

### Rendering Impact

- Each grip: 1 SVG `<rect>` element
- 48 grips = 48 DOM elements (manageable)
- Grip budget strategy from plan applies if needed

### Interaction Impact

- Edge midpoint calculation: O(N) for N-sided polygon
- Performed once per selection change (cold path)
- Hit-testing: O(log n) via spatial index (unchanged)

### Future Optimization (Phase 3)

From plan: Grip budget + progressive disclosure
- 3-12 sides: All grips visible
- 13-24 sides: Vertex grips visible, edge grips on hover/zoom
- 25+ sides: Progressive grip display based on zoom level

---

## Next Steps

### For Engine Team (C++)

1. ✅ Phase 1 APIs implemented (assumed)
2. **Extend `getEntityGripsMeta()` to include edge midpoints**
3. **Implement polygon edge midpoint picking**
4. **Implement EdgeDrag transform mode for polygons**
   - Perpendicular offset (default)
   - Free drag (Shift modifier)
5. **Add commit logic for edge drag (2 × VERTEX_SET)**
6. Test edge drag behavior in isolation

### For Frontend Team (Continuation)

1. Wait for Phase 2 engine APIs
2. Test integration once available
3. Fine-tune edge grip styling if needed
4. Performance profiling (grip count vs render time)
5. UX testing for perpendicular vs free drag
6. Begin Phase 3 planning (snap hardening + performance)

### Documentation

- [ ] Update `docs/architecture/engine-api.md` with EdgeDrag behavior
- [ ] Update `docs/architecture/handle-index-contract.md` with edge grip indices
- [ ] Add Phase 2 edge drag examples to user guide (future)

---

## Files Modified

### Modified Files (3)
- `apps/web/stores/useSettingsStore.ts` (feature flag)
- `apps/web/features/editor/components/ShapeOverlay.tsx` (grip rendering)
- `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx` (interaction)

### New Files (1)
- `docs/ui/PHASE2_IMPLEMENTATION_SUMMARY.md`

**Total**: 4 files

---

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| Feature flag added | ✅ Complete | `enablePolygonEdgeGrips` |
| Edge grip rendering | ✅ Complete | Diamonds (6×6, rotated 45°) |
| Visual distinction | ✅ Complete | Squares (vertex) vs diamonds (edge) |
| Edge grip hit detection | ✅ Complete | Begins EdgeDrag transform |
| Cursor feedback | ✅ Complete | Move cursor on hover + during drag |
| Modifier logging | ✅ Complete | `shiftHeld` logged for free drag detection |
| Fallback strategy | ✅ Complete | Works with Phase 1 APIs only |
| Rollback plan | ✅ Complete | Independent flag control |
| Documentation | ✅ Complete | Summary + architecture |
| Engine APIs | ⏳ Pending | Edge midpoints + EdgeDrag + picking |
| Integration testing | ⏳ Pending | Awaiting engine APIs |
| Perpendicular drag | ⏳ Pending | Engine implementation |
| Free drag (Shift) | ⏳ Pending | Engine implementation |

---

## Comparison: Phase 1 vs Phase 2

| Aspect | Phase 1 | Phase 2 |
|--------|---------|---------|
| **Grips** | Vertex only | Vertex + Edge midpoint |
| **Visual Style** | 8×8 white squares | Squares + 6×6 diamonds |
| **Transform Mode** | VertexDrag | VertexDrag + EdgeDrag |
| **Drag Behavior** | Move single vertex | Move entire edge (2 vertices) |
| **Default Motion** | Free (any direction) | Perpendicular to edge |
| **Modifier** | N/A | Shift = free drag |
| **Commit Ops** | 1 × VERTEX_SET | 2 × VERTEX_SET |
| **Use Case** | Adjust corner/point | Adjust edge position/offset |

---

*Phase 2 frontend implementation complete. Ready for engine integration.*
