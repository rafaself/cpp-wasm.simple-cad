# Engine API Reference

> C++ Engine API reference for high-performance development.

---

## 1. API Design Principles

| Principle                   | Implementation                                     |
| --------------------------- | -------------------------------------------------- |
| **Zero-Copy when possible** | Buffers returned as WASM pointers                  |
| **Batch over Chatty**       | One `apply()` with N commands > N individual calls |
| **Query on Demand**         | Don't cache results, always query fresh            |
| **POD Structs**             | Shared types are plain-old-data                    |

---

## 2. Entity Types

| Type     | CommandOp        | Extensibility                   |
| -------- | ---------------- | ------------------------------- |
| Rect     | `UpsertRect`     | Base for rectangles, squares    |
| Line     | `UpsertLine`     | Simple segment                  |
| Circle   | `UpsertCircle`   | Ellipse with rotation and scale |
| Polygon  | `UpsertPolygon`  | Regular N-sided polygon         |
| Polyline | `UpsertPolyline` | Path with multiple points       |
| Arrow    | `UpsertArrow`    | Line with termination           |
| Text     | `UpsertText`     | Rich text with runs             |

**Note:** The system is extensible for new types via:

1. New CommandOp
2. New payload struct
3. Handler in command callback

---

## 3. EngineRuntime — Core API

### Lifecycle

```typescript
// Singleton initialization
const runtime = await EngineRuntime.create();

// Clear document (doesn't destroy runtime)
runtime.clear();
```

### Command Dispatch

```typescript
// Batch of commands — ALWAYS use batch
runtime.apply(commands: readonly EngineCommand[]): void
```

**Performance:** Commands are encoded in binary buffer, copied once to WASM heap, processed in sequence without marshalling.

---

## 4. Picking System (O(log n))

### Pick Point

```typescript
const result = runtime.pickEx(worldX, worldY, tolerancePx, 0xff): PickResult;
```

### Pick Side Handle (Selection-aware)

```typescript
const sideHit = runtime.pickSideHandle(worldX, worldY, tolerancePx): PickResult;
```

Notes:
- Returns `id = 0` on miss.
- Uses `subTarget = ResizeHandle` with `subIndex` in the frontend side-handle range:
  - `4 = N`, `5 = E`, `6 = S`, `7 = W`.
- Only active when exactly one entity is selected and the entity supports side handles.

### PickResult

```typescript
interface PickResult {
  id: EntityId; // 0 = miss
  kind: PickEntityKind; // Rect, Circle, Line, Text, etc.
  subTarget: PickSubTarget; // Body, Edge, Vertex, ResizeHandle, TextBody
  subIndex: number; // Sub-element index (e.g., which vertex)
  distance: number; // Distance to hit point
  hitX?: number; // Optional hit coordinate
  hitY?: number;
}
```

### SubTargets

| SubTarget      | Usage                     |
| -------------- | ------------------------- |
| `Body`         | Main area of entity       |
| `Edge`         | Border (polylines, rects) |
| `Vertex`       | Draggable vertex          |
| `ResizeHandle` | Resize handle             |
| `RotateHandle` | Rotation handle           |
| `TextBody`     | Text area                 |
| `TextCaret`    | Insertion position        |

**Important:** Picking uses internal spatial index. **NEVER** iterate entities in JS for hit testing.

---

## 5. Selection System

```typescript
// Select by pick result
runtime.selectByPick(pick, modifiers): void

// Modes: Replace, Add, Remove, Toggle
runtime.setSelection(ids, mode): void

// Area selection (marquee)
runtime.marqueeSelect(minX, minY, maxX, maxY, mode, marqueeMode): void
// MarqueeMode: Window (fully inside) or Crossing (any intersection)

// Clear selection
runtime.clearSelection(): void

// Query current selection
runtime.getSelectionIds(): Uint32Array

// Polygon contour overlay (Phase 1-3)
runtime.selection.getPolygonContourMeta(entityId): OverlayBufferMeta

// Polygon grip positions (Phase 1-3)
runtime.selection.getEntityGripsWCS(entityId, includeEdges): GripWCS[]
```

### GripMeta Structure (Phase 1-3)

For polygon grip systems, the engine provides grip positions via `GripMeta`:

```typescript
interface GripMeta {
  generation: number;        // Document generation for cache invalidation
  vertexCount: number;       // Number of vertex grips
  edgeCount: number;         // Number of edge midpoint grips (0 if not requested)
  floatCount: number;        // Total floats (vertexCount*2 + edgeCount*2)
  verticesPtr: number;       // WASM pointer to vertex positions [x0,y0, x1,y1, ...]
  edgeMidpointsPtr: number;  // WASM pointer to edge midpoint positions (if edgeCount > 0)
  valid: number;             // 1 = valid, 0 = invalid/unsupported
}

interface GripWCS {
  kind: 'vertex' | 'edge-midpoint';
  positionWCS: { x: number; y: number };
  index: number;  // Vertex or edge index
}
```

**Important**: All grip positions are in **WCS (World Coordinate System)**. Frontend must convert to screen space for rendering.

---

## 6. GeomZ (Elevation) API

```typescript
// Query geometric elevation for a single entity
const res = runtime.tryGetEntityGeomZ(entityId);
if (!res.ok) throw new Error('Invalid entity ID');

// Set geometric elevation (cold path, undoable)
runtime.setEntityGeomZ(entityId, z);
```

**Notes:**
- `setEntityGeomZ` is cold-path and must not be called in pointermove loops.
- Integration transactions should wrap Atlas + domain operations with history entry
  boundaries (see IntegrationRuntime).

---

## 7. Style System (Layer Defaults + Overrides)

### Queries

```typescript
runtime.style.getLayerStyle(layerId): LayerStyleSnapshot
runtime.style.getSelectionStyleSummary(): SelectionStyleSummary
```

### Commands

```typescript
runtime.apply([{ op: CommandOp.SetLayerStyle, id: layerId, style: { target, colorRGBA } }])
runtime.apply([{ op: CommandOp.SetLayerStyleEnabled, id: layerId, style: { target, enabled } }])
runtime.apply([{ op: CommandOp.SetEntityStyleOverride, style: { target, colorRGBA, ids } }])
runtime.apply([{ op: CommandOp.ClearEntityStyleOverride, clear: { target, ids } }])
runtime.apply([{ op: CommandOp.SetEntityStyleEnabled, enabled: { target, enabled, ids } }])
```

### StyleTarget

- `Stroke`, `Fill`, `TextColor`, `TextBackground`

---

## 8. Interactive Transform (Zero-Copy Pattern)

### Protocol

```typescript
// 1. Begin — capture initial state
runtime.beginTransform(
  ids: Uint32Array,       // IDs to transform
  mode: TransformMode,    // Move, Resize, VertexDrag, EdgeDrag
  specificId: number,     // Specific ID (for vertex drag)
  vertexIndex: number,    // Vertex index (-1 if not applicable)
  screenX: number,
  screenY: number,
  viewX: number,
  viewY: number,
  viewScale: number,
  viewWidth: number,
  viewHeight: number,
  modifiers: number
): void

// 2. Update — modifies entities IN-PLACE in Engine
// Does NOT update React state!
runtime.updateTransform(
  screenX,
  screenY,
  viewX,
  viewY,
  viewScale,
  viewWidth,
  viewHeight,
  modifiers
): void

// 3. Commit — finalize, create undo entry
runtime.commitTransform(): CommitResult | null

// Or Cancel — revert to initial state
runtime.cancelTransform(): void
```

### TransformModes

| Mode         | Usage                  | Polygon Support (Phase 1-3) |
| ------------ | ---------------------- | --------------------------- |
| `Move`       | Move selected entities | ✓ (whole polygon) |
| `Resize`     | Resize via handle      | ✓ (bbox-based) |
| `VertexDrag` | Drag specific vertex   | ✓ (single vertex, adjacent edges update) |
| `EdgeDrag`   | Drag edge              | ✓ (both endpoints move, perpendicular by default) |

**Polygon VertexDrag Behavior**:
- Moves only the specified vertex (via `vertexIndex`)
- Adjacent edges update automatically
- Snapping applies to vertex position

**Polygon EdgeDrag Behavior** (Phase 2):
- Moves both endpoints of the edge (vertices `[i]` and `[(i+1)%N]`)
- Default motion: perpendicular to edge direction (CAD-like)
- Shift modifier: free drag (moves both vertices by raw delta)

### CommitResult

```typescript
interface CommitResult {
  ids: Uint32Array; // Modified IDs
  opCodes: Uint8Array; // Operation type per entity
  payloads: Float32Array; // Final data (stride 4)
}
```

---

## 9. Draft System (Ephemeral Entities)

> Shapes under construction during drag. Rendered by the same WebGL pipeline.

### Protocol

```typescript
// 1. Begin — start draft of a specific type
runtime.apply([
  { op: CommandOp.BeginDraft, draft: { kind: EntityKind.Rect, x, y, /* style */ } }
]);

// 2. Update — update draft geometry (each pointermove)
runtime.apply([{ op: CommandOp.UpdateDraft, pos: { x, y, modifiers } }]);

// 3. Commit — convert draft to permanent entity
runtime.apply([{ op: CommandOp.CommitDraft }]);

// Or Cancel — discard draft
runtime.apply([{ op: CommandOp.CancelDraft }]);
```

### Supported EntityTypes

| Type      | Draft Behavior          |
| --------- | ----------------------- |
| `Rect`    | Start → opposite corner |
| `Circle`  | Center → radius         |
| `Line`    | Start → end point       |
| `Polygon` | Center → circumradius   |
| `Arrow`   | Start → end point       |

**Note:** Draft entities are included in render buffer but NOT in document until commit.

---

## 10. History (Undo/Redo)

```typescript
runtime.undo(): void
runtime.redo(): void
runtime.canUndo(): boolean
runtime.canRedo(): boolean
runtime.getHistoryMeta(): HistoryMeta
runtime.beginHistoryEntry(): boolean
runtime.commitHistoryEntry(): void
runtime.discardHistoryEntry(): void
runtime.rollbackHistoryEntry(): boolean

interface HistoryMeta {
  depth: number;      // Total entries
  cursor: number;     // Current position
  generation: number; // Version (for invalidation)
}
```

**Note:** History is managed entirely by Engine. Frontend only calls undo/redo.

---

## 11. Entity Queries

```typescript
// Bounding box
runtime.getEntityAabb(id): EntityAabb
// { minX, minY, maxX, maxY, valid }

// Stats
runtime.getStats(): EngineStats
// { rectCount, lineCount, triangleVertexCount, ... }
```

---

## 12. Snapping

```typescript
// Configure snap options
runtime.setSnapOptions(
  enabled: boolean,
  gridEnabled: boolean,
  gridSize: number,
  tolerancePx: number,
  endpointEnabled: boolean,
  midpointEnabled: boolean,
  centerEnabled: boolean,
  nearestEnabled: boolean
): void

// Query snapped point
runtime.getSnappedPoint(x, y): Float32Array
```

---

## 13. Serialization

```typescript
// Export document
runtime.saveSnapshotBytes(): Uint8Array

// Import document
runtime.loadSnapshotBytes(bytes: Uint8Array): void
```

**Format:** Proprietary binary (EWC1). Do not parse in JS.

---

## 14. Render Buffers

```typescript
// Tessellated triangles
runtime.getPositionBufferMeta(): BufferMeta

// Lines
runtime.getLineBufferMeta(): BufferMeta

// Text quads
runtime.getTextQuadBufferMeta(): BufferMeta

// Atlas texture
runtime.getAtlasTextureMeta(): TextureBufferMeta

interface BufferMeta {
  generation: number;   // For invalidation
  vertexCount: number;
  floatCount: number;
  ptr: number;          // WASM pointer
}
```

**Pattern:** Renderer reads buffers via direct pointer into WASM heap. Zero-copy.

---

## 15. Event Stream

```typescript
const { generation, events } = runtime.pollEvents(maxEvents);

interface EngineEvent {
  type: EventType;
  flags: number;
  a;
  b;
  c;
  d: number; // Payload fields
}
```

| EventType          | When              |
| ------------------ | ----------------- |
| `DocChanged`       | Document modified |
| `EntityCreated`    | New entity        |
| `EntityChanged`    | Entity modified   |
| `EntityDeleted`    | Entity removed    |
| `SelectionChanged` | Selection changed |
| `HistoryChanged`   | Undo/redo         |
| `LayerChanged`     | Layer modified    |
| `OrderChanged`     | Z-order changed   |

---

## 16. Text API

See `docs/architecture/text-system.md` for complete documentation.

Main methods:

```typescript
runtime.getTextContentMeta(textId): TextContentMeta
runtime.getTextBounds(textId): TextBoundsResult
runtime.getTextCaretPosition(textId, charIndex): TextCaretPosition
runtime.getTextStyleSnapshot(textId): TextStyleSnapshot
runtime.getTextStyleSummary(textId): TextStyleSnapshot
runtime.hitTestText(textId, localX, localY): TextHitResult
```

---

## 17. Extensibility Points

### Adding New Entity Type

1. `types.h`: New struct `FooRec`
2. `commands.h`: New `CommandOp::UpsertFoo`
3. `engine.h`: Storage vector, CRUD methods
4. `entity_manager.cpp`: Implementation
5. `pick_system.cpp`: Hit testing
6. `snapshot.cpp`: Serialization
7. `bindings.cpp`: WASM exposure
8. `commandBuffer.ts`: Payload and encoding

### Adding New Transform Mode

1. `engine.h`: New `TransformMode::Foo`
2. `engine.cpp`: Logic in `updateTransform()`
3. Frontend: Map in `EngineInteractionLayer`

---

## 18. Performance Considerations

| Operation           | Complexity | Notes                           |
| ------------------- | ---------- | ------------------------------- |
| `pickEx()`          | O(log n)   | Spatial index                   |
| `apply()`           | O(k)       | k = number of commands          |
| `getSelectionIds()` | O(1)       | Cached view of internal buffer  |
| `updateTransform()` | O(k)       | k = entities in session         |
| `pollEvents()`      | O(1)       | Ring buffer                     |
