# Handle Index Contract

> **Source of Truth**: `cpp/engine/interaction/interaction_constants.h`

This document defines the canonical order of handle indices used throughout the interaction system. The C++ engine is the authority, and frontend code must follow this contract.

---

## Corner Handle Indices

Corner handles are used for **resize** operations. They follow a **counter-clockwise** order starting from bottom-left:

| Index | Position | Abbreviation | Anchor (opposite corner) |
|-------|----------|--------------|-------------------------|
| 0 | Bottom-Left | BL | Top-Right (2) |
| 1 | Bottom-Right | BR | Top-Left (3) |
| 2 | Top-Right | TR | Bottom-Left (0) |
| 3 | Top-Left | TL | Bottom-Right (1) |

### Visual Representation

```
    TL (3)────────────TR (2)
       │                │
       │     Entity     │
       │                │
    BL (0)────────────BR (1)
```

### Resize Anchor Mapping

When dragging a corner handle, the **opposite corner** is the anchor:

```cpp
switch (handleIndex) {
    case 0: anchor = TR (index 2); break;  // Drag BL -> anchor TR
    case 1: anchor = TL (index 3); break;  // Drag BR -> anchor TL
    case 2: anchor = BL (index 0); break;  // Drag TR -> anchor BL
    case 3: anchor = BR (index 1); break;  // Drag TL -> anchor BR
}
```

---

## Side Handle Indices

Side handles are used for **constrained resize** (one axis only):

| Index | Position | Direction | Constrained Axis |
|-------|----------|-----------|------------------|
| 0 | South | Bottom | Vertical (height) |
| 1 | East | Right | Horizontal (width) |
| 2 | North | Top | Vertical (height) |
| 3 | West | Left | Horizontal (width) |

### Visual Representation

```
           North (2)
              │
    West (3)──┼──East (1)
              │
           South (0)
```

---

## Rotation Handle

Rotation handles are positioned **diagonally outside each corner**, offset by `ROTATE_HANDLE_OFFSET_PX` (15px) in screen space.

The handle index follows the same corner convention:

| Index | Corner | Diagonal Direction |
|-------|--------|-------------------|
| 0 | Near BL | Down-Left (-0.707, -0.707) |
| 1 | Near BR | Down-Right (+0.707, -0.707) |
| 2 | Near TR | Up-Right (+0.707, +0.707) |
| 3 | Near TL | Up-Left (-0.707, +0.707) |

---

## Cursor Angle Mapping

Base angles for cursor direction (0° = East/Right, counter-clockwise positive):

### Corner Handles

| Index | Position | Base Angle (°) | Cursor Direction |
|-------|----------|----------------|------------------|
| 0 | BL | 225 | SW diagonal ↙ |
| 1 | BR | 315 | SE diagonal ↘ |
| 2 | TR | 45 | NE diagonal ↗ |
| 3 | TL | 135 | NW diagonal ↖ |

### Side Handles

| Index | Position | Base Angle (°) | Cursor Direction |
|-------|----------|----------------|------------------|
| 0 | South | 270 | Down ↓ |
| 1 | East | 0 | Right → |
| 2 | North | 90 | Up ↑ |
| 3 | West | 180 | Left ← |

### Applying Entity Rotation

The final cursor angle is: `baseAngle - entityRotationDeg`

This ensures the cursor always points in the correct direction relative to the rotated entity.

---

## Code References

### C++ Engine (Source of Truth)

- Constants: `cpp/engine/interaction/interaction_constants.h`
- Pick system: `cpp/engine/interaction/pick_system.cpp`
- Resize logic: `cpp/engine/interaction/interaction_session_update.cpp`
- Overlay handles: `cpp/engine/impl/engine_overlay.cpp`

### Frontend (Must Follow Contract)

- Constants mirror: `frontend/features/editor/config/interaction-constants.ts`
- Cursor config: `frontend/features/editor/config/cursor-config.ts`
- Side handles: `frontend/features/editor/interactions/sideHandles.ts`
- Selection handler: `frontend/features/editor/interactions/handlers/SelectionHandler.tsx`

---

## Validation

To verify handle alignment between engine and frontend:

1. Pick a corner handle via engine → returns `handleIndex`
2. Render handle at index via frontend → position should match
3. Cursor angle for that index → should point in resize direction

If any mismatch is detected, the engine is authoritative and frontend must be corrected.
