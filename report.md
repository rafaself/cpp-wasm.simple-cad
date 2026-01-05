# Architecture & UX Report: Engine-First Colors

## Executive Summary
This report defines the architecture for implementing a robust, Engine-First Color System (Stroke & Fill) for the CAD application. The proposed solution shifts the "Source of Truth" for styling entirely to the C++ Engine, ensuring consistency, performance, and simplified state management. It introduces a **Non-Destructive Override Model**, allowing users to toggle between "ByLayer" and "Custom" styles without data loss. The UI becomes a reactive reflection of the Engine's state, adhering to the project's strict architectural boundaries.

---

## 1. Findings & Current State

### 1.1 Current Architecture
- **State Split:** Currently, `Layer` objects in the React Store (`useDataStore`) hold style data (`strokeColor`, `fillColor`), while the C++ Engine (`LayerRecord`) only holds structural flags (`Visible`, `Locked`).
- **Baked Geometry:** Entities in C++ (`RectRec`, `LineRec`) store "baked" RGBA values. The Engine does not know *why* a line is red (ByLayer vs. Override); it just knows it is red.
- **UI Logic:** The frontend is responsible for resolving colors before sending geometry to the engine. This violates the "Engine-First" principle and creates synchronization debt.
- **Ribbon:** The "Desenho" tab currently lacks a dedicated Colors section. Layer controls are mixed with general properties.

### 1.2 Identified Gaps
- **Lack of Engine Style Model:** The C++ protocol lacks concepts of "ByLayer" or "Style Source".
- **Destructive Updates:** Currently, changing a color directly mutates the geometry's baked color, losing the semantic link to the Layer.
- **Sync Overhead:** Logic to propagate Layer color changes to Entities currently lives (or would have to live) in the JavaScript runtime, which is performantly expensive (O(N) updates).

---

## 2. Proposed Architecture (Engine-First)

### 2.1 Core Concept: The Style System (C++)
We will introduce a dedicated `StyleSystem` within the C++ Engine. This system manages the relationship between Layer Defaults and Entity Overrides.

**Key Components:**
1.  **Layer Style State (C++):**
    - Extends `LayerRecord` to include `strokeColor`, `fillColor`, `strokeWidth`.
2.  **Entity Style State (C++):**
    - Stores **Semantic Intent** rather than just pixels.
    - Fields:
        - `strokeSource`: `ByLayer` | `Override`
        - `fillSource`: `ByLayer` | `Override` | `None`
        - `strokeOverride`: RGBA (Persistent storage)
        - `fillOverride`: RGBA (Persistent storage)
3.  **The Resolver (C++):**
    - A system that runs when (a) Layer properties change or (b) Entity style properties change.
    - It computes the final "Baked" RGBA values used by the Renderer.
    - **Logic:** `FinalColor = (Source == ByLayer) ? Layer.Color : Entity.OverrideColor`.

### 2.2 Data Flow
1.  **UI Action:** User picks "Red" in Ribbon.
2.  **Command:** Frontend sends `SetEntityStyleOverride(ids, { stroke: 'red' })`.
3.  **Engine Update:**
    - Updates `strokeSource` to `Override`.
    - Updates `strokeOverride` to `red`.
    - Triggers `Resolver` -> Updates `RectRec.sr/sg/sb/sa`.
    - Emits `EntityChanged` event.
4.  **UI Sync:** Frontend receives event, updates Ribbon UI to show "Red" (Custom).

### 2.3 Modular "Plugin" Approach
To ensure low technical debt and ease of removal:
- **Frontend:** New features will live in `frontend/features/editor/components/ribbon/ColorControls.tsx`.
- **State:** A new `useSelectionStyle` hook will aggregate engine state for the UI, isolating logic from the main `useDataStore`.
- **Engine:** The `StyleSystem` will be a distinct module in C++, integrated via the `EntityManager` but logically separate.

---

## 3. API Contract Proposal

### 3.1 New C++ / Protocol Types
```cpp
// Added to protocol_types.h

enum class StyleSource : uint32_t {
    ByLayer = 0,
    Override = 1,
    None = 2 // For Fill only
};

struct LayerStyleCmd {
    uint32_t layerId;
    float strokeR, strokeG, strokeB, strokeA;
    float fillR, fillG, fillB, fillA;
    float strokeWidth;
};

struct EntityStyleCmd {
    uint32_t entityId;
    StyleSource strokeSource;
    StyleSource fillSource;
    // Overrides are sent even if Source=ByLayer (for non-destructive editing)
    float strokeR, strokeG, strokeB, strokeA;
    float fillR, fillG, fillB, fillA;
};
```

### 3.2 New Commands (WASM Exports)
| Command | Parameters | Description |
| :--- | :--- | :--- |
| `setLayerStyle` | `id, strokeColor, fillColor, width` | Updates layer defaults + triggers cascading resolve for "ByLayer" entities. |
| `setEntityStyle` | `ids[], strokeSource, fillSource, strokeColor, fillColor` | Updates entity semantic style + resolves immediate visual. |
| `getSelectionStyle` | `none` | Returns a simplified "Summary" of the current selection (Mixed, Single, ByLayer, etc.) for UI. |

---

## 4. UI State Model

### 4.1 Ribbon "Active" States
The Ribbon controls must reflect the *collective* state of the selection (or active tool).

| Scenario | State | Icon / UI | Tooltip (PT-BR) | Engine Mapping |
| :--- | :--- | :--- | :--- | :--- |
| **Single Item (ByLayer)** | `Inherited` | 🔗 Icon + Layer Color Swatch | "Cor herdada da camada 'Paredes'" | `source=ByLayer` |
| **Single Item (Override)** | `Custom` | 🔓 Icon + Custom Color Swatch | "Cor personalizada do elemento" | `source=Override` |
| **Single Item (No Fill)** | `None` | 🚫 Icon | "Sem preenchimento" | `source=None` |
| **Multi (Same State)** | *(Matches Single)* | *(Matches Single)* | *(Matches Single)* | All match |
| **Multi (Mixed Colors)** | `Mixed` | ❓ / "Vários" | "Múltiplos valores" | `Mixed` detected |

### 4.2 Interaction Logic (Priority)
1.  **Has Selection?** -> Apply to **Selected Entities** (Set `Override`).
2.  **Tool Active?** -> Set **Tool Default** (Set `NextShape` style).
3.  **Nothing?** -> Update **Active Layer** (Set `Layer` defaults).

---

## 5. Action Plan

### Phase 1: C++ Core (The Engine)
*   [ ] **Refactor `LayerRecord`:** Add color/style fields to `LayerStore`.
*   [ ] **Create `StyleSystem`:** Implement the "Source/Override" logic and "Resolver".
*   [ ] **Update `Entity` Structs:** Add sidecar storage for `StyleSource` and `OverrideColors` (or extend existing structs if memory permits).
*   [ ] **Update `upsert`:** Ensure new entities go through the `Resolver` on creation.
*   [ ] **Persistence:** Update Snapshot read/write to include style data (Version bump).

### Phase 2: Protocol & Bridge
*   [ ] **Protocol Update:** Update `protocol_types.h` and TypeScript `protocol.ts` (ABI Hash).
*   [ ] **Expose Commands:** Implement `setLayerStyle` and `setEntityStyle` in `CadEngine` class.
*   [ ] **Query API:** Implement `getSelectionStyleState` in C++ to avoid expensive JS-side loop.

### Phase 3: Frontend Integration
*   [ ] **`EngineRuntime` Update:** Add wrapper methods for new style commands.
*   [ ] **Hook `useSelectionStyle`:** Create a hook that listens to `SelectionChanged` and calls `getSelectionStyleState`.
*   [ ] **Purge Legacy:** Remove color resolution logic from `dxfToShapes` (move to engine) or ensure it sets correct Flags.

### Phase 4: UI Components
*   [ ] **Component `ColorPickerButton`:** A generic dropdown with "By Layer", "Transparent", and Color Palette.
*   [ ] **Component `ColorsRibbonGroup`:** The container for Stroke/Fill controls.
*   [ ] **Integration:** Add to `ribbonConfig.ts` in "Desenho" tab.

---

## 6. Risks & Mitigations
| Risk | Mitigation |
| :--- | :--- |
| **Performance (Cascading Updates)** | When Layer color changes, O(N) entities might need updates. **Mitigation:** C++ `StyleSystem` should index entities by LayerId to optimize the loop (avoid full scan). |
| **Memory Overhead** | Storing overrides for every entity increases memory. **Mitigation:** Use a "Style ID" flyweight pattern or only allocate override storage for entities that actually have overrides (Sparse Map). *For now, direct storage is acceptable given entity count limits.* |
| **Rollback Complexity** | C++ Struct changes break snapshots. **Mitigation:** Bump `SNAPSHOT_VERSION`. Implement legacy loader in `engine_snapshot.cpp` to migrate V1/V2 snapshots to V3 (add default styles). |

## 7. Rollback Strategy
- The feature is additive to the Engine (new fields).
- **If removal is needed:**
    1.  Revert `EditorRibbon` config to hide the "Colors" group.
    2.  Engine fields can remain (dormant) or be stripped in a future refactor.
    3.  Frontend logic for "ByLayer" can simply default to "Override" behavior if the UI is removed.
