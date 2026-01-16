# UI Design Compliance Plan — DESIGN.md Migration

**Date:** 2026-01-16
**Status:** Phase 0 Planning Complete
**Auditor:** AI Agent (Claude Opus 4.5)
**Reference Documents:** `DESIGN.md`, `AGENTS.md`, `docs/ui/UI_AUDIT_REPORT.md`

---

## 1. Executive Summary

1. **Duplicate Token Systems**: Two parallel token files (`theme/theme.css` + `shared/styles/tokens.css`) violate DESIGN.md §3.1 single source of truth.
2. **Arbitrary Values (BLOCKER)**: 40+ arbitrary Tailwind values (`text-[10px]`, `z-[9999]`, `px-2.5`) violating DESIGN.md §3.2. Note: Tailwind scale values (`z-50`, `gap-3`) are WARN-level debt.
3. **Z-Index: No Two-Scale Model**: Missing canvas/portal domain tokens; 15+ arbitrary z-index values (`z-[9999]`, `z-[10000]`). Tailwind scale (`z-50`, `z-10`) is acceptable temporarily with migration plan.
4. **Missing Primitives**: Only 4 UI primitives exist (`Dialog`, `Toast`, `Toggle`, `Section`); DESIGN.md §5.1 requires 10+ mandatory primitives.
5. **Button Duplication**: 5+ button variants with overlapping logic (RibbonButton, RibbonLargeButton, RibbonSmallButton, RibbonIconButton, DialogButton).
6. **Hot-Path Violation**: `setMousePos(world)` Zustand update on every `pointermove` (L135 in EngineInteractionLayer.tsx) violates DESIGN.md §1.2. Missing policy: where mousePos should live.
7. **Hex Colors: UI vs Data Conflated**: 60+ files in hex allowlist mix UI hex (BLOCKER) with data hex (OK for CAD entity colors). Needs separation: `hex-ui` vs `hex-data`.
8. **Accessibility Gaps**: No consistent `focus-visible` ring; ARIA coverage is partial (~24 files have ARIA, ~63 do not).
9. **Governance Gaps**: No CI check for z-index, spacing, or ARIA violations; only hex color check exists. ESLint rules proposed are technically fragile (won't catch dynamic classNames).
10. **Token Categories Missing**: No icon tokens, motion tokens, or component sizing tokens per DESIGN.md §3.3.

---

## 2. Compliance Scorecard

| Category | DESIGN.md Reference | Compliance | Gaps | Severity |
|----------|---------------------|------------|------|----------|
| **Tokens: Single Source** | §3.1 | ❌ FAIL | 2 parallel systems | BLOCKER |
| **Tokens: Categories** | §3.3 | ⚠️ PARTIAL | Missing icon/motion/component tokens | HIGH |
| **Z-Index Two-Scale** | §4.6 | ❌ FAIL | No canvas/portal domains; 15+ hardcoded | CRITICAL |
| **Primitives** | §5.1 | ❌ FAIL | 4/10+ mandatory primitives exist | HIGH |
| **Accessibility** | §7 | ⚠️ PARTIAL | Inconsistent focus-visible, ARIA gaps | MEDIUM |
| **Hot-Path Performance** | §1.2 | ⚠️ PARTIAL | RAF batching good, but Zustand update on pointermove | MEDIUM |
| **Governance/CI** | §9 | ⚠️ PARTIAL | Hex check exists; no z-index/spacing/primitive enforcement | HIGH |
| **Interaction Standards** | §6 | ⚠️ PARTIAL | Dialog has focus trap; dropdowns missing keyboard nav | MEDIUM |

**Overall Score: 3/8 categories compliant**

---

## 3. Gap Analysis (Evidence-Based)

### 3.1 Token System (DESIGN.md §3)

**Requirement:** Single source of truth at `apps/web/theme/tokens.css`

**Current State:**
- `apps/web/theme/theme.css` (L1-45): Defines `--color-bg`, `--color-surface-1`, `--color-text`, etc.
- `apps/web/shared/styles/tokens.css` (L1-30): Defines `--color-background`, `--color-surface`, `--color-foreground`, etc.
- Both imported via `apps/web/design/index.css` (L1-3)

**Evidence:**
```css
/* theme/theme.css */
--color-bg: 213 18% 16%;
--color-surface-1: 222 47% 11%;

/* shared/styles/tokens.css */
--color-background: 220 33% 98%;
--color-surface: 220 33% 96%;
```

**Tailwind Config Duplication:**
- `apps/web/tailwind.config.cjs` (L18-49): Maps both systems
  - Legacy: `background`, `surface`, `foreground` (L19-25)
  - Current: `bg`, `surface1`, `surface2`, `text` (L36-48)

**Violations:**
| File | Violation |
|------|-----------|
| `design/index.css:1` | Imports legacy `tokens.css` |
| `tailwind.config.cjs:19-25` | Legacy color mappings still present |

**Required Tokens Missing (per DESIGN.md §3.3):**
- ❌ `--z-canvas-base`, `--z-canvas-overlay`, `--z-canvas-hud` (Canvas domain)
- ❌ `--z-dropdown`, `--z-tooltip`, `--z-modal`, `--z-toast` (Portal domain)
- ❌ Icon sizing tokens (`--icon-xs` through `--icon-xl`)
- ❌ Motion tokens (`--duration-fast`, `--easing-default`)
- ❌ Component sizing tokens (`--input-height-sm/md/lg`, `--button-height-sm/md/lg`)

---

### 3.2 Z-Index Two-Scale Model (DESIGN.md §4.6)

**Requirement:** Canvas domain + Portal domain separation; semantic tokens only

**Current State:** 15+ hardcoded z-index values with no domain separation

**Evidence (from Grep search):**

| Value | Files | Domain Conflict |
|-------|-------|-----------------|
| `z-[10000]` | InlinePolygonInput.tsx:169 | Extreme escalation |
| `z-[9999]` | Toast.tsx:68, LoadingOverlay.tsx:27, CustomSelect.tsx:86, NumericComboField.tsx:365 | Portal clash |
| `z-[1000]` | ContextMenu.tsx:44 | Portal |
| `z-[200]` | CanvasSettings.tsx:262 | Overlay |
| `z-[100]` | SettingsModal.tsx:100, LayerManagerModal.tsx:262, RadiusInputModal.tsx:58 | Modal |
| `z-[99]` | RadiusInputModal.tsx:50 | Off-by-one conflict |
| `z-[60]` | UserHint.tsx:22 | Canvas? |
| `z-50` | QuickAccessToolbar.tsx:35, LayerManagerModal.tsx:338 | Mixed |
| `z-20` | EngineInteractionLayer.tsx:174 (inline style) | Canvas |

**Canvas Domain Tokens Needed:**
```css
--z-canvas-base: 0;      /* WebGL layer */
--z-canvas-overlay: 10;  /* Handles, guides, marquee */
--z-canvas-hud: 20;      /* Angle tooltip, caret */
```

**Portal Domain Tokens Needed:**
```css
--z-dropdown: 1000;
--z-tooltip: 1100;
--z-modal: 2000;
--z-toast: 3000;
```

---

### 3.3 Primitive Coverage (DESIGN.md §5.1)

**Requirement:** 10+ mandatory primitives in `components/ui/**`

**Current State:** 4 primitives exist

| Primitive | Status | Location | Notes |
|-----------|--------|----------|-------|
| Button | ❌ MISSING | — | 5+ ad-hoc variants (RibbonButton, etc.) |
| Input | ❌ MISSING | — | NumberSpinner, EditableNumber are ad-hoc |
| Select/Combobox | ❌ MISSING | — | CustomSelect is ad-hoc (113 LOC) |
| Popover | ❌ MISSING | — | No base positioning primitive |
| DropdownMenu | ❌ MISSING | — | ContextMenu is ad-hoc |
| Tooltip | ❌ MISSING | — | No component exists |
| Dialog/Modal | ✅ EXISTS | `components/ui/Dialog.tsx` | 319 LOC, good focus trap |
| Toast | ✅ EXISTS | `components/ui/Toast.tsx` | 87 LOC, needs portal |
| Icon | ❌ MISSING | — | No wrapper; raw Lucide imports |
| Toggle | ✅ EXISTS | `components/ui/Toggle.tsx` | 28 LOC |
| Section | ✅ EXISTS | `components/ui/Section.tsx` | 19 LOC |
| Stack/Grid | ❌ MISSING | — | Ad-hoc flexbox everywhere |

**Button Duplication Matrix:**

| Component | LOC | Size Variants | Color Logic | ARIA |
|-----------|-----|---------------|-------------|------|
| RibbonButton | 80 | std(32px) | getRibbonButtonColorClasses | aria-pressed (conditional) |
| RibbonLargeButton | 59 | large(52px) | Duplicated | aria-pressed, aria-disabled |
| RibbonSmallButton | 66 | small(24px) | Duplicated + `!important` | aria-disabled |
| RibbonIconButton | 99 | icon(28-32px) | 4 variant configs | aria-pressed |
| DialogButton | 28 | — | Inline variantClasses | None |

**Total duplicated button code: ~332 LOC**

---

### 3.4 Accessibility Baseline (DESIGN.md §7)

**Requirement:** Focus-visible, ARIA, keyboard navigation, WCAG AA contrast

**Current State:**

| Pattern | Compliant Files | Non-Compliant Files | Gap |
|---------|-----------------|---------------------|-----|
| `aria-label` | 24 | ~63 | Many icon-only buttons lack labels |
| `aria-pressed` | 8 | — | Only ribbon buttons |
| `focus-visible` | 1 (global.css) | 87 TSX | Not applied to components |
| Keyboard nav | Dialog | CustomSelect, ContextMenu | Dropdowns missing arrow keys |
| Focus trap | Dialog | — | Good |
| Focus restore | Dialog | — | Good |

**Evidence:**
- `apps/web/design/global.css:46-55`: `.focus-outline` class defined but not universally applied
- `apps/web/components/CustomSelect.tsx`: No `onKeyDown` handler
- `apps/web/components/NumericComboField/NumericComboField.tsx:286-287`: Has `aria-label`, `aria-expanded` (good)
- `apps/web/features/editor/components/ribbon/RibbonIconButton.tsx:91`: Has `aria-pressed` (good)

**Missing:**
- Skip-to-content link
- Roving tabindex for menus
- `aria-describedby` for error states
- Automated axe-core testing

---

### 3.5 Hot-Path Performance (DESIGN.md §1.2)

**Requirement:** No React re-renders on pointermove; use refs/CSS vars/RAF

**Current State:** Mostly compliant, one violation

**Good Patterns Found:**
- `BaseInteractionHandler.ts:43-59`: RAF batching via `notifyChange()`
- Direct WASM session calls for transforms (no command serialization on pointermove)
- No closure creation inside pointermove handlers

**Violation:**
```typescript
// apps/web/features/editor/components/EngineInteractionLayer.tsx:135
setMousePos(world); // Zustand update on EVERY pointermove
setIsMouseOverCanvas(true); // Also on pointermove (L136)
```

**Impact:** Potential re-renders on every pointer move. Should use ref or CSS variable.

---

### 3.6 Governance/CI Gates (DESIGN.md §9)

**Requirement:** CI-enforced checks for colors, z-index, spacing, primitives, a11y

**Current State:**

| Check | Status | Script |
|-------|--------|--------|
| Hex colors | ✅ EXISTS | `governance:hex` |
| Z-index | ❌ MISSING | — |
| Spacing | ❌ MISSING | — |
| Primitive usage | ❌ MISSING | — |
| ARIA/a11y | ❌ MISSING | — |
| File size budgets | ✅ EXISTS | `governance:budgets` |
| Boundary checks | ✅ EXISTS | `governance:boundaries` |

**Existing Governance Flow:**
```bash
pnpm governance:check
# Runs: budgets → boundaries → manifest → docs → hex → lint
```

**Hex Color Allowlist (60+ files):**
- `apps/web/scripts/check_hex_colors.mjs:19-60`
- Includes ColorPicker components (expected for color data)
- Also includes `ShapeOverlay.tsx`, `PerformanceMonitor.tsx` (need audit)

---

## 4. Hot Path Audit

### 4.1 Pointermove Handlers

| File | Handler | Hot-Path Safe? | Issue |
|------|---------|----------------|-------|
| `EngineInteractionLayer.tsx:124-143` | `handlePointerMove` | ⚠️ PARTIAL | Zustand `setMousePos` on every move |
| `BaseInteractionHandler.ts:48-59` | `notifyChange` | ✅ YES | RAF-batched |
| `DraftingHandler.tsx` | Inherits from Base | ✅ YES | Uses `notifyChange()` |
| `SelectionHandler.tsx` | Inherits from Base | ✅ YES | Uses `notifyChange()` |
| `TextHandler.tsx` | Inherits from Base | ✅ YES | Uses `notifyChange()` |

### 4.2 Zustand Updates on Hot Path

**Violation Found:**
```typescript
// EngineInteractionLayer.tsx:135-136
const handlePointerMove = (e) => {
  // ...
  setMousePos(world);        // ❌ Zustand update
  setIsMouseOverCanvas(true); // ❌ Zustand update (though likely no re-render subscribers)
  // ...
};
```

**Recommended Fix:**
```typescript
// Use ref instead of Zustand for mousePos
const mousePosRef = useRef({ x: 0, y: 0 });

const handlePointerMove = (e) => {
  // ...
  mousePosRef.current = world; // ✅ No re-render
  // Components needing mousePos can subscribe to RAF updates
};
```

### 4.3 Overlay Update Strategy

**Current:** ShapeOverlay is a React component that re-renders via handler's `onUpdate` callback (RAF-batched).

**Analysis:** Acceptable for <100 handles. For 1000+ entities, consider WebGL overlay buffer.

### 4.4 MousePos Policy (Hot-Path Contract)

**Current Violation:** `setMousePos(world)` Zustand update on every pointermove (EngineInteractionLayer.tsx:135)

**Required Policy:**

| Requirement | Implementation |
|-------------|----------------|
| **Storage** | `mousePos` (screen/world) lives in **ref** within EngineInteractionLayer or dedicated InteractionRuntime |
| **UI Consumption** | Components consume via **RAF-snapshot** (max 60Hz) or **on-demand** (e.g., status bar) |
| **Hot-Path Gate** | **Prohibit** `setState`/Zustand updates in pointermove handlers (allowlist required with expiry) |

**Recommended Fix:**
```typescript
// EngineInteractionLayer.tsx
const mousePosRef = useRef({ screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } });
const mouseSnapshotRef = useRef({ screen: { x: 0, y: 0 }, world: { x: 0, y: 0 } });

const handlePointerMove = (e) => {
  // HOT PATH: update ref only
  mousePosRef.current = { screen, world };

  // RAF-batched snapshot for UI (optional, if status bar needs it)
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      mouseSnapshotRef.current = { ...mousePosRef.current };
      rafPending = false;
    });
  }
};

// Status bar consumes snapshot, not live ref
const mousePos = useRAFSnapshot(mouseSnapshotRef); // Custom hook
```

---

## 5. Migration Roadmap (Phased)

### Phase 0: Stop-the-Bleeding Governance (Week 1)

**Goal:** Prevent new violations while planning migration

**Tasks:**

| ID | Task | Complexity | Owner | Status |
|----|------|------------|-------|--------|
| P0-1 | Create z-index governance script | S | — | TODO |
| P0-2 | Create arbitrary Tailwind values check | S | — | TODO |
| P0-3 | Add PR checklist to CONTRIBUTING.md | S | — | TODO |
| P0-4 | Freeze new ad-hoc components (team agreement) | S | — | TODO |
| P0-5 | Document z-index scale in DESIGN.md | S | — | TODO |

**Acceptance Criteria:**
- [ ] `pnpm governance:ui` exists and runs z-index + spacing checks
- [ ] CI fails on new z-index violations (allowlist for existing)
- [ ] PR template includes UI compliance checklist

---

### Phase 1: Token Unification (Week 2)

**Goal:** Single source of truth for all tokens + hard gate against legacy tokens

**Tasks:**

| ID | Task | Complexity | Dependencies |
|----|------|------------|--------------|
| P1-1 | Audit all usages of legacy tokens (bg-surface, bg-background, etc.) | M | — |
| P1-2 | Migrate legacy usages to current tokens (bg-surface1, bg-bg, etc.) | M | P1-1 |
| P1-3 | Delete `shared/styles/tokens.css` | S | P1-2 |
| P1-4 | Remove legacy mappings from `tailwind.config.cjs` | S | P1-3 |
| P1-5 | Add governance script to fail build on legacy token usage | S | P1-4 |
| P1-6 | Add missing token categories (icon, motion, component sizing) | M | P1-3 |
| P1-7 | Rename `theme/theme.css` → `theme/tokens.css` | S | P1-6 |

**Acceptance Criteria:**
- [ ] Only one token file exists: `theme/tokens.css`
- [ ] All DESIGN.md §3.3 token categories present
- [ ] `tailwind.config.cjs` references only new tokens
- [ ] **Hard gate:** Build fails if legacy tokens (bg-surface, bg-background) used
- [ ] `pnpm build` succeeds with no visual regressions

---

### Phase 2: Portal Stack + Z-Index Scale (Weeks 3-4)

**Goal:** Implement two-scale z-index model with layered portal primitives

**Tasks:**

| ID | Task | Complexity | Dependencies |
|----|------|------------|--------------|
| P2-1 | Define z-index tokens in `tokens.css` (canvas + portal domains) | S | P1-7 |
| P2-2 | Create Tailwind z-index mappings | S | P2-1 |
| **P2-3** | **Implement Layer/PortalHost primitive** (portal + stacking + focus boundary) | **M** | P2-2 |
| **P2-4** | **Implement Positioning primitive** (anchor + flip + offset + collision) | **M** | P2-3 |
| **P2-5** | **Implement Popover base** (composes Layer + Positioning) | **S** | P2-3, P2-4 |
| P2-6 | Implement Tooltip specialization | S | P2-5 |
| P2-7 | Migrate Toast to use PortalHost + z-toast | S | P2-3 |
| P2-8 | Migrate CustomSelect to use Popover | M | P2-5 |
| P2-9 | Migrate NumericComboField dropdown to use Popover | M | P2-5 |
| P2-10 | Migrate all `z-[...]` arbitrary values to semantic tokens | M | P2-2 |
| P2-11 | Audit canvas overlays for z-canvas tokens | S | P2-1 |

**Acceptance Criteria:**
- [ ] Zero `z-[...]` arbitrary values in codebase (Tailwind scale `z-50` OK in allowlist)
- [ ] Layer/PortalHost handles stacking + focus boundary
- [ ] Positioning handles anchor/flip/offset independently
- [ ] Popover composes both layers (not monolithic)
- [ ] All portals use `--z-dropdown`, `--z-tooltip`, `--z-modal`, `--z-toast`
- [ ] Canvas overlays use `--z-canvas-*` tokens

---

### Phase 3: Core Primitives (Button/Input/Icon) (Weeks 4-5)

**Goal:** Base primitives that all components use

**Tasks:**

| ID | Task | Complexity | Dependencies |
|----|------|------------|--------------|
| P3-1 | Design Button API (variants, sizes, states) | S | — |
| P3-2 | Implement Button primitive | M | P3-1 |
| P3-3 | Migrate RibbonButton to use Button | M | P3-2 |
| P3-4 | Migrate RibbonLargeButton to use Button | S | P3-2 |
| P3-5 | Migrate RibbonSmallButton to use Button | S | P3-2 |
| P3-6 | Migrate RibbonIconButton to use Button | S | P3-2 |
| P3-7 | Migrate DialogButton to use Button | S | P3-2 |
| P3-8 | Design Input API (types, addons, validation) | S | — |
| P3-9 | Implement Input primitive | M | P3-8 |
| P3-10 | Implement NumberInput variant | M | P3-9 |
| P3-11 | Migrate NumberSpinner to use Input | M | P3-10 |
| P3-12 | Design Icon wrapper API (sizes, strokes) | S | P1-5 |
| P3-13 | Implement Icon primitive | S | P3-12 |
| P3-14 | Migrate ribbon icons to use Icon | M | P3-13 |

**Acceptance Criteria:**
- [ ] Button primitive supports 6 variants, 3 sizes, iconOnly mode
- [ ] Input primitive supports text/number types, prefix/suffix addons
- [ ] Icon primitive enforces size/stroke tokens
- [ ] All ribbon buttons use base Button
- [ ] LOC reduction of 30%+ in ribbon button files

---

### Phase 4: Migrate Major Surfaces (Ribbon/Inspector/Modals) (Weeks 6-7)

**Goal:** All major UI surfaces use primitives and tokens

**Tasks:**

| ID | Task | Complexity | Dependencies |
|----|------|------------|--------------|
| P4-1 | Implement Select primitive | M | P2-3 |
| P4-2 | Migrate CustomSelect to use Select | M | P4-1 |
| P4-3 | Implement DropdownMenu primitive | M | P2-3 |
| P4-4 | Migrate ContextMenu to use DropdownMenu | S | P4-3 |
| P4-5 | Implement Tooltip primitive | S | P2-3 |
| P4-6 | Audit EditorRibbon.tsx for token compliance | M | P1-6 |
| P4-7 | Audit EditorSidebar for token compliance | M | P1-6 |
| P4-8 | Audit LayerManagerModal for primitives | M | P3-2, P4-1 |
| P4-9 | Audit SettingsModal for primitives | M | P3-2, P3-9 |
| P4-10 | Fix arbitrary spacing (gap-0.5, px-2.5, text-[10px]) | M | P1-5 |

**Acceptance Criteria:**
- [ ] Select, DropdownMenu, Tooltip primitives exist
- [ ] Zero arbitrary Tailwind spacing in main surfaces
- [ ] Typography uses semantic tokens only
- [ ] All modals use Dialog primitive correctly

---

### Phase 5: A11y + Test Hardening + Hot-Path Fix (Week 8)

**Goal:** WCAG 2.1 AA compliance + enforce hot-path contract

**Tasks:**

| ID | Task | Complexity | Dependencies |
|----|------|------------|--------------|
| P5-1 | Apply `.focus-outline` to all interactive components | M | — |
| P5-2 | Add `aria-label` to all icon-only buttons | M | P3-2 |
| P5-3 | Implement keyboard navigation for Select | M | P4-1 |
| P5-4 | Implement keyboard navigation for DropdownMenu | M | P4-3 |
| P5-5 | Add skip-to-content link | S | — |
| P5-6 | Install `@axe-core/react` and `jest-axe` | S | — |
| P5-7 | Add a11y tests to all primitives | M | P5-6 |
| P5-8 | Add `governance:a11y` script | S | P5-6 |
| **P5-9** | **Fix mousePos hot-path violation** (ref + RAF snapshot) | **S** | — |
| **P5-10** | **Document mousePos policy in AGENTS.md or frontend-patterns.md** | **S** | P5-9 |
| **P5-11** | **Add governance gate: prohibit setState/Zustand in pointermove** | **M** | — |

**Acceptance Criteria:**
- [ ] Zero axe-core violations in primitive tests
- [ ] All interactive components keyboard-navigable
- [ ] All icon-only buttons have `aria-label`
- [ ] `governance:a11y` script exists and passes
- [ ] **`mousePos` uses ref + RAF snapshot (no Zustand on hot path)**
- [ ] **Policy documented: where mousePos lives, how UI consumes**
- [ ] **Governance script fails on setState/Zustand in pointermove handlers**

---

## 6. Work Breakdown Structure

### Dependencies Graph

```
Phase 0 (Governance)
    ↓
Phase 1 (Tokens)
    ↓
Phase 2 (Popover/Z-Index) ←─────────────────────┐
    ↓                                           │
Phase 3 (Button/Input/Icon) ────────────────────┤
    ↓                                           │
Phase 4 (Surfaces) ←────────────────────────────┘
    ↓
Phase 5 (A11y/Tests)
```

### Complexity Estimates

| Phase | Tasks | Total Complexity | Estimated Days |
|-------|-------|------------------|----------------|
| Phase 0 | 5 | 5 S | 2 |
| Phase 1 | 7 | 3 S + 4 M | 5 |
| Phase 2 | 11 | 5 S + 5 M + 1 M (was L, decomposed) | 8 |
| Phase 3 | 14 | 5 S + 9 M | 10 |
| Phase 4 | 10 | 1 S + 9 M | 10 |
| Phase 5 | 11 | 5 S + 6 M | 7 |
| **Total** | **58** | — | **42 days (~8.5 weeks)** |

---

## 7. Governance Implementation Plan

### 7.1 Three-Tier Violation Model

**BLOCKER** (Build fails, no allowlist):
- Arbitrary Tailwind values: `z-[...]`, `text-[...px]`, `gap-[...]`, `px-[...]`
- Hex in UI styles: `bg-[#...]`, `border-[#...]`, `className="..."` with hex for layout/skin
- `!important` in core layout/token files

**WARN** (Allowlist expires Q2 2026):
- Tailwind scale values without semantic mapping: `z-50`, `gap-3`, `text-xs` (must migrate to tokens)
- Hex in data contexts without `data-` prefix (should use `data-color="#..."` convention)

**OK** (No violation):
- Semantic token classes: `z-dropdown`, `text-body`, `gap-ribbon`
- Hex in CAD data: `data-stroke="#ff0000"`, ColorPicker value props
- Tailwind scale in primitives/design system files (transitional)

### 7.2 New Governance Scripts

**`governance:arbitrary`** (New — BLOCKER-level)
```javascript
// tooling/governance/check_arbitrary_values.js
// Scans for arbitrary Tailwind values: z-[...], text-[...px], etc.
const ARBITRARY_PATTERNS = [
  /\b(z|gap|p|px|py|m|mx|my|text|w|h)-\[/,  // Arbitrary values
];
const violations = grepFiles(ARBITRARY_PATTERNS, tsxFiles);
// No allowlist — fail build
if (violations.length > 0) { process.exit(1); }
```

**`governance:hex-ui`** (New — replaces `governance:hex`)
```javascript
// tooling/governance/check_hex_ui.js
// Scans for hex in UI styles (className, inline styles for layout)
// Ignores:
//   - files in hex_data_allowlist.json (ColorPicker, entity renderers)
//   - data-* attributes
//   - variable values (const color = '#...')
const HEX_UI_PATTERNS = [
  /className="[^"]*#[0-9a-fA-F]{3,8}/,       // className with hex
  /className=\{[^}]*`[^`]*#[0-9a-fA-F]{3,8}/, // template literal
  /style=\{\{[^}]*(background|border|color):[^}]*#[0-9a-fA-F]{3,8}/, // inline styles
];
const DATA_HEX_PATTERNS = [
  /data-[a-z-]+="#[0-9a-fA-F]{3,8}"/,        // OK: data attributes
  /const\s+\w+\s*=\s*['"]#[0-9a-fA-F]{3,8}/, // OK: color data variables
];
// Filter: reject if matches HEX_UI and not DATA_HEX
```

**`governance:semantic`** (New — WARN-level)
```javascript
// tooling/governance/check_semantic_tokens.js
// Warns on Tailwind scale usage outside primitives
const TAILWIND_SCALE_PATTERNS = [
  /\b(z-\d+|gap-\d+|text-xs|text-sm|text-base)\b/,
];
const allowlist = loadAllowlist('semantic_migration_allowlist.json');
// WARN only, expires Q2 2026
```

**`governance:ui`** (Aggregate)
```bash
# apps/web/package.json
"governance:arbitrary": "node ../../tooling/governance/check_arbitrary_values.js",
"governance:hex-ui": "node ../../tooling/governance/check_hex_ui.js",
"governance:semantic": "node ../../tooling/governance/check_semantic_tokens.js",
"governance:ui": "pnpm governance:arbitrary && pnpm governance:hex-ui && pnpm governance:semantic"
```

### 7.3 ESLint Rules (Assistive, Not Gate)

**Note:** ESLint cannot reliably catch dynamic classNames (`className={cn(...)}`). Use grep-based scripts as gates.

```javascript
// .eslintrc.cjs additions
rules: {
  // Assistive hints (WARN level)
  'no-restricted-syntax': [
    'warn',
    {
      selector: 'Literal[value=/z-\\[\\d+\\]/]',
      message: 'BLOCKER: Use semantic z-index tokens (z-dropdown, z-modal, etc.)'
    },
    {
      selector: 'Literal[value=/text-\\[\\d+px\\]/]',
      message: 'BLOCKER: Use semantic typography tokens (text-body, text-caption, etc.)'
    }
  ]
}
```

### 7.4 Allowlist File Structure

```
tooling/governance/
├── allowlists/
│   ├── hex_data.json              # CAD data/ColorPicker (permanent OK)
│   ├── semantic_migration.json    # Tailwind scale → tokens (expires Q2 2026)
│   └── primitives_legacy.json     # Pre-primitive components (expires Q3 2026)
```

**Allowlist Format:**
```json
{
  "version": 1,
  "reason": "CAD entity colors are data, not UI styling",
  "expires": null,
  "files": [
    "components/ColorPicker/**",
    "features/editor/components/ShapeOverlay.tsx",
    "features/import/utils/dxf/**",
    "utils/color.ts"
  ]
}
```

**Expiring Allowlist (Semantic Migration):**
```json
{
  "version": 1,
  "reason": "Tailwind scale usage during token migration",
  "expires": "2026-06-30",
  "files": [
    "features/editor/components/EditorRibbon.tsx",
    "features/editor/components/EditorSidebar.tsx"
  ]
}
```

### 7.5 PR Checklist Updates

```markdown
## UI Compliance Checklist

### BLOCKER (Build fails)
- [ ] No arbitrary Tailwind values (`z-[...]`, `text-[...px]`, `gap-[...]`)
- [ ] No hex in UI styles (`bg-[#...]`, className with hex for layout/borders)
- [ ] Passes `pnpm governance:arbitrary`
- [ ] Passes `pnpm governance:hex-ui`

### Required
- [ ] Uses UI primitives from `components/ui/**` (or adds a new primitive)
- [ ] Uses semantic tokens (z-dropdown, text-body, gap-ribbon)
- [ ] Has focus-visible styles for interactive elements
- [ ] Has ARIA attributes (aria-label for icon buttons, aria-pressed for toggles)

### Allowed (WARN)
- [ ] Tailwind scale values (`z-50`, `gap-3`) only if in migration allowlist
- [ ] Hex in data contexts uses `data-color` attribute or ColorPicker components
```

---

## 8. Acceptance Criteria (Per Phase)

### Phase 0: Governance
- [ ] `pnpm governance:ui` script exists
- [ ] CI runs `governance:ui` and fails on violations
- [ ] Allowlist files created for existing violations
- [ ] PR template updated with UI checklist

### Phase 1: Tokens
- [ ] Single token file at `apps/web/theme/tokens.css`
- [ ] `shared/styles/tokens.css` deleted
- [ ] All DESIGN.md §3.3 token categories present
- [ ] `pnpm build` and visual regression tests pass

### Phase 2: Z-Index
- [ ] Canvas domain tokens: `--z-canvas-base`, `--z-canvas-overlay`, `--z-canvas-hud`
- [ ] Portal domain tokens: `--z-dropdown`, `--z-tooltip`, `--z-modal`, `--z-toast`
- [ ] Popover primitive exists with portal + positioning
- [ ] Zero `z-[...]` arbitrary values (allowlist empty)

### Phase 3: Primitives
- [ ] Button primitive: 6 variants, 3 sizes, iconOnly mode
- [ ] Input primitive: text/number types, prefix/suffix addons
- [ ] Icon primitive: enforces size/stroke tokens
- [ ] All ribbon buttons use Button primitive
- [ ] 30%+ LOC reduction in ribbon button files

### Phase 4: Surfaces
- [ ] Select, DropdownMenu, Tooltip primitives exist
- [ ] Zero arbitrary Tailwind spacing in ribbon/sidebar/modals
- [ ] All modals use Dialog primitive
- [ ] All dropdowns use Select/DropdownMenu primitives

### Phase 5: A11y + Hot-Path
- [ ] Zero axe-core violations in primitive tests
- [ ] All interactive components keyboard-navigable
- [ ] All icon-only buttons have `aria-label`
- [ ] `governance:a11y` script exists and passes
- [ ] **`mousePos` uses ref + RAF snapshot (no Zustand on hot path)**
- [ ] **Policy documented: where mousePos lives, how UI consumes**
- [ ] **Governance script fails on setState/Zustand in pointermove handlers**

---

## 9. Risk Register + Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Visual regressions during token migration | High | Medium | Screenshot comparison tests; incremental migration |
| Breaking ribbon layout during Button migration | Medium | High | Maintain RibbonButton wrapper with presets; test all ribbon groups |
| Performance degradation from Popover portals | Low | High | Benchmark portal overhead; lazy mount |
| Team velocity impact during migration | High | Medium | Parallel tracks (governance vs primitives); no big-bang rewrite |
| Incomplete allowlist causing false CI failures | Medium | Low | Start with warn mode; promote to error after 2 weeks |
| Focus trap conflicts in nested modals | Low | Medium | Document focus management patterns; test edge cases |

---

## 10. Appendix: Evidence Index

### A. File Paths & Line References

**Token Files:**
- `/apps/web/theme/theme.css` — Current tokens (L1-45)
- `/apps/web/shared/styles/tokens.css` — Legacy tokens (L1-30) ⚠️ DELETE
- `/apps/web/tailwind.config.cjs` — Tailwind mappings (L16-62)
- `/apps/web/design/index.css` — Import chain (L1-3)
- `/apps/web/design/global.css` — Ribbon layout tokens (L92-96)

**Z-Index Violations:**
- `Toast.tsx:68` — `z-[9999]`
- `LoadingOverlay.tsx:27` — `z-[9999]`
- `CustomSelect.tsx:86` — `z-[9999]`
- `NumericComboField.tsx:365` — `z-[9999]`
- `InlinePolygonInput.tsx:169` — `z-[10000]`
- `ContextMenu.tsx:44` — `z-[1000]`
- `SettingsModal.tsx:100` — `z-[100]`
- `LayerManagerModal.tsx:262` — `z-[100]`
- `RadiusInputModal.tsx:50,58` — `z-[99]`, `z-[100]`
- `UserHint.tsx:22` — `z-[60]`
- `CanvasSettings.tsx:262` — `z-[200]`
- `EngineInteractionLayer.tsx:174` — `zIndex: 20` (inline)

**UI Primitives:**
- `/apps/web/components/ui/Dialog.tsx` — 319 LOC ✅
- `/apps/web/components/ui/Toast.tsx` — 87 LOC ✅ (needs portal)
- `/apps/web/components/ui/Toggle.tsx` — 28 LOC ✅
- `/apps/web/components/ui/Section.tsx` — 19 LOC ✅

**Button Variants (to consolidate):**
- `/apps/web/features/editor/components/ribbon/RibbonButton.tsx` — 80 LOC
- `/apps/web/features/editor/components/ribbon/RibbonLargeButton.tsx` — 59 LOC
- `/apps/web/features/editor/components/ribbon/RibbonSmallButton.tsx` — 66 LOC
- `/apps/web/features/editor/components/ribbon/RibbonIconButton.tsx` — 99 LOC
- `/apps/web/components/ui/Dialog.tsx:289-316` — DialogButton inline

**Hot-Path Violation:**
- `/apps/web/features/editor/components/EngineInteractionLayer.tsx:135-136`

**Governance Scripts:**
- `/apps/web/package.json:21-26` — governance:* scripts
- `/apps/web/scripts/check_hex_colors.mjs` — Hex color check
- `/tooling/governance/check_boundaries.js` — Boundary enforcement
- `/tooling/governance/check_file_size_budget.js` — File size budgets

### B. Search Patterns Used

```bash
# Z-index violations
grep -rn "z-\[\d+\]" apps/web --include="*.tsx"

# Arbitrary Tailwind values
grep -rn "text-\[\d+px\]|gap-0\.5|px-2\.5" apps/web --include="*.tsx"

# Hardcoded colors
grep -rn "#[0-9a-fA-F]{3,8}" apps/web --include="*.tsx"

# ARIA attributes
grep -rn "aria-|role=" apps/web --include="*.tsx"

# Pointermove handlers
grep -rn "pointermove|onPointerMove" apps/web --include="*.tsx"

# Zustand updates
grep -rn "useUIStore|setState" apps/web --include="*.tsx"
```

---

**End of Compliance Plan**

*Next Step: Approve plan and begin Phase 0 implementation.*
