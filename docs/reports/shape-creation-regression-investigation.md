# Investigation Report: Shape Creation Regression After Color Management

## Executive Summary

**Issue**: Shapes cannot be created after implementing Color Management (stroke/fill, ByLayer/Custom, engine-first approach), while text creation still works.

**Root Cause**: THREE bugs were identified:

1. **Critical: Command Version Mismatch** (`frontend/engine/core/runtime/DraftSystem.ts:98`): The DraftSystem was sending command buffers with version `2`, but the engine was updated to require version `3`. This caused ALL `UpdateDraft` and `AppendDraftPoint` commands to be **silently rejected** with `UnsupportedVersion` error.

2. **Phantom Entity Removed from DrawOrder** (`cpp/engine/interaction/interaction_draft.cpp`): The phantom entity was explicitly removed from `drawOrderIds`, preventing it from being rendered in the normal render loop.

3. **Missing Style Overrides**: The phantom entity didn't have `EntityStyleOverrides` set up, causing the style resolution system to return layer defaults instead of the entity's actual colors.

**Impact**: All shape drafting tools (line, rect, circle, polygon, polyline, arrow) fail to show preview during creation and fail to commit.

---

## Timeline

| Commit | Description |
|--------|-------------|
| `d410e24` | Last known good (main branch) |
| `23c499c` | Color management feature (`feat/colors-management`) - regression introduced |

---

## Observed Behavior Matrix

| Tool | Pointer Down | Pointer Move | Pointer Up | Expected |
|------|-------------|--------------|------------|----------|
| Line | Starts | No preview | Commits? | Preview visible |
| Rectangle | Starts | No preview | Commits? | Preview visible |
| Circle | Starts | No preview | Commits? | Preview visible |
| Polygon | Starts | No preview | Commits? | Preview visible |
| Polyline | Starts | No preview | No preview | Preview visible |
| Arrow | Starts | No preview | Commits? | Preview visible |
| Text | Works | Works | Works | Works |

---

## Architecture Analysis

### Shape Creation Pipeline (Broken)

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ DraftingHandler  │────▶│  runtime.apply()    │────▶│  C++ Engine      │
│ (TypeScript)     │     │  [BeginDraft cmd]   │     │  beginDraft()    │
└──────────────────┘     └─────────────────────┘     └──────────────────┘
                                                              │
                                                              ▼
                         ┌─────────────────────┐     ┌──────────────────┐
                         │  upsertPhantomEntity │────▶│ entityManager_   │
                         │  (creates phantom)  │     │ .upsertRect()    │
                         └─────────────────────┘     └──────────────────┘
                                                              │
                                                              ▼
                         ┌─────────────────────┐     ┌──────────────────┐
                         │  REMOVED from       │────▶│ drawOrderIds     │
                         │  drawOrderIds       │     │ (phantom gone)   │
                         └─────────────────────┘     └──────────────────┘
                                                              │
                                                              ▼
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ rebuildRender    │────▶│  for id in ordered  │     │ PHANTOM NOT IN   │
│ Buffers()        │     │  (drawOrderIds)     │     │ THIS LOOP!       │
└──────────────────┘     └─────────────────────┘     └──────────────────┘
                                                              │
                                                              ▼
                         ┌─────────────────────┐     ┌──────────────────┐
                         │ appendDraftLine     │────▶│ lineVertices     │
                         │ Vertices()          │     │ (outline only)   │
                         └─────────────────────┘     └──────────────────┘
```

### Text Creation Pipeline (Working)

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│ TextHandler      │────▶│  TextTool           │────▶│  C++ TextSystem  │
│ (TypeScript)     │     │  handleClick()      │     │  (separate)      │
└──────────────────┘     └─────────────────────┘     └──────────────────┘
                                                              │
                                                              ▼
                         ┌─────────────────────┐     ┌──────────────────┐
                         │  Text rendered via  │────▶│  MSDF atlas      │
                         │  TextSystem         │     │  (not phantom)   │
                         └─────────────────────┘     └──────────────────┘
```

---

## Root Cause Analysis

### Bug 1: Phantom Entity Not Rendered to triangleVertices

**Location**: `cpp/engine/interaction/interaction_draft.cpp:293-301`

```cpp
// Remove phantom entity from draw order - it should not be included in normal draw order
// (it's rendered separately, at the end, on top of all other entities)
auto& drawOrder = entityManager_.drawOrderIds;
for (auto it = drawOrder.begin(); it != drawOrder.end(); ++it) {
    if (*it == phantomId) {
        drawOrder.erase(it);
        break;
    }
}
```

The comment says "it's rendered separately", but this separate rendering **never happens** for filled triangles. Only `appendDraftLineVertices()` is called, which adds LINE outlines, not filled shapes.

**Location**: `cpp/engine/impl/engine_render.cpp:157-180`

```cpp
void CadEngine::rebuildRenderBuffers() const {
    engine::rebuildRenderBuffers(
        // ... iterates over drawOrderIds ONLY
    );

    interactionSession_.appendDraftLineVertices(lineVertices);  // Only LINE outlines!
    // MISSING: phantom entity triangle rendering
}
```

### Bug 2: Missing Style Overrides for Phantom Entity

**Location**: `cpp/engine/impl/engine_upsert.cpp:5-19`

```cpp
namespace {
    void initShapeStyleOverrides(EntityManager& em, std::uint32_t id, bool hasFill, bool hasStroke, float fillEnabled) {
        EntityStyleOverrides& overrides = em.ensureEntityStyleOverrides(id);
        // Sets up overrides for style resolution
    }
}
```

This function is called for committed entities via `engine_.upsertRect()`, but NOT for phantom entities via `entityManager_.upsertRect()`.

**Location**: `cpp/engine/entity/entity_manager.cpp:548-562` (resolveStyle)

```cpp
ResolvedStyle EntityManager::resolveStyle(std::uint32_t id, EntityKind kind) const {
    // ...
    const EntityStyleOverrides* overrides = getEntityStyleOverrides(id);
    if (!overrides) {
        return resolved;  // Returns layer defaults, NOT entity colors!
    }
    // ...
}
```

Without style overrides, the phantom entity would render with layer default colors (white stroke, gray fill) instead of user-selected colors.

---

## Evidence Summary

### Top 5 Suspicious Diffs

| # | File | Function/Change | Why It Could Break Shapes |
|---|------|-----------------|---------------------------|
| 1 | `render.cpp:554` | Added `resolveStyle` callback | Phantom has no overrides → wrong colors |
| 2 | `engine_render.cpp:14-29` | `resolveStyleForRenderThunk` | Returns layer defaults for phantom |
| 3 | `engine_upsert.cpp:5-19` | `initShapeStyleOverrides` | Only called for committed entities, not phantom |
| 4 | `entity_manager.cpp:548` | `resolveStyle` returns early | No overrides = layer defaults |
| 5 | `interaction_draft.cpp:293` | Phantom removed from drawOrderIds | Never rendered to triangleVertices |

### Hypothesis Verification

| # | Hypothesis | Evidence For | Evidence Against | Verdict |
|---|------------|--------------|------------------|---------|
| 1 | Command schema mismatch | N/A | BeginDraft unchanged | **REJECTED** |
| 2 | Default style invalid | Style resolution returns layer defaults | Layer defaults are valid colors | Partial |
| 3 | Layer/style lookup failure | N/A | Layer exists, lookup succeeds | **REJECTED** |
| 4 | Drafting state machine broken | N/A | Draft state correctly managed | **REJECTED** |
| 5 | Phantom not rendered | Phantom removed from drawOrderIds | N/A | **CONFIRMED** |
| 6 | Style resolution wrong colors | No EntityStyleOverrides for phantom | N/A | **CONFIRMED** |

---

## Impacted Files

### C++ Engine

| File | Lines | Impact |
|------|-------|--------|
| `cpp/engine/interaction/interaction_draft.cpp` | 208-301 | Phantom entity creation/removal |
| `cpp/engine/impl/engine_render.cpp` | 157-180 | Missing phantom triangle rendering |
| `cpp/engine/render/render.cpp` | 554-619 | Style resolution callback added |
| `cpp/engine/entity/entity_manager.cpp` | 548-650 | resolveStyle implementation |
| `cpp/engine/impl/engine_upsert.cpp` | 5-60 | initShapeStyleOverrides only for committed |

### Frontend (No changes needed)

The frontend correctly sends BeginDraft/UpdateDraft/CommitDraft commands. The bug is entirely in the C++ engine rendering.

---

## Why Text Still Works

Text uses a completely separate pipeline:

1. **No phantom entity system**: Text is created immediately via `TextTool.handleClick()` → engine `upsertText()`
2. **Different rendering path**: Text uses MSDF atlas rendering through `TextSystem`, not shape triangles
3. **Style overrides applied differently**: `applyTextStyleDefaults()` calls `SetEntityStyleOverride` commands with `StyleTarget.TextColor`/`StyleTarget.TextBackground`
4. **No drawOrderIds dependency**: Text entities are rendered through the text system, not the shape render loop

---

## Commit Hash Reference

- **Regression Commit**: `23c499cf2f1fc58da1dc79c0d7bb962f7d001a2c`
- **Parent (Good)**: `d410e24`
- **Files Changed**: 58 files, +3209/-193 lines
