# Figma-Identical Shape Rotation Implementation Plan

## Executive Summary

This document specifies the implementation of Figma-identical rotation behavior for our canvas editor, covering both on-canvas rotation via corner handles and sidebar rotation input. The implementation leverages our existing engine-first architecture where the C++ engine owns transform truth and the UI layer handles rendering and input capture.

---

## 1. Behavior Spec

### A) Canvas Rotation Interaction

| Behavior | Specification |
|----------|---------------|
| **Trigger Zone** | Rotation activates when hovering **outside** the corner resize handles, within a **15px screen-space buffer zone** extending diagonally outward from each corner |
| **Cursor** | Rotation cursor changes based on corner quadrant (NE/NW/SE/SW rotation arrows) |
| **Drag Direction** | Clockwise drag = positive angle increase; counter-clockwise = negative |
| **Angle Convention** | 0° = original orientation; positive = clockwise (matching Figma's visual convention) |
| **Display Range** | Angles normalized to **-180° to 180°** range (Figma convention) |
| **Shift Modifier** | Snaps to **15° increments** (0°, 15°, 30°, 45°, 60°, 75°, 90°, etc.) |
| **Pivot Point** | Center of selection bounding box (not entity center for multi-select) |
| **Live Preview** | Entity visually rotates during drag; angle tooltip shown near cursor |
| **Commit** | On pointer up, rotation commits to history (undo-able) |
| **Cancel** | Escape key cancels rotation, reverts to original state |

### B) Multi-Selection Rotation

| Behavior | Specification |
|----------|---------------|
| **Pivot** | Center of the union AABB of all selected entities |
| **Transform** | Each entity rotates around the group pivot, updating both position and local rotation |
| **Individual Angles** | Each entity's local rotation updates as: `newRotation = originalRotation + deltaAngle` |
| **Position Update** | Each entity's position rotates around group pivot: `newPos = rotatePoint(originalPos, pivot, deltaAngle)` |

### C) Sidebar Rotation Input

| Behavior | Specification |
|----------|---------------|
| **Input Field** | Numeric field with `°` suffix |
| **Valid Input** | Any numeric value: `45`, `-30`, `360`, `-450`, `0.5` |
| **Normalization** | Input normalized to -180..180 on commit (e.g., `270` → `-90`, `-270` → `90`) |
| **Typing** | Direct numeric entry, commits on Enter or blur |
| **Arrow Keys** | Up/Down adjust by **1°**; Shift+Up/Down adjust by **15°** |
| **Scrubbing** | Not implemented in Phase 1 (see Phase 2) |
| **Mixed State** | When multiple entities with different rotations selected, show `—` placeholder |
| **Sync** | Field updates live during canvas rotation drag |

### D) Keyboard Modifiers Summary

| Modifier | Context | Effect |
|----------|---------|--------|
| **Shift** | Canvas drag | Snap to 15° increments |
| **Shift** | Sidebar arrow keys | Step by 15° instead of 1° |
| **Escape** | Canvas drag | Cancel rotation |
| **Escape** | Sidebar input | Revert to original value |
| **Alt/Option** | Canvas hover | (Phase 2: Show moveable pivot) |

---

## 2. Data Model

### 2.1 Per-Entity Rotation Storage

Rotation is stored per-entity in the existing `EntityTransform` structure:

```typescript
// frontend/engine/core/protocol.ts (existing)
export type EntityTransform = {
  posX: number;        // Center X of AABB
  posY: number;        // Center Y of AABB
  width: number;       // Local width (unrotated)
  height: number;      // Local height (unrotated)
  rotationDeg: number; // Rotation in degrees, normalized to -180..180
  hasRotation: number; // 1 if entity supports rotation, 0 otherwise
  valid: number;       // 1 if entity exists
};
```

### 2.2 Entities Supporting Rotation

| Entity Type | Supports Rotation | Storage Location |
|-------------|-------------------|------------------|
| Circle | Yes | `CircleRec.rotation` |
| Polygon | Yes | `PolygonRec.rotation` |
| Text | Yes | `TextRec.rotation` |
| Rect | No (Phase 2) | N/A - axis-aligned |
| Line | No | Uses endpoint positions |
| Arrow | No | Uses endpoint positions |
| Polyline | No | Uses vertex positions |

### 2.3 Angle Normalization Rules

```
normalizeAngle(deg: number): number {
  // Wrap to -180..180 range (Figma convention)
  let normalized = deg % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  return normalized;
}
```

**Decision**: We use -180..180 rather than 0..360 because:
1. Figma uses this convention
2. It provides intuitive "signed" rotation (clockwise vs counter-clockwise from origin)
3. Smaller absolute values for common rotations (45° vs 315°)

### 2.4 Transform Session State

During rotation drag, the engine maintains session state:

```cpp
// cpp/engine/interaction/interaction_session.h (extend existing)
struct SessionState {
  // ... existing fields ...

  // Rotation-specific state (add these)
  float rotationPivotX;      // World-space pivot X
  float rotationPivotY;      // World-space pivot Y
  float startAngleDeg;       // Angle from pivot to initial pointer
  float accumulatedDeltaDeg; // Total rotation delta during drag
};

struct TransformSnapshot {
  // ... existing fields ...
  float originalRotationDeg; // Entity's rotation at session start
  float originalPosX;        // Entity's center X at session start
  float originalPosY;        // Entity's center Y at session start
};
```

---

## 3. Math / Geometry

### 3.1 Angle from Pointer Drag

```
// Calculate angle from pivot to pointer position
angleFromPivot(pivotX, pivotY, pointerX, pointerY): number {
  const dx = pointerX - pivotX;
  const dy = pointerY - pivotY;
  return atan2(dy, dx) * (180 / PI);  // Returns -180..180
}

// Calculate delta angle during drag
deltaAngle = currentAngle - startAngle;

// Handle wrap-around (when crossing -180/180 boundary)
if (deltaAngle > 180) deltaAngle -= 360;
if (deltaAngle < -180) deltaAngle += 360;
```

### 3.2 Coordinate Transformation (Screen to World)

Rotation calculations must use **world-space** coordinates:

```
screenToWorld(screenX, screenY, viewTransform): Point {
  return {
    x: (screenX - viewTransform.x) / viewTransform.scale,
    y: (screenY - viewTransform.y) / viewTransform.scale
  };
}
```

**Important**: The angle calculation is zoom-invariant because we use world coordinates. Zoom affects the visual sensitivity (more zoom = finer control) but the math remains consistent.

### 3.3 Snap to 15° Increments

```
snapAngle(angleDeg: number, snapIncrement: number = 15): number {
  return Math.round(angleDeg / snapIncrement) * snapIncrement;
}

// During drag with Shift held:
if (shiftKey) {
  deltaAngle = snapAngle(rawDeltaAngle, 15);
}
```

### 3.4 Rotate Point Around Pivot (Multi-select)

```
rotatePointAroundPivot(px, py, pivotX, pivotY, angleDeg): Point {
  const angleRad = angleDeg * (PI / 180);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const dx = px - pivotX;
  const dy = py - pivotY;

  return {
    x: pivotX + dx * cos - dy * sin,
    y: pivotY + dx * sin + dy * cos
  };
}
```

### 3.5 Final Entity Transform Application

For each entity during rotation:

```
// Single entity: rotate around its own center
newRotation = normalizeAngle(originalRotation + deltaAngle);

// Multi-entity: rotate around group pivot
newRotation = normalizeAngle(originalRotation + deltaAngle);
newPosition = rotatePointAroundPivot(
  originalPosX, originalPosY,
  groupPivotX, groupPivotY,
  deltaAngle
);
```

---

## 4. Selection Bounds Algorithm

### 4.1 Per-Shape AABB Computation

All bounds are **Axis-Aligned Bounding Boxes (AABB)** computed from the shape's world-space geometry.

| Shape Type | AABB Algorithm |
|------------|----------------|
| **Rect** | Direct: `{minX: x, minY: y, maxX: x+w, maxY: y+h}` |
| **Circle** | `{minX: cx-rx, minY: cy-ry, maxX: cx+rx, maxY: cy+ry}` where `rx/ry` are radii |
| **Polygon** | AABB of rotated vertices: compute all corner positions with rotation, then min/max |
| **Line** | `{minX: min(x0,x1), minY: min(y0,y1), maxX: max(x0,x1), maxY: max(y0,y1)}` |
| **Arrow** | Same as Line using `ax,ay,bx,by` |
| **Polyline** | AABB of all vertices |
| **Text** | Uses pre-computed `minX,minY,maxX,maxY` from text layout system |

### 4.2 Rotated Shape AABB (for Circle/Polygon)

For shapes with rotation, the AABB must encompass the rotated geometry:

```cpp
// cpp/engine/interaction/pick_system.cpp (existing pattern)
AABB computeRotatedRectAABB(float cx, float cy, float hw, float hh, float rotRad) {
  float cosR = std::cos(rotRad);
  float sinR = std::sin(rotRad);

  // Compute rotated half-extents
  float extentX = std::abs(hw * cosR) + std::abs(hh * sinR);
  float extentY = std::abs(hw * sinR) + std::abs(hh * cosR);

  return {cx - extentX, cy - extentY, cx + extentX, cy + extentY};
}
```

### 4.3 Multi-Selection Bounds (Union AABB)

```cpp
AABB computeSelectionBounds(const std::vector<uint32_t>& selectedIds) {
  AABB result = {INFINITY, INFINITY, -INFINITY, -INFINITY};

  for (uint32_t id : selectedIds) {
    AABB entityAabb = getEntityAabb(id);
    if (!entityAabb.valid) continue;

    result.minX = std::min(result.minX, entityAabb.minX);
    result.minY = std::min(result.minY, entityAabb.minY);
    result.maxX = std::max(result.maxX, entityAabb.maxX);
    result.maxY = std::max(result.maxY, entityAabb.maxY);
  }

  return result;
}
```

### 4.4 Rotation Pivot Calculation

```
pivot = {
  x: (selectionBounds.minX + selectionBounds.maxX) / 2,
  y: (selectionBounds.minY + selectionBounds.maxY) / 2
}
```

---

## 5. Interaction State Machine

### 5.1 State Diagram

```
                                    ┌─────────────────┐
                                    │                 │
    ┌──────────────┐  hover corner  │   ROTATE_HOVER  │
    │    IDLE      │ ─────────────► │  (cursor change)│
    │              │◄─────────────  │                 │
    └──────────────┘  leave zone    └────────┬────────┘
           │                                 │
           │                                 │ pointerDown
           │                                 ▼
           │                        ┌─────────────────┐
           │                        │                 │
           │                        │ ROTATE_DRAGGING │
           │                        │                 │
           │                        └────────┬────────┘
           │                                 │
           │         ┌───────────────────────┼───────────────────────┐
           │         │                       │                       │
           │         ▼                       ▼                       ▼
           │  ┌─────────────┐        ┌─────────────┐         ┌─────────────┐
           │  │   COMMIT    │        │   CANCEL    │         │  POINTER    │
           │  │ (pointerUp) │        │  (Escape)   │         │   LOST      │
           │  └──────┬──────┘        └──────┬──────┘         └──────┬──────┘
           │         │                      │                       │
           └─────────┴──────────────────────┴───────────────────────┘
                                    │
                                    ▼
                            [IDLE / history entry]
```

### 5.2 State Definitions

```typescript
// frontend/features/editor/interactions/handlers/SelectionHandler.tsx
type RotationInteractionState =
  | { kind: 'none' }
  | { kind: 'rotate_hover'; corner: CornerIndex }  // 0=BL, 1=BR, 2=TR, 3=TL
  | { kind: 'rotate_dragging';
      corner: CornerIndex;
      startScreen: Point;
      startWorld: Point;
      pivotWorld: Point;
      startAngleDeg: number;
    };
```

### 5.3 Corner Index Convention

```
         TL(3)─────────────TR(2)
           │                 │
           │      CENTER     │
           │        ●        │
           │                 │
         BL(0)─────────────BR(1)
```

### 5.4 Hover Detection (Rotation Zone)

```typescript
// In pick_system.cpp, extend checkCandidate for rotation handles
const ROTATION_HANDLE_OFFSET_PX = 15;  // Screen pixels outside corner
const ROTATION_HANDLE_RADIUS_PX = 10;  // Hit tolerance

isInRotationZone(pointerScreen, cornerScreen): boolean {
  // Rotation zone is a circular area offset diagonally from corner
  const offsetDir = getCornerOutwardDirection(cornerIndex);
  const rotationHandlePos = {
    x: cornerScreen.x + offsetDir.x * ROTATION_HANDLE_OFFSET_PX,
    y: cornerScreen.y + offsetDir.y * ROTATION_HANDLE_OFFSET_PX
  };

  const dist = distance(pointerScreen, rotationHandlePos);
  return dist <= ROTATION_HANDLE_RADIUS_PX;
}

getCornerOutwardDirection(corner: CornerIndex): Vector2 {
  // Returns normalized diagonal vector pointing away from shape center
  switch(corner) {
    case 0: return { x: -0.707, y: -0.707 };  // BL: down-left
    case 1: return { x:  0.707, y: -0.707 };  // BR: down-right
    case 2: return { x:  0.707, y:  0.707 };  // TR: up-right
    case 3: return { x: -0.707, y:  0.707 };  // TL: up-left
  }
}
```

### 5.5 Pointer Event Lifecycle

#### onPointerDown (when in rotation zone)

```typescript
onPointerDown(ctx: InputEventContext): void {
  // ... existing hit test ...

  if (res.subTarget === PickSubTarget.RotateHandle) {
    const modifiers = buildModifierMask(event);
    const selectionBounds = runtime.getSelectionBounds();
    const pivot = {
      x: (selectionBounds.minX + selectionBounds.maxX) / 2,
      y: (selectionBounds.minY + selectionBounds.maxY) / 2
    };

    runtime.beginTransform(
      activeIds,
      TransformMode.Rotate,
      res.id,
      res.subIndex,  // Corner index
      screen.x, screen.y,
      viewTransform.x, viewTransform.y, viewTransform.scale,
      canvasSize.width, canvasSize.height,
      modifiers
    );

    this.state = {
      kind: 'rotate_dragging',
      corner: res.subIndex,
      startScreen: screen,
      startWorld: worldPoint,
      pivotWorld: pivot,
      startAngleDeg: angleFromPivot(pivot.x, pivot.y, worldPoint.x, worldPoint.y)
    };
  }
}
```

#### onPointerMove (during rotation)

```typescript
onPointerMove(ctx: InputEventContext): void {
  if (this.state.kind === 'rotate_dragging') {
    const modifiers = buildModifierMask(event);
    runtime.updateTransform(
      screen.x, screen.y,
      viewTransform.x, viewTransform.y, viewTransform.scale,
      canvasSize.width, canvasSize.height,
      modifiers
    );
  }
}
```

#### onPointerUp

```typescript
onPointerUp(ctx: InputEventContext): void {
  if (this.state.kind === 'rotate_dragging') {
    runtime.commitTransform();
    this.state = { kind: 'none' };
  }
}
```

#### onKeyDown (Escape to cancel)

```typescript
onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && this.state.kind === 'rotate_dragging') {
    runtime.cancelTransform();
    this.state = { kind: 'none' };
  }
}
```

### 5.6 Undo/Redo Integration

- `commitTransform()` automatically creates a history entry in the C++ engine
- No frontend history management needed
- Rotation undoes as a single atomic operation
- Multi-select rotation undoes all entity transforms together

---

## 6. Sidebar Integration

### 6.1 Component Structure (Existing)

```
DrawingInspectorPanel
  └─ TransformField (for rotation)
       └─ NumericComboField (for input/display)
            └─ useNumericComboField (hook with draft/commit logic)
```

### 6.2 Current Implementation Status

The sidebar rotation field **already exists** in `DrawingInspectorPanel.tsx`:

```typescript
// frontend/features/editor/components/drawing/DrawingInspectorPanel.tsx:116-132
<Section title="TRANSFORMAÇÃO">
  <TransformField
    label="Rotação"
    value={transform.rotationDeg}
    onCommit={(rotation) => setRotation(entityId, rotation)}
    suffix="°"
    disabled={isLocked || !supportsRotation}
    // ...
  />
</Section>
```

### 6.3 Required Changes

#### 6.3.1 Angle Normalization on Commit

```typescript
// frontend/engine/core/useEntityTransform.ts
const setRotation = useCallback(
  (entityId: EntityId, rotationDeg: number) => {
    // Normalize to -180..180 before sending to engine
    const normalized = normalizeAngle(rotationDeg);
    runtime.setEntityRotation(entityId, normalized);
  },
  [runtime]
);
```

#### 6.3.2 Mixed State for Multi-Selection

Extend `DrawingInspectorPanel` to handle multi-selection:

```typescript
// When multiple entities selected with different rotations
const selectedIds = useEngineSelectionIds();
const transforms = selectedIds.map(id => useEntityTransform(id));

const rotations = transforms.map(t => t?.rotationDeg).filter(r => r !== undefined);
const allSameRotation = rotations.every(r => Math.abs(r - rotations[0]) < 0.01);

const displayRotation = allSameRotation ? rotations[0] : 'mixed';
```

#### 6.3.3 Step Configuration

```typescript
<TransformField
  label="Rotação"
  value={transform.rotationDeg}
  onCommit={handleRotationCommit}
  suffix="°"
  step={1}       // Normal arrow key step
  stepLarge={15} // Shift+arrow key step (matches canvas snap)
  decimals={2}
/>
```

### 6.4 Live Sync During Canvas Drag

The existing reactive pattern handles this automatically:

1. Canvas drag updates entity rotation in engine
2. Engine bumps `geometryGeneration` signal
3. `useEntityTransform` recomputes (depends on signal)
4. `TransformField` receives new value
5. If not focused (`isEditing.current === false`), displays new value

**No changes needed** - the draft/commit pattern in `TransformField` prevents feedback loops.

---

## 7. Engine API Proposal

### 7.1 C++ Engine Extensions

#### 7.1.1 Rotation Handle Hit Detection

**File**: `cpp/engine/interaction/pick_system.cpp`

```cpp
// Add to checkCandidate() for selected entities
if (isSelected(id) && supportsRotation(id)) {
  // Check rotation handle zones at corners
  for (int corner = 0; corner < 4; corner++) {
    Point2 cornerWorld = getCornerPosition(aabb, corner);
    Point2 cornerScreen = worldToScreen(cornerWorld, viewScale, viewX, viewY);
    Point2 handlePos = offsetCorner(cornerScreen, corner, ROTATION_HANDLE_OFFSET);

    float dist = distance(pickPointScreen, handlePos);
    if (dist <= ROTATION_HANDLE_TOLERANCE) {
      outCandidate.subTarget = PickSubTarget::RotateHandle;
      outCandidate.subIndex = corner;
      outCandidate.distance = dist;
      return true;
    }
  }
}
```

#### 7.1.2 Rotation Transform Mode Implementation

**File**: `cpp/engine/interaction/interaction_session.cpp`

```cpp
void InteractionSession::updateTransform(/* ... */) {
  // ... existing code ...

  if (session_.mode == TransformMode::Rotate) {
    // Convert screen to world
    float worldX = (screenX - viewX) / viewScale;
    float worldY = (screenY - viewY) / viewScale;

    // Calculate current angle from pivot
    float currentAngle = std::atan2(
      worldY - session_.rotationPivotY,
      worldX - session_.rotationPivotX
    ) * (180.0f / M_PI);

    // Calculate delta from start
    float deltaAngle = currentAngle - session_.startAngleDeg;

    // Handle wrap-around
    if (deltaAngle > 180.0f) deltaAngle -= 360.0f;
    if (deltaAngle < -180.0f) deltaAngle += 360.0f;

    // Apply shift snap
    if (modifiers & kShiftMask) {
      deltaAngle = std::round(deltaAngle / 15.0f) * 15.0f;
    }

    session_.accumulatedDeltaDeg = deltaAngle;

    // Apply to all entities
    for (const auto& snap : session_.snapshots) {
      float newRotation = normalizeAngle(snap.originalRotationDeg + deltaAngle);

      if (session_.snapshots.size() > 1) {
        // Multi-select: also update position
        Point2 newPos = rotatePointAroundPivot(
          snap.originalPosX, snap.originalPosY,
          session_.rotationPivotX, session_.rotationPivotY,
          deltaAngle
        );
        updateEntityPosition(snap.id, newPos.x, newPos.y);
      }

      updateEntityRotation(snap.id, newRotation);
    }
  }
}
```

#### 7.1.3 Commit Result for Rotation

**File**: `cpp/engine/interaction/interaction_session.cpp`

```cpp
// In commitTransform(), add rotation case
if (session_.mode == TransformMode::Rotate) {
  for (const auto& snap : session_.snapshots) {
    float finalRotation = getEntityRotation(snap.id);

    commitResultIds.push_back(snap.id);
    commitResultOpCodes.push_back(static_cast<uint8_t>(TransformOpCode::ROTATE));
    commitResultPayloads.push_back(finalRotation);
    commitResultPayloads.push_back(0); // reserved
    commitResultPayloads.push_back(0); // reserved
    commitResultPayloads.push_back(0); // reserved
  }
}
```

### 7.2 TypeScript API Surface

No new API functions needed - all existing APIs support rotation:

| API | Purpose | Status |
|-----|---------|--------|
| `beginTransform(ids, mode, ...)` | Start rotation session | Existing, add `Rotate` mode handling |
| `updateTransform(...)` | Update during drag | Existing |
| `commitTransform()` | Finalize rotation | Existing |
| `cancelTransform()` | Revert rotation | Existing |
| `setEntityRotation(id, deg)` | Sidebar direct set | Existing |
| `getEntityTransform(id)` | Read rotation | Existing |
| `getSelectionBounds()` | Get pivot area | Existing |
| `pickExSmart(x,y,tol,mask)` | Detect rotation handle | Existing, extend for `RotateHandle` |

---

## 8. Testing Plan

### 8.1 Unit Tests (Math & Normalization)

**File**: `frontend/tests/rotation/math.test.ts`

```typescript
describe('normalizeAngle', () => {
  test('keeps angles in range', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(45)).toBe(45);
    expect(normalizeAngle(-45)).toBe(-45);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(-180);
  });

  test('wraps positive overflow', () => {
    expect(normalizeAngle(270)).toBe(-90);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(450)).toBe(90);
  });

  test('wraps negative overflow', () => {
    expect(normalizeAngle(-270)).toBe(90);
    expect(normalizeAngle(-360)).toBe(0);
    expect(normalizeAngle(-450)).toBe(-90);
  });
});

describe('snapAngle', () => {
  test('snaps to 15° increments', () => {
    expect(snapAngle(7)).toBe(0);
    expect(snapAngle(8)).toBe(15);
    expect(snapAngle(22)).toBe(15);
    expect(snapAngle(23)).toBe(30);
    expect(snapAngle(-7)).toBe(0);
    expect(snapAngle(-8)).toBe(-15);
  });
});

describe('rotatePointAroundPivot', () => {
  test('rotates 90° clockwise', () => {
    const result = rotatePointAroundPivot(10, 0, 0, 0, 90);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(10);
  });

  test('rotates 180°', () => {
    const result = rotatePointAroundPivot(10, 5, 0, 0, 180);
    expect(result.x).toBeCloseTo(-10);
    expect(result.y).toBeCloseTo(-5);
  });
});
```

### 8.2 Integration Tests (Pointer Scenarios)

**File**: `frontend/tests/rotation/interaction.test.ts`

```typescript
describe('Rotation Interaction', () => {
  test('single entity rotation via corner drag', async () => {
    // Setup: Create circle at (100, 100), select it
    const circle = await createCircle(100, 100, 50);
    await select([circle.id]);

    // Simulate drag from rotation zone
    const corner = getRotationHandlePosition('TR');
    await pointerDown(corner);
    await pointerMove({ x: corner.x + 50, y: corner.y }); // ~26.5° rotation
    await pointerUp();

    const transform = runtime.getEntityTransform(circle.id);
    expect(transform.rotationDeg).toBeCloseTo(26.5, 1);
  });

  test('shift snap to 15° increments', async () => {
    const circle = await createCircle(100, 100, 50);
    await select([circle.id]);

    const corner = getRotationHandlePosition('TR');
    await pointerDown(corner);
    await pointerMove({ x: corner.x + 50, y: corner.y }, { shiftKey: true });
    await pointerUp();

    const transform = runtime.getEntityTransform(circle.id);
    expect(transform.rotationDeg % 15).toBe(0);
  });

  test('escape cancels rotation', async () => {
    const circle = await createCircle(100, 100, 50);
    await select([circle.id]);

    const corner = getRotationHandlePosition('TR');
    await pointerDown(corner);
    await pointerMove({ x: corner.x + 100, y: corner.y });
    await keyDown('Escape');

    const transform = runtime.getEntityTransform(circle.id);
    expect(transform.rotationDeg).toBe(0); // Reverted
  });

  test('multi-select rotation', async () => {
    const c1 = await createCircle(100, 100, 25);
    const c2 = await createCircle(200, 100, 25);
    await select([c1.id, c2.id]);

    // Rotate 90° around selection center (150, 100)
    // c1 at (100,100) should move to (150, 50)
    // c2 at (200,100) should move to (150, 150)

    await rotateSelection(90);

    const t1 = runtime.getEntityTransform(c1.id);
    const t2 = runtime.getEntityTransform(c2.id);

    expect(t1.posX).toBeCloseTo(150);
    expect(t1.posY).toBeCloseTo(50);
    expect(t2.posX).toBeCloseTo(150);
    expect(t2.posY).toBeCloseTo(150);
  });
});
```

### 8.3 Regression Tests

```typescript
describe('Regression: Lines at Arbitrary Angles', () => {
  test('line at 45° has correct AABB', async () => {
    const line = await createLine(0, 0, 100, 100);
    const aabb = runtime.getEntityAabb(line.id);

    expect(aabb.minX).toBe(0);
    expect(aabb.minY).toBe(0);
    expect(aabb.maxX).toBe(100);
    expect(aabb.maxY).toBe(100);
  });
});

describe('Regression: Zoom Independence', () => {
  test('same rotation at different zoom levels', async () => {
    const circle = await createCircle(100, 100, 50);
    await select([circle.id]);

    // Test at zoom 100%
    await setZoom(1.0);
    const result1 = await measureRotationFromDrag(50, 0); // 50px horizontal drag

    // Test at zoom 200%
    await setZoom(2.0);
    const result2 = await measureRotationFromDrag(100, 0); // Same world-space drag

    expect(result1).toBeCloseTo(result2, 1);
  });
});
```

### 8.4 Acceptance Criteria

| Scenario | Expected Result |
|----------|-----------------|
| Drag corner at zoom 100%, 45° clockwise | Rotation = 45° |
| Drag corner at zoom 200%, 45° clockwise | Rotation = 45° (same world-space movement requires 2x screen pixels) |
| Shift+drag to ~37° | Snaps to 30° or 45° |
| Type `270` in sidebar | Displays as `-90°` |
| Type `-270` in sidebar | Displays as `90°` |
| Rotate 2 shapes together 90° | Both rotate 90° and positions swap around group center |
| Undo after rotation | Restores original rotation and positions |

---

## 9. Risks & Mitigations

### 9.1 Floating-Point Drift

**Risk**: Repeated small rotations accumulate floating-point errors.

**Mitigation**:
- Store rotation as `float` (sufficient precision for degrees)
- Normalize angles after each operation
- Round to 2 decimal places for display
- Use original snapshot values during drag (not incremental updates)

### 9.2 Performance (Bounds Recomputation)

**Risk**: Recomputing rotated AABBs for many entities during drag is expensive.

**Mitigation**:
- Cache AABBs in `TransformSnapshot` at session start
- Only recompute on commit
- Use approximate bounds during drag (acceptable visual fidelity)
- Batch entity updates in single render pass

### 9.3 Determinism with Zoom + Snapping

**Risk**: Different zoom levels could yield different snap results.

**Mitigation**:
- All angle calculations use world-space coordinates
- Snap is applied to the calculated world-space angle
- Screen-space only affects input sensitivity, not math

### 9.4 Pointer Capture Loss

**Risk**: User drags outside browser window, loses pointer capture.

**Mitigation**:
- Use `setPointerCapture()` on drag start
- Handle `pointercancel` event same as `pointerup`
- If capture lost mid-drag, commit current state (not cancel)

### 9.5 Undo/Redo Consistency

**Risk**: Partial undo (some entities but not others) in multi-select.

**Mitigation**:
- Engine creates single history entry for entire rotation operation
- Undo reverts all entities atomically
- Frontend doesn't manage history state

---

## 10. Phased Rollout

### Phase 1: MVP (This Implementation)

**Scope**:
- [x] Canvas rotation via corner handles for Circle, Polygon, Text
- [x] Shift snap to 15° increments
- [x] Sidebar rotation input with normalization
- [x] Multi-entity group rotation
- [x] Undo/redo support
- [x] Escape to cancel

**Timeline**: Core implementation

**Deliverables**:
1. C++ rotation handle hit detection
2. C++ rotation transform mode in `interaction_session.cpp`
3. SelectionHandler rotation state handling
4. Sidebar normalization fix
5. Unit and integration tests

### Phase 2: Polish & Advanced Features

**Scope** (future work):
- [ ] Moveable pivot point (Alt/Option+click to reposition)
- [ ] Rotation cursor variations per corner
- [ ] Angle tooltip during drag
- [ ] Rect rotation support
- [ ] Sidebar scrubbing (click+drag on number to adjust)
- [ ] Constrain proportions during rotation (for shapes with aspect ratio)

**Not in Scope** (explicit exclusions):
- Skew/shear transforms
- Non-uniform scaling during rotation
- Rotation around arbitrary external points
- Rotation keyframes/animation

---

## Appendix A: Cursor Assets

Rotation cursors should be provided as SVG or PNG assets:

| Corner | Cursor | Visual |
|--------|--------|--------|
| TL | `rotate-nw.svg` | ↺ arrow curving counter-clockwise |
| TR | `rotate-ne.svg` | ↻ arrow curving clockwise |
| BR | `rotate-se.svg` | ↺ arrow curving counter-clockwise |
| BL | `rotate-sw.svg` | ↻ arrow curving clockwise |

Cursor logic:
```typescript
getRotationCursor(corner: CornerIndex): string {
  // Cursors alternate based on which way rotation would "naturally" go
  return corner % 2 === 0 ? 'rotate-ccw' : 'rotate-cw';
}
```

---

## Appendix B: File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `cpp/engine/interaction/pick_system.cpp` | Modify | Add rotation handle hit detection |
| `cpp/engine/interaction/interaction_session.cpp` | Modify | Implement `TransformMode::Rotate` |
| `cpp/engine/interaction/interaction_session.h` | Modify | Add rotation fields to `SessionState` |
| `cpp/engine/impl/engine_overlay.cpp` | Modify | (Optional) Emit rotation handle positions |
| `frontend/features/editor/interactions/handlers/SelectionHandler.tsx` | Modify | Handle `PickSubTarget.RotateHandle` |
| `frontend/features/editor/components/ShapeOverlay.tsx` | Modify | Render rotation handle zones |
| `frontend/features/editor/components/drawing/DrawingInspectorPanel.tsx` | Modify | Multi-select mixed state |
| `frontend/engine/core/useEntityTransform.ts` | Modify | Normalize angle on set |
| `frontend/utils/geometry/angleNormalization.ts` | Create | Shared normalization utilities |
| `frontend/tests/rotation/*.test.ts` | Create | Test suites |

---

## Appendix C: Figma Reference Behavior

Verified Figma behaviors (as of Jan 2025):

1. **Angle display**: Shows -180 to 180 (e.g., 270° input → -90° display)
2. **Rotation direction**: Clockwise = positive visually on screen
3. **Snap increment**: 15° with Shift key
4. **Multi-select pivot**: Center of union bounding box
5. **Handle position**: ~12-15px outside corner, on diagonal
6. **Cursor change**: Happens before click (on hover)
7. **During drag**: Shows angle tooltip near cursor
8. **Sidebar sync**: Updates live during canvas drag
