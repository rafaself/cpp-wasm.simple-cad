# Phase 1 Implementation Summary: Polygon Contour Selection

> **Date**: 2026-01-23
> **Status**: Frontend Changes Complete - Awaiting Engine APIs
> **Related Plan**: [CAD_SELECTION_TRANSITION_PLAN.md](./CAD_SELECTION_TRANSITION_PLAN.md)

---

## Overview

Phase 1 frontend implementation is complete. The system now supports polygon contour-based selection with vertex grips, controlled by a feature flag. The implementation includes proper fallbacks for when the C++ engine APIs are not yet available.

---

## Changes Implemented

### 1. Feature Flags Added

**File**: `apps/web/stores/useSettingsStore.ts`

```typescript
featureFlags: {
  enablePolygonContourSelection: boolean;  // Phase 1: Default false (dev: true)
  enablePolygonEdgeGrips: boolean;         // Phase 2: Not ready yet
}
```

- `enablePolygonContourSelection`: Controls polygon contour vs bbox selection
- Default: `false` in production, `true` in development
- Setters: `setPolygonContourSelectionEnabled()`, `setPolygonEdgeGripsEnabled()`

### 2. Protocol Types

**File**: `apps/web/engine/core/protocol.ts`

Added `GripMeta` type for grip position queries:

```typescript
export type GripMeta = {
  generation: number;
  vertexCount: number;
  edgeCount: number;        // 0 for Phase 1, >0 for Phase 2
  floatCount: number;
  verticesPtr: number;      // WCS vertex positions
  edgeMidpointsPtr: number; // WCS edge midpoint positions (Phase 2)
  valid: number;
};
```

### 3. Grip Decoder

**File**: `apps/web/engine/core/gripDecoder.ts` (NEW)

Utility to decode grip metadata from WASM memory:

```typescript
interface GripWCS {
  kind: 'vertex' | 'edge-midpoint';
  positionWCS: { x: number; y: number };
  index: number;
}

decodeGripMeta(heap: Uint8Array, meta: GripMeta): GripWCS[]
```

### 4. SelectionSystem Extensions

**File**: `apps/web/engine/core/runtime/SelectionSystem.ts`

Added methods:

```typescript
// Get polygon contour for selection outline
getPolygonContourMeta(entityId: EntityId): OverlayBufferMeta

// Get grip positions in WCS
getEntityGripsWCS(entityId: EntityId, includeEdges: boolean): GripWCS[]

// Fallback decoder for existing handle system
private decodeHandlesAsGrips(meta: OverlayBufferMeta): GripWCS[]
```

**Fallback Strategy**:
- If engine has `getPolygonContourMeta()` → use it
- Else → fall back to `getSelectionOutlineMeta()`
- If engine has `getEntityGripsMeta()` → use it
- Else → decode from existing `getSelectionHandleMeta()`

### 5. ShapeOverlay Rendering

**File**: `apps/web/features/editor/components/ShapeOverlay.tsx`

**Changes**:

1. Added polygon contour detection:
```typescript
const enablePolygonContour =
  entityKind === EntityKind.Polygon &&
  useSettingsStore.getState().featureFlags.enablePolygonContourSelection;

const isVertexBased = isVertexOnly || enablePolygonContour;
```

2. Updated rendering path to use contour + grips:
```typescript
// Get contour outline
const outlineMeta = enablePolygonContour
  ? runtime.selection.getPolygonContourMeta(entityId)
  : runtime.getSelectionOutlineMeta();

// Get grips
const gripsWCS = enablePolygonContour
  ? runtime.selection.getEntityGripsWCS(entityId, false)
  : null;
```

3. Render grips with proper styling:
```typescript
gripsWCS.forEach((grip, i) => {
  const screenPos = worldToScreen(grip.positionWCS, viewTransform);
  const gripSize = grip.kind === 'vertex' ? 8 : 6;
  // Render as 8x8 white squares with primary stroke
});
```

### 6. SelectionHandler Interaction

**File**: `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx`

**Changes**:

1. Import EntityKind enum
2. Added polygon vertex grip hit detection in `onPointerDown()`:

```typescript
if (
  enablePolygonContour &&
  res.kind === PickEntityKind.Polygon &&
  res.subTarget === PickSubTarget.Vertex
) {
  // Begin vertex drag transform
  runtime.beginTransform(
    activeIds,
    TransformMode.VertexDrag,
    res.id,
    res.subIndex, // Vertex index from pick
    ...
  );
}
```

3. Cursor updates in `onPointerMove()`:
   - Vertex grips show move cursor
   - Works for lines, arrows, polylines, and polygons

### 7. EngineRuntime Facade

**File**: `apps/web/engine/core/EngineRuntime.ts`

Exposed `SelectionSystem` as public facade:

```typescript
public readonly selection: SelectionSystem;
```

This allows clean access: `runtime.selection.getPolygonContourMeta(id)`

---

## Current Behavior

### With `enablePolygonContourSelection: false` (Default - Production)
- Polygons show 4-corner bounding box (existing behavior)
- Resize via corner handles
- Rotate via rotate handle
- **No change from current system**

### With `enablePolygonContourSelection: true` (Development)
- Polygons show true N-sided contour outline
- Vertex grips appear at each polygon vertex
- Hovering vertex grip shows move cursor
- Clicking vertex grip begins VertexDrag transform
- **Falls back gracefully if engine APIs not available**

---

## Pending Engine (C++) Changes

For full functionality, the following C++ APIs need to be implemented:

### 1. `getPolygonContourMeta(EntityId)`

**Location**: `packages/engine/engine/impl/engine_overlay.cpp`

**Signature**:
```cpp
OverlayBufferMeta getPolygonContourMeta(EntityId id);
```

**Behavior**:
- For `EntityKind::Polygon`: Return N vertices of the polygon in WCS
- For other entities: Return empty or fall back to getSelectionOutlineMeta
- Vertices in CCW order, closed polygon (first != last)

### 2. `getEntityGripsMeta(EntityId, bool includeEdges)`

**Location**: `packages/engine/engine/impl/engine_overlay.cpp`

**Signature**:
```cpp
GripMeta getEntityGripsMeta(EntityId id, bool includeEdges);
```

**Behavior**:
- Returns vertex positions in WCS (always)
- If `includeEdges == true` and Phase 2: also return edge midpoints
- Phase 1: `edgeCount = 0`, `edgeMidpointsPtr = 0`

### 3. Polygon Vertex Picking

**Location**: `packages/engine/engine/interaction/pick_system.cpp`

**Current Status**: Likely already works

**Verify**:
- Picking a polygon vertex returns `PickSubTarget::Vertex` with correct `subIndex`
- Hit tolerance applies correctly (8-10px in screen space)
- Grips have higher priority than edges/body

### 4. VertexDrag Transform for Polygons

**Location**: `packages/engine/engine/interaction/interaction_session_update.cpp`

**Current Status**: Likely already works for polylines

**Verify**:
- `TransformMode::VertexDrag` with polygon moves only the specified vertex
- Adjacent edges update correctly
- Polygon remains valid (no self-intersection)
- Snapping applies during vertex drag

### 5. WASM Bindings

**Location**: `packages/engine/engine/bindings.cpp`

**Add**:
```cpp
.function("getPolygonContourMeta", &CadEngine::getPolygonContourMeta)
.function("getEntityGripsMeta", &CadEngine::getEntityGripsMeta)
```

---

## Testing Checklist

### Manual Testing (Once Engine APIs Available)

- [ ] Create triangle (3 sides) → shows 3-sided contour with 3 vertex grips
- [ ] Create hexagon (6 sides) → shows 6-sided contour with 6 vertex grips
- [ ] Hover over vertex grip → shows move cursor
- [ ] Drag vertex grip → moves only that vertex
- [ ] Drag vertex grip with snap enabled → snaps to endpoints/midpoints/grid
- [ ] ESC during vertex drag → cancels and restores original position
- [ ] Undo after vertex drag → restores original position
- [ ] Zoom in/out → grips remain hittable and correctly positioned
- [ ] Rotate polygon → contour follows rotation, grips at correct positions
- [ ] Multi-select 2 polygons → shows group AABB (existing behavior, unchanged)
- [ ] Toggle feature flag off → reverts to bbox selection

### Browser Console Testing

```javascript
// Enable Phase 1 in production
useSettingsStore.getState().setPolygonContourSelectionEnabled(true);

// Verify flag
useSettingsStore.getState().featureFlags.enablePolygonContourSelection; // true

// Disable
useSettingsStore.getState().setPolygonContourSelectionEnabled(false);
```

---

## Rollout Plan

### Stage 1: Development (Current)
- Feature flag default: `true` in development mode
- Testing by developers
- Engine API development in parallel

### Stage 2: Staging
- Feature flag default: `false`
- Enable manually for QA testing
- Validate engine integration

### Stage 3: Production Beta
- Feature flag default: `false`
- Opt-in via settings panel (if desired)
- Monitor for issues

### Stage 4: Production GA
- Feature flag default: `true`
- Full rollout to all users
- Remove feature flag in future (Phase 3+)

---

## Rollback Strategy

If issues are discovered:

1. **Immediate**: Set flag to `false` in useSettingsStore initial state
2. **Client-side**: Users can disable via browser console
3. **No data loss**: Polygon geometry unchanged, only visualization affected
4. **Graceful degradation**: Falls back to bbox selection seamlessly

---

## Next Steps

### For Engine Team (C++)

1. Implement `getPolygonContourMeta()` API
2. Implement `getEntityGripsMeta()` API
3. Verify polygon vertex picking returns correct subTarget/subIndex
4. Verify VertexDrag mode works for polygons
5. Add WASM bindings
6. Test in isolation with C++ unit tests

### For Frontend Team (Continuation)

1. Wait for engine APIs
2. Test integration once available
3. Fine-tune grip rendering (size, style, zoom-gating)
4. Add CAD_DEBUG visualization for snap candidates
5. Performance profiling
6. Begin Phase 2 planning (edge midpoint grips)

### Documentation

- [ ] Update `docs/architecture/engine-api.md` with new APIs
- [ ] Update `docs/architecture/handle-index-contract.md` with polygon grip indices
- [ ] Add Phase 1 to `AGENTS.md` architecture rules

---

## Files Modified

### New Files (3)
- `apps/web/engine/core/gripDecoder.ts`
- `docs/ui/CAD_SELECTION_TRANSITION_PLAN.md`
- `docs/ui/PHASE1_IMPLEMENTATION_SUMMARY.md`

### Modified Files (6)
- `apps/web/stores/useSettingsStore.ts`
- `apps/web/engine/core/protocol.ts`
- `apps/web/engine/core/runtime/SelectionSystem.ts`
- `apps/web/engine/core/EngineRuntime.ts`
- `apps/web/features/editor/components/ShapeOverlay.tsx`
- `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx`

**Total**: 9 files

---

## Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| Feature flags added | ✅ Complete | `enablePolygonContourSelection`, `enablePolygonEdgeGrips` |
| Protocol types defined | ✅ Complete | `GripMeta` added |
| Grip decoder implemented | ✅ Complete | `decodeGripMeta()` with tests needed |
| SelectionSystem methods | ✅ Complete | With proper fallbacks |
| ShapeOverlay rendering | ✅ Complete | Conditional on feature flag |
| SelectionHandler interaction | ✅ Complete | Vertex grip hit-test + drag |
| Engine facade updated | ✅ Complete | `runtime.selection` exposed |
| Fallback strategy | ✅ Complete | Graceful degradation if APIs missing |
| Rollback plan | ✅ Complete | Feature flag + browser console |
| Documentation | ✅ Complete | Plan + summary |
| Engine APIs | ⏳ Pending | C++ implementation needed |
| Integration testing | ⏳ Pending | Awaiting engine APIs |
| Performance profiling | ⏳ Pending | Phase 3 task |

---

*Phase 1 frontend implementation complete. Ready for engine integration.*
