# Phase 3 Implementation Plan: i18n Cleanup

This plan addresses the widespread usage of hardcoded Portuguese strings in the frontend codebase.

## Objective

Centralize all user-facing strings into a single `LABELS` dictionary to facilitate maintenance and future localization support (English/Portuguese).

## 1. Analysis Findings

- **Hardcoded Strings:** Found in `title`, `label`, `aria-label`, and JSX content (e.g., `<span>Texto</span>`).
- **Files Affected:**
  - `frontend/features/editor/components/EditorStatusBar.tsx`
  - `frontend/features/editor/components/EditorSidebar.tsx`
  - `frontend/features/editor/components/Header.tsx`
  - `frontend/features/editor/ribbon/EditorRibbon.tsx`
  - `frontend/features/settings/sections/SnappingSettings.tsx`
  - `frontend/features/settings/sections/CanvasSettings.tsx`
  - And others.

## 2. Plan of Action

### 2.1 Create Translation Definition (`frontend/i18n/labels.ts`)

- [ ] Create directory `frontend/i18n`.
- [ ] Create file `labels.ts`.
- [ ] Populate `LABELS` object with nested categories (e.g., `menu`, `tools`, `statusbar`, `settings`).

### 2.2 Refactoring Components

- [ ] Convert `EditorStatusBar.tsx`: Replace hardcoded strings with `LABELS.statusbar.*`.
- [ ] Convert `EditorSidebar.tsx`: Replace hardcoded strings with `LABELS.sidebar.*`.
- [ ] Convert `Header.tsx`: Replace menu items and tooltips with `LABELS.menu.*`.
- [ ] Convert `EditorRibbon.tsx` & Controls: Replace tool names and undo/redo with `LABELS.tools.*`.
- [ ] Convert Settings Modals: Replace labels in `SnappingSettings.tsx`, `CanvasSettings.tsx` etc.

### 2.3 Keyboard Shortcut Formatting (Optional but recommended)

- [ ] Create a helper `formatShortcut(key: string)` to standardise display (e.g. "Ctrl+S" vs "Cmd+S" logic if needed, or just standard string).

## 3. Execution

I will start by creating the `labels.ts` file with all identified strings from the grep investigation, and then systematically apply them file by file.

## 4. Verification

- Manual review of changed files to ensure no strings were missed.
- Verify typescript compiles without errors.
