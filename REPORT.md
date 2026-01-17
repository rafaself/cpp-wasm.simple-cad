# 1) Ribbon Architecture Map (What exists)

  ## 1.1 Identify the “core” components

  - EditorRibbon (Ribbon container + tabs)
      - Renders tab headers + active tab content; horizontally scrollable group row.
      - File: apps/web/features/editor/components/EditorRibbon.tsx:12
      - Groups come from config: apps/web/features/editor/ui/ribbonConfig.ts:55
  - RibbonGroup (Group container + layout switch)
      - Responsible for rendering one group with fixed slots and a layout mode (flex-row / grid-2x3 /
        stack).
      - File: apps/web/features/editor/components/ribbon/RibbonGroup.tsx:49
  - RibbonGroupContent (Group “body” slot)
      - Fixed-height “content area” wrapper + overflow handling.
      - File: apps/web/features/editor/components/ribbon/RibbonGroup.tsx:15
  - RibbonGroupTitle (Group label slot)
      - Fixed-height label row, vertically centered.
      - File: apps/web/features/editor/components/ribbon/RibbonGroup.tsx:34
  - Buttons
      - RibbonButton (default row button; delegates based on layout/variant)
          - File: apps/web/features/editor/components/ribbon/RibbonButton.tsx:19
      - RibbonLargeButton (vertical big button used for “large” items)
          - File: apps/web/features/editor/components/ribbon/RibbonLargeButton.tsx:16
      - RibbonSmallButton (dense grid/stack button, forced 24px height)
          - File: apps/web/features/editor/components/ribbon/RibbonSmallButton.tsx:18
      - RibbonIconButton (icon-only button used by toggle groups)
          - File: apps/web/features/editor/components/ribbon/RibbonIconButton.tsx:49
  - Inputs / controls
      - Select (dropdown built on Button + Popover)
          - File: apps/web/components/ui/Select.tsx:16
      - Ribbon “input recipe” used by selects/inputs (height/padding/typography)
          - File: apps/web/src/styles/recipes.ts:17
      - Numeric control in text group (combo field)
          - File: apps/web/features/editor/ribbon/components/TextControls.tsx:129
  - Toggle container
      - RibbonToggleGroup
          - File: apps/web/features/editor/components/ribbon/RibbonToggleGroup.tsx:17 (exists; used
            widely)
  - Divider
      - RibbonDivider
          - File: apps/web/features/editor/components/ribbon/RibbonDivider.tsx:12
  - Ribbon layout utilities (CSS)
      - .ribbon-row, .ribbon-group-col, .ribbon-fill-h etc.
      - File: apps/web/design/global.css:102

  ## 1.2 Layout metrics (current)

  - EditorRibbon content rail
      - Display: flex row of groups, scrollable (horizontal).
      - Height strategy: fixed h-[82px].
      - Padding strategy: px-[12px] (no vertical padding on the rail currently).
      - File: apps/web/features/editor/components/EditorRibbon.tsx:114
  - RibbonGroup
      - Outer: flex flex-col h-full.
      - Slotting:
          - Content slot: h-[64px], overflow-hidden.
          - Label slot: h-[18px], label uses leading-[18px].
      - File: apps/web/features/editor/components/ribbon/RibbonGroup.tsx:22, apps/web/features/editor/
        components/ribbon/RibbonGroup.tsx:35
  - RibbonGroup layout modes
      - flex-row: flex items-center gap-1 justify-center.
      - grid-2x3: grid grid-cols-3 ... items-center.
      - stack: flex flex-col ... justify-center.
      - File: apps/web/features/editor/components/ribbon/RibbonGroup.tsx:9
  - RibbonButton (default)
      - Uses Button size="md" (h-8 from primitive) unless overridden.
      - File: apps/web/features/editor/components/ribbon/RibbonButton.tsx:63
  - RibbonLargeButton
      - Now fixed: h-[52px] and column layout.
      - File: apps/web/features/editor/components/ribbon/RibbonLargeButton.tsx:52
  - RibbonSmallButton
      - Forces !h-[24px] (dense).
      - File: apps/web/features/editor/components/ribbon/RibbonSmallButton.tsx:49
  - RibbonIconButton
      - Now fixed per size:
          - sm: h-7 w-7
          - md: h-8 w-8
      - Override still possible via className="h-full" etc.
      - File: apps/web/features/editor/components/ribbon/RibbonIconButton.tsx:32
  - RibbonDivider
      - Vertical: self-stretch w-px ... my-1 (fixed inset, no proportional height).
      - Horizontal: w-full h-px ... my-1.
      - File: apps/web/features/editor/components/ribbon/RibbonDivider.tsx:16
  - CSS utilities
      - .ribbon-row: fixed height via CSS var; now align-items: center.
      - --ribbon-item-height: 32px.
      - File: apps/web/design/global.css:92, apps/web/design/global.css:114

  ———

  # 2) Misalignment Diagnosis (Root Causes + Code Evidence)

  ## 2.1 Misalignment classes (evidence-based)

  1. Flex-row groups stretching children

  - Symptom: controls appear “stuck” to top or unevenly distributed in a group row.
  - Root cause: parent alignment items-stretch in a flex-row rail forces children to fill height
    inconsistently vs fixed-height controls.
  - Where: this was the pattern in the old RibbonGroup mapping; current fix is items-center.
  - File evidence (current): apps/web/features/editor/components/ribbon/RibbonGroup.tsx:9
  - Why: mixed h-* children + stretch parent yields inconsistent vertical baselines.
  - Severity: High.

  2. Icon buttons defaulting to h-full

  - Symptom: icon buttons render as 64px tall in some groups and 28/32px elsewhere.
  - Root cause: h-full makes height dependent on the closest constrained parent (group content slot vs
    row slot).
  - Where (current fix): size is now explicit and h-full must be opt-in via className.
  - File evidence: apps/web/features/editor/components/ribbon/RibbonIconButton.tsx:62
  - Severity: High.

  3. Vertical divider proportional height (h-4/5)

  - Symptom: dividers “telegraph” different paddings/heights across groups; looks uneven.
  - Root cause: percentage height depends on parent computed height/padding; visually inconsistent.
  - Where (current fix): self-stretch + fixed my-1 inset.
  - File evidence: apps/web/features/editor/components/ribbon/RibbonDivider.tsx:16
  - Severity: Medium.

  4. Custom controls inserted without a normalization slot

  - Symptom: custom blocks (layers/colors/text group controls) can sit off-center and/or size
    themselves differently from adjacent items.
  - Root cause: no enforced wrapper enforcing h-full + items-center + shrink-0.
  - Where (current fix): wrapped with className="h-full flex items-center shrink-0".
  - File evidence: apps/web/features/editor/components/ribbon/RibbonGroup.tsx:60
  - Severity: High.

  5. Large buttons filling the entire group body

  - Symptom: big buttons (ex: Text tool) visually “kiss” the top edge of the ribbon body slot.
  - Root cause: RibbonLargeButton previously used h-full, so it filled the whole 64px content slot.
  - Where (current fix): h-[52px] so it is vertically centered within the 64px slot when parent uses
    items-center.
  - File evidence: apps/web/features/editor/components/ribbon/RibbonLargeButton.tsx:52
  - Severity: High (because it breaks perceived padding).

  ## 2.2 Cross-component inconsistencies to watch (confirmed in code)

  - Select vs other controls height strategy
      - Select uses Button size="sm" (base h-6), but callers override with INPUT_STYLES.ribbon (h-7)
        and/or ribbon-fill-h (100%).
      - Files: apps/web/components/ui/Select.tsx:60, apps/web/src/styles/recipes.ts:17, apps/web/
        design/global.css:136
      - Risk: order-of-classes and wrapper height can cause “compact” vs “full-rail” behaviors.
  - Dense small buttons hard-coded to 24px
      - RibbonSmallButton uses !h-[24px].
      - File: apps/web/features/editor/components/ribbon/RibbonSmallButton.tsx:49
      - Risk: mixing 24px buttons with 32px rails requires explicit centering (now handled by items-
        center and .ribbon-row).

  ———

  # 3) Ribbon Standardization Proposal (Minimal Design System)

  ## 3.1 Sizing tokens (explicit)

  I recommend consolidating Ribbon-only tokens in one place (either apps/web/design/global.css
  under :root or @layer components):

  - --ribbon-height: 82px (matches EditorRibbon rail)
  - --ribbon-group-body-height: 64px
  - --ribbon-group-label-height: 18px
  - --ribbon-control-height-md: 32px (row baseline)
  - --ribbon-control-height-sm: 28px
  - --ribbon-icon-btn-size-md: 32px (h-8 w-8)
  - --ribbon-icon-btn-size-sm: 28px (h-7 w-7)
  - Spacing:
      - --ribbon-group-px: 12px (current px-[12px] on rail)
      - --ribbon-group-gap-x: 4px
      - --ribbon-group-gap-y: 4px
      - --ribbon-divider-inset-y: 4px (maps to my-1)
  - Typography:
      - --ribbon-label-font-size: 10px
      - --ribbon-label-line-height: 18px
      - --ribbon-control-font-size: 12px (or existing text-xs)
      - --ribbon-control-line-height: 16px (typical for text-xs)
  - Corners/borders:
      - --ribbon-control-radius: 6px (maps to rounded-md)
      - --ribbon-divider-opacity: 0.5 (maps to bg-border/50)

  Justification: right now heights are split between Tailwind literals (h-[82px], h-[64px], h-8, h-7)
  + CSS vars (--ribbon-item-height). Formalizing prevents future drift.

## 3.2 Layout primitives (enforceable)

Implement as CSS utilities (Tailwind @layer components) or keep in global.css:

  - .ribbon-rail → fixed height, horizontal scroll, consistent padding.
  - .ribbon-group → flex flex-col h-full.
  - .ribbon-group-body → fixed height, overflow hidden.
  - .ribbon-group-label → fixed height, centered, standardized typography.
  - .ribbon-row → always display:flex; align-items:center; height: var(--ribbon-control-height-md).
  - .ribbon-col → flex flex-col justify-center gap: var(--ribbon-group-gap-y).
  - .ribbon-control → base typography/padding/height normalization for selects/inputs.
  - .ribbon-divider-v → self-stretch w-px my-* inset (no percentages).
  - RibbonIconButton rule: fixed size by prop; fill only via explicit class override.

# 4) Phase 0 — Baseline Instrumentation (Executed)

- **Debug flag**: ribbon outlines are enabled by setting `VITE_RIBBON_DEBUG=true` before starting `pnpm dev` or by evaluating `window.__RIBBON_DEBUG__ = true` in the console before the ribbon mounts.
  - The ribbon rail, each group, and every control get dashed outlines when the flag is active (`apps/web/design/global.css:151-167`).
  - Ribbon groups now carry `ribbon-group`/`ribbon-group-content` classes and honor the debug outline rules in the global CSS.
  - Icon, large, and small buttons automatically append `ribbon-debug-control` when the debug flag is set, so no component changes are required to see their bounding boxes (`apps/web/features/editor/components/ribbon/*.tsx`).
- **Center guide**: a dashed horizontal guide line is rendered at the ribbon domain center when debug mode is active (`apps/web/features/editor/components/EditorRibbon.tsx:114-122`).
- **Baseline capture instructions**: run `VITE_RIBBON_DEBUG=true pnpm dev`, navigate to the relevant tabs (e.g., Início default tab, Desenho/Formas, Texto/Camadas), and take screenshots at the default and a narrower viewport width for future regression comparison.

The instrumentation is safe for production builds since the flag defaults to `false` and the outlines only appear when explicitly enabled.

  ## 3.3 Group label strategy

  Option A (Preferred and already aligned with the current direction): explicit fixed-height label row
  under fixed-height content row.

  - It guarantees consistent baseline across groups without needing absolute positioning tricks.
  - Enforced by construction in RibbonGroup.
  - File: apps/web/features/editor/components/ribbon/RibbonGroup.tsx:15

  ———

  # 4) Implementation Plan (Phased, Incremental, With Acceptance Criteria)

  ## Phase 0 — Baseline & Instrumentation

  - Add a RIBBON_DEBUG flag (env or feature flag) to toggle outline classes on:
      - rail (EditorRibbon)
      - group body + label slots (RibbonGroup)
      - key controls (RibbonIconButton, Select)
  - Add an optional horizontal guide line at the vertical center of the rail.
  - Capture baseline screenshots (manual or Playwright):
      - Início tab
      - Desenho tab (Formas grid)
      - Camadas group
      - Anotação/Text group
      - Standard + narrow viewport widths
        Acceptance:
  - Debug mode is off by default and has zero runtime cost when disabled.
  - Baseline images exist for comparison.

  ## Phase 1 — High Impact / Low Risk Fixes (layout correctness)

  Already implemented in codebase (see Phase 1 patch section below):

  - flex-row: items-center (not stretch)
  - custom slot wrapper
  - RibbonIconButton fixed sizes
  - RibbonDivider fixed inset + stretch
  - plus: RibbonLargeButton no longer h-full (prevents “touching top”)
    Acceptance:
  - Icon buttons are always 28/32px.
  - Large buttons visually respect top/bottom breathing room in the 64px body slot.
  - Custom controls sit centered in the same vertical rail.

  ## Phase 2 — Tokens + primitives

  - Replace hard-coded heights in multiple places with a single token set (prefer CSS vars + Tailwind
    utilities).
  - Migrate a few representative groups:
      - Formas (grid)
      - Camadas (select + toggles + divider)
      - Anotação (text controls)
        Acceptance:
  - At least two control types (select + icon button) consume shared tokens.
  - No per-tab “fixes”.

  ## Phase 3 — Control normalization

  - Normalize typography + line-height:
      - group label
      - select label text
      - button labels (default/large/small)
  - Ensure all “row controls” align on the same centerline:
      - selects, toggle groups, icon buttons
        Acceptance:
  - No visible vertical drift when switching tabs.
  - No control is clipped in rows/groups.

  ## Phase 4 — Visual harmony & density

  - Standardize radius, borders, hover/active/disabled/focus states across ribbon controls.
    Acceptance:
  - Ribbon looks cohesive and “single system”.

  ## Phase 5 — Hardening

  - Add Playwright screenshot tests for the ribbon rail (no new dependencies beyond what you already
    use).
  - Add lightweight guardrails:
      - forbid h-full in RibbonIconButton unless explicitly requested by prop/class
      - enforce .ribbon-row usage inside custom groups
        Acceptance:
  - Alignment regressions are caught automatically.

  ———

  # 5) Decisions & Trade-offs (Mandatory)

  - Why IconButton should not default to h-full
      - It makes size dependent on parent slot height (64px group body vs 32px row), which is exactly
        how drift happens. Fixed per-size avoids “contextual stretching”. (apps/web/features/editor/
        components/ribbon/RibbonIconButton.tsx:62)
  - Why RibbonGroup should prefer items-center in flex-row
      - A ribbon row is a “rail”: controls must opt into stretching; the default should be consistent
        center alignment to handle mixed heights safely. (apps/web/features/editor/components/ribbon/
        RibbonGroup.tsx:9)
  - Why divider height should not be proportional
      - Percentage heights expose differences in parent padding/box sizing; fixed inset + stretch
        reads consistent across groups. (apps/web/features/editor/components/ribbon/
        RibbonDivider.tsx:16)
  - Why custom components must be normalized via a wrapper slot
      - Otherwise each custom component becomes its own “layout system” (some align top, some center,
        some size to content). The wrapper enforces the same rail rules without changing the custom
        component internals. (apps/web/features/editor/components/ribbon/RibbonGroup.tsx:60)
  - Why RibbonLargeButton should not be h-full
      - Large buttons should be visually centered within the group body slot; h-full defeats
        “perceived padding” and causes the “touching top edge” issue. (apps/web/features/editor/
        components/ribbon/RibbonLargeButton.tsx:52)

  ———

  # 6) Recommended Initial Patch (Preferred)

  Phase 1 is effectively implemented. Key deltas (diff-style excerpts):

  --- a/apps/web/features/editor/components/ribbon/RibbonGroup.tsx
  +++ b/apps/web/features/editor/components/ribbon/RibbonGroup.tsx
  @@
  -  'flex-row': 'flex items-stretch gap-1 justify-center',
  +  'flex-row': 'flex items-center gap-1 justify-center',
  @@
  -  return <React.Fragment key={item.id}><Component /></React.Fragment>
  +  return <div key={item.id} className="h-full flex items-center shrink-0"><Component /></div>

  --- a/apps/web/features/editor/components/ribbon/RibbonIconButton.tsx
  +++ b/apps/web/features/editor/components/ribbon/RibbonIconButton.tsx
  @@
  -  className={`h-full ${widthClass} p-0 ${className}`}
  +  className={`${SIZE_CLASSES[size]} p-0 ${className}`}

  --- a/apps/web/features/editor/components/ribbon/RibbonDivider.tsx
  +++ b/apps/web/features/editor/components/ribbon/RibbonDivider.tsx
  @@
  -  orientation === 'vertical' ? 'h-4/5 w-px ...' : ...
  +  orientation === 'vertical' ? 'self-stretch w-px bg-border/50 mx-0.5 my-1' : ...

  --- a/apps/web/features/editor/components/ribbon/RibbonLargeButton.tsx
  +++ b/apps/web/features/editor/components/ribbon/RibbonLargeButton.tsx
  @@
  -  className={`h-full flex-col ...`}
  +  className={`h-[52px] flex-col ...`}

  ## Validation checklist (manual)

  - View: Início tab (large buttons like Text/Arquivo) and confirm they no longer touch the top of the
    group body slot.
  - View: Desenho tab (Formas grid) and confirm icon buttons are consistent 28px and centered.
  - View: Camadas group (select + toggles + divider) and confirm divider inset looks identical across
    groups.
  - Resize: narrow viewport (forces horizontal scroll) and confirm no wrapping/clipping.
