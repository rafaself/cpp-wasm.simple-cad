# SRP Phase 4: Eliminate Known Violations

**Objective**: Reduce ALL files below mandatory thresholds (C++ ≤800 LOC, TS/TSX ≤600 LOC)

**Current Violations**: 10 files totaling ~10,440 LOC over limits

---

## Priority Order

| Priority | File | Current | Target | Reduction | Risk |
|----------|------|---------|--------|-----------|------|
| P0 | `engine.cpp` | 3001 | ≤800 | 2201 | HIGH |
| P1 | `text_layout.cpp` | 1291 | ≤800 | 491 | MEDIUM |
| P1 | `TextTool.ts` | 1003 | ≤600 | 403 | MEDIUM |
| P2 | `vector_tessellation.cpp` | 820 | ≤800 | 20 | LOW |
| P2 | `snapshot.cpp` | 811 | ≤800 | 11 | LOW |
| P2 | `dxfToShapes.ts` | 781 | ≤600 | 181 | LOW |
| P2 | `pdfToShapes.ts` | 776 | ≤600 | 176 | LOW |
| P3 | `textBridge.ts` | 686 | ≤600 | 86 | LOW |
| P3 | `pdfToVectorDocument.ts` | 663 | ≤600 | 63 | LOW |
| P3 | `TextInputCoordinator.ts` | 608 | ≤600 | 8 | LOW |

---

## Phase 4.1: Engine Core Split (P0)

**Target**: `engine.cpp` 3001 → ≤800 LOC (extract ~2200 LOC)

### Analysis of engine.cpp Contents

After prior extractions, engine.cpp still contains:
1. **UTF-8 helpers** (~50 LOC) - `logicalToByteIndex`, `byteToLogicalIndex`
2. **Geometry helpers** (~30 LOC) - `pointToSegmentDistanceSq`
3. **Hash/digest functions** (~50 LOC) - FNV-1a hashing
4. **Entity visibility** (~20 LOC) - `isEntityVisibleForRenderThunk`
5. **Constructor/destructor** (~50 LOC)
6. **Memory management** (~20 LOC) - `allocBytes`, `freeBytes`
7. **Snapshot load/save wrappers** (~200 LOC)
8. **Command buffer processing** (~300 LOC)
9. **Undo/redo wrappers** (~50 LOC)
10. **Layer management** (~150 LOC)
11. **Entity property setters** (~200 LOC)
12. **Render buffer generation** (~800 LOC) - `rebuildBuffers`, tessellation calls
13. **Selection wrappers** (~50 LOC)
14. **View/snap management** (~100 LOC)
15. **Event system** (~100 LOC)
16. **Determinism digest** (~150 LOC)
17. **Overlay queries** (~200 LOC)
18. **Text system integration** (~200 LOC)

### PR 4.1.1: Extract Render System (C++)

**Branch**: `refactor/phase4-render-system`
**Effort**: 1-2 days
**Risk**: HIGH (hot path)

#### Tasks

- [ ] **Create** `cpp/engine/render_system.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  #include <vector>
  
  class EntityManager;
  class TextSystem;
  class PickSystem;
  
  class RenderSystem {
  public:
      RenderSystem(EntityManager& em, TextSystem& ts, PickSystem& ps);
      
      void rebuildBuffers(
          std::vector<float>& triangleVertices,
          std::vector<float>& lineVertices,
          float viewScale,
          const std::function<bool(uint32_t)>& isVisible
      );
      
      void rebuildGrid(
          std::vector<float>& gridVertices,
          float viewScale, float gridSize,
          float minX, float minY, float maxX, float maxY
      );
      
  private:
      EntityManager& entityManager_;
      TextSystem& textSystem_;
      PickSystem& pickSystem_;
  };
  ```

- [ ] **Create** `cpp/engine/render_system.cpp`

  Move from `engine.cpp`:
  - `rebuildBuffers()` implementation (~400 LOC)
  - Entity tessellation dispatch
  - Grid line generation
  - Text quad integration

- [ ] **Update CMakeLists.txt**

- [ ] **Update engine.cpp** - delegate to `renderSystem_`

- [ ] **Build and test**
  ```bash
  make fbuild && cd cpp/build_native && ctest -R render
  ```

**Expected Reduction**: ~500 LOC

---

### PR 4.1.2: Extract View Manager (C++)

**Branch**: `refactor/phase4-view-manager`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `cpp/engine/view_manager.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  
  struct ViewState {
      float x{0}, y{0};
      float scale{1};
      float width{800}, height{600};
  };
  
  class ViewManager {
  public:
      void setView(float x, float y, float scale, float w, float h);
      const ViewState& getView() const;
      float getPickTolerance() const;
      
      // Snap options
      void setSnapOptions(bool enabled, bool grid, float gridSize);
      Point2 getSnappedPoint(float x, float y) const;
      
  private:
      ViewState view_;
      bool snapEnabled_{false};
      bool snapGrid_{false};
      float gridSize_{10.0f};
  };
  ```

- [ ] **Create** `cpp/engine/view_manager.cpp`

  Move from `engine.cpp`:
  - `setViewScale()` / view state
  - `setSnapOptions()` / `getSnappedPoint()`
  - Pick tolerance calculation

- [ ] **Update engine.cpp** - delegate to `viewManager_`

**Expected Reduction**: ~150 LOC

---

### PR 4.1.3: Extract Layer System (C++)

**Branch**: `refactor/phase4-layer-system`
**Effort**: 0.5 day
**Risk**: MEDIUM

#### Tasks

- [ ] **Create** `cpp/engine/layer_system.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  #include <vector>
  #include <string>
  
  class LayerSystem {
  public:
      void setLayerProps(uint32_t layerId, uint32_t propsMask, 
                         uint32_t flagsValue, const std::string& name);
      const LayerData& getLayer(uint32_t id) const;
      const std::vector<LayerData>& getAllLayers() const;
      uint32_t createLayer(const std::string& name);
      void deleteLayer(uint32_t id);
      bool isLayerVisible(uint32_t id) const;
      bool isLayerLocked(uint32_t id) const;
      
  private:
      std::vector<LayerData> layers_;
  };
  ```

- [ ] **Create** `cpp/engine/layer_system.cpp`

  Move from `engine.cpp`:
  - `setLayerProps()` (~100 LOC)
  - Layer queries
  - Layer creation/deletion

**Expected Reduction**: ~200 LOC

---

### PR 4.1.4: Extract Event System (C++)

**Branch**: `refactor/phase4-event-system`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `cpp/engine/event_system.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  #include <vector>
  
  class EventSystem {
  public:
      void pushEvent(EventType type, uint32_t entityId = 0, 
                     uint32_t extra1 = 0, uint32_t extra2 = 0);
      uint32_t pollEvents(EngineEvent* out, uint32_t maxEvents);
      void clearEvents();
      
  private:
      std::vector<EngineEvent> queue_;
      uint32_t head_{0};
      uint32_t tail_{0};
  };
  ```

- [ ] **Create** `cpp/engine/event_system.cpp`

  Move from `engine.cpp`:
  - Event queue management
  - `pushEvent()` / `pollEvents()`

**Expected Reduction**: ~150 LOC

---

### PR 4.1.5: Extract Overlay System (C++)

**Branch**: `refactor/phase4-overlay-system`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `cpp/engine/overlay_system.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  #include <vector>
  
  class EntityManager;
  class SelectionManager;
  
  class OverlaySystem {
  public:
      OverlaySystem(EntityManager& em, SelectionManager& sm);
      
      void querySelectionOverlay(OverlayQueryResult& out);
      void queryResizeHandles(uint32_t entityId, std::vector<HandleInfo>& out);
      void queryVertexHandles(uint32_t entityId, std::vector<HandleInfo>& out);
      
  private:
      EntityManager& entityManager_;
      SelectionManager& selectionManager_;
  };
  ```

- [ ] **Create** `cpp/engine/overlay_system.cpp`

  Move from `engine.cpp`:
  - `querySelectionOverlay()` (~100 LOC)
  - Handle queries (~100 LOC)

**Expected Reduction**: ~200 LOC

---

### PR 4.1.6: Extract Utility Modules (C++)

**Branch**: `refactor/phase4-utils`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `cpp/engine/string_utils.h`
  - Move UTF-8 index conversion functions

- [ ] **Create** `cpp/engine/hash_utils.h`
  - Move FNV-1a hash functions
  - Move determinism digest logic

- [ ] **Update engine.cpp** - include utils, remove inlined code

**Expected Reduction**: ~150 LOC

---

### PR 4.1 Summary

After all 4.1.x PRs:

| Extraction | LOC Moved |
|------------|-----------|
| Render System | ~500 |
| View Manager | ~150 |
| Layer System | ~200 |
| Event System | ~150 |
| Overlay System | ~200 |
| Utility Modules | ~150 |
| **Total** | ~1350 |

**Remaining in engine.cpp**: ~1650 LOC (still over, need Phase 4.1.7)

---

### PR 4.1.7: Extract Entity Facade (C++)

**Branch**: `refactor/phase4-entity-facade`
**Effort**: 1 day
**Risk**: MEDIUM

#### Tasks

- [ ] **Create** `cpp/engine/entity_facade.h`

  Thin wrappers for entity operations:
  - `setEntityFlags()`
  - `setEntityLayer()`
  - `deleteEntity()`
  - Entity property bulk setters

- [ ] Move ~400 LOC of entity manipulation code

**Final engine.cpp target**: ~800-900 LOC (thin orchestrator)

---

## Phase 4.2: Text Layout Split (P1)

**Target**: `text_layout.cpp` 1291 → ≤800 LOC

### PR 4.2.1: Extract Line Breaking (C++)

**Branch**: `refactor/phase4-line-breaking`
**Effort**: 1 day
**Risk**: MEDIUM

#### Tasks

- [ ] **Create** `cpp/engine/text/line_breaker.h`

  ```cpp
  #pragma once
  #include <vector>
  #include <string_view>
  
  namespace engine::text {
  
  struct LineBreakResult {
      uint32_t startByte;
      uint32_t byteCount;
      float width;
  };
  
  class LineBreaker {
  public:
      std::vector<LineBreakResult> breakLines(
          std::string_view content,
          float maxWidth,
          const std::vector<GlyphInfo>& glyphs
      );
      
  private:
      bool isBreakOpportunity(char32_t c) const;
      uint32_t findBreakPoint(std::string_view text, uint32_t start, uint32_t end);
  };
  
  }
  ```

- [ ] **Create** `cpp/engine/text/line_breaker.cpp`

  Move from `text_layout.cpp`:
  - Line breaking algorithm (~200 LOC)
  - Word boundary detection
  - Whitespace handling

**Expected Reduction**: ~250 LOC

---

### PR 4.2.2: Extract Hit Testing (C++)

**Branch**: `refactor/phase4-text-hit`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `cpp/engine/text/text_hit_test.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  
  namespace engine::text {
  
  class TextHitTest {
  public:
      TextHitResult hitTest(
          const TextLayout& layout,
          float localX, float localY
      );
      
      uint32_t getCharIndexAtPoint(
          const TextLayout& layout,
          float x, float y
      );
      
  private:
      uint32_t findLineAtY(const TextLayout& layout, float y);
      uint32_t findCharInLine(const LayoutLine& line, float x);
  };
  
  }
  ```

- [ ] **Create** `cpp/engine/text/text_hit_test.cpp`

  Move from `text_layout.cpp`:
  - `hitTestText()` implementation
  - Character index lookup
  - Line/glyph binary search

**Expected Reduction**: ~200 LOC

---

### PR 4.2.3: Extract Selection Geometry (C++)

**Branch**: `refactor/phase4-text-selection`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `cpp/engine/text/selection_geometry.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  #include <vector>
  
  namespace engine::text {
  
  class SelectionGeometry {
  public:
      std::vector<TextSelectionRect> getSelectionRects(
          const TextLayout& layout,
          uint32_t startChar, uint32_t endChar
      );
      
      TextCaretPosition getCaretPosition(
          const TextLayout& layout,
          uint32_t charIndex
      );
      
  private:
      void addRectForRange(/* params */);
  };
  
  }
  ```

- [ ] **Create** `cpp/engine/text/selection_geometry.cpp`

  Move from `text_layout.cpp`:
  - `getTextSelectionRects()` (~100 LOC)
  - `getTextCaretPosition()` (~50 LOC)
  - Rectangle merging logic

**Expected Reduction**: ~200 LOC

---

### PR 4.2 Summary

After all 4.2.x PRs:

| Extraction | LOC Moved |
|------------|-----------|
| Line Breaker | ~250 |
| Hit Testing | ~200 |
| Selection Geometry | ~200 |
| **Total** | ~650 |

**Remaining in text_layout.cpp**: ~640 LOC ✓

---

## Phase 4.3: TextTool Split (P1)

**Target**: `TextTool.ts` 1003 → ≤600 LOC

### PR 4.3.1: Extract State Manager (TS)

**Branch**: `refactor/phase4-texttool-state`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `frontend/engine/tools/text/TextToolState.ts`

  ```typescript
  export interface TextToolState {
    mode: 'idle' | 'creating' | 'editing';
    activeTextId: number | null;
    boxMode: TextBoxMode;
    constraintWidth: number;
    caretIndex: number;
    selectionStart: number;
    selectionEnd: number;
    anchorX: number;
    anchorY: number;
    rotation: number;
  }
  
  export class TextToolStateManager {
    private state: TextToolState;
    private callbacks: TextToolCallbacks;
    
    constructor(callbacks: TextToolCallbacks);
    
    getState(): TextToolState;
    setState(partial: Partial<TextToolState>): void;
    
    transitionToIdle(): void;
    transitionToCreating(x: number, y: number): void;
    transitionToEditing(textId: number): void;
    
    updateCaret(index: number): void;
    updateSelection(start: number, end: number): void;
  }
  ```

- [ ] Move state management logic from TextTool.ts

**Expected Reduction**: ~150 LOC

---

### PR 4.3.2: Extract Navigation Handler (TS)

**Branch**: `refactor/phase4-texttool-nav`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `frontend/engine/tools/text/TextNavigation.ts`

  ```typescript
  export class TextNavigation {
    constructor(private bridge: TextBridge);
    
    // Arrow key navigation
    moveLeft(textId: number, caret: number, shift: boolean): NavigationResult;
    moveRight(textId: number, caret: number, shift: boolean): NavigationResult;
    moveUp(textId: number, caret: number, shift: boolean): NavigationResult;
    moveDown(textId: number, caret: number, shift: boolean): NavigationResult;
    
    // Word/line navigation
    moveWordLeft(textId: number, caret: number): number;
    moveWordRight(textId: number, caret: number): number;
    moveLineStart(textId: number, caret: number): number;
    moveLineEnd(textId: number, caret: number): number;
    
    // Selection
    selectAll(textId: number): { start: number; end: number };
    selectWord(textId: number, caret: number): { start: number; end: number };
  }
  ```

- [ ] Move navigation logic from TextTool.ts `handleSpecialKey()`

**Expected Reduction**: ~150 LOC

---

### PR 4.3.3: Slim Down TextInputCoordinator (TS)

**Branch**: `refactor/phase4-coordinator-slim`
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `frontend/engine/tools/text/SelectionDrag.ts`

  Extract multi-click and drag selection logic:
  - Double-click word select
  - Triple-click line select
  - Drag selection

- [ ] Update `TextInputCoordinator.ts` to use `SelectionDrag`

**Expected Reduction from TextInputCoordinator**: ~100 LOC (608 → ~500)

---

### PR 4.3 Summary

After all 4.3.x PRs:

| Extraction | LOC Moved |
|------------|-----------|
| State Manager | ~150 |
| Navigation | ~150 |
| Selection Drag | ~100 |
| **Total** | ~400 |

**Remaining in TextTool.ts**: ~600 LOC ✓
**Remaining in TextInputCoordinator.ts**: ~500 LOC ✓

---

## Phase 4.4: Low-Hanging Fruit (P2)

### PR 4.4.1: Slim vector_tessellation.cpp

**Target**: 820 → ≤800 LOC (need -20)
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] Extract `QuadWork` struct and bezier helpers to `cpp/engine/bezier_utils.h`
- [ ] Move ~50 LOC of helper functions

---

### PR 4.4.2: Slim snapshot.cpp

**Target**: 811 → ≤800 LOC (need -11)
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] Extract `fourCC` macro and constants to `cpp/engine/snapshot_constants.h`
- [ ] Move CRC32 implementation to `cpp/engine/hash_utils.h` (reuse from 4.1.6)

---

### PR 4.4.3: Split dxfToShapes.ts

**Target**: 781 → ≤600 LOC
**Effort**: 1 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `frontend/features/import/utils/dxf/entityConverters.ts`

  Move entity conversion functions:
  - `convertLine()`, `convertArc()`, `convertCircle()`
  - `convertPolyline()`, `convertSpline()`
  - `convertText()`, `convertMText()`
  - `convertInsert()` (block references)

- [ ] **Create** `frontend/features/import/utils/dxf/unitResolver.ts`

  Move:
  - `DXF_UNITS` constant
  - Unit detection heuristics
  - Scale computation

- [ ] Keep `dxfToShapes.ts` as orchestrator (~300 LOC)

**Expected Reduction**: ~400 LOC

---

### PR 4.4.4: Split pdfToShapes.ts

**Target**: 776 → ≤600 LOC
**Effort**: 1 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `frontend/features/import/utils/pdf/pathBuilder.ts`

  Move path construction logic:
  - `moveTo`, `lineTo`, `curveTo` handling
  - Path closing and stroking

- [ ] **Create** `frontend/features/import/utils/pdf/colorUtils.ts`

  Move:
  - `formatColor()`
  - Color space conversions (CMYK, RGB, grayscale)

- [ ] Keep `pdfToShapes.ts` as orchestrator (~400 LOC)

**Expected Reduction**: ~300 LOC

---

## Phase 4.5: Final Cleanup (P3)

### PR 4.5.1: Slim textBridge.ts

**Target**: 686 → ≤600 LOC
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] **Create** `frontend/engine/bridge/textStyleSync.ts`

  Extract style synchronization methods:
  - `applyTextStyle()`
  - `getTextStyleSnapshot()`
  - Style delta computation

**Expected Reduction**: ~100 LOC

---

### PR 4.5.2: Slim pdfToVectorDocument.ts

**Target**: 663 → ≤600 LOC
**Effort**: 0.5 day
**Risk**: LOW

#### Tasks

- [ ] Extract page processing loop to separate function
- [ ] Move coordinate transformation helpers

**Expected Reduction**: ~80 LOC

---

## Execution Timeline

| Week | PRs | Files Addressed |
|------|-----|-----------------|
| 1 | 4.1.1-4.1.3 | engine.cpp (partial) |
| 2 | 4.1.4-4.1.7 | engine.cpp (complete) |
| 3 | 4.2.1-4.2.3 | text_layout.cpp |
| 4 | 4.3.1-4.3.3 | TextTool.ts, TextInputCoordinator.ts |
| 5 | 4.4.1-4.4.4 | tessellation, snapshot, DXF, PDF |
| 6 | 4.5.1-4.5.2 | textBridge, pdfToVectorDocument |

---

## Success Criteria

After Phase 4 completion:

```bash
./scripts/check-file-size.sh
# Expected: 0 errors, reduced warnings
```

All files must be:
- C++ engine: ≤800 LOC
- TS/TSX: ≤600 LOC
- No known violations remaining

---

## Risk Mitigation

### For engine.cpp (HIGH RISK)

1. **Incremental PRs** - Each extraction is a separate PR
2. **Performance baselines** - Run perf tests after each PR
3. **Feature flags** - Keep old code path available for rollback
4. **Manual testing** - Full app walkthrough after each merge

### For text_layout.cpp (MEDIUM RISK)

1. **Text rendering tests** - Verify glyph positions unchanged
2. **Selection tests** - Verify hit testing accuracy
3. **Unicode tests** - Test with multi-byte characters

### For Import utilities (LOW RISK)

1. **Integration tests** - Import sample DXF/PDF files
2. **Visual comparison** - Before/after screenshots

---

## Tracking Table

| PR | Status | Started | Completed | Notes |
|----|--------|---------|-----------|-------|
| 4.1.1 Render System | ⬜ | | | |
| 4.1.2 View Manager | ⬜ | | | |
| 4.1.3 Layer System | ⬜ | | | |
| 4.1.4 Event System | ⬜ | | | |
| 4.1.5 Overlay System | ⬜ | | | |
| 4.1.6 Utility Modules | ⬜ | | | |
| 4.1.7 Entity Facade | ⬜ | | | |
| 4.2.1 Line Breaker | ⬜ | | | |
| 4.2.2 Text Hit Test | ⬜ | | | |
| 4.2.3 Selection Geometry | ⬜ | | | |
| 4.3.1 TextTool State | ⬜ | | | |
| 4.3.2 Text Navigation | ⬜ | | | |
| 4.3.3 Selection Drag | ⬜ | | | |
| 4.4.1 vector_tessellation | ⬜ | | | |
| 4.4.2 snapshot | ⬜ | | | |
| 4.4.3 dxfToShapes | ⬜ | | | |
| 4.4.4 pdfToShapes | ⬜ | | | |
| 4.5.1 textBridge | ⬜ | | | |
| 4.5.2 pdfToVectorDocument | ⬜ | | | |

**Legend**: ⬜ Not Started | 🟡 In Progress | ✅ Complete | ❌ Blocked
