# Architecture & UX Report: Engine-First Colors

## Executive Summary
This report defines the architecture for implementing a robust, Engine-First Color System (Stroke & Fill) for the CAD application. The proposed solution shifts the **"Source of Truth"** for styling entirely to the **C++ WASM Core**, treating the frontend runtime merely as a bridge. It introduces a **Non-Destructive Override Model**, allowing users to toggle between "ByLayer" and "Custom" styles without data loss, while maintaining high performance via a cached resolver strategy.

---

## 1. Architecture: Engine-First Decisions

### 1.1 Source of Truth
- **C++ WASM Core** is the definitive owner of:
  - Layer Defaults (Stroke/Fill colors, Widths).
  - Entity Semantic State (`ByLayer` vs `Override`).
  - Style Resolution Logic (Resolver).
  - Undo/Redo history for style changes.
- **Frontend (TS/React):** Acts only as a view layer. It does **not** compute colors or manage inheritance logic.

### 1.2 Data Model: EntityStyleStore (Sidecar)
To avoid bloating the core geometry structs (`RectRec`, `LineRec`) with style metadata, we will implement a **Sidecar Store** (`EntityStyleStore`) in C++.
- **Concept:** Only entities with overrides or specific flags allocate a style record.
- **Fields per Entity:**
  - `strokeSource`: `ByLayer` | `Override`
  - `fillSource`: `ByLayer` | `Override` | `None`
  - `strokeOverride`: RGBA (Preserved even if source is ByLayer)
  - `fillOverride`: RGBA (Preserved even if source is ByLayer)
- **Text Mapping (MVP):**
  - `stroke` attributes map to **Text Color**.
  - `fill` attributes map to **Text Background**.

### 1.3 Resolution Strategy (Option B: Cached/Baked)
We will **Cache "Baked" Values** in the geometry structs for rendering performance.
- **Mechanism:** The `StyleSystem` maintains an index of `LayerID -> EntityIDs`.
- **Trigger:**
  - When an Entity's style changes -> Resolve immediately -> Update "Baked" RGBA.
  - When a Layer's style changes -> Iterate indexed entities -> Resolve -> Update "Baked" RGBA.
- **Performance:** Updates are O(N_layer), not O(N_document). Rendering remains O(1) per entity.

---

## 2. UX Specification: Ribbon & Interaction

### 2.1 Ribbon "CORES" Group
Located in the **"Desenho"** tab, containing two **Active** controls:
1.  **Traço (Stroke)**: Click opens Color Picker.
2.  **Preenchimento (Fill)**: Click opens Color Picker + "Sem preenchimento" toggle.

**Key constraints:**
- **No Dropdown:** There is no "By Layer" dropdown option in the Ribbon.
- **Implicit Override:** Changing a color in the Ribbon automatically sets the target's source to **Override**.
- **Restoration:** "Restore to ByLayer" is handled via Context Menu or Properties Panel (future).

### 2.2 Target Priority
When the user modifies a color in the Ribbon, the system resolves the target in this order:
1.  **Selection Exists:** Apply override to **Selected Entities**.
2.  **Tool Active:** Update **Tool Defaults** (affecting next-created entities).
3.  **No Selection/Tool:** Update **Active Layer Defaults**.

### 2.3 State Indicators (Tooltip Strings)
The Ribbon buttons display the effective color state of the selection:

| State | Icon Indicator | Tooltip (PT-BR) | Engine State |
| :--- | :--- | :--- | :--- |
| **Inherited** | 🔗 (Link) | "Cor herdada da camada “{nome}”" | `source=ByLayer` |
| **Override** | 🔓 (Unlock) | "Cor personalizada do elemento" | `source=Override` |
| **None** | 🚫 (Slash) | "Sem preenchimento" | `source=None` (Fill only) |
| **Mixed** | ❓ / "Vários" | "Múltiplos valores" | Multiple sources/values detected |

---

## 3. API Contract & Protocol

### 3.1 Batch Commands
To ensure performance, all style operations must support batching via ID arrays.

**New C++ Commands (WASM Exports):**
1.  `SetLayerStyle(layerId, strokeColor, fillColor, width)`
    - Updates layer definition and triggers cascading resolve.
2.  `SetEntityOverride(entityIds[], target, color)`
    - `target`: `Stroke` | `Fill` | `Both`
    - Sets `source = Override` and updates the stored override color.
3.  `SetFillEnabled(entityIds[], enabled)`
    - Sets `fillSource` to `None` (if false) or restores previous source (if true).
4.  `ClearEntityOverride(entityIds[], target)`
    - Sets `source = ByLayer`. Preserves the hidden override color in storage.
5.  `GetSelectionStyleState()`
    - Returns a summary struct: `{ strokeState, fillState, commonStrokeColor, commonFillColor }` for UI rendering.

### 3.2 Protocol Types
```cpp
enum class StyleSource : uint8_t { ByLayer = 0, Override = 1, None = 2 };

struct SelectionStyleState {
    uint8_t strokeSource; // 0=ByLayer, 1=Override, 2=Mixed
    uint8_t fillSource;   // 0=ByLayer, 1=Override, 2=None, 3=Mixed
    // ... RGBA values if common, else marker for mixed
};
```

---

## 4. Execution Plan

### Phase 1: C++ Core (The Engine)
*   [ ] **Snapshot Version:** Bump `SNAPSHOT_VERSION`. Implement legacy loader.
*   [ ] **Style Store:** Create `EntityStyleStore` class with Sparse Map storage.
*   [ ] **Resolver Logic:** Implement `StyleSystem::resolve(entityId)` and `StyleSystem::onLayerChanged(layerId)`.
*   [ ] **Layer Index:** maintain `std::vector<EntityId>` per Layer for fast cascading.

### Phase 2: Bridge & Protocol
*   [ ] **Exports:** Bind `SetEntityOverride`, `SetLayerStyle` to WASM.
*   [ ] **Queries:** Implement `GetSelectionStyleState`.
*   [ ] **TS Types:** Update `protocol.ts` and `wasm-types.ts`.

### Phase 3: Frontend UI
*   [ ] **Hooks:** Create `useSelectionStyle()` utilizing `useEngineEvents` to invalidate on `SelectionChanged` or `EntityChanged`.
*   [ ] **Components:** Implement `ColorPickerButton` with Active/Inactive/Mixed states.
*   [ ] **Ribbon Integration:** Add "CORES" group to `ribbonConfig.ts`.

---

## 5. Acceptance Criteria (E2E)

*   [ ] **ByLayer Creation:** New shapes created without tool overrides default to `ByLayer` and render with Layer colors.
*   [ ] **Tool Defaults:** Changing color while a tool is active applies to the *next* shape drawn, setting it to `Override`.
*   [ ] **Selection Override:** Changing color with a selection updates only the selected entities to `Override`.
*   [ ] **Non-Destructive Restore:** "Restore to ByLayer" (via debug/console initially) reverts visual style but keeps the custom color in memory (verifiable via toggle).
*   [ ] **Layer Edit:** Changing a Layer's color immediately updates all `ByLayer` entities on that layer, but *not* `Override` entities.
*   [ ] **Text Mapping:** Changing "Traço" color on a Text entity updates the font color. Changing "Preenchimento" updates the background box.
*   [ ] **Persistence:** Saving and reloading a project preserves all `ByLayer`/`Override` states and custom colors.
*   [ ] **Undo/Redo:** Undo correctly reverts style changes (Source and Color values).

## 6. Risks & Rollback

-   **Persistence Risk:** Once a project is saved with V4 Snapshots (Style Store), it cannot be opened by older versions.
    -   *Mitigation:* This is a standard forward-migration. No backward compatibility is promised for development builds.
-   **Rollback Strategy:**
    -   **UI:** Can be disabled via Feature Flag (hiding Ribbon group).
    -   **Engine:** Code removal is complex. If feature is abandoned, the `Resolver` can be hardcoded to always return Layer colors, effectively disabling the logic while keeping data structures.
