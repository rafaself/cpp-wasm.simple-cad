# UI Audit & Compliance Action Plan

**Date:** 2026-01-16
**Status:** Phase 0 Complete -> Phase 1 Ready

## 1. Compliance Status

| Category | Status | Notes |
|----------|--------|-------|
| **Arbitrary Values** | ✅ Gated | Allowlist created (35 files) |
| **Hex Colors (UI)** | ✅ Gated | `check_hex_ui.js` active |
| **Tailwind Scale** | ⚠️ Warn | 358 violations detected (migration needed) |
| **Z-Index Scale** | ⚠️ Warn | Documentation updated; migration pending |
| **PR Process** | ✅ Active | Template updated with checklist |

## 2. Immediate Priorities (Phase 1)

1. **Token Unification**:
   - Merge `shared/styles/tokens.css` into `theme/tokens.css`.
   - Update `tailwind.config.cjs` to reference single source.
   - Audit `apps/web/src/styles/recipes.ts` for token usage.

2. **Z-Index Migration**:
   - Target files with `z-[...]` and `z-50` for semantic replacement.

## 3. Manual Audit Log

- **Hot Path**: `EngineInteractionLayer.tsx` still has `setMousePos` Zustand update. (Scheduled for Phase 5).
- **Buttons**: Ribbon buttons are heavily duplicated. (Scheduled for Phase 3).
- **Z-Index**: `z-[9999]` is common in portals.

## 4. Allowlist Expiry Tracker

| Allowlist | Expiry Date | Target Phase |
|-----------|-------------|--------------|
| `arbitrary_values_exceptions.json` | 2026-06-30 | Phase 2 |
| `semantic_migration.json` | 2026-06-30 | Phase 4 |
| `hex_data.json` | Permanent (Data) | - |
