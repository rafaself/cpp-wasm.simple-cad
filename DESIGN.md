# DESIGN.md — UI Design System & Governance

**Status:** Normative contract.

**Purpose:** Define UI/UX rules and frontend engineering standards that maximize **maintainability**, **consistency**, **performance**, and **accessibility** for a CAD-grade application.

**Applies to:** All UI code in `apps/web/**`.

**Priority:** If any existing UI conflicts with this document, the UI must be migrated to conform. **No compatibility shims.**

**Related:** `AGENTS.md` (architecture + engine-first governance).

---

## 0. Core Principles (Non-Negotiable)

1. **Performance is a product feature**

   * CAD interactions must remain fluid at 60fps.
   * UI must not degrade the engine-first hot path.

2. **Single Source of Truth**

   * One token system.
   * One primitive per UI role.

3. **Semantic > Numeric**

   * Use semantic tokens, semantic variants, and semantic classes.
   * Avoid arbitrary Tailwind values and magic numbers.

4. **Consistency > Novelty**

   * New patterns are disallowed unless documented here.

5. **Accessibility is mandatory**

   * Keyboard-first, focus-visible, ARIA correctness.

---

## 1. UI Architecture & Layering

### 1.1 UI Surfaces

The UI is composed of the following surfaces:

* **Canvas Surface**: WebGL render + overlay layer (handles, guides, caret, marquee)
* **Ribbon / Top Toolbar**: tools + action groups
* **Left Tool Palette**: primary tool shortcuts
* **Right Inspector**: properties, layers, drawing settings
* **Status Bar**: coordinates, snap state, hints
* **Portals**: dropdowns, tooltips, modals, toasts

### 1.2 Hot Path Constraints (Strict)

**Hot path** includes pointermove/drag during drawing, transforms, panning, snapping, selection.

**Forbidden in hot path:**

* React re-renders triggered by pointermove (including Zustand updates)
* allocations (array spreads, per-event object creation, closures inside handlers)
* repeated layout measurement causing forced reflow

**Allowed in hot path:**

* mutate a ref
* write CSS variables
* schedule a single RAF
* direct WASM session calls

**Rule:** If UI needs live data (e.g., mouse position for status bar), update via RAF-batched ref/CSS variables at a bounded frequency.

---

## 2. Maintainability Model

### 2.1 Theme/Design Changes Must Be Cheap

A design change (colors, radii, spacing, typography, elevations, z-index) must be achievable by:

* changing values in a **single token file** (or theme override)
* adjusting a small number of primitives

**Anti-goal:** touching dozens of feature components.

### 2.2 No Divergent Systems

* No parallel theme files defining competing tokens.
* No duplicated primitives with slightly different props.
* No “temporary” token bridges.

---

## 3. Token System (Single Source of Truth)

### 3.1 Token Source of Truth

**CSS Variables are the only source of truth** for UI tokens.

* Canonical tokens: `apps/web/theme/tokens.css`
* Theme overrides (dark/light): `apps/web/theme/theme.css`

Tailwind may map tokens to utilities, but feature code must treat tokens as authoritative.

### 3.2 Banned Values (Governance-Enforced)

Disallowed in TS/TSX classnames:

* arbitrary Tailwind values: `z-[...]`, `text-[...]`, `p-[...]`, `gap-[...]`, etc.
* hardcoded colors: hex/rgb/hsl literals in TSX
* spacing “magic” values outside approved scale (e.g., `px-2.5`, `gap-0.5`) unless explicitly allowed

Exceptions must be rare and listed in a centralized allowlist.

### 3.3 Token Categories

Tokens must exist for:

* **Color** (surfaces, text, actions, status)
* **Spacing** (CAD-optimized)
* **Typography** (semantic scale)
* **Radii**
* **Elevation / Shadows**
* **Z-index** (two-scale model)
* **Icon sizing and stroke**
* **Component sizing** (ribbon height, input/button heights)
* **Motion** (durations/easings)

---

## 4. Token Specifications

> Numeric values below are normative defaults. Adjust numbers only in token files.

### 4.1 Spacing (CAD-Optimized)

Base scale is **4px**.

* `--space-0`: 0
* `--space-0_5`: 2px (micro spacing; use sparingly)
* `--space-0_75`: 3px (text toolbar column gap)
* `--space-1`: 4px
* `--space-2`: 8px
* `--space-3`: 12px
* `--space-4`: 16px
* `--space-5`: 20px
* `--space-6`: 24px
* `--space-8`: 32px
* `--space-10`: 40px
* `--space-12`: 48px
* `--space-16`: 64px

**Rule:** Prefer `--space-1/2/3/4/6/8`. Use `--space-0_5` only for dense ribbon micro-alignment.

### 4.2 Typography (Semantic)

Define a stable semantic scale:

* `--font-sans`, `--font-mono`
* `--text-title` (app headers, modal titles)
* `--text-heading` (section titles)
* `--text-body` (default)
* `--text-body-strong` (emphasis)
* `--text-label` (control labels)
* `--text-caption` (hints, secondary)
* `--text-mono` (values, coordinates)

Also define:

* `--font-weight-normal/medium/semibold/bold`
* `--line-height-tight/normal/relaxed`

**Rule:** feature code must not use raw `text-[px]`.

### 4.3 Colors (Themeable)

Required semantic tokens:

* Surfaces: `--color-bg`, `--color-surface-1`, `--color-surface-2`, `--color-border`
* Text: `--color-text`, `--color-text-muted`, `--color-text-subtle`
* Primary action: `--color-primary`, `--color-primary-hover`, `--color-primary-contrast`
* Status: `--color-success`, `--color-warning`, `--color-error`, `--color-info`
* Focus: `--color-focus`

**Rule:** No hardcoded colors in TSX. If a new semantic role is required, add a token.

### 4.4 Radii

* `--radius-sm` (chips, dense)
* `--radius-md` (buttons, inputs)
* `--radius-lg` (panels, cards)
* `--radius-xl` (modals)

### 4.5 Elevation (Shadows)

* `--shadow-0`: none
* `--shadow-1`: raised control
* `--shadow-2`: dropdown
* `--shadow-3`: modal
* `--shadow-4`: heavy overlay

**Rule:** do not use ad-hoc Tailwind shadow classes in feature code.

### 4.6 Z-Index (Two-Scale Model)

CAD requires two distinct z-index domains.

#### A) Canvas Domain (within editor surface)

* `--z-canvas-base`: 0      (WebGL layer)
* `--z-canvas-overlay`: 10  (Handles, guides, marquee)
* `--z-canvas-hud`: 20      (Angle tooltip, caret)

#### B) Portal Domain (global)

* `--z-modal`: 2000
* `--z-dropdown`: 2100
* `--z-tooltip`: 2200
* `--z-toast`: 3000

Rules:

* Canvas layers MUST NOT exceed portal layers.
* All dropdowns/tooltips/modals/toasts MUST use the portal domain.
* No hardcoded z-index values.

### 4.7 Icons

Use an `<Icon />` wrapper that enforces:

* size tokens: `xs/sm/md/lg/xl`
* standardized stroke width
* consistent alignment and color inheritance

---

## 5. Primitives (Mandatory)

All interactive UI must be built from primitives in:

`apps/web/components/ui/**`

### 5.1 Required Primitives

* `Button`
* `Input` (TextInput, NumberInput)
* `Select` / `Combobox`
* `Popover` (base)
* `DropdownMenu`
* `Tooltip`
* `Dialog` / `Modal`
* `Toast`
* `Icon`
* Layout primitives: `Stack`, `Grid`, `Section`, `Separator`

### 5.2 Primitive API Standards

* Strict TypeScript types (no unjustified `any`)
* Variants are explicit unions, not free-form strings
* Controlled components: `value` + `onChange`
* Escape hatch `className` allowed for layout only (no colors/tokens)

### 5.3 Ribbon as Presets

Ribbon components may wrap primitives as presets.

* Ribbon must not duplicate button/input logic.
* Ribbon presets may define layout and density.

---

## 6. Interaction Standards

### 6.1 Buttons

* Icon-only buttons require `aria-label`.
* Toggle buttons require `aria-pressed`.
* Active tool state must be visually clear.

### 6.2 Inputs

* Number inputs must support: step, shift-step, enter commit, escape revert.
* Error state must be supported (visual + `aria-invalid`).

### 6.3 Dropdowns / Combobox

* Keyboard: arrows navigate, enter selects, escape closes.
* Focus: restore focus to trigger on close.

### 6.4 Modals

* Must trap focus.
* Must restore focus to opener.
* Escape closes unless explicitly disabled.

### 6.5 Tooltips

* Must not block pointer interaction.
* Must have hover delay.

---

## 7. Accessibility Baseline

Mandatory:

* Focus visible styles for all interactive elements
* Correct ARIA attributes for custom components
* Keyboard navigation for menus, selects, dialogs
* Contrast targets: WCAG AA

Testing:

* Run axe-based a11y tests for primitives.
* No primitive merges without a11y coverage.

---

## 8. Performance Engineering Rules

### 8.1 React Rendering Policy

* React renders only on cold-path state changes.
* Overlays should use RAF batching and bounded complexity.

### 8.2 Measurements

* Any layout measurement must be cached.
* Popover positioning measures on open and on resize/scroll, not per frame.

### 8.3 Zustand Policy

* Zustand is UI-only.
* No pointermove updates unless RAF-batched and documented.

---

## 9. Governance (CI-Enforced)

### 9.1 Required Checks

* no hardcoded colors
* no hardcoded z-index
* no arbitrary Tailwind values
* restricted spacing values
* primitive usage enforcement
* a11y checks for primitives

### 9.2 Exceptions

All exceptions must:

* be rare
* be documented
* be centralized in a single allowlist

---

## 10. Contribution Checklist (PR Gate)

Every UI PR must satisfy:

* [ ] Uses primitives (or adds a primitive)
* [ ] Uses tokens only (no hex, no arbitrary Tailwind)
* [ ] Uses semantic z-index tokens
* [ ] Has keyboard + focus behavior
* [ ] Has ARIA where applicable
* [ ] Does not add hot-path renders or allocations
* [ ] Updates this document if a new pattern is introduced

---

## 11. CAD-Specific Guidelines

### 11.1 Canvas Overlays

* Overlays must remain low-latency.
* Prefer engine-provided overlay buffers where available.
* If React overlays exist, keep them small, RAF-batched, and avoid expensive DOM.

### 11.2 Inspector Panels

* Use `Section` for grouping.
* Avoid deep nesting.
* Use semantic typography (heading/label/body).

### 11.3 Command Palette / Command Input

If present:

* keyboard-first
* explicit activation (must not steal focus during drawing)
* consistent with primitives

---

## 12. Conventions & File Structure

Recommended structure:

```
apps/web/
  components/
    ui/
      Button/
      Input/
      Popover/
      Select/
      Dialog/
      Tooltip/
      Toast/
      Icon/
      Layout/
  theme/
    tokens.css
    theme.css
  design/
    global.css
```

Rule: feature code must not invent new primitives outside `components/ui/`.

---

## 13. Change Management (Design ADR)

Any non-trivial change to tokens, primitives, or layering must include a short ADR:

* file: `docs/ui/adr/ADR-YYYYMMDD-<slug>.md`
* content:

  * Context
  * Decision
  * Alternatives considered
  * Consequences

---

## 14. Appendix: Minimum Token File Template

`apps/web/theme/tokens.css` must define at least:

* color tokens
* spacing scale
* typography semantic tokens
* radii
* elevation
* z-index domains
* icon tokens
* component sizing tokens
