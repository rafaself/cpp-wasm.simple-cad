# Text Shadow State Remediation Report

**Date:** 2025-12-28
**Status:** Completed

## Problem Description

The `useUIStore.ts` contained a "Shadow State" of the text editing session, duplicating authoritative data from the C++ Engine including:

- `content` (Full text string)
- `caretIndex`
- `selectionStart`
- `selectionEnd`

This violated the "Engine-First" architecture principle (AC01: Source of Truth), leading to:

1.  **Memory Duplication:** Text content stored in both WASM heap and JS string heap.
2.  **Concurrency Risks:** Potential for JS state to drift from Engine state.
3.  **Performance Overhead:** Unnecessary serialization and React updates on every keystroke.

## Implemented Solution

We implemented a **"Direct-Read, Command-Write"** pattern for text editing.

### 1. Refactored `useUIStore.ts`

- Removed `content`, `caretIndex`, `selectionStart`, and `selectionEnd` from `engineTextEditState`.
- Removed setters `setEngineTextEditContent` and `setEngineTextEditCaret`.
- Added `editGeneration` (number) to signal when Engine state has changed.
- Added `bumpEngineTextEditGeneration()` action.

### 2. Refactored `TextTool.ts`

- Removed sending `content` payload in `onTextUpdated` callbacks.
- Updated callbacks to only signal "change happened" (via metadata or explicit bump).
- Adhered to strict types for `TextToolCallbacks`.

### 3. Updated `useTextEditHandler.ts`

- Replaced direct store updates with `bumpEngineTextEditGeneration()`.
- Maintained local React state for UI-only overlays (Caret/Selection Rects) via `useTextCaret` (View State, not Document State).

### 4. Created `useEngineTextEditState.ts`

- Created a new custom hook to encapsulate "Direct-Read" logic.
- Hook reads `runtime.getTextContent(textId)` and `engine.getTextStyleSnapshot(textId)` directly from the Engine.
- Uses `editGeneration` dependency to trigger re-reads only when necessary.
- **Benefit:** Cleaner components, strict adherence to Single Source of Truth.

### 5. Updated `EngineInteractionLayer.tsx`

- Replaced usage of store properties with `useEngineTextEditState` hook.
- Passes fresh, Engine-sourced data to `TextInputProxy`.

## Verification

- **Static Analysis:** Verified removal of `content` from store and tool callbacks.
- **Type Safety:** TypeScript compilation confirms `TextControls` and `EngineInteractionLayer` are compatible with changes.
- **Architecture Compliance:** Data flow is now:
  - Input -> `TextInputProxy` -> `TextTool` -> `TextBridge` -> **C++ Engine** (Update)
  - **C++ Engine** -> `TextTool Callback` -> `Store.bumpGeneration` -> `useEngineTextEditState` -> **React UI** (Render)

## Next Steps

- Continue with Architecture Audit for other potential shadow states (e.g. Selection sets, History stack).
- Validate behavior in runtime (manual testing recommended).
