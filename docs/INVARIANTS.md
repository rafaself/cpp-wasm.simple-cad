# Document Invariants — EletroCAD Engine-First Architecture

This document defines the **invariants** that must always hold in the EletroCAD WebApp.
These are properties that, if violated, indicate a bug or architectural regression.

---

## 1. Single Source of Truth

### 1.1 Entity State

**Invariant:** All entity data (shapes, text, layers) exists **only** in the C++ engine.

```
✅ VALID: frontend reads entity position via engine.getEntityAabb(id)
❌ INVALID: frontend stores entity position in a Zustand store
```

**Verification:**

- Grep for `shapes:` or `entities:` in store files → should NOT find authoritative state

### 1.2 Selection State

**Invariant:** Selection is managed **only** by the engine.

```
✅ VALID: runtime.getSelectionIds() returns current selection
❌ INVALID: useUIStore.selectedIds = [1, 2, 3]
```

**Verification:**

- `getSelectionIds()` should be the only way to read selection
- All selection changes go through `setSelection()` or `selectByPick()`

### 1.3 Draw Order

**Invariant:** Z-order is managed **only** by the engine.

```
✅ VALID: runtime.getDrawOrderSnapshot() returns current order
❌ INVALID: store.drawOrder = reorderedShapes
```

### 1.4 History (Undo/Redo)

**Invariant:** History is managed **only** by the engine.

```
✅ VALID: engine.undo() / engine.redo()
❌ INVALID: store.historyStack.push(currentState)
```

---

## 2. Command Flow

### 2.1 Mutations via Commands

**Invariant:** All document mutations go through the command buffer.

```
✅ VALID: runtime.apply([{ op: CommandOp.UpsertRect, ... }])
❌ INVALID: engine.rects.push(newRect)
```

**Verification:**

- All entity creation/modification should call `runtime.apply()`
- Direct mutation of engine internals is forbidden

### 2.2 Command Determinism

**Invariant:** Applying the same command sequence to a clean engine produces identical state.

```
engine1.apply(commands) → snapshot1
engine2.apply(commands) → snapshot2
ASSERT: snapshot1 === snapshot2 (byte-identical)
```

**Verification:**

- See `cpp/tests/determinism_test.cpp`

---

## 3. Persistence

### 3.1 Snapshot Authority

**Invariant:** The persisted document is the engine's binary snapshot.

```
✅ VALID: File contains ESNP section from engine.saveSnapshotBytes()
❌ INVALID: File contains JSON serialization of JS store state
```

### 3.2 Snapshot Round-Trip

**Invariant:** Loading a saved snapshot produces identical engine state.

```
save():  bytes = engine.saveSnapshotBytes()
load():  engine.loadSnapshotBytes(bytes)
verify: engine.saveSnapshotBytes() === bytes
```

**Verification:**

- See `cpp/tests/snapshot_test.cpp`
- See `cpp/tests/determinism_test.cpp::SnapshotRoundTripIsExact`

---

## 4. ID Allocation

### 4.1 Engine-Allocated IDs

**Invariant:** All entity IDs are allocated by the engine.

```
✅ VALID: const id = runtime.allocateEntityId()
❌ INVALID: const id = Math.random() * 1000000
```

### 4.2 ID Uniqueness

**Invariant:** No two entities share the same ID within a document.

### 4.3 ID Stability

**Invariant:** Entity IDs are stable across save/load cycles.

---

## 5. Text Subsystem

### 5.1 Content Authority

**Invariant:** Text content exists **only** in the engine's TextStore.

```
✅ VALID: bridge.getTextContent(textId)
❌ INVALID: textToolState.content (REMOVED in Audit Phase 1)
```

### 5.2 Layout Authority

**Invariant:** Text layout is computed **only** by the engine.

```
✅ VALID: bridge.getTextBounds(textId)
❌ INVALID: calculateTextWidth(content, fontSize)
```

### 5.3 Caret/Selection Sync

**Invariant:** Caret position shown in UI matches engine state.

- Frontend may cache caret for latency optimization
- Engine is always updated via `setCaretByteIndex()`
- `TextStyleSnapshot` contains authoritative caret position

---

## 6. View State (Permitted Frontend State)

The following state is **permitted** in the frontend because it is NOT document state:

| State                      | Location           | Reason                       |
| :------------------------- | :----------------- | :--------------------------- |
| `viewTransform` (pan/zoom) | `useUIStore`       | Viewport, not document       |
| `activeTool`               | `useUIStore`       | UI mode, not document        |
| `activeLayerId`            | `useUIStore`       | UI selection, not layer data |
| `canvasSize`               | `useUIStore`       | Window size, not document    |
| `featureFlags`             | `useSettingsStore` | User preferences             |

---

## 7. Rendering

### 7.1 Render Data Source

**Invariant:** All render data comes from engine buffers.

```
✅ VALID: gl.bindBuffer(engine.getPositionBufferMeta().ptr)
❌ INVALID: gl.bindBuffer(frontendGeneratedVertices)
```

### 7.2 Dirty Tracking

**Invariant:** Renderer only updates when engine signals dirty state.

---

## 8. Interaction

### 8.1 Picking

**Invariant:** Hit-testing is performed by the engine.

```
✅ VALID: runtime.pickEx(x, y, tolerance, mask)
❌ INVALID: isPointInShape(point, shape) (only in tests/import)
```

### 8.2 Snapping

**Invariant:** Snapping is computed by the engine.

```
✅ VALID: runtime.getSnappedPoint(x, y)
❌ INVALID: snapToGrid(x, y, gridSize)
```

### 8.3 Transform Sessions

**Invariant:** Interactive transforms are managed by the engine.

```
✅ VALID: runtime.beginTransform() → updateTransform() → commitTransform()
❌ INVALID: setShapePosition(id, newX, newY) on each pointermove
```

---

## Verification Checklist

- [ ] Run `cpp/tests/determinism_test.cpp`
- [ ] Grep for forbidden patterns in frontend:
  - `shapes:` in stores → should NOT exist
  - `entities:` in stores → should NOT exist
  - `selectedIds:` in stores → should NOT exist (use engine)
- [ ] Verify all `runtime.apply()` calls use proper commands
- [ ] Verify snapshot round-trip in save/load flow

---

## Change Log

| Date       | Author | Change                                   |
| :--------- | :----- | :--------------------------------------- |
| 2025-12-27 | Audit  | Initial document from Engine-First audit |
