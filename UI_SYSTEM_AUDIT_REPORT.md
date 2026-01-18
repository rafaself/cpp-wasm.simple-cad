# UI System Audit Report (MUI/Vuetify-Level)

## Executive Summary

Top 10 findings (most impactful)
1) Focus-visible system is effectively broken: `focus-outline` uses undefined CSS vars and `Button` uses `ring-ring` (not defined), while global CSS removes default outlines. Result: keyboard focus is often invisible. See `apps/web/design/global.css`, `apps/web/components/ui/Button.tsx`.
2) Core primitives are not keyboard accessible: `Toggle`, `Select`, `ContextMenu`, `DisciplineContextMenu`, `Tooltip`, and `Popover` lack proper roles/keyboard interactions.
3) Token discipline is not enforced: widespread raw colors, `text-[px]`, `gap-0.5`, `z-50`, and inline styles violate `DESIGN.md` token rules.
4) Typography tokens defined in `DESIGN.md` are missing in `apps/web/theme/tokens.css`, and Tailwind has no `fontFamily` mapping to tokens.
5) Component APIs are inconsistent (`Dialog` uses `modelValue/onUpdate`, `Input` uses `inputSize`, `Button` uses `size`), reducing reusability and predictability.
6) Overlay stacking is inconsistent: mixed `z-*` tokens, hardcoded values (1000), and extreme z-index (ColorPicker) create unpredictable layering.
7) Numeric input duplication causes divergent UX: `Input`, `NumberSpinner`, `NumericComboField`, `TransformField`, and `RadiusInputModal` all implement different patterns.
8) i18n drift: English strings in UI (placeholders, aria labels, sr-only text) violate pt-BR and extractable rules.
9) Popover/tooltip positioning lacks viewport collision handling and can render off-screen.
10) `Toggle` uses `bg-muted` (undefined in Tailwind config), likely producing missing styles in UI.

Risk assessment
- High: accessibility regressions and token drift are structural and affect most UI surfaces.
- Medium: overlay stacking and inconsistent primitives cause subtle UX bugs.
- Medium: duplication and API inconsistencies increase maintenance risk.

What to fix first (shortlist)
- Restore focus-visible styling (tokens + classes) and stop globally suppressing focus without a replacement.
- Fix `Toggle` and `Select` accessibility, and add a11y to `Popover/Tooltip`.
- Normalize overlay z-indexing to token scale.
- Replace raw colors and `text-[px]` with token-backed classes.
- Localize remaining English UI strings and connect to `LABELS`.

## Component Inventory (UI_COMPONENT_INVENTORY)

### Primitives (apps/web/components/ui)
| Component | Props API (key) | Styling approach | A11y coverage | Usage (examples) |
| --- | --- | --- | --- | --- |
| Button | `variant`, `size`, `isLoading`, `leftIcon`, `rightIcon` | Tailwind + tokens + raw colors | Partial (focus ring broken, no default `type`) | Ribbon buttons, Settings modal, Layer manager |
| Input | `inputSize`, `variant`, `leftIcon`, `rightIcon`, `error` | Tailwind, raw sizes | Partial (no label association) | Limited direct usage |
| Select | `value`, `onChange`, `options`, `placeholder` | Popover + Button | Low (no keyboard listbox) | Ribbon Font/Layer selects |
| Toggle | `label`, `checked`, `onChange` | Tailwind, `bg-muted` | Low (no role/keyboard) | Settings sections |
| Dialog | `modelValue`, `onUpdate`, `activator`, `persistent` | Portal + Tailwind | Partial (basic focus trap) | Settings, Header, Command help |
| Popover | `isOpen`, `onOpenChange`, `placement` | Portal + Tailwind | Low (no ARIA/focus handling) | Select |
| Tooltip | `content`, `placement`, `delay` | Portal + Tailwind | Low (no aria-describedby) | Ribbon/toolbar hints |
| Toast | `type`, `isVisible`, `duration`, `position` | Portal + Tailwind + raw colors | Partial (role status/alert) | Global toast |
| Portal | `container` | React portal | N/A | Popover, Tooltip, Toast |
| Icon | `icon`, `size` | Lucide wrapper | N/A | Ribbon, buttons |
| Section | `title` | Tailwind + tokens | Partial (heading only) | Settings, Drawing inspector |

### Shared components (apps/web/components)
| Component | Type | Styling | A11y | Notes |
| --- | --- | --- | --- | --- |
| ContextMenu | Menu | Tailwind + absolute | Low | No portal, no keyboard roles |
| NumberSpinner | Numeric input | Tailwind + raw sizes | Low | No label association, buttons not focusable |
| EditableNumber | Inline edit | Tailwind | Low | Uses NumberSpinner, no label association |
| NumericComboField | Numeric combobox | Tailwind + portal | Medium | Combobox roles, but some strings not localized |
| TextInputProxy | IME input proxy | Hidden textarea | N/A | Accessibility not applicable (engine input) |
| TextCaretOverlay | Canvas overlay | Inline styles | N/A | Engine-driven overlay |
| LoadingOverlay | App overlay | Tailwind + raw colors | Partial | Uses `role="alert"` for loading state |
| ColorPicker (Area/Slider/Inputs/Swatches) | Complex control | Hardcoded colors, inline styles | Low | No keyboard support, huge z-index |
| PerformanceMonitor (dev) | HUD | Inline styles | Low | Dev-only but uses raw colors |

### Feature composites (apps/web/features)
Settings
- `SettingsModal`, `SettingsSidebar`, `CanvasSettings`, `SnappingSettings`, `ShortcutsSettings`, `ProjectSettings`, `InterfaceSettings`, `DeveloperSettings`

Editor (surfaces and panels)
- `NextSurface`, `Header`, `EditorRibbon`, `EditorTabs`, `EditorSidebar`, `EditorStatusBar`, `QuickAccessToolbar`
- `LayerManagerModal`, `RadiusInputModal`, `InlinePolygonInput`, `CommandInput`, `CommandHelpContent`
- `SidebarTabs`, `DrawingInspectorPanel`, `TransformField`

Editor (ribbon system)
- `RibbonGroup`, `RibbonButton`, `RibbonLargeButton`, `RibbonSmallButton`, `RibbonIconButton`, `RibbonToggleGroup`, `RibbonControlWrapper`, `RibbonDivider`
- `LayerRibbonControls`, `SelectionControls`, `TextFormattingControls`
- `TextControls`, `GridControl`, `TransformShortcuts`

Editor (overlays and cursors)
- `EngineInteractionLayer`, `MarqueeOverlay`, `ShapeOverlay`, `StrokeOverlay`, `RotationTooltip`, `MoveCursor`, `RotationCursor`, `ResizeCursor`, `CenterOriginIcon`, `UserHint`, `PlanProperties`
- `DisciplineContextMenu`

#### Duplication and divergence
- Numeric inputs are fragmented across `Input`, `NumberSpinner`, `NumericComboField`, `TransformField`, and `RadiusInputModal`.
- Menus and overlays are implemented multiple ways: `ContextMenu`, `DisciplineContextMenu`, `Popover`, and ad-hoc dropdowns.
- Buttons are re-implemented in `QuickAccessToolbar` and `Header` instead of using `Button` or `IconButton`.

#### Dependency map
Foundational primitives
- `Button`, `Icon`, `Dialog`, `Popover`, `Tooltip`, `Portal`, `Section`, `Input`, `Select`

Composites built on primitives
- `RibbonButton`, `RibbonLargeButton`, `RibbonSmallButton`, `RibbonIconButton`, `SettingsModal`, `LayerManagerModal`

Composites that bypass primitives (re-implement behavior)
- `QuickAccessToolbar` (raw buttons), `RadiusInputModal` (custom modal), `CommandInput` (raw input), `ContextMenu`/`DisciplineContextMenu` (custom menu), `ColorPicker` (custom palette and controls)

## Standards Rubric (0-5)

| Primitive | API | Styling/Tokens | A11y | Behavior | Performance | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Button | 3 | 2 | 2 | 3 | 5 | Missing default `type`; focus ring class invalid; danger hover uses raw color |
| Input | 3 | 2 | 2 | 3 | 5 | Uses `inputSize` not `size`; no label association |
| Select | 2 | 2 | 1 | 2 | 3 | No keyboard listbox or ARIA; uses Popover click only |
| Toggle | 2 | 1 | 0 | 2 | 5 | `bg-muted` undefined; no keyboard or `role="switch"` |
| Dialog | 2 | 2 | 2 | 3 | 3 | API naming inconsistent; z-index not tokenized |
| Popover | 3 | 3 | 1 | 2 | 3 | No focus/esc; no viewport collision handling |
| Tooltip | 3 | 2 | 1 | 3 | 3 | No aria-describedby; uses raw colors |
| Toast | 3 | 1 | 2 | 3 | 4 | Raw colors and no stacking/queueing |
| Portal | 4 | 5 | 5 | 5 | 5 | Simple and stable |
| Icon | 4 | 4 | 5 | 5 | 5 | OK |
| Section | 3 | 3 | 3 | 4 | 5 | Styling is reasonable but not tokenized for typography |
| NumericComboField | 4 | 2 | 3 | 4 | 3 | Good behavior, but text sizing and strings not tokenized/localized |
| NumberSpinner | 3 | 2 | 1 | 3 | 4 | Buttons not focusable; text uses raw sizes |
| ContextMenu | 2 | 2 | 0 | 2 | 4 | No ARIA, no portal, no keyboard nav |

## Bug and Risk Candidates (UI + State + Edge Cases)

1) P1 - Focus-visible styling missing
- Symptom: Keyboard focus is not visible across header/ribbon/buttons.
- Likely cause: `focus-outline` uses undefined `--shadow-focus` and `--color-accent`; `Button` uses `focus-visible:ring-ring` which is not generated. Also global CSS removes default outlines.
- Repro: Press Tab in `Header` or `EditorRibbon` and observe no visible focus indicator.
- Suggested fix: Define focus tokens or use existing `--color-focus`; update `focus-outline` and `Button` to use valid Tailwind classes (`focus-visible:ring-1 focus-visible:ring-primary` or `shadow-focus`).
- References: `apps/web/design/global.css`, `apps/web/components/ui/Button.tsx`.

2) P1 - Toggle is not keyboard accessible and uses invalid class
- Symptom: Toggle cannot be toggled by keyboard and may render without background.
- Likely cause: Click handler on a `div` without `role="switch"` or `input`. `bg-muted` not defined in Tailwind config.
- Repro: Open Settings > Interface, try to toggle using keyboard; inspect toggle background.
- Suggested fix: Replace with `<button role="switch" aria-checked>` or `<input type="checkbox">` and map `bg` to tokens.
- Reference: `apps/web/components/ui/Toggle.tsx`.

3) P1 - Select has no keyboard navigation or listbox semantics
- Symptom: Cannot navigate/select options with keyboard; no ARIA roles for listbox/options.
- Likely cause: Custom Popover dropdown lacks `role="listbox"` and roving focus.
- Repro: Ribbon Font Family Select; use arrows/Enter/Esc.
- Suggested fix: Implement a `Combobox/Listbox` primitive or migrate to `NumericComboField`-style ARIA patterns.
- References: `apps/web/components/ui/Select.tsx`, `apps/web/components/ui/Popover.tsx`.

4) P2 - Context menus can be clipped and are not accessible
- Symptom: Menu may be clipped inside overflow containers and has no keyboard support.
- Likely cause: `ContextMenu` uses `absolute` positioning and no portal or `role="menu"`.
- Repro: Open context menu near container with overflow hidden; tab navigation does not reach items.
- Suggested fix: Add `Portal`, `role="menu"`, `menuitem`, and keyboard navigation.
- References: `apps/web/components/ContextMenu.tsx`, `apps/web/features/editor/components/DisciplineContextMenu.tsx`.

5) P2 - Popover/Tooltip can render off-screen
- Symptom: Dropdowns and tooltips appear partially outside viewport.
- Likely cause: `calculatePosition` does not clamp or flip placements.
- Repro: Open a Popover near bottom/right of viewport.
- Suggested fix: Add viewport collision detection or integrate `@floating-ui` for placement.
- Reference: `apps/web/components/ui/utils/positioning.ts`.

6) P2 - Button default type missing
- Symptom: Buttons inside forms submit unexpectedly.
- Likely cause: `Button` does not default `type="button"`.
- Repro: Place `<Button>` inside a form and click it; form submits.
- Suggested fix: Set default `type="button"` unless explicitly provided.
- Reference: `apps/web/components/ui/Button.tsx`.

7) P2 - Overlay stacking conflicts
- Symptom: Modals, toasts, and color picker stack unpredictably.
- Likely cause: Mixed z-index patterns (`z-50`, `z-10`, `z-modal`, inline 1000, and `2147483647`).
- Repro: Open Settings dialog and trigger ColorPicker or Toast.
- Suggested fix: Enforce z-index tokens and remove arbitrary z-index values.
- References: `apps/web/components/ColorPicker/index.tsx`, `apps/web/components/ui/Dialog.tsx`, `apps/web/features/editor/components/QuickAccessToolbar.tsx`.

8) P2 - i18n drift in UI strings
- Symptom: English strings appear in pt-BR UI and are not extracted.
- Likely cause: Hardcoded strings in primitives and labels.
- Repro: See Select placeholder "Select...", NumericComboField "Open presets", ThemeToggle sr-only "Toggle theme", and `LABELS.statusbar.commandInputLabel` in English.
- Suggested fix: Move all UI strings to `LABELS` and replace inline text.
- References: `apps/web/components/ui/Select.tsx`, `apps/web/components/NumericComboField/NumericComboField.tsx`, `apps/web/features/editor/components/ThemeToggle.tsx`, `apps/web/i18n/labels.ts`.

9) P2 - Focus suppression without replacement
- Symptom: `button:focus` and `button:active` are globally reset to no outline.
- Likely cause: Global CSS reset not paired with consistent focus-visible styling.
- Repro: Tab navigation shows no outline even on native buttons.
- Suggested fix: Remove global reset or ensure `focus-visible` classes are always applied.
- Reference: `apps/web/design/global.css`.

## Refactor and Standardization Plan

Phase 0 (quick wins, 1-2 days)
- Fix focus ring tokens and classes (`focus-outline`, `Button` focus styles).
- Add `type="button"` default to `Button`.
- Replace `bg-muted` and other undefined classes with token-backed classes.
- Localize English strings to `LABELS` and update `LABELS.statusbar.commandInputLabel`.
- Normalize z-index usage: replace `z-50` and inline z-index with token classes.
- Patch documentation drift (see Appendix patches).

Phase 1 (primitives foundation)
- Introduce `IconButton` primitive (wraps `Button` with `aria-pressed`, size tokens).
- Build `TextField` primitive with `label`, `helper`, `error`, and `id`/`aria` wiring.
- Replace `Select` with `Combobox/Listbox` primitive (keyboard, aria, type-ahead).
- Replace `Toggle` with `Switch` primitive using `input type="checkbox"` or `button role="switch"`.
- Extend `Popover/Tooltip` to support `Esc`, focus, and `aria-describedby`.
- Create `Menu` primitive for context menus with roving focus.

Phase 2 (migrate composites)
- Migrate `QuickAccessToolbar`, `SettingsSidebar`, and `Header` to primitives (`IconButton`, `Menu`).
- Consolidate numeric inputs: make `NumericComboField` the base and adapt `NumberSpinner` or replace it.
- Replace `RadiusInputModal` with `Dialog` + `TextField`.
- Wrap `ColorPicker` inside `Popover` and align to tokenized colors.

Phase 3 (enforce rules)
- Add lint rule to ban `text-[px]`, `gap-0.5`, raw colors in TSX, and `z-` not in tokens.
- Add unit tests for keyboard nav, focus trap, and overflow recovery in UI primitives.
- Add a11y checks (axe) for `Dialog`, `Select`, `Menu`, `Toggle`.
- Add doc drift check for token locations and required token categories.

## Concrete Recommendations

Naming conventions
- `open` / `onOpenChange` for dialogs, popovers, menus.
- `size` and `variant` consistently across primitives (avoid `inputSize`).
- `tone` for semantic intent (`default`, `primary`, `danger`, `warning`).

Token rules
- Map Tailwind `fontFamily`, `fontSize`, `height`, `spacing`, and `boxShadow` to tokens.
- Replace `text-[px]` with semantic text tokens (eg `text-body`, `text-label`).
- No raw hex/rgba in TSX except in `theme/*` and engine overlays.

Z-index layering policy
- Canvas: `z-canvas-base`, `z-canvas-overlay`, `z-canvas-hud`.
- Portals: `z-dropdown`, `z-modal`, `z-tooltip`, `z-toast`.
- Ban `z-50`/`z-10` and inline z-index in TSX.

Accessibility minimum checklist
- All interactive components must be reachable by keyboard.
- Visible focus state for all focusable elements.
- `Dialog`: `role="dialog"`, `aria-modal`, `aria-labelledby` or `aria-label`, focus trap, `Esc` close.
- `Menu/Select`: `role="menu/listbox"`, `role="menuitem/option"`, roving focus, `Esc` and `Arrow` handling.
- `Toggle`: `role="switch"`, `aria-checked`, label association.

Gold standard API templates (examples)
```ts
// Button
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  asChild?: boolean;
}

// Dialog
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
}

// Select (Combobox)
export interface SelectProps<T> {
  value: T | null;
  onChange: (value: T | null) => void;
  options: Array<{ value: T; label: string }>;
  placeholder?: string;
  disabled?: boolean;
}

// TextField
export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: boolean;
  size?: 'sm' | 'md';
}
```

## Appendix

Files and areas inspected
- `apps/web/components/ui/*`
- `apps/web/components/*`
- `apps/web/features/editor/components/*`
- `apps/web/features/editor/ribbon/components/*`
- `apps/web/features/settings/*`
- `apps/web/design/global.css`
- `apps/web/theme/tokens.css`
- `apps/web/tailwind.config.cjs`
- `apps/web/src/styles/recipes.ts`
- `apps/web/i18n/labels.ts`
- `apps/web/AGENTS.md`, `DESIGN.md`

Assumptions
- Single toast at a time (no queue).
- ColorPicker is only used in layer manager and ribbon controls.
- No SSR or server rendering requirements for UI primitives.

Open questions
- Do we want to adopt `@floating-ui` for all positioned overlays?
- Should ColorPicker be promoted to a formal primitive with tokenized theme?
- Are there planned light/dark theme overrides beyond what exists in `tokens.css`?

Documentation drift patches (proposed)

*** Begin Patch
*** Update File: apps/web/AGENTS.md
@@
-- **Design Fidelity**: Strictly follow `design/tokens.css` and Tailwind classes.
+- **Design Fidelity**: Strictly follow `theme/tokens.css` (tokens) and `design/global.css` (UI patterns) alongside Tailwind classes.
*** End Patch

*** Begin Patch
*** Update File: DESIGN.md
@@
-* Canonical tokens: `apps/web/theme/tokens.css`
-* Theme overrides (dark/light): `apps/web/theme/theme.css`
+* Canonical tokens and theme overrides (dark/light): `apps/web/theme/tokens.css` (see :root[data-theme] blocks)
*** End Patch
