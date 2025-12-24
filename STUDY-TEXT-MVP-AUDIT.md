# STUDY: Text MVP Audit (Read-only)

**Repo:** `eletrocad-webapp`  
**Scope:** Deep code study of text editing/tooling, styling/runs, and coordinate systems (World Y-up vs Screen Y-down), with MVP readiness recommendations.  
**Change policy:** This report is **read-only** (no code changes).

## What I will change / What I will not change

- **I will change:** nothing (analysis + recommendations only).
- **I will not change:** engine behavior, UI behavior, serialization, file structure, or APIs.

---

## Executive summary (≤10 bullets)

- The C++ engine exposes a coherent text API surface (hit-test, caret position, selection rects, style snapshot, apply style) and the frontend follows an engine-first pattern for caret/selection geometry. See [cpp/engine/engine.h](cpp/engine/engine.h#L350) and [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L1020).
- Text layout returns caret + selection rectangles in **text-local coordinates** with **origin at top-left** and **+Y down**. This is explicitly documented and implemented in [cpp/engine/text/text_layout.cpp](cpp/engine/text/text_layout.cpp#L333).
- World space is **Y-up** and screen/DOM is **Y-down**; conversion utilities implement the Y inversion. See [frontend/utils/geometry.ts](frontend/utils/geometry.ts#L23-L41).
- Pointer events convert world→text-local for hit testing via `localY = anchorY - world.y` (Y-up → Y-down) before calling the text tool. See [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L1219-L1239).
- Selection highlighting is rendered as DOM rectangles positioned in text-local space, with an overlay container anchored in screen space and rotated/scaled. See [frontend/components/TextCaretOverlay.tsx](frontend/components/TextCaretOverlay.tsx#L98-L160).
- **Major styling issue:** `CadEngine::applyTextStyle()` returns early on `byteStart >= byteEnd` (empty range), but later contains a caret-only “zero-length run at caret” branch guarded by `if (byteStart == byteEnd)` — making that caret-only path unreachable as written. See [cpp/engine.cpp](cpp/engine.cpp#L908-L963).
- Frontend currently treats collapsed selection styling as “style the whole text entity” (range 0..len) rather than caret-only typing attributes. See [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L709-L747).
- Despite the above, the engine *does* have infrastructure to support caret-only styling via zero-length runs: inserted text expands a `length=0` run at the insertion point. See [cpp/engine/text/text_store.cpp](cpp/engine/text/text_store.cpp#L395-L427).
- Ribbon style toggles always update tool defaults **even during engine text editing**, and the interaction layer syncs those defaults into the `TextTool`. See [frontend/features/editor/ribbon/components/TextControls.tsx](frontend/features/editor/ribbon/components/TextControls.tsx#L136-L150) and [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L500-L548).
- MVP recommendation: pick **caret-only typing attributes** for collapsed selection (via zero-length runs) and keep selection-range styling for non-collapsed selection; this matches existing engine intent and avoids surprising “style everything” behavior.

---

## 1) Architecture map (engine → wasm → tool → overlay)

### Components (authoritative → presentation)

- **C++ engine (authoritative):** text content, runs, shaping/layout, hit-testing, caret/selection geometry.
  - Core types: [cpp/engine/types.h](cpp/engine/types.h#L167-L214)
  - Public methods: [cpp/engine/engine.h](cpp/engine/engine.h#L350-L382)
- **WASM bindings:** exposes engine APIs; note `TextHitResult.charIndex` exported as `byteIndex`.  
  - [cpp/engine/bindings.cpp](cpp/engine/bindings.cpp#L103-L106)
- **TS bridge (`TextBridge`):** wraps engine calls; converts char↔byte indices; frees returned C++ vector wrappers.
  - Selection rects: [frontend/wasm/textBridge.ts](frontend/wasm/textBridge.ts#L415-L443)
- **Tool/controller (`TextTool`):** owns editing state machine; routes pointer/keyboard/IME; requests caret+rect snapshots.
  - Caret+selection update: [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L1020-L1060)
- **Event router (`EngineInteractionLayer`):** pointer routing + world→local conversion + “commit on click outside”.
  - Inside/outside decision + local conversion: [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L1188-L1253)
- **Overlay (`TextCaretOverlay`):** renders caret + selection highlight using local rects.
  - Transform: [frontend/components/TextCaretOverlay.tsx](frontend/components/TextCaretOverlay.tsx#L98-L121)
  - Rect rendering: [frontend/components/TextCaretOverlay.tsx](frontend/components/TextCaretOverlay.tsx#L123-L140)

### End-to-end flow (ASCII)

```
PointerDown (screen)
  -> EngineInteractionLayer: screenToWorld + inside/outside active text
     -> if inside:
        world->textLocal: localX = world.x - anchorX
                          localY = anchorY - world.y
        -> TextTool.handlePointerDown(...)
           -> TextBridge.hitTest(textId, localX, localY)
              -> CadEngine::hitTestText(...)
                 -> TextLayoutEngine::hitTest(...)
              <- TextHitResult{ byteIndex }
           -> update tool caret/selection
           -> TextTool.updateCaretPosition()
              -> TextBridge.getCaretPosition(...)
                 -> CadEngine::getTextCaretPosition(...)
                    -> TextLayoutEngine::getCaretPosition(...)
              -> (if selection) TextBridge.getSelectionRects(...)
                 -> CadEngine::getTextSelectionRects(...)
                    -> TextLayoutEngine::getSelectionRects(...)
              -> callbacks -> TextCaretOverlay
```

---

## 2) Interaction states & event flow (MVP behavior)

### 2.1 “Click inside vs outside” while editing

- **Inside active text box:** moves caret/selection by hit-testing in text-local space.
  - Conversion + call: [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L1219-L1239)
- **Outside active text box:** commits and exits; event then falls through to normal selection.
  - Commit: [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L1241-L1250)
  - Commit semantics (delete if whitespace): [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L906-L920)

### 2.2 Drag selection

- The tool updates selection in response to pointer move while dragging, then refreshes overlay via `updateCaretPosition()`.
- Selection rectangles are requested from engine only when selection is non-collapsed.
  - [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L1034-L1049)

### 2.3 Keyboard/IME selection

- `TextTool.handleSelectionChange()` receives selection updates (from the hidden textarea proxy) and writes the authoritative caret/selection back to the engine.
  - [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L679-L707)

---

## 3) Hit-testing, caret, selection rectangles (API chain)

### 3.1 Engine APIs

- Declarations:
  - `hitTestText(textId, localX, localY)`: [cpp/engine/engine.h](cpp/engine/engine.h#L350)
  - `getTextCaretPosition(textId, charIndex)`: [cpp/engine/engine.h](cpp/engine/engine.h#L358)
  - `getTextSelectionRects(textId, start, end)`: [cpp/engine/engine.h](cpp/engine/engine.h#L382)

### 3.2 Text-local coordinate contract (engine)

- Caret position explicitly documented as text-local **Y-down**:
  - [cpp/engine/text/text_layout.cpp](cpp/engine/text/text_layout.cpp#L333-L349)
- Selection rects are accumulated line-by-line by increasing `y` (also Y-down):
  - [cpp/engine/text/text_layout.cpp](cpp/engine/text/text_layout.cpp#L363-L424)

### 3.3 Bindings contract nuance: “charIndex” vs “byteIndex”

- C++ type field is named `charIndex` but is described as a UTF-8 byte index in [cpp/engine/types.h](cpp/engine/types.h#L206-L214).
- WASM exports it as `byteIndex` for clarity:
  - [cpp/engine/bindings.cpp](cpp/engine/bindings.cpp#L103-L106)

### 3.4 Bridge contract

- `TextBridge.getSelectionRects()` converts char indices to bytes and calls the engine, then frees the returned vector wrapper:
  - [frontend/wasm/textBridge.ts](frontend/wasm/textBridge.ts#L415-L443)

---

## 4) Coordinate systems audit (Y-up vs Y-down)

### 4.1 Coordinate spaces in play

1) **Screen space (DOM / pointer):** X right, Y down.
2) **World space:** X right, **Y up** (project-wide contract in AGENTS.md).
3) **Text-local space:** origin at **text anchor top-left**, X right, **Y down**.
4) **Overlay local CSS space:** same as text-local, positioned by CSS `left/top`.

### 4.2 World↔screen transforms

- Canonical conversions (note the `-` on Y):
  - [frontend/utils/geometry.ts](frontend/utils/geometry.ts#L23-L41)

### 4.3 World→text-local conversion (for hit testing)

- During active text editing, the pointer is converted:
  - `anchorY = shape.y + shape.height` (shape stored as bottom-left; `anchorY` becomes top)
  - `localY = anchorY - world.y` (Y-up → Y-down)
  - [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L1219-L1239)

### 4.4 Text-local→screen (for caret/selection rendering)

- Overlay container is placed at `screenAnchor = worldToScreen(anchor)` and then rotated/scaled.
  - [frontend/components/TextCaretOverlay.tsx](frontend/components/TextCaretOverlay.tsx#L98-L121)

**Risk note:** The overlay contains several “direction needs verification” comments around rotation and Y flip. That’s a signal to add a small visual verification checklist (see MVP verification section).

---

## 5) Styling & runs model (and the collapsed-selection mismatch)

### 5.1 Runs are byte-ranges

- Engine runs are contiguous spans of **UTF-8 byte offsets** with a single style:
  - [cpp/engine/types.h](cpp/engine/types.h#L167-L185)

### 5.2 Engine supports caret-only styling conceptually

- `CadEngine::applyTextStyle()` contains an explicit caret-only intent:
  - “Caret-only toggle should still affect future typing: create a zero-length run at caret.”
  - [cpp/engine.cpp](cpp/engine.cpp#L957)

### 5.3 But the caret-only branch is unreachable today

- The function returns early on `if (byteStart >= byteEnd) return true; // empty range, no-op`.
  - [cpp/engine.cpp](cpp/engine.cpp#L932-L934)
- Immediately after, it checks `if (byteStart == byteEnd) { ... }` for caret-only handling.
  - [cpp/engine.cpp](cpp/engine.cpp#L957-L963)

**Implication:** style operations with a collapsed selection (range length 0) will no-op at the engine layer (unless the frontend expands the range).

### 5.4 Frontend collapsed-selection styling behavior

- The current `TextTool.applyStyle()` behavior:
  - If selection is collapsed and content is non-empty, it styles the **entire** text (`0..content.length`).
  - [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L713-L723)

This avoids the engine no-op, but is a UX divergence from typical “typing attributes” semantics.

### 5.5 Existing engine machinery that makes caret-only viable

- When inserting text, `TextStore` will **expand** a `length=0` run at the insertion point, and shift subsequent runs.
  - [cpp/engine/text/text_store.cpp](cpp/engine/text/text_store.cpp#L395-L423)

This is exactly what you’d want if the engine inserted a zero-length run at the caret when toggling style with a collapsed selection.

### 5.6 Ribbon controls: tri-state display vs default settings

- While editing, the ribbon displays tri-state based on engine snapshots:
  - [frontend/features/editor/ribbon/components/TextControls.tsx](frontend/features/editor/ribbon/components/TextControls.tsx#L106-L121)
- Clicking a style toggle updates settings defaults **and** (if editing) calls `tool.applyStyle(...)`:
  - [frontend/features/editor/ribbon/components/TextControls.tsx](frontend/features/editor/ribbon/components/TextControls.tsx#L136-L150)
- The interaction layer keeps `TextTool` defaults in sync with the ribbon defaults:
  - [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L500-L548)

---

## 6) MVP recommendations (minimal fixes, no rewrites)

### MVP strategy choice (explicit)

**Choose:** **Caret-only typing attributes** for collapsed selection, implemented engine-side via a **zero-length run at the caret**, with selection-range styling only when selection is non-collapsed.

**Why this is the best MVP fit here:**
- The engine already contains the intended caret-only logic (currently unreachable) and `TextStore` already supports zero-length-run expansion on insert.
- It aligns with common editor semantics and avoids the surprising “I clicked Bold and my whole text changed” behavior.

### P0 (must fix before MVP text styling feels correct)

1) **Make caret-only applyTextStyle reachable**
- Fix `CadEngine::applyTextStyle()` so `byteStart == byteEnd` executes the caret-only run insertion logic instead of returning early.
- Evidence: [cpp/engine.cpp](cpp/engine.cpp#L932-L963)

2) **Align frontend collapsed-selection behavior with chosen strategy**
- Stop expanding collapsed selection to full range in `TextTool.applyStyle()`; instead send a collapsed range (caret range) and let engine create the zero-length run.
- Evidence: [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L713-L723)

### P1 (important for correctness/consistency)

1) **Coordinate/rotation verification checklist**
- Because caret overlay includes “verify direction” comments, add a tiny manual QA script (or automated visual test later) covering:
  - rotation 0°, 90°, 180° text; caret moves right with ArrowRight; selection rects align with glyphs.
  - Evidence: [frontend/components/TextCaretOverlay.tsx](frontend/components/TextCaretOverlay.tsx#L86-L121)

2) **Keep hit-test bounding boxes in sync with engine layout**
- The “inside/outside click” check uses JS shape bbox; if engine layout diverges from stored shape size, outside-click may incorrectly commit.
- Evidence: [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L1204-L1250)

### P2 (nice-to-have / post-MVP)

- Grapheme-accurate indexing (today indices are “codepoint approximation”):
  - Evidence: [cpp/engine.cpp](cpp/engine.cpp#L925-L931)
- Extend style snapshot semantics (font/size/color) and unify object-level vs edit-mode controls.

---

## 7) Open questions / ambiguities to confirm

- **Rotation sign correctness:** Overlay has multiple notes about “verify direction.” Confirm with a simple rotated-text scenario.
  - [frontend/components/TextCaretOverlay.tsx](frontend/components/TextCaretOverlay.tsx#L86-L121)
- **Indexing semantics:** Engine and bindings call the field `charIndex` but treat it as a UTF-8 byte index. This is consistent internally, but it’s easy to misread. The WASM rename to `byteIndex` helps.
  - [cpp/engine/types.h](cpp/engine/types.h#L206-L214), [cpp/engine/bindings.cpp](cpp/engine/bindings.cpp#L103-L106)

---

## Appendix: Key evidence links

- Apply style unreachable caret-only block: [cpp/engine.cpp](cpp/engine.cpp#L908-L963)
- Text-local coordinate system comment: [cpp/engine/text/text_layout.cpp](cpp/engine/text/text_layout.cpp#L333-L349)
- World↔screen Y inversion: [frontend/utils/geometry.ts](frontend/utils/geometry.ts#L23-L41)
- World→local conversion for hit-test: [frontend/src/components/EngineInteractionLayer.tsx](frontend/src/components/EngineInteractionLayer.tsx#L1219-L1239)
- Overlay transforms + local rect rendering: [frontend/components/TextCaretOverlay.tsx](frontend/components/TextCaretOverlay.tsx#L98-L140)
- Frontend collapsed-selection styles whole entity: [frontend/features/editor/tools/TextTool.ts](frontend/features/editor/tools/TextTool.ts#L713-L723)
- Zero-length run expansion on insert: [cpp/engine/text/text_store.cpp](cpp/engine/text/text_store.cpp#L395-L423)
