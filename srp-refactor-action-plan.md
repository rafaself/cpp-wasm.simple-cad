# SRP Refactor — Execution Action Plan

**Reference**: [srp-refactor-plan.md](./srp-refactor-plan.md)  
**Start Date**: \***\*\_\*\***  
**Owner**: \***\*\_\*\***

---

## Pre-Flight Checklist

Before starting any refactoring work:

- [ ] All tests passing (`make fbuild && cd cpp/build_native && ctest && cd ../../frontend && pnpm test`)
- [ ] Create baseline branch: `git checkout -b refactor/srp-baseline`
- [ ] Document current LOC counts (run `scripts/loc-report.sh` after creating it)
- [ ] Ensure no pending PRs that will conflict with engine.cpp or TextTool.ts
- [ ] Notify team about refactoring timeline

---

## Phase 0: Preparation

### PR 0.1: Governance Documentation + Baseline

**Branch**: `refactor/phase0-governance`

#### Tasks

- [ ] **Create LOC report script**

  ```bash
  # Create scripts/loc-report.sh
  mkdir -p scripts
  ```

  File content:

  ```bash
  #!/bin/bash
  echo "=== C++ Engine Files ==="
  find cpp/engine -name "*.cpp" -o -name "*.h" | xargs wc -l | sort -rn | head -20
  echo ""
  echo "=== Frontend Engine Files ==="
  find frontend/engine -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20
  echo ""
  echo "=== Editor Components ==="
  find frontend/features/editor -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20
  echo ""
  echo "=== Files Exceeding Thresholds ==="
  echo "C++ > 800 LOC:"
  find cpp/engine -name "*.cpp" | while read f; do
    loc=$(wc -l < "$f")
    [ $loc -gt 800 ] && echo "  ❌ $f: $loc"
  done
  echo "TS/TSX > 600 LOC:"
  find frontend -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print | while read f; do
    loc=$(wc -l < "$f")
    [ $loc -gt 600 ] && echo "  ❌ $f: $loc"
  done
  ```

- [ ] **Run baseline report**

  ```bash
  chmod +x scripts/loc-report.sh
  ./scripts/loc-report.sh > docs/agents/loc-baseline-$(date +%Y%m%d).txt
  ```

- [ ] **Update AGENTS.md** — Add governance section (append to existing file):

  ```markdown
  ## 14. Code Size Governance

  | Area       | Review    | Mandatory Split |
  | ---------- | --------- | --------------- |
  | C++ engine | > 450 LOC | > 800 LOC       |
  | TS/TSX     | > 350 LOC | > 600 LOC       |
  | Functions  | > 80 LOC  | > 120 LOC       |

  See `docs/agents/srp-refactor-plan.md` for detailed rules.
  ```

- [ ] **Commit and PR**
  ```bash
  git add scripts/loc-report.sh docs/agents/ AGENTS.md
  git commit -m "chore: add code size governance and baseline report"
  git push -u origin refactor/phase0-governance
  ```

#### Definition of Done

- [ ] Script runs without errors
- [ ] Baseline report saved
- [ ] AGENTS.md updated
- [ ] PR merged

---

### PR 0.2: Test Coverage Baseline

**Branch**: `refactor/phase0-tests`

#### Tasks

- [ ] **Run all C++ tests and verify green**

  ```bash
  cd cpp/build_native
  ctest --output-on-failure
  ```

- [ ] **Run all frontend tests and verify green**

  ```bash
  cd frontend
  pnpm test
  ```

- [ ] **Identify untested functions that will be moved** (manual review):

  - [ ] `encodeHistoryBytes` / `decodeHistoryBytes` — covered by `history_test.cpp`?
  - [ ] `setSelection` / `clearSelection` — covered by `selection_order_test.cpp`?
  - [ ] `beginTransform` / `commitTransform` — covered by `interactive_transform_perf_test.cpp`?

- [ ] **Add missing tests if any gaps found**

- [ ] **Commit and PR**
  ```bash
  git add cpp/tests/ frontend/tests/
  git commit -m "test: ensure coverage for functions being refactored"
  git push -u origin refactor/phase0-tests
  ```

#### Definition of Done

- [ ] All tests passing
- [ ] No critical untested functions in scope
- [ ] PR merged

---

## Phase 1: Low-Risk Splits

### PR 1.1: Extract History Manager (C++)

**Branch**: `refactor/phase1-history-manager`  
**Estimated Effort**: 1-2 days  
**Risk**: Medium

#### Tasks

- [ ] **Create header file** `cpp/engine/history_manager.h`

  ```cpp
  #pragma once
  #include "engine/history_types.h"
  #include "engine/types.h"
  #include <vector>
  #include <cstdint>

  class EntityManager;
  class TextSystem;

  class HistoryManager {
  public:
      HistoryManager();

      // Public API
      bool canUndo() const noexcept;
      bool canRedo() const noexcept;
      void undo(/* callbacks for applying */);
      void redo(/* callbacks for applying */);

      // Entry management
      bool beginEntry();
      void commitEntry();
      void discardEntry();

      // Change markers
      void markEntityChange(std::uint32_t id);
      void markLayerChange();
      void markDrawOrderChange();
      void markSelectionChange();

      // Serialization
      std::vector<std::uint8_t> encodeBytes() const;
      void decodeBytes(const std::uint8_t* data, std::size_t len);

      // State
      void clear();
      std::uint32_t getGeneration() const noexcept;

  private:
      std::vector<HistoryEntry> history_;
      std::size_t cursor_ = 0;
      std::uint32_t generation_ = 0;
      bool suppressed_ = false;
      // ... other state from engine.cpp
  };
  ```

- [ ] **Create implementation file** `cpp/engine/history_manager.cpp`

  - Move from `engine.cpp`:
    - `encodeHistoryBytes()` (~150 LOC)
    - `decodeHistoryBytes()` (~200 LOC)
    - `beginHistoryEntry()` / `commitHistoryEntry()` / `discardHistoryEntry()`
    - `markEntityChange()` / `markLayerChange()` / etc.
    - `pushHistoryEntry()`
    - `applyHistoryEntry()`

- [ ] **Update CMakeLists.txt**

  ```cmake
  add_library(cad_engine
      # ... existing files
      engine/history_manager.cpp
  )
  ```

- [ ] **Update engine.cpp**

  - Add `#include "engine/history_manager.h"`
  - Add member: `HistoryManager historyManager_;`
  - Replace direct history calls with `historyManager_.xxx()`
  - Keep `undo()` / `redo()` as thin wrappers that call historyManager

- [ ] **Update engine.h**

  - Forward declare HistoryManager
  - Update public interface if needed

- [ ] **Build and test**

  ```bash
  make fbuild
  cd cpp/build_native && ctest --output-on-failure -R history
  ```

- [ ] **Manual verification**

  - Open app in browser
  - Create shapes, undo, redo
  - Save/load document, verify history preserved

- [ ] **Commit**

  ```bash
  git add cpp/engine/history_manager.* cpp/CMakeLists.txt cpp/engine.cpp cpp/engine/engine.h
  git commit -m "refactor(engine): extract HistoryManager from CadEngine

  - Move history state and operations to dedicated class
  - CadEngine delegates via historyManager_ member
  - No behavioral changes

  Part of SRP refactor Phase 1"
  ```

#### Rollback Plan

```bash
git revert HEAD  # Revert the commit
# Or restore from engine.cpp.bak if you made one
```

#### Definition of Done

- [ ] `history_test.cpp` passes
- [ ] Undo/redo works in browser
- [ ] Snapshot preserves history
- [ ] engine.cpp reduced by ~600 LOC
- [ ] PR merged

---

### PR 1.2: Extract Selection Manager (C++)

**Branch**: `refactor/phase1-selection-manager`  
**Estimated Effort**: 1 day  
**Risk**: Medium

#### Tasks

- [ ] **Create header file** `cpp/engine/selection_manager.h`

  ```cpp
  #pragma once
  #include "engine/types.h"
  #include "engine/pick_system.h"
  #include <vector>
  #include <unordered_set>

  class SelectionManager {
  public:
      enum class Mode : std::uint32_t { Replace = 0, Add = 1, Remove = 2, Toggle = 3 };

      void setSelection(const std::uint32_t* ids, std::uint32_t count, Mode mode);
      void clearSelection();
      void selectByPick(const PickResult& pick, std::uint32_t modifiers);
      void marqueeSelect(float minX, float minY, float maxX, float maxY, Mode mode, int hitMode);

      const std::vector<std::uint32_t>& getOrdered() const;
      const std::unordered_set<std::uint32_t>& getSet() const;
      std::uint32_t getGeneration() const;

      void rebuildOrder(const std::vector<std::uint32_t>& drawOrder);
      void prune(/* entity existence checker */);

  private:
      std::unordered_set<std::uint32_t> set_;
      std::vector<std::uint32_t> ordered_;
      std::uint32_t generation_ = 0;
  };
  ```

- [ ] **Create implementation** `cpp/engine/selection_manager.cpp`

  - Move from `engine.cpp`:
    - `setSelection()` (~60 LOC)
    - `clearSelection()` (~10 LOC)
    - `selectByPick()` (~30 LOC)
    - `marqueeSelect()` (~30 LOC)
    - `rebuildSelectionOrder()` (~50 LOC)
    - `pruneSelection()` (~20 LOC)

- [ ] **Update CMakeLists.txt**

- [ ] **Update engine.cpp** — delegate to `selectionManager_`

- [ ] **Build and test**

  ```bash
  make fbuild
  cd cpp/build_native && ctest --output-on-failure -R selection
  ```

- [ ] **Manual verification**

  - Click to select
  - Shift+click to add
  - Ctrl+click to toggle
  - Marquee select (window and crossing)

- [ ] **Commit and PR**

#### Definition of Done

- [ ] `selection_order_test.cpp` passes
- [ ] All selection modes work in browser
- [ ] engine.cpp reduced by ~300 LOC
- [ ] PR merged

---

### PR 1.3: Split TextTool State/Navigation (TS)

**Branch**: `refactor/phase1-texttool-split`  
**Estimated Effort**: 1 day  
**Risk**: Low

#### Tasks

- [ ] **Expand TextStateManager.ts**

  Move from `TextTool.ts`:

  - `createInitialState()` function
  - State transition logic (idle → creating → editing)
  - Mode validation helpers

- [ ] **Expand TextNavigationHandler.ts**

  Move from `TextTool.ts`:

  - Arrow key handling from `handleSpecialKey()`
  - Word/line boundary navigation
  - Home/End handling

- [ ] **Update TextTool.ts**

  - Import and use `TextStateManager`
  - Import and use `TextNavigationHandler`
  - Delegate calls instead of inline logic

- [ ] **Build and test**

  ```bash
  cd frontend && pnpm build && pnpm test
  ```

- [ ] **Manual verification**

  - Click to create text
  - Drag to create fixed-width text
  - Arrow keys navigate
  - Shift+arrows select
  - Ctrl+arrows jump words

- [ ] **Commit and PR**

#### Definition of Done

- [ ] Text tool fully functional
- [ ] TextTool.ts reduced by ~300 LOC
- [ ] No runtime errors
- [ ] PR merged

---

### PR 1.4: Split Import Utilities (TS)

**Branch**: `refactor/phase1-import-utils`  
**Estimated Effort**: 0.5 day  
**Risk**: Low

#### Tasks

- [ ] **Create** `frontend/features/import/utils/dxf/entityConverters.ts`

  - Move entity-specific conversion functions (LINE, ARC, CIRCLE, etc.)

- [ ] **Create** `frontend/features/import/utils/dxf/unitResolver.ts`

  - Move `DXF_UNITS` constant
  - Move unit detection heuristics
  - Move scale factor computation

- [ ] **Update** `dxfToShapes.ts`

  - Import from new modules
  - Keep as orchestrator

- [ ] **Build and test**

  ```bash
  cd frontend && pnpm build && pnpm test -- --grep dxf
  ```

- [ ] **Manual verification**

  - Import a DXF file
  - Verify shapes appear correctly

- [ ] **Commit and PR**

#### Definition of Done

- [ ] DXF import tests pass
- [ ] Manual import works
- [ ] dxfToShapes.ts reduced to ~300 LOC
- [ ] PR merged

---

## Phase 2: Hot-Path Modules

### PR 2.1: Extract Interaction Session (C++)

**Branch**: `refactor/phase2-interaction-session`  
**Estimated Effort**: 2 days  
**Risk**: HIGH

#### Pre-Work

- [x] **Create performance baseline** _(Completed 2025-12-28)_
  ```bash
  cd cpp/build_native
  ./bin/interactive_transform_perf_test
  # Record baseline numbers
  ```

#### Tasks

- [x] **Create** `cpp/engine/interaction_session.h` _(Completed 2025-12-28)_

  ```cpp
  #pragma once
  #include "engine/types.h"

  class EntityManager;

  class InteractionSession {
  public:
      enum class Mode { None, Move, Resize, VertexDrag };

      void begin(const std::uint32_t* ids, std::uint32_t count,
                 Mode mode, std::uint32_t specificId,
                 int vertexIndex, float startX, float startY);
      void update(float worldX, float worldY);
      void commit();
      void cancel();
      bool isActive() const;

      // Draft system
      void beginDraft(/* params */);
      void updateDraft(float x, float y);
      void appendDraftPoint(float x, float y);
      void commitDraft();
      void cancelDraft();

  private:
      Mode mode_ = Mode::None;
      // ... session state
  };
  ```

- [x] **Create** `cpp/engine/interaction_session.cpp` _(Completed 2025-12-28)_

  - Move from `engine.cpp`:
    - `beginTransform()` / `updateTransform()` / `commitTransform()` / `cancelTransform()`
    - `beginDraft()` / `updateDraft()` / `commitDraft()` / `cancelDraft()`
    - Related state variables

- [x] **Update CMakeLists.txt** _(Completed 2025-12-28)_

- [x] **Update engine.cpp** — delegate to `interactionSession_` _(Completed 2025-12-28)_

- [x] **Build and test** _(Completed 2025-12-28)_

  ```bash
  make fbuild
  cd cpp/build_native && ctest --output-on-failure
  ```

- [x] **Performance verification** _(Completed 2025-12-28)_

  ```bash
  ./bin/interactive_transform_perf_test
  # Compare to baseline — must not regress > 5%
  ```

  **Result**: `InteractiveTransformPerfTest.UpdateTransformDoesNotRebuildAll` passes.

- [ ] **Manual verification** _(Pending)_

  - Move shapes (smooth dragging)
  - Resize shapes
  - Vertex drag on polylines
  - Draw rect/circle/polyline (draft system)

- [ ] **Commit and PR** _(Pending)_

#### Rollback Plan

If performance regresses:

```bash
git revert HEAD
# Analyze inlining / allocation issues before retry
```

#### Definition of Done

- [x] `interactive_transform_perf_test.cpp` passes _(Completed 2025-12-28)_
- [ ] No frame drops during drag _(Needs manual verification)_
- [ ] All draft tools work _(Needs manual verification)_
- [x] engine.cpp reduced by ~500 LOC _(Completed 2025-12-28 - reduced from ~4076 to ~3244 lines)_
- [ ] PR merged

---

### PR 2.2: Extract Command Dispatch (C++)

**Branch**: `refactor/phase2-command-dispatch`  
**Estimated Effort**: 1 day  
**Risk**: Medium

#### Tasks

- [ ] **Create** `cpp/engine/command_dispatch.h`

- [ ] **Create** `cpp/engine/command_dispatch.cpp`

  - Move `cad_command_callback` switch statement
  - Create dispatcher class or namespace

- [ ] **Update engine.cpp**

- [ ] **Build and test**

  ```bash
  make fbuild
  cd cpp/build_native && ctest --output-on-failure -R commands
  ```

- [ ] **Manual verification**

  - All entity creation commands work
  - All text commands work
  - Undo/redo after commands

- [ ] **Commit and PR**

#### Definition of Done

- [ ] `commands_test.cpp` passes
- [ ] All operations work in browser
- [ ] engine.cpp reduced by ~400 LOC
- [ ] PR merged

---

### PR 2.3: Extract TextInputCoordinator (TS)

**Branch**: `refactor/phase2-text-input-coordinator`  
**Estimated Effort**: 1 day  
**Risk**: Medium

#### Tasks

- [ ] **Create** `frontend/engine/tools/text/TextInputCoordinator.ts`

  - Move from `TextTool.ts`:
    - `handleClick()`
    - `handleDrag()`
    - `handlePointerDown()` / `handlePointerMove()` / `handlePointerUp()`
    - `handleInputDelta()`
    - Selection drag logic

- [ ] **Update TextTool.ts**

  - Create `inputCoordinator` member
  - Delegate pointer/input events

- [ ] **Build and test**

  ```bash
  cd frontend && pnpm build && pnpm test
  ```

- [ ] **Manual verification**

  - Click to create text
  - Drag to create text box
  - Click on existing text to edit
  - Type, select, delete

- [ ] **Commit and PR**

#### Definition of Done

- [ ] Text creation/editing works
- [ ] TextTool.ts reduced to ~300 LOC
- [ ] No runtime errors
- [ ] PR merged

---

## Phase 3: Normalization + Cleanup

### PR 3.1: EngineInteractionLayer Hook Extraction

**Branch**: `refactor/phase3-interaction-hooks`  
**Estimated Effort**: 1 day  
**Risk**: Medium

#### Tasks

- [ ] **Create** `usePointerRouter.ts`

  - Extract top-level event routing from component

- [ ] **Create** `useEngineSession.ts`

  - Extract `beginEngineSession`, `cancelActiveEngineSession`
  - Extract `dragRef` management

- [ ] **Create** `MarqueeOverlay.tsx` (optional)

  - Extract `selectionSvg` memo and JSX

- [ ] **Update EngineInteractionLayer.tsx**

  - Use new hooks
  - Reduce to composition + render

- [ ] **Build and test**

- [ ] **Manual verification**

  - All tools work
  - No interaction regressions

- [ ] **Commit and PR**

#### Definition of Done

- [ ] All interaction modes work
- [ ] EngineInteractionLayer.tsx reduced to ~400 LOC
- [ ] PR merged

---

### PR 3.2: CI Enforcement Activation

**Branch**: `refactor/phase3-ci-enforcement`  
**Estimated Effort**: 0.5 day  
**Risk**: Low

#### Tasks

- [ ] **Create** `scripts/check-file-size.sh`

  ```bash
  #!/bin/bash
  set -e
  ERRORS=0

  # C++ files
  for f in $(find cpp/engine -name "*.cpp"); do
    loc=$(wc -l < "$f")
    if [ $loc -gt 800 ]; then
      echo "❌ $f exceeds 800 LOC ($loc)"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # TS/TSX files
  for f in $(find frontend -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print); do
    loc=$(wc -l < "$f")
    if [ $loc -gt 600 ]; then
      echo "❌ $f exceeds 600 LOC ($loc)"
      ERRORS=$((ERRORS + 1))
    fi
  done

  if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "Found $ERRORS file(s) exceeding size limits."
    echo "See docs/agents/srp-refactor-plan.md for guidance."
    exit 1
  fi

  echo "✅ All files within size limits"
  ```

- [ ] **Create** `.github/workflows/size-check.yml`

  ```yaml
  name: Code Size Check
  on: [push, pull_request]
  jobs:
    check-sizes:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - name: Check file sizes
          run: ./scripts/check-file-size.sh
  ```

- [ ] **Update ESLint config** (if not already)

  ```js
  // eslint.config.js
  rules: {
    'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
  }
  ```

- [ ] **Test CI locally**

  ```bash
  ./scripts/check-file-size.sh
  ```

- [ ] **Commit and PR**

#### Definition of Done

- [ ] CI workflow runs on PRs
- [ ] Catches intentional violations
- [ ] PR merged

---

## Post-Refactor Checklist

After all phases complete:

- [ ] **Run final LOC report**

  ```bash
  ./scripts/loc-report.sh > docs/agents/loc-final-$(date +%Y%m%d).txt
  ```

- [ ] **Compare before/after**

  ```bash
  diff docs/agents/loc-baseline-*.txt docs/agents/loc-final-*.txt
  ```

- [ ] **Update documentation**

  - [ ] Mark srp-refactor-plan.md as "Completed"
  - [ ] Update AGENTS.md if architecture changed

- [ ] **Full regression test**

  ```bash
  make fbuild
  cd cpp/build_native && ctest --output-on-failure
  cd ../../frontend && pnpm test
  ```

- [ ] **Performance validation**

  - [ ] Interactive transform perf test unchanged
  - [ ] No noticeable lag in browser

- [ ] **Team review**
  - [ ] Demo the changes
  - [ ] Confirm everyone understands new module boundaries

---

## Quick Reference: Git Commands

```bash
# Start a new phase
git checkout main && git pull
git checkout -b refactor/phaseX-name

# After completing work
git add -A
git commit -m "refactor(scope): description"
git push -u origin refactor/phaseX-name

# Create PR via GitHub CLI (optional)
gh pr create --title "refactor(scope): description" --body "Part of SRP refactor Phase X"

# If you need to rollback
git revert HEAD
# or
git reset --hard HEAD~1  # destructive, use carefully
```

---

## Tracking

| PR                       | Status         | Started    | Completed  | Notes                               |
| ------------------------ | -------------- | ---------- | ---------- | ----------------------------------- |
| 0.1 Governance           | ✅ Complete    | 2025-12-28 | 2025-12-28 | Script created, AGENTS.md confirmed |
| 0.2 Test Baseline        | ✅ Complete    | 2025-12-28 | 2025-12-28 | Fixed C++ tests, all green          |
| 1.1 History Manager      | ✅ Complete    | 2025-12-28 | 2025-12-28 | Extracted, tests passed             |
| 1.2 Selection Manager    | ✅ Complete    | 2025-12-28 | 2025-12-28 | Extracted, tests passed             |
| 1.3 TextTool Split       | ⬜ Not Started |            |            |                                     |
| 1.4 Import Utils         | ⬜ Not Started |            |            |                                     |
| 2.1 Interaction Session  | ⬜ Not Started |            |            |                                     |
| 2.2 Command Dispatch     | ⬜ Not Started |            |            |                                     |
| 2.3 TextInputCoordinator | ⬜ Not Started |            |            |                                     |
| 3.1 Interaction Hooks    | ⬜ Not Started |            |            |                                     |
| 3.2 CI Enforcement       | ⬜ Not Started |            |            |                                     |

**Legend**: ⬜ Not Started | 🟡 In Progress | ✅ Complete | ❌ Blocked
