# Codebase Cleanup Plan

Generated: 2026-01-15

This plan provides actionable cleanup tasks based on the findings in `CLEANUP_REPORT.md`. Tasks are organized by risk level and can be executed as individual PRs.

---

## Phase 1: Safe Cleanups (No Behavioral Change)

These changes remove dead code with zero risk of breaking functionality.

### PR 1.1: Remove Unused Imports

**Risk**: None
**Verification**: `pnpm typecheck && pnpm lint`

```bash
# Files to modify:
apps/web/engine/core/EngineRuntime.ts        # Remove ProtocolInfo import
apps/web/features/editor/commands/commandExecutor.ts  # Remove CommandResult
apps/web/features/editor/components/EditorStatusBar.tsx  # Remove Magnet
apps/web/features/editor/components/Header.tsx  # Remove Undo2, Redo2
apps/web/features/editor/components/LayerManagerModal.tsx  # Remove useMemo, CommandOp, StyleTarget, ColorControlTarget
apps/web/features/editor/interactions/handlers/SelectionHandler.tsx  # Remove getRotationCursorAngle, worldToScreen
apps/web/features/editor/ui/ribbonConfig.ts  # Remove ReactNode
apps/web/features/editor/hooks/useEditorLogic.ts  # Remove EntityId
apps/web/features/import/utils/dxf/dxfWorker.ts  # Remove DxfImportOptions
apps/web/features/import/utils/dxf/shapeNormalization.ts  # Remove Point
apps/web/features/import/utils/pdfToShapes.ts  # Remove NormalizedViewBox
apps/web/features/settings/sections/ProjectSettings.tsx  # Remove Folder
apps/web/utils/benchmarks/pickBenchmarks.ts  # Remove getPickProfiler, getPickCache, PickResult
```

### PR 1.2: Remove Unused Variables

**Risk**: None
**Verification**: `pnpm typecheck`

```bash
# Files and variables to remove:
apps/web/components/NumericComboField/NumericComboField.tsx:
  - Line 131: openDropdown (dead state)
  - Line 139: handleWheel (dead handler)
  - Line 265: currentInPresets (dead variable)

apps/web/components/TextCaretOverlay.tsx:
  - Line 252: options (unused destructure)

apps/web/components/TextInputProxy.tsx:
  - Line 69: caretIndex (unused variable)

apps/web/components/ui/Dialog.tsx:
  - Line 68: open (unused state)

apps/web/design/ThemeContext.tsx:
  - Line 35: root (unused variable)

apps/web/engine/core/commandBuffer.ts:
  - Line 562: totalLen (dead calculation)

apps/web/engine/renderer/webgl2/passes/GridPass.ts:
  - Line 311: screenBaseSize (unused variable)

apps/web/features/editor/components/LayerManagerModal.tsx:
  - Line 144: styleGeneration (unused variable)

apps/web/features/editor/components/QuickAccessToolbar.tsx:
  - Line 20: history (unused variable)
  - Line 22: executeAction (unused variable)

apps/web/features/import/utils/dxf/curveTessellation.ts:
  - Line 226: spanIndex (unused variable)

apps/web/features/import/utils/dxf/dxfToShapes.ts:
  - Line 216: trans (unused variable)
```

### PR 1.3: Prefix Unused Parameters

**Risk**: None
**Verification**: `pnpm typecheck`

Rename unused callback/interface parameters with `_` prefix:

```typescript
// apps/web/engine/core/runtime/LayerSystem.ts:6
-  private module: EngineModule;
+  private _module: EngineModule;

// apps/web/engine/core/runtime/PickSystem.ts:10
-  private module: EngineModule;
+  private _module: EngineModule;

// apps/web/engine/tools/text/TextInputCoordinator.ts:519
-  (reason: string, payload: unknown) => { ... }
+  (_reason: string, _payload: unknown) => { ... }

// apps/web/features/editor/interactions/BaseInteractionHandler.ts:17,21,25,29
-  onPointerDown(ctx: InputEventContext, ...
+  onPointerDown(_ctx: InputEventContext, ...
// (repeat for all 4 methods)

// apps/web/features/editor/interactions/handlers/IdleHandler.ts:7
-  onPointerDown(ctx: InputEventContext) { ... }
+  onPointerDown(_ctx: InputEventContext) { ... }

// apps/web/features/editor/interactions/handlers/TextHandler.tsx:313
-  onDeactivate(ctx: InputEventContext) { ... }
+  onDeactivate(_ctx: InputEventContext) { ... }

// apps/web/features/editor/utils/tools.ts:5,7
-  (tool: Tool) => ...
-  (shape: Shape) => ...
+  (_tool: Tool) => ...
+  (_shape: Shape) => ...

// apps/web/features/import/utils/dxf/textUtils.ts:77
-  valign: number
+  _valign: number

// apps/web/stores/useSettingsStore.ts:219
-  (state: SettingsState) => ...
+  (_state: SettingsState) => ...
```

---

## Phase 2: Bug Fixes

### PR 2.1: Fix TypeScript Error

**Risk**: Low
**Verification**: `pnpm typecheck`

Fix the `snapSettings` error in `settingsCommands.ts`:

```typescript
// apps/web/features/editor/commands/definitions/settingsCommands.ts
// Line 30: Remove or update the toggleSnap command that references snapSettings
```

Options:
1. Remove the command if snap settings were intentionally removed
2. Add `snapSettings` back to `SettingsState` if it was accidentally removed
3. Update the command to use a different settings property

---

## Phase 3: Structural Improvements (Medium Risk)

These changes require more careful review but significantly improve code quality.

### PR 3.1: Split SelectionHandler.tsx (735 → ~300 LOC each)

**Risk**: Medium
**Verification**: Manual testing of selection, transform, resize operations

Extract into:
- `SelectionHandler.tsx` - Core selection logic (~300 LOC)
- `TransformHandler.tsx` - Move/rotate transforms (~200 LOC)
- `ResizeHandler.tsx` - Resize handle logic (~200 LOC)

### PR 3.2: Split ShapeOverlay.tsx (701 → ~250 LOC each)

**Risk**: Medium
**Verification**: Visual inspection of overlay rendering

Extract into:
- `ShapeOverlay.tsx` - Main orchestrator (~200 LOC)
- `SelectionOverlay.tsx` - Selection box rendering (~200 LOC)
- `HandleOverlay.tsx` - Resize/rotate handles (~200 LOC)
- `SnapOverlay.tsx` - Snap indicator rendering (~100 LOC)

### PR 3.3: Split commandBuffer.ts (653 → ~200 LOC each)

**Risk**: Medium
**Verification**: `pnpm test` + manual command testing

Extract into:
- `commandBuffer.ts` - Core encoding/decoding (~200 LOC)
- `entityCommands.ts` - Entity CRUD commands (~150 LOC)
- `styleCommands.ts` - Style/property commands (~150 LOC)
- `transformCommands.ts` - Transform commands (~150 LOC)

---

## Phase 4: Facade Migration (Reduces Boundary Violations)

### PR 4.1: Add Protocol Types to EngineRuntime

**Risk**: Low
**Verification**: `pnpm typecheck`

Re-export commonly used protocol types from `EngineRuntime.ts`:

```typescript
// apps/web/engine/core/EngineRuntime.ts
export { SelectionMode, MarqueeMode, StyleTarget } from './protocol';
export { EntityKind } from '../types';
```

Update feature imports to use `EngineRuntime` instead of direct imports.

### PR 4.2: Add Command Helpers to EngineRuntime

**Risk**: Low
**Verification**: `pnpm test`

Add helper methods for common command patterns:

```typescript
// apps/web/engine/core/EngineRuntime.ts
class EngineRuntime {
  // Add helpers like:
  createEntity(kind: EntityKind, props: EntityProps): void;
  updateEntityStyle(entityId: EntityId, style: StyleProps): void;
  beginDraft(kind: EntityKind, startPoint: Point): void;
}
```

---

## Execution Checklist

### Before Each PR
- [ ] Run `pnpm typecheck` - no new errors
- [ ] Run `pnpm lint` - no new errors
- [ ] Run `pnpm test` - no new failures
- [ ] Run governance checks:
  ```bash
  node tooling/governance/check_boundaries.js
  node tooling/governance/check_file_size_budget.js
  node tooling/governance/check_engine_api_manifest.js
  ```

### PR Order (Recommended)
1. PR 1.1 (imports) - unblocks other work
2. PR 2.1 (TS error) - fixes CI
3. PR 1.2 (variables) - quick wins
4. PR 1.3 (params) - quick wins
5. PR 4.1 (protocol re-export) - enables facade migration
6. PR 3.1-3.3 (splits) - larger refactors

---

## Metrics to Track

After completing all phases:

| Metric | Before | Target |
|--------|--------|--------|
| TSC unused warnings | 83 | <10 |
| Hard cap violations | 11 | 0 |
| Boundary violations | 29 | <15 |
| Lint errors | 192 | <50 |

---

## Files Modified Summary

| Phase | Files Modified | Risk |
|-------|----------------|------|
| 1.1 | 13 | None |
| 1.2 | 12 | None |
| 1.3 | 10 | None |
| 2.1 | 1-2 | Low |
| 3.1 | 3-4 | Medium |
| 3.2 | 4-5 | Medium |
| 3.3 | 4-5 | Medium |
| 4.1 | 10+ | Low |
| 4.2 | 10+ | Low |
