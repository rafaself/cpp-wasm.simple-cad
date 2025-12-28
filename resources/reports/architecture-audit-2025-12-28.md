# Architecture Audit Report

**Date:** 2025-12-28
**Auditor:** AI Agent
**Scope:** Full codebase review against AGENTS.md architecture rules

---

## Executive Summary

The project has a **strong Engine-First foundation** but contains several violations of the documented architecture principles. Most issues are in the **text editing state management** and **missing Engine-side features** that are documented as mandatory.

| Category                  | Status                                   |
| ------------------------- | ---------------------------------------- |
| Engine as Source of Truth | ✅ Compliant (Text shadow state removed) |
| Draft System in Engine    | ✅ Implemented (DraftState in Engine)    |
| Grid Rendering in Engine  | ✅ Implemented (C++ native)              |
| Viewport Sync to Engine   | ✅ Fixed                                 |
| i18n Extractable Strings  | ❌ Hardcoded inline                      |
| Code Language (EN)        | ✅ Mostly compliant                      |

---

## 1. Critical Violations

### 1.1 Shadow State in `useUIStore.ts` (CRITICAL)

**Location:** `frontend/stores/useUIStore.ts` lines 43-52

**Violation:** Text editing state duplicated in React- [x] **Store**: `useUIStore.ts` contains `engineTextEditState` with full content duplication. **(FIXED)**

```typescript
engineTextEditState: {
  active: boolean;
  textId: number | null;
  content: string;           // ❌ FORBIDDEN - Engine is authority
  caretIndex: number;        // ❌ FORBIDDEN - Engine is authority
  selectionStart: number;    // ❌ FORBIDDEN - Engine is authority
  selectionEnd: number;      // ❌ FORBIDDEN - Engine is authority
  caretPosition: { x: number; y: number; height: number } | null;
}
```

**Rule Violated:** AGENTS.md Section 4 - "Store text content in React - Engine is authority"

**Impact:** Potential desynchronization between React and Engine state during text editing.

**Remediation:**

- Remove `content`, `caretIndex`, `selectionStart`, `selectionEnd` from store
- Query Engine directly when needed via `runtime.getTextContentMeta()` and `runtime.getTextStyleSnapshot()`
- Keep only `active`, `textId`, and `caretPosition` (for overlay rendering)

---

### 1.2 Draft System Not in Engine (CRITICAL)

**Location:** `frontend/features/editor/hooks/useDraftHandler.ts`

**Violation:** Draft shapes (during creation drag) are managed entirely in React state, not Engine.

```typescript
const [draft, setDraft] = useState<Draft>({ kind: "none" });
// Draft is rendered via SVG overlay, not Engine render pipeline
```

**Rule Violated:** AGENTS.md Section 3 - "Draft/Preview Entities - Shapes under construction during drag"

**Impact:**

- React re-renders on every pointermove during shape creation
- Draft shapes use different rendering pipeline (SVG) than final shapes (WebGL)
- Performance degradation on large documents

**Remediation:**

1. Implement in C++ Engine:
   ```cpp
   void beginDraft(EntityType type, float startX, float startY);
   void updateDraft(float currentX, float currentY);
   EntityId commitDraft();
   void cancelDraft();
   bool isDraftActive() const;
   ```
2. Draft should be included in render buffers with a special flag
3. Frontend calls Engine methods instead of managing React state

---

### 1.3 Viewport Not Synced to Engine (HIGH)

**Location:** `frontend/features/editor/components/EditorStatusBar.tsx` and others

**Violation:** Viewport scale changes are not communicated to Engine. **(FIXED)**

```typescript
// Scale changes in React only
const handleZoomIn = () =>
  setViewTransform((prev) => ({
    ...prev,
    scale: Math.min(prev.scale * 1.2, 5),
  }));
```

**Rule Violated:** AGENTS.md Section 7 - "Whenever viewport changes, mandatory sync with Engine: `runtime.setViewScale(viewTransform.scale)`"

**Impact:**

- Engine picking tolerance may be incorrect at different zoom levels
- Stroke width calculations may be wrong

**Remediation:**

1. After every `setViewTransform` that changes scale, call:
   ```typescript
   runtime.apply([{ op: CommandOp.SetViewScale, view: { scale: newScale } }]);
   ```
2. Or create a sync effect that watches `viewTransform.scale`

---

### 1.4 Grid Rendering Not Implemented in Engine (MEDIUM)

**Location:** Grid settings exist in `useSettingsStore.ts` but no rendering code found.

**Rule Violated:** AGENTS.md Section 3 - "Grid Rendering - Generate grid lines/dots in render buffer"

**Current State:** Grid configuration exists but grid is not visually rendered.

**Remediation:**

1. Implement grid generation in C++ Engine's render buffer
2. Engine should receive grid settings via command
3. Grid lines/dots should be in the line buffer

---

## 2. i18n Violations

### 2.1 Hardcoded Portuguese Strings (MEDIUM)

**Locations Found:** 40+ occurrences across UI components

| File                     | Example                                                                |
| ------------------------ | ---------------------------------------------------------------------- |
| `EditorRibbon.tsx`       | `title="Salvar"`, `title="Desfazer"`                                   |
| `Header.tsx`             | `title="Novo Arquivo (Ctrl+N)"`, `title="Configuracoes"`               |
| `EditorStatusBar.tsx`    | `title="Opções de Snap"`, `title="Diminuir Zoom"`                      |
| `EditorSidebar.tsx`      | `title="Nova camada"`, `title={layer.visible ? 'Ocultar' : 'Mostrar'}` |
| `SnappingSettings.tsx`   | `title="Geral"`, `title="Modos de Snap"`                               |
| `CanvasSettings.tsx`     | `title="Grade"`, `title="Eixos Centrais"`                              |
| `QuickAccessToolbar.tsx` | `title="Desfazer"`, `title="Refazer"`                                  |
| `ColorPicker/index.tsx`  | `title="Conta-gotas"`                                                  |
| `EditableNumber.tsx`     | `title="Clique para editar"`                                           |

**Rule Violated:** AGENTS.md Section 10 and frontend-patterns.md Section 11 - "All user-facing strings must be extractable"

**Remediation:**

1. Create `frontend/i18n/labels.ts`:

   ```typescript
   export const LABELS = {
     // File operations
     newFile: "Novo Arquivo",
     open: "Abrir",
     save: "Salvar",

     // Edit operations
     undo: "Desfazer",
     redo: "Refazer",

     // Tools
     selectTool: "Seleção",
     textTool: "Texto",
     // ... all strings
   };
   ```

2. Replace all inline strings with `LABELS.xxx`
3. Add keyboard shortcut formatting utility

---

## 3. Compliant Areas ✅

### 3.1 Engine Source of Truth for Entities

- Entity creation via `CommandOp.UpsertRect`, etc. ✅
- Selection managed by Engine ✅
- Transforms via `beginTransform/updateTransform/commitTransform` ✅
- Undo/Redo via Engine ✅

### 3.2 Store Structure

- `useUIStore` correctly separates UI state (tool, viewport, modals) ✅
- `useSettingsStore` correctly stores preferences ✅
- No shape lists in Zustand ✅

### 3.3 Code Language

- Class/function/variable names in English ✅
- Comments mostly in English ✅
- File names in English ✅

### 3.4 Transform Pattern

- Interactive transforms use `begin/update/commit` pattern ✅
- No React state updates during drag (except `interactionDragActive`) ✅

---

## 4. Action Plan

### Phase 1: Critical Fixes (Immediate)

| Priority | Task                                       | Effort | Files                                                |
| -------- | ------------------------------------------ | ------ | ---------------------------------------------------- | ------- |
| P0       | Remove text shadow state from `useUIStore` | 4h     | `useUIStore.ts`, `TextTool.ts`, `TextInputProxy.tsx` | ✅ Done |
| P0       | Add viewport scale sync to Engine          | 1h     | `EditorStatusBar.tsx`, `EngineInteractionLayer.tsx`  | ✅ Done |

### Phase 2: Engine Features (1-2 weeks)

| Priority | Task                                            | Effort | Files                                              |
| -------- | ----------------------------------------------- | ------ | -------------------------------------------------- | ------- |
| P1       | Implement Draft System in C++ Engine            | 16h    | `engine.h`, `engine.cpp`, `bindings.cpp`           | ✅ Done |
| P1       | Migrate `useDraftHandler` to Engine-based draft | 8h     | `useDraftHandler.ts`, `EngineInteractionLayer.tsx` | ✅ Done |
| P1       | Implement Grid Rendering in Engine              | 8h     | `engine.cpp`, `commandBuffer.ts`                   | ✅ Done |

### Phase 3: i18n Cleanup (1 week)

| Priority | Task                                        | Effort | Files     |
| -------- | ------------------------------------------- | ------ | --------- |
| P2       | Create `labels.ts` with all UI strings      | 2h     | New file  |
| P2       | Replace hardcoded strings in all components | 4h     | 15+ files |
| P2       | Add keyboard shortcut formatting            | 1h     | Utility   |

---

## 5. Estimated Total Effort

| Phase              | Effort       |
| ------------------ | ------------ |
| Phase 1 (Critical) | 5 hours      |
| Phase 2 (Engine)   | 32 hours     |
| Phase 3 (i18n)     | 7 hours      |
| **Total**          | **44 hours** |

---

## 6. Recommendations

1. **Prioritize Phase 1** - Shadow state and viewport sync are architectural violations that can cause subtle bugs.

2. **Draft System** - This is the largest change. Consider implementing incrementally:

   - First: Rect/Circle/Polygon drafts
   - Then: Line/Arrow/Polyline drafts
   - Finally: Text box drafts

3. **i18n** - While not critical for functionality, doing this now prevents technical debt accumulation.

4. **Testing** - After each phase, run full test suite:
   ```bash
   cd cpp/build_native && ctest --output-on-failure
   cd frontend && npx vitest run
   ```

---

## Appendix: Files Requiring Changes

### Text Shadow State

- `frontend/stores/useUIStore.ts`
- `frontend/engine/tools/TextTool.ts`
- `frontend/components/TextInputProxy.tsx`
- `frontend/components/TextCaretOverlay.tsx`

### Viewport Sync

- `frontend/features/editor/components/EditorStatusBar.tsx`
- `frontend/features/editor/components/EngineInteractionLayer.tsx`

### Draft System (Engine)

- `cpp/engine/engine.h`
- `cpp/engine/engine.cpp`
- `cpp/engine/bindings.cpp`
- `frontend/engine/core/EngineRuntime.ts`
- `frontend/features/editor/hooks/useDraftHandler.ts`
- `frontend/features/editor/components/EngineInteractionLayer.tsx`

### Grid Rendering

- `cpp/engine/engine.h`
- `cpp/engine/engine.cpp`
- `frontend/engine/core/commandBuffer.ts`

### i18n

- New: `frontend/i18n/labels.ts`
- `frontend/features/editor/components/EditorRibbon.tsx`
- `frontend/features/editor/components/Header.tsx`
- `frontend/features/editor/components/EditorStatusBar.tsx`
- `frontend/features/editor/components/EditorSidebar.tsx`
- `frontend/features/editor/components/QuickAccessToolbar.tsx`
- `frontend/features/settings/sections/*.tsx`
- `frontend/components/ColorPicker/index.tsx`
- `frontend/components/EditableNumber.tsx`
