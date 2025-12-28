# SRP + Anti-Monolith Refactor Plan

**Generated**: December 28, 2025  
**Status**: Proposal  
**Engine-First Compliant**: ✅ Yes

---

## 1. Verdict / Summary

- **Critical Monolith (C++)**: [engine.cpp](../../cpp/engine.cpp) at ~5,140 LOC is **6.4x above the 800 LOC mandatory threshold**, containing 140+ functions spanning 7+ distinct responsibilities
- **Critical Monolith (TS)**: [TextTool.ts](../../frontend/engine/tools/TextTool.ts) at ~1,285 LOC is **2.1x above the 600 LOC threshold**, mixing input handling, state management, style operations, and navigation
- **High-Risk Files (TS)**: [EngineInteractionLayer.tsx](../../frontend/features/editor/components/EngineInteractionLayer.tsx) (814 LOC), [dxfToShapes.ts](../../frontend/features/import/utils/dxf/dxfToShapes.ts) (781 LOC), [pdfToShapes.ts](../../frontend/features/import/utils/pdfToShapes.ts) (776 LOC)
- **Engine-First boundaries are respected** — document/geometry authority stays in C++; the violation is internal monolithism, not cross-layer bleeding
- **Hot-path risk**: `EngineInteractionLayer.tsx` handles all pointer events (pointermove/drag) — any split must preserve zero-allocation patterns
- **Text subsystem is heavily entangled**: TextTool, textBridge, text handlers span 3,200+ LOC across 8 files with unclear ownership
- **Existing partial splits (good patterns)**: `text/` subfolder, hooks extraction (`useDraftHandler`, `useSelectInteraction`) show direction
- **Positive: Well-separated subsystems in C++**: `pick_system`, `snapshot`, `entity_manager`, `text/` modules are properly isolated

---

## 2. Monolith Candidates (Ranked Table)

| Priority | File | LOC | Threshold | Hot-Path? | Primary Violations |
|----------|------|-----|-----------|-----------|-------------------|
| **P0** | `cpp/engine.cpp` | 5,140 | 800 (6.4x) | Yes (commands, render) | Entity CRUD, history, selection, text, interaction, draft, snapshotting, command dispatch |
| **P1** | `frontend/engine/tools/TextTool.ts` | 1,285 | 600 (2.1x) | Yes (keyboard/pointer input) | Input handling, state mgmt, style ops, navigation, selection drag, multi-click |
| **P2** | `frontend/features/editor/components/EngineInteractionLayer.tsx` | 814 | 600 (1.4x) | Yes (pointer events) | Event routing, text editing, selection, draft, pan/zoom, JSX rendering |
| **P3** | `frontend/features/import/utils/dxf/dxfToShapes.ts` | 781 | 600 (1.3x) | No | Entity conversion, unit handling, style resolution, geometry transform |
| **P4** | `frontend/features/import/utils/pdfToShapes.ts` | 776 | 600 (1.3x) | No | PDF parsing, shape conversion, text extraction, path handling |
| P5 | `frontend/engine/bridge/textBridge.ts` | 686 | 600 (1.1x) | Yes (text input) | WASM bridging, command encoding, content queries, style queries |
| P6 | `frontend/engine/core/EngineRuntime.ts` | 584 | 350 (1.7x) | Yes | WASM lifecycle, buffer access, multiple subsystem coordination |
| P7 | `frontend/engine/core/commandBuffer.ts` | 507 | 350 (1.4x) | No | Type defs + binary encoding (mixed concerns) |
| P8 | `cpp/engine/engine.h` | 1,429 | 450 (3.2x) | Partial | Aggregates all public API + inline implementations |
| P9 | `cpp/engine/text/text_layout.cpp` | 1,291 | 800 (1.6x) | Yes (text render) | Layout algorithm, glyph positioning, line breaking — single responsibility but large |

---

## 3. Per-File SRP Split Proposals

### 3.1 engine.cpp (P0 — CRITICAL)

**Current Responsibilities (7+ mixed):**
1. Entity CRUD (upsertRect, upsertLine, upsertPolyline, upsertCircle, upsertPolygon, upsertArrow, deleteEntity)
2. History system (undo/redo, snapshots, encoding/decoding)
3. Selection management (setSelection, clearSelection, selectByPick, marqueeSelect, selectionOrdered)
4. Text system delegation (upsertText, deleteText, text styling, caret/selection)
5. Interaction sessions (beginTransform, updateTransform, commitTransform, cancelTransform)
6. Draft system (beginDraft, updateDraft, commitDraft, cancelDraft)
7. Command dispatch (cad_command_callback switch statement)
8. Render buffer management (rebuildRenderBuffers, addGridToBuffers)
9. Snapshot serialization (rebuildSnapshotBytes, loadSnapshotFromPtr)
10. Layer management (setLayerProps, deleteLayer)

**Proposed Split:**

| New File | Responsibility | Methods to Move | LOC Est |
|----------|---------------|-----------------|---------|
| `engine/history_manager.cpp` | Undo/redo, snapshot encoding | `undo`, `redo`, `encodeHistoryBytes`, `decodeHistoryBytes`, `applyHistoryEntry`, history recording | ~600 |
| `engine/selection_manager.cpp` | Selection state & operations | `setSelection`, `clearSelection`, `selectByPick`, `marqueeSelect`, `rebuildSelectionOrder` | ~300 |
| `engine/interaction_session.cpp` | Transform sessions + draft | `beginTransform`, `updateTransform`, `commitTransform`, `cancelTransform`, `beginDraft`, `updateDraft`, `commitDraft` | ~500 |
| `engine/command_dispatch.cpp` | Command buffer parsing + dispatch | `cad_command_callback`, `applyCommandBuffer` | ~400 |
| `engine/entity_crud.cpp` | Entity upsert/delete orchestration | `upsertRect`, `upsertLine`, `deleteEntity`, layer assignment | ~500 |
| `engine.cpp` (thin coordinator) | Public API, delegates to modules | Constructor, `clear`, buffer access, stats | ~400 |

**Dependency Direction:**
```
engine.cpp (coordinator)
    ├── entity_manager (data)
    ├── history_manager (state)
    ├── selection_manager (state)
    ├── interaction_session (transient)
    ├── command_dispatch (ingress)
    ├── pick_system (query)
    └── text_system (subsystem)
```

---

### 3.2 TextTool.ts (P1)

**Current Responsibilities (5+ mixed):**
1. Lifecycle management (initialize, isReady, loadFont)
2. Input event handling (handleClick, handleDrag, handlePointerDown, handlePointerMove, handlePointerUp)
3. State management (TextToolState, createInitialState, mode transitions)
4. Style operations (setBold, setItalic, setFontSize, applyStyleParamsToText)
5. Navigation (arrow keys, Home/End, word movement via handleSpecialKey)
6. Selection/multi-click logic (double-click word select, triple-click all)

**Proposed Split:**

| New File | Responsibility | Methods to Move | LOC Est |
|----------|---------------|-----------------|---------|
| `text/TextInputCoordinator.ts` | Pointer/keyboard event routing | `handleClick`, `handleDrag`, `handlePointerDown`, `handlePointerMove`, `handlePointerUp`, `handleInputDelta` | ~350 |
| `text/TextStateManager.ts` (existing, expand) | State machine, mode transitions | `createInitialState`, state update logic, mode transitions | ~150 (current 127) |
| `text/TextStyleHandler.ts` (existing, expand) | Style application | `setBold`, `setItalic`, `applyStyleParamsToText`, font operations | ~300 (current 287) |
| `text/TextNavigationHandler.ts` (existing, expand) | Caret navigation | Arrow key handling, word/line movement | ~200 (current 157) |
| `TextTool.ts` (facade) | Public API, delegates | `initialize`, `isReady`, `commitAndExit`, callbacks wiring | ~300 |

---

### 3.3 EngineInteractionLayer.tsx (P2)

**Current Responsibilities:**
1. Pointer event capture + routing
2. Tool-specific handling (select, text, draft tools)
3. Engine session management (beginEngineSession, cancelActiveEngineSession)
4. Selection box rendering (marquee SVG)
5. Text editing overlay integration
6. Pan/zoom coordination

**Proposed Split:**

| New Component/Hook | Responsibility | Extract From |
|-------------------|---------------|--------------|
| `usePointerRouter.ts` | Top-level event routing, tool dispatch | `handlePointerDown`, `handlePointerMove`, `handlePointerUp` |
| `useEngineSession.ts` | Transform session lifecycle | `beginEngineSession`, `cancelActiveEngineSession`, `dragRef` handling |
| `MarqueeOverlay.tsx` | Selection box rendering | `selectionSvg` memo block + SVG JSX |
| `EngineInteractionLayer.tsx` | Composition root | Wire hooks + render overlays |

**Note:** Existing `useSelectInteraction`, `useDraftHandler`, `useTextEditHandler` are good patterns — continue this approach.

---

### 3.4 Import Utilities (P3, P4)

**dxfToShapes.ts (781 LOC):**

| New File | Responsibility |
|----------|---------------|
| `dxf/entityConverters.ts` | Entity-specific conversion (LINE, ARC, CIRCLE, etc.) |
| `dxf/unitResolver.ts` | Unit detection and scale factor computation |
| `dxf/layerProcessor.ts` | Layer extraction and mapping |
| `dxf/dxfToShapes.ts` | Orchestrator (coordinate the above) |

**pdfToShapes.ts (776 LOC):**

| New File | Responsibility |
|----------|---------------|
| `pdf/pathConverter.ts` | SVG path → shape conversion |
| `pdf/textExtractor.ts` | PDF text extraction |
| `pdf/pdfToShapes.ts` | Orchestrator |

---

## 4. Governance Rules (SRP + Anti-Monolith)

### 4.1 File Size Limits

| Area | Review Threshold | Mandatory Refactor |
|------|-----------------|-------------------|
| C++ engine (`cpp/engine/**`) | > 450 LOC | > 800 LOC |
| C++ tests (`cpp/tests/**`) | > 600 LOC | > 1000 LOC |
| TS/TSX (`frontend/**`) | > 350 LOC | > 600 LOC |
| TS tests | > 400 LOC | > 700 LOC |

### 4.2 Function Length Guardrails

- **Review**: Any function > 80 LOC
- **Mandatory refactor**: Any function > 120 LOC
- **Exception**: Data-heavy switch statements (command dispatch) with clear 1:1 case mapping

### 4.3 Responsibility Rules

**Maximum responsibilities per file:**
- **2** for hot-path files (input handlers, render loops)
- **3** for orchestrators (coordinators that delegate)
- **1** for domain logic (pure algorithms, data structures)

**Responsibility indicators:**
- Multiple `// ========` section headers in one file
- More than 3 distinct import categories (e.g., types + bridge + store + utils + config)
- Both public API surface AND internal implementation in same file

### 4.4 Forbidden Patterns

| Pattern | Why Forbidden | Detection |
|---------|--------------|-----------|
| `utils.ts` > 200 LOC | God-file accumulation | Size + generic name |
| Manager class > 500 LOC | Hidden monolith | Size + "Manager" suffix |
| Cross-layer imports (`frontend/` → `cpp/` internals) | Engine-First violation | Import path analysis |
| Render logic in event handlers | Hot-path pollution | `render`, `draw`, `build` in pointer handlers |
| Document state in Zustand (beyond UI) | Engine-First violation | Store inspection |

### 4.5 Ownership Boundaries

```
cpp/engine/
├── Core (entity_manager, types) — Data structures only
├── Pick (pick_system) — Query only, no mutation
├── Text (text/) — Self-contained subsystem
├── History — State only, no entity logic
├── Render — Buffer generation only
└── Commands — Dispatch only, delegates to above

frontend/engine/
├── core/ — WASM bridge, runtime, protocol
├── bridge/ — High-level APIs over WASM
├── tools/ — User interaction tools (stateful)
└── renderer/ — WebGL passes (stateless)
```

---

## 5. Enforcement Options

### 5.1 Option A: Script-Based LOC Checks (Low Friction)

**What it checks:**
- File LOC against thresholds
- Function length (via regex heuristic)
- Import depth (cross-layer detection)

**Where it runs:**
- Pre-commit hook (fast, ~2s)
- CI as warning (non-blocking initially)

**Implementation:**
```bash
# scripts/check-file-size.sh
find cpp/engine -name "*.cpp" -o -name "*.h" | while read f; do
  loc=$(wc -l < "$f")
  if [ $loc -gt 800 ]; then
    echo "ERROR: $f exceeds 800 LOC ($loc)"
    exit 1
  fi
done
```

**Failure message:**
```
❌ File cpp/engine/foo.cpp exceeds mandatory limit (850/800 LOC).
   Split into focused modules. See AGENTS.md §Governance.
```

### 5.2 Option B: ESLint/Clang-Tidy Integration (Stricter)

**TypeScript (ESLint):**
```json
{
  "rules": {
    "max-lines": ["error", { "max": 600, "skipBlankLines": true, "skipComments": true }],
    "max-lines-per-function": ["warn", { "max": 120 }]
  }
}
```

**C++ (Clang-Tidy):**
```yaml
Checks: 'readability-function-size'
CheckOptions:
  - key: readability-function-size.LineThreshold
    value: 120
```

**Where it runs:**
- CI gate (blocking)
- Editor integration (real-time feedback)

**Failure message:**
```
error: Function 'cad_command_callback' exceeds 120 lines (readability-function-size)
```

---

## 6. Phased PR Plan

### Phase 0: Preparation (2 PRs)

#### PR 0.1: Governance Documentation + Baseline
- **Goal**: Establish rules before changes
- **Files**: `docs/agents/governance.md`, update `AGENTS.md`
- **Steps**:
  1. Add governance section to AGENTS.md
  2. Create baseline LOC report (`scripts/loc-report.sh`)
  3. Document current violations as "known debt"
- **Risk**: Low
- **Verification**: Doc review, script runs without error
- **Rollback**: Revert docs

#### PR 0.2: Test Coverage Baseline
- **Goal**: Ensure existing tests pass, establish coverage baseline
- **Files**: Test files only
- **Steps**:
  1. Run `ctest` and `vitest`, fix any flaky tests
  2. Add missing unit tests for functions being split later
- **Risk**: Low
- **Verification**: CI green
- **Rollback**: Revert test changes

---

### Phase 1: Low-Risk Splits (4 PRs)

#### PR 1.1: Extract History Manager (C++)
- **Goal**: Isolate undo/redo from CadEngine
- **Files**:
  - Create: `cpp/engine/history_manager.cpp`, `cpp/engine/history_manager.h`
  - Modify: `cpp/engine.cpp` (remove ~600 LOC)
- **Steps**:
  1. Create `HistoryManager` class with history-specific state
  2. Move `encodeHistoryBytes`, `decodeHistoryBytes`, `applyHistoryEntry`, history recording
  3. CadEngine holds `HistoryManager historyManager_`
  4. Delegate calls through thin wrappers
- **Risk**: Medium (history is stateful)
- **Verification**:
  - All `history_test.cpp` tests pass
  - Undo/redo works in browser
  - Snapshot round-trip preserves history
- **Rollback**: Revert, inline back into engine.cpp

#### PR 1.2: Extract Selection Manager (C++)
- **Goal**: Isolate selection state management
- **Files**:
  - Create: `cpp/engine/selection_manager.cpp`, `cpp/engine/selection_manager.h`
  - Modify: `cpp/engine.cpp` (remove ~300 LOC)
- **Steps**:
  1. Create `SelectionManager` class
  2. Move `setSelection`, `clearSelection`, `selectByPick`, `marqueeSelect`, `rebuildSelectionOrder`
  3. SelectionManager references PickSystem for hit testing
- **Risk**: Medium
- **Verification**:
  - `selection_order_test.cpp` passes
  - Multi-select, shift-click, marquee work in browser
- **Rollback**: Revert to engine.cpp

#### PR 1.3: Split TextTool State/Navigation (TS)
- **Goal**: Reduce TextTool.ts by extracting clear modules
- **Files**:
  - Expand: `frontend/engine/tools/text/TextStateManager.ts`
  - Expand: `frontend/engine/tools/text/TextNavigationHandler.ts`
  - Modify: `frontend/engine/tools/TextTool.ts` (remove ~300 LOC)
- **Steps**:
  1. Move state machine logic to TextStateManager
  2. Move all navigation (arrows, Home/End, word jump) to TextNavigationHandler
  3. TextTool delegates via composition
- **Risk**: Low (already partially split)
- **Verification**:
  - Text editing works: typing, selection, navigation
  - No regressions in text tool behavior
- **Rollback**: Inline back into TextTool.ts

#### PR 1.4: Split Import Utilities (TS)
- **Goal**: Break up dxfToShapes and pdfToShapes
- **Files**:
  - Create: `frontend/features/import/utils/dxf/entityConverters.ts`
  - Create: `frontend/features/import/utils/dxf/unitResolver.ts`
  - Modify: `dxfToShapes.ts` (orchestrator only)
- **Steps**:
  1. Extract entity conversion functions
  2. Extract unit detection logic
  3. Main file orchestrates imports
- **Risk**: Low (import feature is isolated)
- **Verification**:
  - DXF import tests pass
  - Manual import of test DXF files
- **Rollback**: Inline functions

---

### Phase 2: Hot-Path Modules (3 PRs)

#### PR 2.1: Extract Interaction Session (C++)
- **Goal**: Isolate transform/draft sessions from CadEngine
- **Files**:
  - Create: `cpp/engine/interaction_session.cpp`, `cpp/engine/interaction_session.h`
  - Modify: `cpp/engine.cpp` (remove ~500 LOC)
- **Steps**:
  1. Create `InteractionSession` class managing transform state
  2. Move `beginTransform`, `updateTransform`, `commitTransform`, `cancelTransform`
  3. Move draft system (`beginDraft`, `updateDraft`, etc.)
  4. Session references EntityManager for mutations
- **Risk**: High (hot path for all interactions)
- **Verification**:
  - `interactive_transform_perf_test.cpp` passes
  - Move/resize/vertex-drag work smoothly (no frame drops)
  - Draft shapes (rect, circle, polyline) commit correctly
- **Rollback**: Revert, inline back

#### PR 2.2: Extract Command Dispatch (C++)
- **Goal**: Isolate command parsing/dispatch
- **Files**:
  - Create: `cpp/engine/command_dispatch.cpp`
  - Modify: `cpp/engine.cpp` (remove ~400 LOC)
- **Steps**:
  1. Move `cad_command_callback` and helper parsing
  2. Dispatcher receives CadEngine* and delegates
  3. Commands route to appropriate managers
- **Risk**: Medium (all mutations go through here)
- **Verification**:
  - `commands_test.cpp` passes
  - All entity operations work in browser
- **Rollback**: Revert

#### PR 2.3: Extract TextInputCoordinator (TS)
- **Goal**: Reduce TextTool to facade
- **Files**:
  - Create: `frontend/engine/tools/text/TextInputCoordinator.ts`
  - Modify: `TextTool.ts` (remove ~350 LOC)
- **Steps**:
  1. Move pointer event handlers to coordinator
  2. Move input delta handling
  3. TextTool becomes thin facade over coordinator + style + navigation handlers
- **Risk**: Medium (text input is interactive)
- **Verification**:
  - Text creation (click, drag) works
  - Text editing (click existing, type) works
  - Selection drag works
- **Rollback**: Inline back

---

### Phase 3: Normalization + Cleanup (2 PRs)

#### PR 3.1: EngineInteractionLayer Hook Extraction
- **Goal**: Further reduce component complexity
- **Files**:
  - Create: `frontend/features/editor/hooks/usePointerRouter.ts`
  - Create: `frontend/features/editor/hooks/useEngineSession.ts`
  - Modify: `EngineInteractionLayer.tsx`
- **Steps**:
  1. Extract pointer routing logic to hook
  2. Extract engine session management to hook
  3. Component focuses on composition + JSX
- **Risk**: Medium
- **Verification**:
  - All interaction tests pass
  - Manual testing of select, draw, text tools
- **Rollback**: Inline hooks

#### PR 3.2: CI Enforcement Activation
- **Goal**: Prevent regression
- **Files**:
  - Create: `.github/workflows/size-check.yml`
  - Create: `scripts/check-file-size.sh`
  - Update: `eslint.config.js`
- **Steps**:
  1. Add LOC check script
  2. Add CI workflow running script
  3. Enable ESLint max-lines rule
- **Risk**: Low
- **Verification**: CI runs, catches intentional violation
- **Rollback**: Disable workflow

---

## 7. Target Architecture Map

### C++ Engine Modules

```
cpp/engine/
├── engine.h            # Public API declarations only
├── engine.cpp          # Thin coordinator (~400 LOC)
│
├── entity_manager.*    # Entity storage (EXISTING)
├── history_manager.*   # Undo/redo state (NEW)
├── selection_manager.* # Selection state (NEW)
├── interaction_session.*# Transform/draft sessions (NEW)
├── command_dispatch.*  # Command routing (NEW)
│
├── pick_system.*       # Hit testing (EXISTING)
├── render.*            # Buffer generation (EXISTING)
├── snapshot.*          # Serialization (EXISTING)
│
└── text/               # Text subsystem (EXISTING)
    ├── text_store.*
    ├── text_layout.*
    ├── font_manager.*
    └── glyph_atlas.*
```

### TypeScript Frontend Modules

```
frontend/engine/
├── core/
│   ├── EngineRuntime.ts      # WASM lifecycle
│   ├── commandBuffer.ts      # Binary encoding
│   ├── protocol.ts           # Type definitions
│   └── singleton.ts          # Instance management
│
├── bridge/
│   ├── textBridge.ts         # Text API
│   └── getCadEngineFactory.ts
│
├── tools/
│   ├── TextTool.ts           # Facade (~300 LOC)
│   └── text/
│       ├── TextInputCoordinator.ts  (NEW)
│       ├── TextStateManager.ts
│       ├── TextStyleHandler.ts
│       └── TextNavigationHandler.ts
│
└── renderer/
    └── webgl2/
        ├── passes/
        └── shaders/

frontend/features/editor/
├── components/
│   ├── EngineInteractionLayer.tsx  (~400 LOC)
│   └── MarqueeOverlay.tsx          (NEW)
│
└── hooks/
    ├── useDraftHandler.ts          (EXISTING)
    ├── useSelectInteraction.ts     (EXISTING)
    ├── useTextEditHandler.ts       (EXISTING)
    ├── usePointerRouter.ts         (NEW)
    └── useEngineSession.ts         (NEW)
```

### Allowed Dependency Graph

```
         ┌─────────────────────────────────────────┐
         │              CadEngine                  │
         │         (thin coordinator)              │
         └─────────────────┬───────────────────────┘
                           │
    ┌──────────┬───────────┼───────────┬──────────┐
    ▼          ▼           ▼           ▼          ▼
HistoryMgr  SelectionMgr  InteractionSession  CommandDispatch  TextSystem
    │          │           │           │          │
    └──────────┴───────────┴───────────┴──────────┘
                           │
                           ▼
                    EntityManager
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          PickSystem   RenderBuffer  Snapshot
```

**Frontend:**
```
EngineInteractionLayer
    │
    ├── usePointerRouter
    │       └── delegates to tool hooks
    │
    ├── useEngineSession
    │       └── manages transform state
    │
    ├── useSelectInteraction
    ├── useDraftHandler
    └── useTextEditHandler
            └── TextTool (facade)
                    └── TextInputCoordinator
                    └── TextStateManager
                    └── TextStyleHandler
                    └── TextNavigationHandler
```

---

## 8. Do-Not-Do List

| Anti-Pattern | Why It Must Be Rejected | Review Checkpoint |
|--------------|------------------------|-------------------|
| **New mega utils.ts** | Becomes a dumping ground; violates SRP | Any new file named `utils.ts` > 100 LOC |
| **Orchestration in render loops** | Performance regression (allocations in hot path) | `new`, `...spread`, closures in `rebuildRenderBuffers` or `handlePointerMove` |
| **Duplicating engine rules in TS** | Engine-First violation; desync risk | Geometry calculations, hit testing, selection logic in frontend |
| **Cross-layer imports** | Tight coupling breaks modularity | `frontend/` importing from `cpp/` types directly (except protocol.ts) |
| **Big-bang refactors** | Risk of introducing bugs; hard to review | PRs touching > 10 files or > 500 LOC changed |
| **State in multiple places** | Desyncs cause bugs | Document state in Zustand beyond UI (no entities, no selection beyond IDs) |
| **Giant switch statements without dispatch** | Monolithic command handling | Command switch > 300 LOC without delegating to focused handlers |
| **Inline implementations in headers** | Compilation time, coupling | `engine.h` growing beyond 500 LOC of implementation |
| **Shared mutable state across modules** | Race conditions, hidden dependencies | Multiple modules mutating `generation`, `renderDirty` without coordinator |
| **Test coupling to implementation** | Brittle tests block refactoring | Tests importing internal helpers instead of public API |

---

## Quality Notes

1. **This plan is executable by a single developer** — each PR is scoped to 1-2 days of work
2. **Engine-First is preserved** — all splits keep document authority in C++; TS splits are UI/interaction only
3. **Hot paths are protected** — Phase 2 has explicit performance verification steps
4. **Rollback is always possible** — each PR is atomic and reversible
5. **Governance prevents regression** — Phase 3 adds CI enforcement
