# Plan: "Desenho" Inspector Panel for Transform Properties

> **Status:** Planning
> **Date:** 2026-01-07
> **Scope:** Right sidebar "Desenho" section - Position, Rotation, Dimensions

---

## 1) Figma Reference Behavior (Research + Decisions)

### Figma Behavior Analysis

**X/Y Position Fields:**
- Represent the **top-left corner** of the object's bounding box (not center, not pivot)
- When rotated: X/Y still refer to the top-left corner of the **axis-aligned bounding box**
- Negative values allowed (object can be off-canvas)
- Sub-pixel precision (shows decimals)

**Width/Height Fields:**
- Represent the **local object dimensions** (unrotated size), NOT axis-aligned bounding box
- When rotated: W/H remain the same; only X/Y bounding box changes
- Minimum: typically ~0.01 or ~1 depending on object type
- Aspect ratio lock available (linked W/H)

**Rotation Field:**
- Degrees (°), positive = counterclockwise in Figma
- Display range: -180° to 180° (or shows 360° as 0°)
- Wraps around (typing 450° → shows 90°)
- Input accepts any number, then normalizes
- Rounded to 2 decimal places for display

**Input Interaction Model (Figma):**
- **Commit rules:** Enter or Blur commits; typing does NOT live-update
- **Escape:** Reverts to last committed value
- **Decimal support:** Yes, typically 2 decimal places displayed
- **Arrow keys:** ↑/↓ step by 1; Shift+↑/↓ step by 10
- **Tab:** Moves between fields

### Concrete Decisions for This Project

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **X/Y reference** | **Center of AABB** | Matches engine's center-origin coordinate system (0,0 at document center); simpler math |
| **Y direction** | **Y-up** (positive = up) | Already defined in system prompt; matches mathematical convention |
| **W/H meaning** | **Local object size** (unrotated) | More intuitive for users; consistent with Figma |
| **Rotation convention** | **Degrees, counterclockwise positive** | Matches standard mathematical convention |
| **Rotation range** | **-180° to 180°** | Cleaner display; wraps 181° → -179° |
| **Commit behavior** | **Enter/Blur commits** | Prevents intermediate invalid states; matches existing `NumericComboField` pattern |
| **Escape behavior** | **Reverts to last committed** | Standard UX pattern |
| **Decimal precision** | **2 decimal places** for display | Sufficient precision without clutter |
| **Arrow step** | **1 unit (px or °)** | Standard increment |
| **Shift+Arrow step** | **10 units** | Faster adjustment |

---

## 2) UI Spec (Portuguese Strings + Layout)

### Section Structure

```
┌─────────────────────────────────────────┐
│ POSIÇÃO                                 │  ← Section header
├─────────────────────────────────────────┤
│  ┌──────────┐    ┌──────────┐          │
│  │ X │ 125.5│    │ Y │ -42.0│          │  ← Two-column row
│  └──────────┘    └──────────┘          │
├─────────────────────────────────────────┤
│ DIMENSÕES                               │
├─────────────────────────────────────────┤
│  ┌──────────┐    ┌──────────┐          │
│  │ L │ 100.0│    │ A │  50.0│          │  ← L=Largura, A=Altura
│  └──────────┘    └──────────┘          │
├─────────────────────────────────────────┤
│ TRANSFORMAÇÃO                           │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────┐       │
│  │ Rotação │ 45.00°            │       │  ← Single field row
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Portuguese Labels (pt-BR)

| Element | Portuguese | Notes |
|---------|------------|-------|
| Section: Position | **POSIÇÃO** | All caps for section headers |
| Field: X | **X** | Universal, no translation |
| Field: Y | **Y** | Universal, no translation |
| Section: Dimensions | **DIMENSÕES** | |
| Field: Width | **L** | Abbreviation of "Largura" |
| Field: Height | **A** | Abbreviation of "Altura" |
| Section: Transform | **TRANSFORMAÇÃO** | |
| Field: Rotation | **Rotação** | Full word, single field |
| Placeholder (empty) | **—** | Em dash |
| Tooltip: Rotation unavailable | **Rotação ainda não disponível para este tipo de objeto** | |
| Tooltip: Locked | **Objeto bloqueado** | |
| Unit: pixels | **px** | Suffix shown in field |
| Unit: degrees | **°** | Suffix shown in field |

### Label Choice Justification

- **"L" / "A"** instead of full words: Matches Figma's compact style; two-column layout requires abbreviation; tooltips can show full "Largura" / "Altura"
- **"Rotação"** as full word: Single-column field has space; more discoverable than abbreviation

### States

| Condition | Behavior |
|-----------|----------|
| `selectionCount === 0` | Render nothing (empty section, no placeholders) |
| `selectionCount === 1` | Show all fields with current values |
| `selectionCount > 1` | Render nothing (multi-selection out of scope) |
| Entity is locked | Fields shown but **disabled**; tooltip "Objeto bloqueado" |
| Rotation not supported by entity type | Field shown but **disabled**; tooltip "Rotação ainda não disponível para este tipo de objeto" |

### Formatting Rules

- Units shown as suffix: `125.50 px`, `45.00°`
- Decimal places: 2 (configurable per field)
- No thousands separators
- Negative sign for negative values: `-42.00 px`

---

## 3) Transform Semantics (What Each Field Means)

### Position (X, Y)

| Property | Semantics |
|----------|-----------|
| **Reference point** | Center of axis-aligned bounding box |
| **Coordinate system** | Document center = origin (0, 0) |
| **Sign convention** | X: positive = right; Y: positive = up |
| **Units** | Pixels (document units) |
| **For rotated objects** | Center of AABB (not center of unrotated shape) |

**Why center of AABB?**
- The engine already computes AABB via `getEntityAabb()`
- Center is trivially computed: `centerX = (minX + maxX) / 2`
- More intuitive than top-left when Y-up

### Dimensions (L/Largura, A/Altura)

| Property | Semantics |
|----------|-----------|
| **Reference** | Local object size (unrotated) |
| **For Rect** | `w`, `h` fields directly |
| **For Circle/Polygon** | `rx * 2 * sx`, `ry * 2 * sy` (diameter × scale) |
| **For Text** | `layoutWidth`, `layoutHeight` (computed) |
| **For Line/Polyline/Arrow** | AABB width/height (since they have no "local" size) |
| **Minimum constraint** | 1 px minimum (clamped on commit) |
| **Maximum constraint** | None (allow arbitrarily large) |

**Behavior when rotated:**
- Dimensions remain constant (local size)
- Only position (AABB center) changes as rotation changes

### Rotation (Rotação)

| Property | Semantics |
|----------|-----------|
| **Units** | Degrees (°) |
| **Convention** | Counterclockwise = positive |
| **Normalization range** | -180° to 180° |
| **Precision** | 2 decimal places |
| **Normalization formula** | `((angle + 180) % 360) - 180` |

**Entity type support:**

| Entity | Rotation Support | Notes |
|--------|------------------|-------|
| Rect | ❌ No | Show field disabled |
| Circle | ✅ Yes | `rot` field |
| Polygon | ✅ Yes | `rot` field |
| Text | ✅ Yes | `rotation` field |
| Line | ❌ N/A | Point-based, rotation meaningless |
| Polyline | ❌ N/A | Point-based |
| Arrow | ❌ N/A | Point-based |

---

## 4) Data Flow & Sync Model (Two-Way Without Feedback Loops)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              DrawingInspector Component                   │   │
│  │  ┌──────────────────┐    ┌──────────────────┐           │   │
│  │  │   Draft State    │◄──►│  Committed State │           │   │
│  │  │ (during typing)  │    │ (from engine)    │           │   │
│  │  └──────────────────┘    └──────────────────┘           │   │
│  └────────────────────────────┬─────────────────────────────┘   │
│                               │                                  │
└───────────────────────────────┼──────────────────────────────────┘
                                │ commit (Enter/Blur)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Runtime Layer                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  EngineRuntime                            │   │
│  │  setEntityPosition() / setEntitySize() / setEntityRotation │   │
│  └────────────────────────────┬──────────────────────────────┘   │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Engine Layer (C++ WASM)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              CadEngine (Source of Truth)                  │   │
│  │  • Entity storage (RectRec, CircleRec, etc.)             │   │
│  │  • Transform application                                  │   │
│  │  • Event emission (EntityChanged)                         │   │
│  └────────────────────────────┬──────────────────────────────┘   │
└───────────────────────────────┼──────────────────────────────────┘
                                │ events
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               Signal/Subscription Layer                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  engineDocumentSignals.ts                                 │   │
│  │  bumpDocumentSignal('selection') / 'geometry'            │   │
│  └────────────────────────────┬──────────────────────────────┘   │
└───────────────────────────────┼──────────────────────────────────┘
                                │
                                ▼
                     UI re-reads from engine
```

### State Management Rules

1. **Engine is authoritative** - UI never stores transform state persistently; always reads from engine

2. **Draft state during editing:**
   - When user focuses a field, current engine value is copied to local draft state
   - Draft state is local `useState` in the input component
   - Engine updates are **ignored** while draft is active (field is focused)

3. **Commit triggers:**
   - Enter key
   - Blur (focus loss)
   - Draft value is validated, clamped, and sent to engine

4. **Cancel triggers:**
   - Escape key → revert draft to last engine value
   - Selection change → discard draft, read new entity

5. **Real-time updates during drag/resize/rotate (canvas interaction):**
   - Engine emits `EntityChanged` events with `ChangeMask.Geometry | ChangeMask.Bounds`
   - Event loop bumps `geometry` signal (new signal to add)
   - Inspector subscribes to `geometry` signal
   - **If not editing (no focused field):** Inspector re-reads engine values
   - **If editing:** Inspector ignores updates (draft takes precedence)

### Loop Prevention

```typescript
// Pseudo-code for the inspector
const [draftValue, setDraftValue] = useState<string | null>(null);
const isFocused = useRef(false);
const geometryGen = useDocumentSignal('geometry'); // New signal

// Read from engine when not editing
const engineValue = useMemo(() => {
  if (!entityId) return null;
  return runtime.getEntityTransform(entityId);
}, [entityId, geometryGen, /* only recalc when gen changes */]);

// Commit handler
const handleCommit = (newValue: number) => {
  if (isFocused.current) {
    // Commit to engine
    runtime.setEntityPosition(entityId, { x: newValue, y: currentY });
    // Don't update draft - we're about to blur anyway
  }
};

// Engine → UI update
useEffect(() => {
  if (!isFocused.current && engineValue) {
    // Only sync if not editing
    setDraftValue(null); // Clear draft, use engine value
  }
}, [engineValue]);
```

---

## 5) Minimal Engine/Runtime API Surface (Engine-First)

### Required APIs (New)

#### C++ Engine (`engine.h`)

```cpp
// New struct for unified transform data
struct EntityTransform {
    float posX, posY;       // Center of AABB
    float width, height;    // Local dimensions (unrotated)
    float rotationDeg;      // Rotation in degrees (-180 to 180)
    bool hasRotation;       // Whether rotation is supported
    bool valid;             // Whether entity exists
};

// New methods
EntityTransform getEntityTransform(std::uint32_t entityId) const;
void setEntityPosition(std::uint32_t entityId, float x, float y);
void setEntitySize(std::uint32_t entityId, float width, float height);
void setEntityRotation(std::uint32_t entityId, float rotationDeg);
```

#### TypeScript Protocol (`protocol.ts`)

```typescript
export type EntityTransform = {
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotationDeg: number;
  hasRotation: number;  // 0 or 1 (bool in WASM)
  valid: number;        // 0 or 1
};
```

#### TypeScript Runtime

**New file: `frontend/engine/core/runtime/TransformQuerySystem.ts`**

```typescript
export class TransformQuerySystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance,
  ) {}

  public getEntityTransform(entityId: EntityId): EntityTransform {
    if (!this.engine.getEntityTransform) {
      throw new Error('[EngineRuntime] getEntityTransform() missing in WASM build.');
    }
    return this.engine.getEntityTransform(entityId);
  }

  public setEntityPosition(entityId: EntityId, x: number, y: number): void {
    this.engine.setEntityPosition?.(entityId, x, y);
  }

  public setEntitySize(entityId: EntityId, width: number, height: number): void {
    this.engine.setEntitySize?.(entityId, width, height);
  }

  public setEntityRotation(entityId: EntityId, rotationDeg: number): void {
    this.engine.setEntityRotation?.(entityId, rotationDeg);
  }
}
```

**EngineRuntime additions:**

```typescript
// In EngineRuntime class
public getEntityTransform(entityId: EntityId): EntityTransform {
  return this.transformQuerySystem.getEntityTransform(entityId);
}

public setEntityPosition(entityId: EntityId, x: number, y: number): void {
  this.transformQuerySystem.setEntityPosition(entityId, x, y);
}

// ... similar for setEntitySize, setEntityRotation
```

### Event Emission

**Existing mechanism is sufficient:**
- `EntityChanged` event with `ChangeMask.Geometry | ChangeMask.Bounds` already emitted during transforms
- Need to ensure these events are emitted for `setEntityPosition/Size/Rotation` calls

**New document signal:**
- Add `'geometry'` to `DocumentSignal` type
- Bump on `EntityChanged` events with `ChangeMask.Geometry`

### Implementation Location

| Component | Location |
|-----------|----------|
| C++ `getEntityTransform` | `cpp/engine/engine.cpp` |
| C++ `setEntity*` methods | `cpp/engine/engine.cpp` |
| Emscripten bindings | `cpp/engine/bindings.cpp` |
| TS `TransformQuerySystem` | `frontend/engine/core/runtime/TransformQuerySystem.ts` |
| TS protocol types | `frontend/engine/core/protocol.ts` |
| WASM types | `frontend/engine/core/wasm-types.ts` |

---

## 6) Rotation-Not-Yet-Implemented Plan

### Current State Analysis

**Rotation IS implemented for:**
- Circle (`rot` field in `CircleRec`)
- Polygon (`rot` field in `PolygonRec`)
- Text (`rotation` field in `TextRec`)

**Rotation is NOT implemented for:**
- Rect (no `rot` field in `RectRec`)
- Line, Polyline, Arrow (point-based, rotation N/A)

### Incremental Plan for Rect Rotation

**Phase 1: Engine Data Model (Future)**
```cpp
// Modify RectRec in types.h
struct RectRec {
    std::uint32_t id;
    float x, y;     // Center position (change from top-left)
    float w, h;     // Size
    float rot;      // NEW: rotation in radians
    // ... style fields
};
```

**Phase 2: Runtime Bridge + Events (Future)**
- Update `upsertRect` to accept rotation parameter
- Update snapshot format (version bump)
- Add rotation to AABB computation

**Phase 3: UI Wiring (Future)**
- Inspector rotation field becomes enabled for Rect
- Canvas rotation handles for Rect (separate feature)

### Temporary UI Behavior (Now)

**Decision: Show field disabled with tooltip**

Rationale:
- Consistency: Users see that rotation exists as a concept
- Discoverability: When rotation is added, users already know where to find it
- Clear feedback: Tooltip explains why it's disabled
- No crashes: Disabled field cannot trigger invalid operations

**Implementation:**

```tsx
// In DrawingInspector
const supportsRotation = transform.hasRotation;

<NumericField
  label="Rotação"
  value={supportsRotation ? transform.rotationDeg : 0}
  disabled={!supportsRotation || isLocked}
  suffix="°"
  title={!supportsRotation
    ? "Rotação ainda não disponível para este tipo de objeto"
    : undefined}
/>
```

---

## 7) Performance Plan

### High-Frequency Update Handling

**During drag/resize/rotate operations:**

1. **rAF-aligned event polling** (already exists in `useEngineEvents.ts`)
   - Events polled once per frame
   - Multiple transform updates coalesced into single generation bump

2. **Geometry signal debouncing:**
   ```typescript
   // In event loop
   let needsGeometryBump = false;

   for (const ev of events) {
     if (ev.type === EventType.EntityChanged && (ev.b & ChangeMask.Geometry)) {
       needsGeometryBump = true;
     }
   }

   if (needsGeometryBump) {
     bumpDocumentSignal('geometry');
   }
   ```

3. **Scoped component updates:**
   - Inspector subscribes only to `selection` and `geometry` signals
   - Rest of sidebar (other tabs) unaffected by geometry changes
   - Use `React.memo` on field components to prevent unnecessary re-renders

4. **Avoid calling engine on every keystroke:**
   - Draft/commit pattern: Only call `setEntity*` on Enter/Blur
   - No live preview while typing (consistent with Figma)

### Rendering Optimization

```tsx
// Field component with memo
const TransformField = React.memo(function TransformField({
  label,
  value,
  onCommit,
  ...props
}: TransformFieldProps) {
  // Component only re-renders when props actually change
  return <NumericComboField value={value} onCommit={onCommit} {...props} />;
}, (prev, next) => {
  // Custom comparison - only re-render if value or disabled state changed
  return prev.value === next.value && prev.disabled === next.disabled;
});
```

### Throttling Strategy

- **Canvas interactions → Engine events:** Already throttled by rAF in engine
- **Engine events → UI signals:** Coalesced per frame (no throttling needed)
- **UI re-render:** React handles batching automatically
- **No additional throttling required** if draft pattern is used correctly

---

## 8) Undo/Redo & History Semantics

### Policy

| Action | History Entry |
|--------|---------------|
| Edit X field (Enter/Blur) | Single undo entry for position change |
| Edit Y field (Enter/Blur) | Single undo entry for position change |
| Edit X then Y without blur | Two separate entries (one per commit) |
| Edit Largura | Single undo entry for size change |
| Edit Altura | Single undo entry for size change |
| Edit Rotação | Single undo entry for rotation change |
| Drag on canvas | Single entry (managed by InteractionSession) |
| Resize on canvas | Single entry (managed by InteractionSession) |
| Rotate on canvas | Single entry (managed by InteractionSession) |

### Implementation

**Inspector field edits:**
- Each `setEntityPosition/Size/Rotation` call creates one history entry
- Engine's `HistoryManager` handles this automatically via `beginHistoryEntry()` / `commitHistoryEntry()`

**No special handling needed:**
- Existing history infrastructure handles atomicity
- Inspector commits are single operations (not compound)

**Potential future enhancement:**
- If user edits X and Y rapidly (within 500ms), could coalesce into single "position" entry
- Not implementing for v1 (complexity vs. benefit)

---

## 9) Implementation Task List + Acceptance Criteria

### Ordered Checklist

#### Phase A: Engine API (C++)

- [ ] **A1.** Add `EntityTransform` struct to `engine_protocol_types.h`
- [ ] **A2.** Implement `getEntityTransform()` in `engine.cpp`
  - AC: Returns valid transform for all entity types
  - AC: `hasRotation = false` for Rect, Line, Polyline, Arrow
  - AC: `valid = false` for non-existent entity ID
- [ ] **A3.** Implement `setEntityPosition()` in `engine.cpp`
  - AC: Updates entity position by computing new x/y from center offset
  - AC: Emits `EntityChanged` event with `Geometry | Bounds` mask
  - AC: Creates history entry
- [ ] **A4.** Implement `setEntitySize()` in `engine.cpp`
  - AC: Updates entity dimensions
  - AC: Respects minimum size (1 px)
  - AC: Emits events and history entry
- [ ] **A5.** Implement `setEntityRotation()` in `engine.cpp`
  - AC: Only affects entities with rotation support
  - AC: No-op for Rect (until rotation implemented)
  - AC: Normalizes to -180..180 range
- [ ] **A6.** Add Emscripten bindings in `bindings.cpp`
- [ ] **A7.** Update ABI hash in both C++ and TypeScript

#### Phase B: TypeScript Runtime

- [ ] **B1.** Add `EntityTransform` type to `protocol.ts`
- [ ] **B2.** Add method signatures to `wasm-types.ts`
- [ ] **B3.** Create `TransformQuerySystem.ts`
- [ ] **B4.** Add methods to `EngineRuntime.ts`
- [ ] **B5.** Add `'geometry'` to `DocumentSignal` type in `engineDocumentSignals.ts`
- [ ] **B6.** Bump `geometry` signal in event loop (`useEngineEvents.ts`)

#### Phase C: React Hooks

- [ ] **C1.** Create `useEntityTransform(entityId)` hook
  - AC: Returns null when no entity selected
  - AC: Re-reads when geometry signal changes
  - AC: Does not re-read when field is focused (draft mode)
- [ ] **C2.** Create `useSetEntityTransform()` hook (returns mutation functions)

#### Phase D: UI Components

- [ ] **D1.** Create `TransformField` component (wrapper around `NumericComboField`)
  - AC: Shows suffix (px or °)
  - AC: Uses draft/commit pattern
  - AC: Supports disabled state with tooltip
- [ ] **D2.** Create `DrawingInspectorPanel` component
  - AC: Renders nothing when `selectionCount !== 1`
  - AC: Shows all three sections (Posição, Dimensões, Transformação)
  - AC: All labels in pt-BR
- [ ] **D3.** Integrate into `EditorSidebar.tsx` (replace "Desenho" placeholder)
- [ ] **D4.** Style consistency with existing sidebar panels

#### Phase E: Integration & Testing

- [ ] **E1.** Manual test: Select single shape → values appear
- [ ] **E2.** Manual test: Deselect → section disappears
- [ ] **E3.** Manual test: Select multiple → section disappears
- [ ] **E4.** Manual test: Drag shape on canvas → X/Y update in real-time
- [ ] **E5.** Manual test: Resize shape on canvas → L/A update in real-time
- [ ] **E6.** Manual test: Edit X field → shape moves on canvas
- [ ] **E7.** Manual test: Edit Largura field → shape resizes
- [ ] **E8.** Manual test: Edit Rotação on Circle → circle rotates
- [ ] **E9.** Manual test: Rotação disabled for Rect with tooltip
- [ ] **E10.** Manual test: Undo/Redo works for inspector edits
- [ ] **E11.** Manual test: No feedback loops (editing doesn't cause jitter)
- [ ] **E12.** Manual test: Escape key reverts draft

### Acceptance Criteria Summary

| Criterion | Verification |
|-----------|--------------|
| Renders only for single selection | Select 0, 1, 2+ items; verify visibility |
| X/Y reflect correct engine position | Compare inspector values to engine `getEntityTransform` |
| Y-up coordinate system | Drag shape up → Y increases |
| Center-origin coordinates | Shape at doc center shows X=0, Y=0 |
| Pixel units | Values match pixel dimensions |
| L/A update live during resize | Resize via canvas handles; watch inspector |
| Rotação updates live during rotate | Rotate Circle via canvas; watch inspector |
| Field editing updates canvas | Type new value, press Enter; verify canvas |
| No feedback loops | Edit + undo repeatedly; no jitter |
| All UI strings in pt-BR | Visual inspection |
| Rotation disabled safely | Select Rect; rotation field disabled with tooltip |

---

## 10) Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Coordinate mismatch** (Y-down vs Y-up confusion) | Medium | High | Add unit tests for Y-up; document clearly in code comments |
| **Pivot confusion** (center vs corner) | Medium | Medium | Consistently use AABB center; document decision |
| **Rotated size ambiguity** (local vs AABB) | Medium | Medium | Always show local size; add tooltip explaining behavior |
| **Clobbered edits** (engine update overwrites draft) | High | High | Use `isFocused` guard; ignore engine updates during editing |
| **Missing subscriptions** (UI not updating) | Medium | Medium | Add `geometry` signal; verify in event loop |
| **Performance regression** (too many re-renders) | Low | Medium | Use `React.memo`; profile with React DevTools |
| **ABI mismatch** (C++ and TS out of sync) | Medium | High | Update ABI hash on both sides; runtime validation throws |
| **History corruption** (multiple entries for single edit) | Low | Medium | Each `setEntity*` call creates exactly one entry |
| **Rect rotation confusion** (field shown but disabled) | Low | Low | Clear tooltip in pt-BR; consistent disabled styling |
| **Text entity edge cases** (computed dimensions) | Medium | Low | Use `layoutWidth/layoutHeight` from TextRec |
| **Line/Polyline/Arrow edge cases** | Medium | Low | Use AABB dimensions; position is AABB center |

### Critical Path Dependencies

```
A1-A7 (Engine APIs) → B1-B6 (Runtime) → C1-C2 (Hooks) → D1-D4 (UI) → E1-E12 (Testing)
```

All phases are sequential; no parallelization possible for core functionality.

---

## Summary

This plan provides a comprehensive, engine-first approach to implementing the "Desenho" inspector panel. Key decisions:

1. **Center-origin, Y-up coordinate system** for X/Y
2. **Local dimensions** for Width/Height
3. **Degrees, counterclockwise positive** for Rotation
4. **Draft/commit pattern** to prevent feedback loops
5. **Geometry signal** for efficient real-time updates
6. **Disabled rotation field with tooltip** for unsupported entity types

The implementation requires new engine APIs (`getEntityTransform`, `setEntityPosition`, etc.) before the UI can be built. Estimated 9 ordered tasks for engine work, followed by runtime, hooks, and UI layers.
