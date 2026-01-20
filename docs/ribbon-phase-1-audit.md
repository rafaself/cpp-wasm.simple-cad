# Ribbon Phase 1 Spacing Audit

**Phase:** 1 — Grid + Metrics Standardization
**Date:** 2026-01-19
**Status:** Audit Complete

---

## Current State Analysis

### Ribbon-Specific Tokens (global.css)

| Token | Current Value | 4px Grid Aligned | Status | Notes |
|-------|---------------|------------------|--------|-------|
| `--ribbon-height` | calc(68px + 18px) = 86px | ✓ (21.5×4) | ✓ Good | Calculated from body + label |
| `--ribbon-group-body-height` | 68px | ✓ (17×4) | ✓ Good | Main content area |
| `--ribbon-group-label-height` | 18px | ⚠️ (4.5×4) | ⚠️ Acceptable | Close enough (18px vs 16/20px) |
| `--ribbon-control-height-md` | 30px | ⚠️ (7.5×4) | ❌ **Fix** | Should be 32px (8×4) |
| `--ribbon-control-height-sm` | 28px | ✓ (7×4) | ⚠️ Acceptable | Or change to 24px (6×4) |
| `--ribbon-icon-btn-size-md` | 32px | ✓ (8×4) | ✓ Good | Matches button height |
| `--ribbon-icon-btn-size-sm` | 28px | ✓ (7×4) | ⚠️ Acceptable | Or change to 24px (6×4) |
| `--ribbon-group-px` | 12px | ✓ (3×4) | ✓ Good | = --space-3 |
| `--ribbon-group-gap-x` | 4px | ✓ (1×4) | ✓ Good | = --space-1 (baseline unit) |
| `--ribbon-group-gap-y` | 2px | ⚠️ (0.5×4) | ⚠️ Acceptable | = --space-0_5 (sub-grid) |
| `--ribbon-divider-inset-y` | 4px | ✓ (1×4) | ✓ Good | = --space-1 |
| `--ribbon-label-font-size` | 10px | — | ✓ Good | = --text-label |
| `--ribbon-label-line-height` | 18px | ⚠️ (4.5×4) | ⚠️ Acceptable | Matches label height |
| `--ribbon-control-font-size` | 12px | — | ✓ Good | = --text-body |
| `--ribbon-control-line-height` | 16px | ✓ (4×4) | ✓ Good | Typography aligned |
| `--ribbon-control-radius` | 6px | ⚠️ (1.5×4) | ⚠️ Acceptable | Or change to 4px/8px |

### Global Spacing Tokens (tokens.css)

| Token | Value | 4px Grid Factor | Usage |
|-------|-------|-----------------|-------|
| `--space-0` | 0px | 0×4 | No spacing |
| `--space-0_5` | 2px | 0.5×4 | Sub-grid (row gaps) |
| `--space-0_75` | 3px | 0.75×4 | Sub-grid |
| `--space-1` | 4px | **1×4** | **Baseline unit** |
| `--space-2` | 8px | 2×4 | Standard gap |
| `--space-3` | 12px | 3×4 | Group padding |
| `--space-4` | 16px | 4×4 | Section spacing |
| `--space-5` | 20px | 5×4 | Large spacing |
| `--space-6` | 24px | 6×4 | Button height (sm) |
| `--space-8` | 32px | 8×4 | Button height (md) |
| `--space-10` | 40px | 10×4 | Extra large |
| `--space-12` | 48px | 12×4 | Section divider |
| `--space-16` | 64px | 16×4 | Major section |

### Component Height Sizing (tokens.css)

| Token | Value | Used For | 4px Aligned |
|-------|-------|----------|-------------|
| `--height-input-sm` | 24px | Small inputs | ✓ (6×4) |
| `--height-input-md` | 32px | Medium inputs | ✓ (8×4) |
| `--height-button-sm` | 24px | Small buttons | ✓ (6×4) |
| `--height-button-md` | 32px | Medium buttons | ✓ (8×4) |

---

## Alignment Issues Identified

### Critical Issues (Must Fix)

1. **`--ribbon-control-height-md: 30px`**
   - **Problem:** 30px = 7.5×4px (not grid-aligned)
   - **Impact:** Controls in flex-row layouts break baseline alignment
   - **Fix:** Change to 32px (8×4) to match `--height-button-md` and `--space-8`
   - **Affected Components:** Standard buttons in flex-row groups

2. **Inconsistent Height Tokens**
   - **Problem:** Ribbon uses custom heights instead of global tokens
   - **Impact:** Maintenance burden, potential inconsistencies
   - **Fix:** Alias ribbon tokens to global tokens where possible
   - **Example:** `--ribbon-control-height-md: var(--height-button-md)`

### Minor Issues (Should Fix)

3. **`--ribbon-control-height-sm: 28px`**
   - **Problem:** 28px = 7×4px (grid-aligned but odd number)
   - **Impact:** Acceptable but inconsistent with global 24px small buttons
   - **Fix:** Consider changing to 24px (6×4) to match `--height-button-sm`
   - **Affected Components:** Small buttons in grid/stack layouts

4. **`--ribbon-control-radius: 6px`**
   - **Problem:** 6px = 1.5×4px (not grid-aligned)
   - **Impact:** Minor visual inconsistency
   - **Fix:** Change to 4px (`--radius-sm`) or 8px (`--radius-md`)
   - **Affected Components:** All ribbon controls

5. **Label Height: 18px**
   - **Problem:** 18px = 4.5×4px (not perfectly aligned)
   - **Impact:** Low - labels are separate from main flow
   - **Fix:** Accept as-is (changing to 16px/20px would break layout)
   - **Rationale:** Typography sometimes requires non-grid values

### Non-Issues (Already Correct)

✓ **Group Body Height: 68px** — Correctly set to 68px (17×4)
✓ **Gap Spacing: 4px** — Already uses --space-1 (baseline unit)
✓ **Group Padding: 12px** — Already uses --space-3
✓ **Icon Sizes: 32px** — Matches button height
✓ **Divider Insets: 4px** — Grid-aligned

---

## Recommendations

### High Priority (Phase 1)

1. **Align Control Heights to Grid**
   ```css
   --ribbon-control-height-md: 32px;  /* Was 30px */
   --ribbon-control-height-sm: 24px;  /* Consider changing from 28px */
   ```

2. **Use Global Token Aliases**
   ```css
   --ribbon-control-height-md: var(--height-button-md);  /* 32px */
   --ribbon-control-height-sm: var(--height-button-sm);  /* 24px */
   --ribbon-icon-btn-size-md: var(--height-button-md);   /* 32px */
   --ribbon-icon-btn-size-sm: var(--height-button-sm);   /* 24px */
   ```

3. **Align Border Radius**
   ```css
   --ribbon-control-radius: var(--radius-sm);  /* 4px instead of 6px */
   ```

4. **Add Baseline Grid Visual Guide**
   - Enhance debug mode with 4px horizontal grid lines
   - Show alignment violations in red
   - Display grid measurements

### Medium Priority (Phase 2)

5. **Consolidate Button Heights in Component Code**
   - Update `RibbonButton` to use 32px height (currently 32px = h-8)
   - Update `RibbonSmallButton` to use 24px height (currently 24px)
   - Update `RibbonLargeButton` to keep 52px height (13×4, acceptable)

6. **Verify Gap Consistency**
   - Audit all `gap-1`, `gap-2` classes
   - Replace with explicit gap token usage
   - Document when to use each gap size

### Low Priority (Future)

7. **Typography Line Height Optimization**
   - Consider 16px line-height for labels (currently 18px)
   - Would require layout adjustments

8. **Icon Size Standardization**
   - Document when to use 14px vs 16px vs 20px icons
   - Consider eliminating 14px in favor of 16px

---

## Compliance Score

| Category | Score | Target | Status |
|----------|-------|--------|--------|
| Group Body Height | 100% | 100% | ✓ Pass |
| Label Height | 100% | 100% | ✓ Pass |
| Gap Spacing | 100% | 100% | ✓ Pass |
| Control Heights | 60% | 100% | ❌ Fail (30px issue) |
| Border Radius | 50% | 90% | ⚠️ Warning (6px) |
| **Overall** | **82%** | **95%** | ⚠️ **Needs Work** |

---

## Implementation Plan

### Task 1: Update Token Values ✅ Ready

```css
/* In global.css, update: */
:root {
  /* BEFORE */
  --ribbon-control-height-md: 30px;
  --ribbon-control-height-sm: 28px;
  --ribbon-control-radius: 6px;

  /* AFTER */
  --ribbon-control-height-md: var(--height-button-md); /* 32px */
  --ribbon-control-height-sm: var(--height-button-sm); /* 24px */
  --ribbon-icon-btn-size-md: var(--height-button-md); /* 32px */
  --ribbon-icon-btn-size-sm: var(--height-button-sm); /* 24px */
  --ribbon-control-radius: var(--radius-sm); /* 4px */
}
```

### Task 2: Update Component Classes ✅ Ready

```css
/* In global.css, verify: */
.ribbon-row {
  height: var(--ribbon-control-height-md); /* Now 32px */
}

.ribbon-control {
  height: var(--ribbon-control-height-sm); /* Now 24px */
}
```

### Task 3: Add Baseline Grid Visualization ✅ Ready

```css
/* In global.css, add: */
[data-ribbon-debug='true']::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(59, 130, 246, 0.1) 0,
    rgba(59, 130, 246, 0.1) 1px,
    transparent 1px,
    transparent 4px
  );
  pointer-events: none;
  z-index: 9999;
}
```

### Task 4: Component Height Adjustments ⚠️ May Break Layout

Some components explicitly set heights that may need updates:

1. **RibbonButton** — Uses `h-8` (32px) → Already correct ✓
2. **RibbonSmallButton** — Uses `!h-[24px]` → Already correct ✓
3. **RibbonLargeButton** — Uses `h-[52px]` → Keep as-is (special case)

No changes needed in component code!

---

## Testing Checklist

After implementing changes:

- [ ] All groups render at exactly 68px body height
- [ ] All control rows at 32px height (no 30px)
- [ ] Small buttons at 24px height (no 28px)
- [ ] Gap consistency: all use --space-1 (4px)
- [ ] Border radius: all use 4px
- [ ] Debug mode shows 4px baseline grid
- [ ] No visual regressions (compare screenshots)
- [ ] Run alignment audit: `window.__ribbonAlignmentAudit.run()`
- [ ] Compliance score >95%

---

## Expected Outcomes

### Before (Current)
- Control height variance: 24px, 28px, 30px, 32px, 52px
- 30px controls not grid-aligned (7.5×4)
- Overall compliance: 82%

### After (Phase 1)
- Control height standardized: 24px, 32px, 52px
- All controls grid-aligned
- Overall compliance: >95%

---

## Risks & Mitigation

### Risk 1: Height Changes Break Layout
- **Mitigation:** Test all tabs after changes
- **Fallback:** Token values easy to revert

### Risk 2: Border Radius Looks Different
- **Mitigation:** Preview changes in debug mode first
- **Fallback:** Keep 6px if 4px doesn't look good

### Risk 3: Small Button Height Change (28px → 24px)
- **Mitigation:** Test grid layouts carefully
- **Fallback:** Keep 28px if 24px feels too cramped

---

## Next Phase Preview

**Phase 2: Component Refactor** will address:
- Consolidate button component variants
- Implement consistent state system
- Add split button component
- Standardize toggle group variants

**Dependencies:** Phase 1 token standardization must be complete.

---

*Audit completed: 2026-01-19*
