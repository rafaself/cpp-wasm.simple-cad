# Deep Dive Report: Text Shadow State

**Date:** 2025-12-28
**Topic:** Critical Analysis of Text Editing Shadow State Violations
**Scope:** `useUIStore.ts`, `TextTool.ts`, `TextInputProxy.tsx`

---

## 1. Problem Definition

The current implementation violates the **Engine-First** architecture by maintaining a duplicate "shadow state" of text content and selection indices within the React application (`useUIStore`).

**Core Architectectural Rule Violation:**

> "AC01: Source of Truth - The C++ Engine is the single source of truth for all document state. React must never duplicate this state."

### Current Data Flow (Incorrect)

```
[Engine] -> (sync) -> [TextTool] -> (callback) -> [useUIStore] -> (props) -> [TextInputProxy]
   ^                                                   |
   |                                                   |
   +--------------------(commands)---------------------+
```

This creates cycles and potential desynchronization where React believes `content="ABC"` while Engine has `content="ABCD"` due to race conditions or skipped updates.

---

## 2. Detailed Code Analysis

### 2.1 `frontend/stores/useUIStore.ts`

**Violation:** Explicit storage of Engine data.

```typescript
// lines 44-52
engineTextEditState: {
    active: boolean;
    textId: number | null;
    content: string;           // ❌ CRITICAL: Engine data duplication
    caretIndex: number;        // ❌ CRITICAL: Engine data duplication
    selectionStart: number;    // ❌ CRITICAL: Engine data duplication
    selectionEnd: number;      // ❌ CRITICAL: Engine data duplication
    caretPosition: { ... }     // ✅ ACCEPTABLE: Transient UI state for overlay
}
```

The store acts as a cache that must be manually kept in sync via `setEngineTextEditContent`, which is an anti-pattern.

### 2.2 `frontend/engine/tools/TextTool.ts`

**Status:** Partially Fixed but still problematic.

- **Good:** The `TextToolState` interface (line 37) has removed `content`.
- **Bad:** It still maintains `caretIndex`, `selectionStart`, `selectionEnd`.
- **Bad:** The `onInputDelta` method triggers callbacks that push content back to the store (lines 657-663):
  ```typescript
  this.callbacks.onTextUpdated?.(
      textId,
      contentAfterEdit, // ❌ Pushes content to React
      ...
  );
  ```

### 2.3 `frontend/components/TextInputProxy.tsx`

**Challenge:** This component _needs_ `content` to function correctly for IME (Input Method Editor) and diffing inputs.

```typescript
export interface TextInputProxyProps {
  content: string; // Needs full content
  caretIndex: number; // Needs caret
  // ...
}
```

Since it's a controlled component pattern, it demands the upstream state (the Store) to hold the data.

---

## 3. Impact Analysis

1.  **Memory Usage:** Double storage of large text blocks (WASM heap + JS string heap).
2.  **Performance:** Every keystroke triggers a roundtrip:
    - JS Event -> Engine Command -> Engine Update -> JS Callback -> Store Update -> React Re-render -> Component Update.
    - This is the "Chatty" anti-pattern identified in AGENTS.md.
3.  **Correctness:** If Engine rejects an edit (e.g., max length, validation), React store might desync if not carefully reset.

---

## 4. Proposed Solution: "Direct-Read, Command-Write"

We need to break the cycle by making the Store store _metadata_ (ID + Version), and components read _data_ directly from Engine.

### 4.1 Refactored Store (`useUIStore.ts`)

```typescript
interface EngineTextEditState {
  active: boolean;
  textId: number | null;
  version: number; // ✅ NEW: Increments on every edit
  // REMOVED: content, caretIndex, selection*
  // KEPT: caretPosition (for overlay)
}
```

### 4.2 Data Access Component (`TextEditManager.tsx`)

Instead of passing `content` from the store, we create a smart wrapper that reads from Engine when `version` changes.

```typescript
function TextEditManager() {
  const { textId, version } = useUIStore((s) => s.engineTextEditState);

  // Memoized read from Engine - only re-reads when version bumps
  const textData = useMemo(() => {
    if (!textId) return emptyData;
    return {
      content: runtime.getTextContent(textId),
      caret: runtime.getTextCaretIndex(textId),
      selection: runtime.getTextSelection(textId),
    };
  }, [textId, version]); // Reacts to version bump

  return (
    <TextInputProxy
      content={textData.content}
      caretIndex={textData.caret}
      // ...
    />
  );
}
```

### 4.3 TextTool Update

Ensure `TextTool` only updates the `version` counter in the store, not the content payload.

```typescript
// TextTool.ts
handleInputDelta(...) {
    // 1. Send command to Engine
    this.bridge.insertContent(...);

    // 2. Notify Store that version changed
    this.callbacks.onTextVersionBump(textId); // Just a signal!
}
```

---

## 5. Action Plan

1.  **Modify `useUIStore.ts`**:

    - Deprecate/Remove `content`, `caretIndex`, `selection*` from `engineTextEditState`.
    - Add `editGeneration: number`.
    - Add `incrementEditGeneration()` action.

2.  **Update `TextTool.ts`**:

    - Change `onTextUpdated` callback to `onTextEdit` (void) or similar signal.
    - Remove content passing in callbacks.

3.  **Refactor `EditorLayer.tsx` (consumer)**:
    - Implement the `useMemo` pattern to fetch text data from `runtime` using `editGeneration` as dependency.
    - Pass this derived data to `TextInputProxy`.

This approach strictly aligns with **Engine-First** while satisfying `TextInputProxy`'s need for data, without duplicating state in the persistent Store.
