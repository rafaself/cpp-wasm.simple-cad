# Codebase Cleanup Report

Generated: 2026-01-15

## Executive Summary

This report documents dead code, unused artifacts, and technical debt identified during a comprehensive audit of the eletrocad-webapp repository. The audit was performed after the monorepo refactoring that moved:
- `frontend/` → `apps/web/`
- `cpp/` → `packages/engine/`

### Baseline Status

| Check | Status | Details |
|-------|--------|---------|
| Build | ✅ PASS | WASM and web build successful |
| TypeScript | ❌ 1 error | `snapSettings` property missing on `SettingsState` |
| Lint | ❌ 192 errors, 142 warnings | Various ESLint issues |
| Format | ❌ 14 files | Need Prettier formatting |
| Tests | ❌ 4 failing | 466 passing, 4 failing |
| Boundaries | ✅ PASS | All tracked exceptions documented |
| File Size | ❌ 11 violations | Hard cap exceeded |
| Engine API | ✅ PASS | Manifest up to date |

---

## 1. TypeScript Dead Code (TSC Unused Diagnostics)

### 1.1 Production Code - Unused Variables (35 instances)

#### Components
| File | Line | Variable | Type | Recommendation |
|------|------|----------|------|----------------|
| `NumericComboField.tsx` | 131 | `openDropdown` | dead state | Remove |
| `NumericComboField.tsx` | 139 | `handleWheel` | dead handler | Remove |
| `NumericComboField.tsx` | 265 | `currentInPresets` | dead variable | Remove |
| `TextCaretOverlay.tsx` | 252 | `options` | unused destructure | Remove |
| `TextInputProxy.tsx` | 69 | `caretIndex` | unused variable | Remove |
| `Dialog.tsx` | 68 | `open` | unused state | Remove |
| `ThemeContext.tsx` | 35 | `root` | unused variable | Remove |

#### Engine Layer
| File | Line | Variable | Type | Recommendation |
|------|------|----------|------|----------------|
| `EngineRuntime.ts` | 11,52 | `ProtocolInfo`, imports | unused import | Remove |
| `commandBuffer.ts` | 562 | `totalLen` | dead calculation | Remove |
| `LayerSystem.ts` | 6 | `module` property | unused | Prefix with `_` |
| `PickSystem.ts` | 10 | `module` property | unused | Prefix with `_` |
| `GridPass.ts` | 311 | `screenBaseSize` | unused variable | Remove |
| `TextInputCoordinator.ts` | 519 | `reason`, `payload` | unused params | Prefix with `_` |

#### Features
| File | Line | Variable | Type | Recommendation |
|------|------|----------|------|----------------|
| `commandExecutor.ts` | 12 | `CommandResult` | unused import | Remove |
| `EditorStatusBar.tsx` | 2,31 | `Magnet`, `isMouseOverCanvas` | unused | Remove |
| `Header.tsx` | 5-6 | `Undo2`, `Redo2` | unused icons | Remove |
| `LayerManagerModal.tsx` | 2,5-6,15,144 | multiple | unused imports/vars | Remove |
| `QuickAccessToolbar.tsx` | 20,22 | `history`, `executeAction` | unused | Remove |
| `RibbonGroup.tsx` | 31 | `index` | unused param | Prefix with `_` |
| `useEditorLogic.ts` | 6 | `EntityId` | unused import | Remove |
| `BaseInteractionHandler.ts` | 17,21,25,29 | `ctx` params | base class | Prefix with `_` |
| `IdleHandler.ts` | 7 | `ctx` | unused param | Prefix with `_` |
| `SelectionHandler.tsx` | 9,21 | rotation/transform utils | unused imports | Remove |
| `TextHandler.tsx` | 313 | `ctx` | unused param | Prefix with `_` |
| `ribbonConfig.ts` | 22 | `ReactNode` | unused import | Remove |
| `tools.ts` | 5,7 | `tool`, `shape` | unused params | Prefix with `_` |

#### Import Utils
| File | Line | Variable | Type | Recommendation |
|------|------|----------|------|----------------|
| `curveTessellation.ts` | 226 | `spanIndex` | unused | Remove |
| `dxfToShapes.ts` | 216 | `trans` | unused | Remove |
| `dxfWorker.ts` | 12 | `DxfImportOptions` | unused import | Remove |
| `shapeNormalization.ts` | 4 | `Point` | unused import | Remove |
| `textUtils.ts` | 77 | `valign` | unused param | Prefix with `_` |
| `pdfToShapes.ts` | 5,59,342 | multiple | unused | Remove/prefix |

#### Other
| File | Line | Variable | Type | Recommendation |
|------|------|----------|------|----------------|
| `ProjectSettings.tsx` | 1 | `Folder` | unused icon | Remove |
| `useSettingsStore.ts` | 219 | `state` | unused param | Prefix with `_` |
| `performanceAPI.ts` | 37-38 | timing functions | unused exports | Verify usage or remove |
| `pickBenchmarks.ts` | 23-24,27 | profiler/cache | unused imports | Remove |

### 1.2 Test Files - Acceptable Unused (Safe to Ignore)

These are legitimate unused parameters in test infrastructure:
- `tests/setup.ts` - `originalPerformanceNow` (stored for restoration)
- `tests/utils/testHelpers.ts` - loop indices and comparison params
- Various `.test.tsx` files - `React` imports for JSX

---

## 2. File Size Budget Violations

### Hard Cap Violations (11 files)

| File | LOC | Limit | Over By | Priority |
|------|-----|-------|---------|----------|
| `packages/engine/engine/history/history_manager.cpp` | 955 | 870 | +85 | HIGH |
| `packages/engine/engine.cpp` | 915 | 900 | +15 | MEDIUM |
| `packages/engine/engine/interaction/pick_system.cpp` | 958 | 900 | +58 | HIGH |
| `packages/engine/engine/impl/engine_snapshot.cpp` | 902 | 850 | +52 | HIGH |
| `apps/web/features/editor/interactions/handlers/SelectionHandler.tsx` | 735 | 500 | +235 | CRITICAL |
| `apps/web/features/editor/components/ShapeOverlay.tsx` | 701 | 500 | +201 | CRITICAL |
| `apps/web/engine/core/commandBuffer.ts` | 653 | 580 | +73 | HIGH |
| `apps/web/engine/core/protocol.ts` | 613 | 500 | +113 | HIGH |
| `apps/web/engine/core/EngineRuntime.ts` | 594 | 560 | +34 | MEDIUM |
| `apps/web/features/editor/interactions/handlers/DraftingHandler.tsx` | 521 | 500 | +21 | LOW |
| `apps/web/features/editor/colors/ColorRibbonControls.tsx` | 516 | 500 | +16 | LOW |

### Soft Cap Warnings (23 files)

See `node tooling/governance/check_file_size_budget.js` for full list.

---

## 3. Boundary Violations (Tracked Exceptions)

The following 29 feature→engine import violations are tracked in `boundary_rules.json`:

### By Component Category

**Interaction Handlers** (12 violations)
- `DraftingHandler.tsx` → 3 engine imports
- `SelectionHandler.tsx` → 4 engine imports
- `TextHandler.tsx` → 3 engine imports

**Editor Components** (11 violations)
- `LayerManagerModal.tsx` → 2 engine imports
- `ShapeOverlay.tsx` → 4 engine imports
- `EngineInteractionLayer.tsx` → 1 engine import
- `NextSurface.tsx` → 1 engine import
- `RotationTooltip.tsx` → 1 engine import
- `DrawingInspectorPanel.tsx` → 2 engine imports

**Other** (6 violations)
- `useEditorLogic.ts` → 2 engine imports
- `LayerRibbonControls.tsx` → 1 engine import
- `textToolController.ts` → 1 engine import
- `DeveloperSettings.tsx` → 1 engine import
- `applyColorAction.ts` → 2 engine imports
- `colorState.ts` → 1 engine import

---

## 4. TypeScript Error

### Critical Error
```
features/editor/commands/definitions/settingsCommands.ts:30
Property 'snapSettings' does not exist on type 'SettingsState'.
```

**Root Cause**: The `snapSettings` property was removed from `SettingsState` but the command definition still references it.

**Fix**: Remove or update the `toggleSnap` command in `settingsCommands.ts`.

---

## 5. Governance Script Fixes Applied

During this audit, several governance scripts were fixed to use the new paths after monorepo refactoring:

1. **`check_boundaries.js`** - Fixed `normalizeImportPath()` to use `apps/web` instead of `frontend`
2. **`deadcode_cpp_report.sh`** - Fixed paths from `cpp/` to `packages/engine/`
3. **`boundary_rules.json`** - Added 9 new tracked exceptions

---

## 6. Recommendations

### Immediate (PR-ready)

1. **Fix TypeScript error** - Remove `snapSettings` reference in `settingsCommands.ts`
2. **Remove unused imports** - ~25 unused imports across production code
3. **Prefix unused params** - ~15 callback parameters need `_` prefix

### Short-term (Next Sprint)

1. **Split oversized files**:
   - `SelectionHandler.tsx` (735 LOC) → extract selection modes
   - `ShapeOverlay.tsx` (701 LOC) → extract overlay renderers
   - `commandBuffer.ts` (653 LOC) → extract command builders

2. **Reduce boundary violations** - Create facade methods in `EngineRuntime` for common operations

### Medium-term (Backlog)

1. **C++ file size debt** - Split `history_manager.cpp`, `pick_system.cpp`, `engine_snapshot.cpp`
2. **Complete facade migration** - Move all 29 boundary violations behind proper facades
