# UI Audit & Compliance Action Plan

**Date:** 2026-01-16
**Status:** ✅ ALL PHASES COMPLETE

## 1. Compliance Status

| Category | Status | Notes |
|----------|--------|-------|
| **Arbitrary Values** | ✅ Gated | Allowlist active (27 files) |
| **Hex Colors (UI)** | ✅ Gated | `check_hex_ui.js` active |
| **Tailwind Scale** | ⚠️ Warn | Migration needed |
| **Z-Index Scale** | ✅ Migrated | Tokens active |
| **Legacy Tokens** | ✅ Gated | `bg-surface` etc. removed & banned |
| **Primitives** | ✅ Ready | All core primitives implemented |
| **Hot Path** | ✅ Optimized | Ref + RAF pattern enforced |

## 2. Completed Milestones

- **Phase 0:** Governance scripts and allowlists established.
- **Phase 1:** Token system unified into `theme/tokens.css`.
- **Phase 2:** Portal stack and Z-Index scale implemented.
- **Phase 3:** Core primitives (`Button`, `Input`, `Select`, `Icon`) created.
- **Phase 4:** Major surfaces (Ribbon, Modals) migrated to primitives.
- **Phase 5:** Hot-path performance fixed and documented.

## 3. Next Steps (Maintenance)

- **Monitor**: Watch `governance:semantic` warnings (currently ~350). Plan to reduce them in future sprints.
- **Refactor**: Continue replacing ad-hoc layouts with `Stack`/`Grid` primitives (when implemented).
- **A11y**: Add automated a11y tests (jest-axe) for new primitives.

## 4. Allowlist Expiry Tracker

| Allowlist | Expiry Date | Target Phase |
|-----------|-------------|--------------|
| `arbitrary_values_exceptions.json` | 2026-06-30 | Future cleanup |
| `semantic_migration.json` | 2026-06-30 | Future cleanup |
| `hex_data.json` | Permanent (Data) | - |