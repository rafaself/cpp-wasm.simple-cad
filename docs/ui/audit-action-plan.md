# UI Audit & Compliance Action Plan

**Date:** 2026-01-16
**Status:** Phase 3 Complete -> Phase 4 Ready

## 1. Compliance Status

| Category | Status | Notes |
|----------|--------|-------|
| **Arbitrary Values** | ✅ Gated | Allowlist active (27 files) |
| **Hex Colors (UI)** | ✅ Gated | `check_hex_ui.js` active |
| **Tailwind Scale** | ⚠️ Warn | Migration needed |
| **Z-Index Scale** | ✅ Migrated | Tokens active, `z-[...]` removed from key components |
| **Legacy Tokens** | ✅ Gated | `bg-surface` etc. removed & banned |
| **Primitives** | ✅ Ready | Button, Input, Icon, Popover, Portal available |

## 2. Immediate Priorities (Phase 4: Migrate Surfaces)

1. **Ribbon Migration**:
   - Replace `RibbonButton` variants with `Button` primitive.
   - Replace `RibbonGroup` inputs with `Input` primitive.

2. **Inspector Migration**:
   - Update `LayerManagerModal` to use `Button` and `Input`.
   - Update `SettingsModal` to use `Button` and `Input`.

3. **Dropdown Migration**:
   - Refactor `CustomSelect` to use `Popover` + `Button` (trigger) + `Layer`.

## 3. Manual Audit Log

- **Hot Path**: `EngineInteractionLayer.tsx` still has `setMousePos` Zustand update. (Scheduled for Phase 5).
- **Z-Index**: Dropdowns over Modals issue resolved via token update.

## 4. Allowlist Expiry Tracker

| Allowlist | Expiry Date | Target Phase |
|-----------|-------------|--------------|
| `arbitrary_values_exceptions.json` | 2026-06-30 | Phase 4 (Sizing) |
| `semantic_migration.json` | 2026-06-30 | Phase 4 |
| `hex_data.json` | Permanent (Data) | - |
