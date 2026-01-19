# Ribbon UI/UX Optimization Plan — ElectroCad

**Document Version:** 1.0
**Date:** 2026-01-19
**Author:** Senior UX/UI Designer (AI-Assisted Analysis)
**Application:** ElectroCad Webapp
**Scope:** Complete Ribbon System Optimization

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Ribbon Audit (Diagnosis)](#2-ribbon-audit-diagnosis)
3. [Full Feature Inventory](#3-full-feature-inventory)
4. [Design Principles and System Rules](#4-design-principles-and-system-rules)
5. [Proposed New Ribbon IA and Layout](#5-proposed-new-ribbon-ia-and-layout)
6. [Command Migration Map](#6-command-migration-map)
7. [Responsive Ribbon Strategy](#7-responsive-ribbon-strategy)
8. [Interaction States, Feedback, and Modes](#8-interaction-states-feedback-and-modes)
9. [Implementation Plan (Phased Roadmap)](#9-implementation-plan-phased-roadmap)
10. [Acceptance Criteria and Success Metrics](#10-acceptance-criteria-and-success-metrics)
11. [Appendices](#11-appendices)

---

## 1. Executive Summary

### Top Issues Identified

- **Inconsistent component patterns**: Three different button sizes (24px, 32px, 52px) without clear usage rules; mixing `flex-row`, `grid-2x3`, and `stack` layouts arbitrarily
- **Information Architecture fragmentation**: File operations split between "Arquivo" and "Projeto" groups; drawing tools separated from annotation tools; selection/editing tools on separate tab from drawing
- **Density imbalance**: Some groups have 1 item (Measure), others have 6+ items (Formas); uneven visual weight across tabs
- **Missing consistency tokens**: Height tokens exist (`--ribbon-group-body-height: 68px`) but component heights vary (24px, 28px, 30px, 32px, 52px) without a unified system
- **Accessibility gaps**: Tooltips lack structured format; no command palette; shortcut discoverability depends on hovering
- **No responsive collapse strategy**: Only horizontal scrolling implemented; no adaptive density or overflow behavior defined

### Guiding Principles

1. **Preserve 100% functionality** — All current commands remain accessible
2. **Jobs-to-be-done organization** — Group by workflow task, not by technical category
3. **Consistent density** — Standardize component sizes and group widths
4. **Expert-first, learner-friendly** — Shortcuts visible, tooltips structured, discoverability maintained
5. **Predictable responsiveness** — Defined collapse order with always-visible critical commands

### Biggest Structural Changes

1. Consolidate 3 tabs into a streamlined 4-tab structure: **Home | Draw | Annotate | View**
2. Merge File and Project groups into unified **File** group
3. Move Selection and Edit tools to **Draw** tab for workflow continuity
4. Create dedicated **View** tab for navigation, display, and measurement tools
5. Introduce standardized 3-tier button hierarchy: Primary (52px), Standard (32px), Compact (24px)
6. Implement responsive collapse with defined "never hide" commands

### Implementation Roadmap Overview

| Phase | Focus | Duration Estimate |
|-------|-------|-------------------|
| 0 | Instrumentation + Baseline | — |
| 1 | Grid + Metrics Standardization | — |
| 2 | Component Refactor + States | — |
| 3 | IA Reorganization + Migration | — |
| 4 | Responsiveness + Overflow | — |
| 5 | Polish + Accessibility | — |

### Success Metrics

- Baseline alignment score: 100% (currently ~70% estimated)
- Group height variance: ±0px (currently ~8px variance)
- Time-to-find key commands: Reduced by 30% in usability tests
- Consistent visual hierarchy across all tabs
- Keyboard navigation coverage: 100% of commands

---

## 2. Ribbon Audit (Diagnosis)

### 2.1 Information Architecture (IA)

| Symptom | User Impact | Severity | Recommended Fix | Measurement |
|---------|-------------|----------|-----------------|-------------|
| File operations split across "Arquivo" and "Projeto" | Users must remember two locations for file-related tasks | Medium | Merge into single "File" group with primary/secondary hierarchy | User task completion time for save/export flows |
| Selection tool on "Ferramentas" tab, drawing tools on "Desenho" | Context switching required during standard draw→select→modify workflow | High | Move Selection to Draw tab as first group | Tab switch count during typical drawing session |
| Measure tool isolated on "Ferramentas" with single item | Wasted space; inconsistent with dense groups elsewhere | Medium | Move to View tab; combine with display controls | Group item count variance |
| "Cores" group conditionally rendered (feature flag) | Inconsistent tab layout when flag changes | Low | Always render with graceful empty state or merge with text formatting | Visual consistency audit |
| Undo/Redo on "Ferramentas" tab | Not discoverable during drawing workflow | Medium | Move to Draw tab or make always-visible in tab header | Shortcut usage vs. button click ratio |

### 2.2 Layout: Grid / Baseline / Spacing / Group Consistency

| Symptom | User Impact | Severity | Recommended Fix | Measurement |
|---------|-------------|----------|-----------------|-------------|
| Three different layout modes (`flex-row`, `grid-2x3`, `stack`) without clear rules | Unpredictable visual patterns; cognitive load | Medium | Define layout decision matrix based on item count and type | Layout type distribution audit |
| Large buttons (52px) mixed with standard buttons (32px) in same row | Uneven visual rhythm; alignment breaks | High | Enforce single button size per row; use consistent height containers | Alignment grid compliance score |
| Group widths vary significantly (64px min to 300px+) | Unbalanced tab layouts; some groups feel cramped, others sparse | Medium | Define min/max group widths; introduce group width tiers | Group width variance measurement |
| `gap-1` (4px) used inconsistently | Micro-variations in spacing across components | Low | Standardize all gaps to token values | Gap consistency audit |
| No explicit baseline alignment rule | Text labels at different vertical positions | Medium | Define baseline grid (4px increment) for all text elements | Baseline alignment score |

### 2.3 Component Consistency

| Symptom | User Impact | Severity | Recommended Fix | Measurement |
|---------|-------------|----------|-----------------|-------------|
| Four button components with overlapping purposes | Developer confusion; inconsistent user experience | High | Consolidate to 3 clear variants with explicit usage rules | Component usage audit |
| `RibbonSmallButton` height (24px) differs from `RibbonIconButton` size (28px/32px) | Visual inconsistency when adjacent | Medium | Unify small/icon button heights to single token | Height variance count |
| Custom components (Color, Layer, Text) have different internal layouts | Each complex control feels like a different design system | High | Create shared composition patterns for multi-row controls | Visual consistency score |
| Split buttons not implemented (only dropdowns in custom controls) | Missing pattern for common CAD interaction (tool + options) | Medium | Implement `RibbonSplitButton` component | Component catalog completeness |
| Segmented controls use `RibbonToggleGroup` with dividers | Works but not optimized for toggle-vs-radio semantics | Low | Differentiate segmented control (radio) vs. toggle group (checkbox) | Semantic correctness audit |

### 2.4 Density & Legibility

| Symptom | User Impact | Severity | Recommended Fix | Measurement |
|---------|-------------|----------|-----------------|-------------|
| Label font size (10px) at minimum legibility | Strain for extended use; accessibility concern | Medium | Increase to 11px minimum; ensure 4.5:1 contrast ratio | WCAG contrast audit |
| Large buttons use `line-clamp-2` for labels | Truncation hides important text; unpredictable | Low | Enforce single-line labels; use abbreviation rules | Label truncation count |
| Icon sizes (14px, 16px, 20px) may be too small on high-DPI displays | Reduced target size; misclick potential | Medium | Minimum 16px icons; 24px touch targets | Touch target compliance |
| Control font size (12px) adequate but inconsistent application | Some controls use different sizes | Low | Enforce `--ribbon-control-font-size` globally | Font size consistency audit |

### 2.5 States & Feedback

| Symptom | User Impact | Severity | Recommended Fix | Measurement |
|---------|-------------|----------|-----------------|-------------|
| Active tool state uses color change only | May be missed by colorblind users | Medium | Add secondary indicator (icon badge, border, or background pattern) | State visibility score |
| "Stub" status shows as disabled without clear "coming soon" indication | Users may think feature is broken | Low | Add visual badge or distinct styling for stub state | User confusion reports |
| Mixed state ("?") for multi-selection only in custom controls | Inconsistent mixed state pattern | Medium | Implement mixed state indicator for all multi-value controls | Mixed state coverage |
| No visual feedback for command execution | Users uncertain if click registered | Medium | Add micro-feedback (brief highlight, ripple, or status bar message) | User confidence score |
| Mode indication (e.g., "drawing line") not visible in ribbon | Users lose context of current mode | High | Add mode indicator badge to active tool button | Mode awareness score |

### 2.6 Accessibility

| Symptom | User Impact | Severity | Recommended Fix | Measurement |
|---------|-------------|----------|-----------------|-------------|
| Tooltips show only name + shortcut (when available) | Missing description for new users | Medium | Implement structured tooltip: Name, Shortcut, Description | Tooltip completeness audit |
| No skip navigation for ribbon | Keyboard users must tab through all items | Low | Add "Skip to canvas" link; implement roving tabindex | Tab stop count |
| Contrast ratios not verified for all states | Potential WCAG violations | Medium | Audit all color combinations; fix violations | WCAG 2.1 AA compliance |
| Focus indicators rely on browser defaults in some cases | Inconsistent focus visibility | Low | Implement custom focus ring matching design system | Focus visibility score |
| No command palette or search | Users must visually scan for commands | Medium | Implement Cmd/Ctrl+K command palette | Feature implementation |

### 2.7 Discoverability vs. Speed

| Symptom | User Impact | Severity | Recommended Fix | Measurement |
|---------|-------------|----------|-----------------|-------------|
| Shortcuts only visible on hover (tooltip) | Expert users must memorize or hover | Medium | Add optional "Show shortcuts" mode; integrate with command palette | Shortcut discoverability score |
| No visual grouping of related shortcuts | Learning curve for shortcut system | Low | Document shortcut families; consider mnemonic consistency | Shortcut learnability test |
| Feature flags hide commands completely | Users unaware features exist | Low | Show disabled state with "Coming soon" for unreleased features | Feature awareness |
| Tab switching via number keys not documented in UI | Hidden expert feature | Low | Add subtle hint in tab area; include in onboarding | Feature discovery rate |

---

## 3. Full Feature Inventory

### 3.1 Current Command Inventory

#### Tab: Início (Home)

| Group | Command/Control | Type | Shortcut | Frequency | Criticality | Status |
|-------|-----------------|------|----------|-----------|-------------|--------|
| Arquivo | New File | Large Button | — | Medium | Critical | Stub |
| Arquivo | Open File | Large Button | — | Medium | Critical | Ready |
| Arquivo | Save File | Large Button | — | High | Critical | Ready |
| Projeto | Export JSON | Large Button | — | Low | Important | Stub |
| Projeto | Export Project | Large Button | — | Low | Important | Stub |

#### Tab: Desenho (Draw)

| Group | Command/Control | Type | Shortcut | Frequency | Criticality | Status |
|-------|-----------------|------|----------|-----------|-------------|--------|
| Formas | Line | Small Button (Grid) | tools.line | High | Critical | Ready |
| Formas | Polyline | Small Button (Grid) | tools.polyline | Medium | Critical | Ready |
| Formas | Arrow | Small Button (Grid) | tools.arrow | Medium | Important | Ready |
| Formas | Rectangle | Small Button (Grid) | tools.rect | High | Critical | Ready |
| Formas | Circle | Small Button (Grid) | tools.circle | Medium | Critical | Ready |
| Formas | Polygon | Small Button (Grid) | tools.polygon | Low | Important | Ready |
| Anotação | Text Tool | Large Button | tools.text | High | Critical | Ready |
| Anotação | Font Family | Dropdown | — | Medium | Important | Ready |
| Anotação | Font Size | Numeric Input | — | Medium | Important | Ready |
| Anotação | Bold | Icon Toggle | — | Medium | Important | Ready |
| Anotação | Italic | Icon Toggle | — | Low | Nice-to-have | Ready |
| Anotação | Underline | Icon Toggle | — | Low | Nice-to-have | Ready |
| Anotação | Strikethrough | Icon Toggle | — | Low | Nice-to-have | Ready |
| Anotação | Align Left | Icon Toggle | — | Medium | Important | Ready |
| Anotação | Align Center | Icon Toggle | — | Medium | Important | Ready |
| Anotação | Align Right | Icon Toggle | — | Low | Important | Ready |
| Cores | Stroke Color | Color Swatch + Picker | — | High | Critical | Ready |
| Cores | Stroke Visibility | Icon Toggle | — | Medium | Important | Ready |
| Cores | Stroke Restore | Icon Button | — | Low | Nice-to-have | Ready |
| Cores | Fill Color | Color Swatch + Picker | — | High | Critical | Ready |
| Cores | Fill Visibility | Icon Toggle | — | Medium | Important | Ready |
| Cores | Fill Restore | Icon Button | — | Low | Nice-to-have | Ready |
| Camadas | Layer Select | Dropdown | — | High | Critical | Ready |
| Camadas | Layer Visibility | Icon Toggle | — | Medium | Important | Ready |
| Camadas | Layer Lock | Icon Toggle | — | Medium | Important | Ready |
| Camadas | Layer Manager | Icon Button | — | Medium | Important | Ready |

#### Tab: Ferramentas (Tools)

| Group | Command/Control | Type | Shortcut | Frequency | Criticality | Status |
|-------|-----------------|------|----------|-----------|-------------|--------|
| Seleção | Select Tool | Large Button | tools.select | High | Critical | Ready |
| Seleção | Move Tool | Icon Button | — | High | Critical | Ready |
| Seleção | Rotate Tool | Icon Button | transform.rotate | Medium | Important | Ready |
| Seleção | Duplicate | Icon Button | — | High | Important | Ready |
| Seleção | Delete | Icon Button | editor.delete | High | Critical | Ready |
| Edição | Undo | Small Button | editor.undo | High | Critical | Ready |
| Edição | Redo | Small Button | editor.redo | High | Critical | Ready |
| Exibição | Pan Tool | Large Button | tools.pan | Medium | Important | Ready |
| Exibição | Zoom to Fit | Large Button | nav.zoomFit | Medium | Important | Ready |
| Exibição | Grid Toggle | Large Button | — | Medium | Important | Ready |
| Medir | Measure Tool | Large Button | tools.measure | Low | Important | Stub |

### 3.2 Total Command Count

| Category | Count |
|----------|-------|
| File Operations | 5 |
| Drawing Tools | 6 |
| Annotation/Text | 10 |
| Color Controls | 6 |
| Layer Controls | 4 |
| Selection/Edit | 7 |
| View/Navigation | 4 |
| **Total** | **42** |

### 3.3 Data Collection Template (For Validation)

If analytics are available, collect the following for each command:

| Command ID | Click Count (30 days) | Shortcut Usage Count | Hover Duration (avg) | Error Rate | User Segment |
|------------|----------------------|---------------------|---------------------|------------|--------------|
| `new-file` | | | | | |
| `open-file` | | | | | |
| `save-file` | | | | | |
| ... | | | | | |

**Recommendation:** Instrument all ribbon interactions with analytics events before Phase 1 implementation.

---

## 4. Design Principles and System Rules

### 4.A Layout Metrics

#### Fixed Heights

| Token | Value | Usage |
|-------|-------|-------|
| `--ribbon-height` | 86px | Total ribbon height (body + label) |
| `--ribbon-group-body-height` | 68px | Group content area |
| `--ribbon-group-label-height` | 18px | Group title below content |
| `--ribbon-control-row-height` | 32px | Standard control row |
| `--ribbon-control-compact-height` | 24px | Compact control row |

#### Spacing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ribbon-group-px` | 12px | Horizontal padding inside groups |
| `--ribbon-group-gap` | 8px | Gap between groups |
| `--ribbon-item-gap` | 4px | Gap between items in a row |
| `--ribbon-row-gap` | 4px | Gap between stacked rows |
| `--ribbon-divider-inset` | 8px | Vertical inset for dividers |

#### Baseline Alignment Rules

1. All text baselines align to a 4px grid
2. Label baseline: 4px from bottom of group body
3. Control labels: vertically centered within control height
4. Icon vertical center: aligned with adjacent text baseline + 2px

#### Group Width Constraints

| Tier | Min Width | Max Width | Usage |
|------|-----------|-----------|-------|
| Narrow | 64px | 80px | Single large button groups |
| Standard | 80px | 160px | 2-4 item groups |
| Wide | 160px | 240px | Complex controls (color, text) |
| Extra-Wide | 240px | 320px | Multi-control groups with rows |

#### Icon Sizes

| Token | Value | Usage |
|-------|-------|-------|
| `--ribbon-icon-lg` | 20px | Large buttons (primary commands) |
| `--ribbon-icon-md` | 16px | Standard buttons |
| `--ribbon-icon-sm` | 14px | Compact buttons, toggle icons |

#### Typography

| Element | Font Size | Line Height | Weight |
|---------|-----------|-------------|--------|
| Group Label | 10px | 18px | 500 (Medium) |
| Button Label | 12px | 16px | 400 (Regular) |
| Large Button Label | 10px | 14px | 400 (Regular) |
| Input Text | 12px | 16px | 400 (Regular) |

### 4.B Component Usage Rules (Decision Matrix)

#### When to Use Each Component

| Scenario | Component | Rationale |
|----------|-----------|-----------|
| Primary command, frequently used, needs visibility | Large Button (52px) | Maximum discoverability; supports icon + label |
| Secondary command, moderate frequency | Standard Button (32px) | Balanced density; icon + optional label |
| Tertiary command, space-constrained | Compact Button (24px) | Maximum density; icon-only or short label |
| Tool with sub-options (e.g., shape variants) | Split Button | Single click = default; dropdown = variants |
| Discrete options (e.g., alignment) | Segmented Control | Radio-button semantics; mutually exclusive |
| On/off state (e.g., bold, visibility) | Toggle Button | Checkbox semantics; independent |
| Value input (e.g., font size) | Numeric Input | Direct value entry with increment/decrement |
| Selection from list (e.g., font family, layer) | Dropdown | Large option set; searchable if >7 items |
| Color selection | Color Swatch + Picker | Visual preview + full picker on click |

#### Button Variant Selection

```
IF command frequency = High AND visibility requirement = Critical
  THEN use Large Button
ELSE IF command frequency = Medium OR space-constrained
  THEN use Standard Button
ELSE IF command is part of dense group (>4 items)
  THEN use Compact Button
ELSE IF command toggles state
  THEN use Icon Toggle
```

### 4.C Visual Hierarchy Rules

#### Primary vs. Secondary Commands

| Level | Visual Treatment | Examples |
|-------|-----------------|----------|
| Primary | Large button, prominent position (left in group) | Select, Line, Text, Save |
| Secondary | Standard button, center position | Polyline, Rectangle, Circle |
| Tertiary | Compact button or overflow | Polygon, Strikethrough |

#### Label Shortening Rules

| Full Label | Abbreviated | When to Apply |
|------------|-------------|---------------|
| "Rectangle" | "Rect" | Width < 80px |
| "Strikethrough" | "Strike" | Width < 100px |
| "Zoom to Fit" | "Fit" | Width < 80px |
| "Layer Manager" | "Layers" | Width < 100px |

**Rule:** Abbreviate when label exceeds 8 characters AND control width is constrained.

#### Icon/Label Priority

1. **Always show icon** — Icons are mandatory for recognition
2. **Show label when space permits** — Labels improve discoverability
3. **Tooltips always available** — Full name + shortcut + description

### 4.D Stability and Contextual Tools

#### Contextual Group Rules

1. **Insertion Point:** Contextual groups appear at the END of the active tab's groups
2. **Visual Distinction:** Contextual groups have a subtle left border accent
3. **Animation:** Slide-in from right, 150ms ease-out
4. **No Reflow:** Existing groups maintain position; scroll may be required

#### Contextual Tab Rules

1. **Naming:** Contextual tabs use entity name (e.g., "Text", "Image", "Table")
2. **Position:** Appear after standard tabs, before overflow indicator
3. **Auto-activation:** When entity selected, tab activates automatically
4. **Auto-dismiss:** When selection clears, tab remains but doesn't auto-switch away

#### Stability Guarantee

- Core groups (File, Draw, Select, View) **never move** position
- Width changes are animated (200ms) to prevent jarring jumps
- Overflow indicator appears consistently at right edge

### 4.E CAD Tooltips Standard

#### Required Tooltip Structure

```
┌─────────────────────────────────────┐
│ Command Name              [Ctrl+S] │
│─────────────────────────────────────│
│ Brief description of what the       │
│ command does (1-2 lines max).       │
│─────────────────────────────────────│
│ 💡 Pro tip: Additional context      │  ← Optional
└─────────────────────────────────────┘
```

#### Tooltip Content Rules

| Element | Required | Max Length | Example |
|---------|----------|------------|---------|
| Command Name | Yes | 30 chars | "Save File" |
| Shortcut | If exists | — | "Ctrl+S" |
| Description | Yes | 80 chars | "Save the current document to your local files" |
| Pro Tip | Optional | 60 chars | "Auto-saves every 5 minutes" |

#### Tooltip Behavior

- **Delay:** 500ms hover before show
- **Duration:** Persist while hovering; dismiss 100ms after mouse leaves
- **Position:** Above control, centered; flip below if insufficient space
- **Keyboard:** Show on focus after 800ms

#### Status-Specific Tooltips

| Status | Tooltip Addition |
|--------|-----------------|
| Stub | "Coming soon" badge with muted styling |
| Disabled | Reason for disabled state (e.g., "No selection") |
| Active | "Active" indicator (checkmark or highlight) |

---

## 5. Proposed New Ribbon IA and Layout

### 5.1 Tab Structure (Jobs-to-be-Done)

| Tab | Purpose | Primary Jobs |
|-----|---------|--------------|
| **Home** | File and project operations | Open, Save, Export, Project settings |
| **Draw** | Create and modify content | Select, Draw shapes, Edit, Transform |
| **Annotate** | Add information to drawings | Text, Dimensions, Colors, Layers |
| **View** | Control display and navigation | Pan, Zoom, Grid, Measure |

### 5.2 Detailed Tab Layouts

#### Tab: Home

**Rationale:** Consolidate all file/project operations. Users expect file operations on the first tab (Office convention).

| Group | Commands | Layout | Width Tier |
|-------|----------|--------|------------|
| **File** | New, Open, Save | flex-row, 3 large buttons | Standard |
| **Export** | Export JSON, Export Project | flex-row, 2 large buttons | Standard |

**Visual Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ┌──────────────────────┐ ┌──────────────────────┐          │
│ │  [📄] [📂] [💾]     │ │  [📋] [📦]          │          │
│ │  New  Open Save      │ │  JSON  Project       │          │
│ │                      │ │                      │          │
│ └──────────────────────┘ └──────────────────────┘          │
│       File                      Export                      │
└─────────────────────────────────────────────────────────────┘
```

#### Tab: Draw

**Rationale:** Combine selection, shapes, and editing into single workflow tab. Users draw→select→modify in continuous flow.

| Group | Commands | Layout | Width Tier |
|-------|----------|--------|------------|
| **Select** | Select Tool, Move, Rotate, Duplicate, Delete | Large + 2x2 grid | Standard |
| **Shapes** | Line, Polyline, Arrow, Rect, Circle, Polygon | grid-2x3 | Standard |
| **Edit** | Undo, Redo | stack, 2 compact buttons | Narrow |

**Visual Layout:**
```
┌───────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────────┐ ┌─────────────────────────┐ ┌─────────────┐        │
│ │  [🖱️]   [↗][🔄]   │ │  [/][⟋][→]            │ │   [↩]      │        │
│ │  Select [📋][🗑]   │ │  [□][○][⬡]            │ │   [↪]      │        │
│ │                    │ │                         │ │             │        │
│ └────────────────────┘ └─────────────────────────┘ └─────────────┘        │
│       Select                   Shapes                   Edit              │
└───────────────────────────────────────────────────────────────────────────┘
```

#### Tab: Annotate

**Rationale:** Group all content-enhancement tools: text, colors, layers. These modify properties rather than create geometry.

| Group | Commands | Layout | Width Tier |
|-------|----------|--------|------------|
| **Text** | Text Tool, Font Family, Font Size, Styles, Alignment | Large + 2-col custom | Extra-Wide |
| **Colors** | Stroke (color, visibility, restore), Fill (color, visibility, restore) | 2-row custom | Wide |
| **Layers** | Layer Select, Visibility, Lock, Manager | dropdown + toggles + button | Wide |

**Visual Layout:**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ┌───────────────────────────────────────┐ ┌─────────────────────┐ ┌───────────────┐ │
│ │  [T]   │ Font ▼  │ Size ▼ │           │ │ Stroke: [█] 👁 ↩   │ │ Layer ▼       │ │
│ │  Text  │ B I U S │ ◀ ▬ ▶  │           │ │ Fill:   [█] 👁 ↩   │ │ 👁 🔒  [≡]    │ │
│ │        │         │        │           │ │                     │ │               │ │
│ └───────────────────────────────────────┘ └─────────────────────┘ └───────────────┘ │
│                Text                              Colors               Layers        │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Tab: View

**Rationale:** Group all display, navigation, and measurement tools. These don't modify content but change how users see it.

| Group | Commands | Layout | Width Tier |
|-------|----------|--------|------------|
| **Navigate** | Pan Tool, Zoom to Fit | flex-row, 2 large buttons | Standard |
| **Display** | Grid Toggle (with options) | Large + custom control | Standard |
| **Measure** | Measure Tool | Single large button | Narrow |

**Visual Layout:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────┐ ┌─────────────────────────┐ ┌──────────────────┐ │
│ │  [✋] [⛶]          │ │  [#]  │ • ─ │ Color │ ▼ │ │  [📏]           │ │
│ │  Pan  Fit           │ │  Grid │     │       │   │ │  Measure        │ │
│ │                     │ │       │     │       │   │ │                 │ │
│ └─────────────────────┘ └─────────────────────────┘ └──────────────────┘ │
│       Navigate                  Display                 Measure          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Group Organization Rationale

| Group | Rationale |
|-------|-----------|
| **File** | Standard location for document operations; matches user mental model |
| **Export** | Separated from File to distinguish "save locally" from "export for sharing" |
| **Select** | Gateway to all modifications; must be immediately accessible when drawing |
| **Shapes** | Core drawing primitives grouped by function (create geometry) |
| **Edit** | Undo/Redo are universal; compact size keeps them available without dominating |
| **Text** | Complex control needs space; grouped with all text-related options |
| **Colors** | Visual properties; affects both stroke and fill in parallel structure |
| **Layers** | Organization mechanism; separate from visual properties |
| **Navigate** | View manipulation without content modification |
| **Display** | Canvas appearance settings |
| **Measure** | Information-only tool; doesn't modify content |

---

## 6. Command Migration Map

### 6.1 Complete Migration Table

| Command | Current Location | New Location | Visibility | Justification |
|---------|------------------|--------------|------------|---------------|
| New File | Início → Arquivo | Home → File | Always | Primary file operation |
| Open File | Início → Arquivo | Home → File | Always | Primary file operation |
| Save File | Início → Arquivo | Home → File | Always | Primary file operation |
| Export JSON | Início → Projeto | Home → Export | Always | Grouped with export |
| Export Project | Início → Projeto | Home → Export | Always | Grouped with export |
| Select Tool | Ferramentas → Seleção | Draw → Select | Always | Essential for draw workflow |
| Move Tool | Ferramentas → Seleção | Draw → Select | Always | Part of selection actions |
| Rotate Tool | Ferramentas → Seleção | Draw → Select | Always | Part of selection actions |
| Duplicate | Ferramentas → Seleção | Draw → Select | Always | Common editing action |
| Delete | Ferramentas → Seleção | Draw → Select | Always | Common editing action |
| Line | Desenho → Formas | Draw → Shapes | Always | Core drawing tool |
| Polyline | Desenho → Formas | Draw → Shapes | Always | Core drawing tool |
| Arrow | Desenho → Formas | Draw → Shapes | Always | Core drawing tool |
| Rectangle | Desenho → Formas | Draw → Shapes | Always | Core drawing tool |
| Circle | Desenho → Formas | Draw → Shapes | Always | Core drawing tool |
| Polygon | Desenho → Formas | Draw → Shapes | Collapse Tier 2 | Less frequent |
| Undo | Ferramentas → Edição | Draw → Edit | Always | Universal; critical |
| Redo | Ferramentas → Edição | Draw → Edit | Always | Universal; critical |
| Text Tool | Desenho → Anotação | Annotate → Text | Always | Primary annotation tool |
| Font Family | Desenho → Anotação | Annotate → Text | Always | Text property |
| Font Size | Desenho → Anotação | Annotate → Text | Always | Text property |
| Bold | Desenho → Anotação | Annotate → Text | Always | Text style |
| Italic | Desenho → Anotação | Annotate → Text | Collapse Tier 3 | Less frequent |
| Underline | Desenho → Anotação | Annotate → Text | Collapse Tier 3 | Less frequent |
| Strikethrough | Desenho → Anotação | Annotate → Text | Collapse Tier 3 | Rare |
| Align Left | Desenho → Anotação | Annotate → Text | Always | Common alignment |
| Align Center | Desenho → Anotação | Annotate → Text | Always | Common alignment |
| Align Right | Desenho → Anotação | Annotate → Text | Collapse Tier 3 | Less frequent |
| Stroke Color | Desenho → Cores | Annotate → Colors | Always | Primary property |
| Stroke Visibility | Desenho → Cores | Annotate → Colors | Always | Primary property |
| Stroke Restore | Desenho → Cores | Annotate → Colors | Collapse Tier 2 | Secondary |
| Fill Color | Desenho → Cores | Annotate → Colors | Always | Primary property |
| Fill Visibility | Desenho → Cores | Annotate → Colors | Always | Primary property |
| Fill Restore | Desenho → Cores | Annotate → Colors | Collapse Tier 2 | Secondary |
| Layer Select | Desenho → Camadas | Annotate → Layers | Always | Primary layer control |
| Layer Visibility | Desenho → Camadas | Annotate → Layers | Always | Primary layer control |
| Layer Lock | Desenho → Camadas | Annotate → Layers | Always | Primary layer control |
| Layer Manager | Desenho → Camadas | Annotate → Layers | Collapse Tier 2 | Secondary |
| Pan Tool | Ferramentas → Exibição | View → Navigate | Always | Primary navigation |
| Zoom to Fit | Ferramentas → Exibição | View → Navigate | Always | Primary navigation |
| Grid Toggle | Ferramentas → Exibição | View → Display | Always | Display setting |
| Measure Tool | Ferramentas → Medir | View → Measure | Always | Measurement |

### 6.2 Migration Summary

| Metric | Value |
|--------|-------|
| Total Commands | 42 |
| Commands Changing Tab | 23 |
| Commands Changing Group | 32 |
| Commands Staying in Place | 10 |
| New Groups Created | 3 (Navigate, Display, Measure) |
| Groups Removed | 2 (Seleção merged into Select, Projeto merged into Export) |
| Functionality Removed | 0 |

---

## 7. Responsive Ribbon Strategy

### 7.1 Adaptive Density Tiers

The ribbon adapts through 4 progressive tiers as horizontal space decreases:

| Tier | Breakpoint | Strategy |
|------|------------|----------|
| **Full** | ≥1400px | All controls visible with full labels |
| **Tier 1** | 1200-1399px | Shorten labels; reduce button widths |
| **Tier 2** | 1000-1199px | Icon-only for secondary commands; collapse least-used groups |
| **Tier 3** | 800-999px | Move tertiary commands to overflow; minimal labels |
| **Tier 4** | <800px | Overflow-heavy; only critical commands visible |

### 7.2 Collapse Priority Order

#### Commands to Collapse First (Tier 2)

1. Polygon (Shapes) → Overflow
2. Stroke Restore (Colors) → Overflow
3. Fill Restore (Colors) → Overflow
4. Layer Manager (Layers) → Overflow
5. Export JSON (Export) → Overflow

#### Commands to Collapse Second (Tier 3)

1. Italic, Underline, Strikethrough (Text) → Combined "More Styles" dropdown
2. Align Right (Text) → Overflow
3. Arrow (Shapes) → Overflow
4. Export Project (Export) → Overflow

### 7.3 "Never Hide" Commands

These commands must remain visible at all viewport widths:

| Tab | Commands |
|-----|----------|
| Home | Open, Save |
| Draw | Select, Line, Rectangle, Circle, Undo |
| Annotate | Text, Font Size, Bold, Stroke Color, Fill Color, Layer Select |
| View | Pan, Zoom to Fit |

**Total "Never Hide":** 14 commands

### 7.4 Overflow Menu Design

#### Structure

```
┌─────────────────────────────────────┐
│ ⋯ More                          ▼  │
├─────────────────────────────────────┤
│ ┌─ Shapes ─────────────────────────┐│
│ │ [⬡] Polygon                     ││
│ │ [→] Arrow                       ││
│ └───────────────────────────────────┘│
│ ┌─ Text Styles ────────────────────┐│
│ │ [I] Italic                      ││
│ │ [U] Underline                   ││
│ │ [S] Strikethrough               ││
│ └───────────────────────────────────┘│
│ ┌─ Export ─────────────────────────┐│
│ │ [📋] Export JSON                ││
│ │ [📦] Export Project             ││
│ └───────────────────────────────────┘│
└─────────────────────────────────────┘
```

#### Overflow Behavior Rules

1. **Grouped by source group:** Items maintain their group context
2. **Search included:** Filter field at top for >10 items
3. **Keyboard accessible:** Arrow keys navigate; Enter activates
4. **Shortcuts displayed:** Each item shows its shortcut
5. **Persist state:** Overflow menu remembers scroll position within session

### 7.5 Preventing User Disorientation

| Strategy | Implementation |
|----------|----------------|
| **Animation** | 200ms ease-out for all collapse/expand transitions |
| **Visual anchor** | Group labels remain visible even when group collapses |
| **Consistent position** | Overflow button always at right edge of each tab |
| **Tooltip guidance** | "Find more commands in the overflow menu" hint |
| **Search** | Cmd/Ctrl+K opens command palette with all commands |

---

## 8. Interaction States, Feedback, and Modes

### 8.1 Button States

| State | Visual Treatment | CSS Class |
|-------|-----------------|-----------|
| **Default** | `bg-surface-2`, `text-text`, `border-border` | `.ribbon-btn` |
| **Hover** | `bg-surface-3`, `border-primary/30` | `.ribbon-btn:hover` |
| **Pressed** | `bg-primary/20`, `scale-[0.98]` | `.ribbon-btn:active` |
| **Selected/Active** | `bg-primary`, `text-primary-foreground` | `.ribbon-btn--active` |
| **Disabled** | `opacity-50`, `cursor-not-allowed` | `.ribbon-btn:disabled` |
| **Stub** | `opacity-60`, dashed border, "Coming soon" tooltip | `.ribbon-btn--stub` |

### 8.2 Toggle States

| State | Visual Treatment |
|-------|-----------------|
| **Off** | Ghost variant (transparent background) |
| **On** | Filled variant (`bg-primary/20`, `text-primary`) |
| **Mixed** | Dashed border, "?" icon overlay |

### 8.3 Active Tool Mode

When a tool is active (e.g., drawing line):

| Element | Behavior |
|---------|----------|
| **Tool Button** | Filled primary color; stays highlighted |
| **Mode Badge** | Small badge below icon: "Drawing" / "Selecting" |
| **Cursor** | Changes to tool-specific cursor |
| **Status Bar** | Shows mode hint: "Click to place first point, ESC to cancel" |

### 8.4 Mode Exit

| Trigger | Behavior |
|---------|----------|
| **ESC key** | Cancel current operation; return to Select tool |
| **Right-click** | Context menu OR cancel (configurable) |
| **Click other tool** | Switch tool; cancel current operation |
| **Complete action** | Return to Select tool (configurable: stay in tool) |

### 8.5 Feedback Surfaces

| Surface | Usage | Duration |
|---------|-------|----------|
| **Button highlight** | Confirm click registration | 150ms flash |
| **Status bar** | Show current mode, hints, warnings | Persistent during mode |
| **Toast** | Confirm completed action (save, export) | 3000ms, auto-dismiss |
| **Tooltip** | Describe command on hover | 500ms delay, persist on hover |

### 8.6 State Specification Table

| Component | Hover | Pressed | Active | Disabled | Focus |
|-----------|-------|---------|--------|----------|-------|
| Large Button | bg-surface-3 | scale-98 | bg-primary | opacity-50 | ring-2 ring-primary |
| Standard Button | bg-surface-3 | scale-98 | bg-primary | opacity-50 | ring-2 ring-primary |
| Compact Button | bg-surface-3 | scale-98 | bg-primary/80 | opacity-50 | ring-2 ring-primary |
| Icon Toggle | bg-surface-3 | scale-98 | bg-primary/20 | opacity-50 | ring-2 ring-primary |
| Dropdown | border-primary/50 | — | border-primary | opacity-50 | ring-2 ring-primary |
| Color Swatch | ring-2 ring-primary/50 | scale-95 | ring-2 ring-primary | opacity-50 | ring-2 ring-primary |

---

## 9. Implementation Plan (Phased Roadmap)

### Phase 0: Instrumentation + Baseline

**Scope:** Establish measurement infrastructure before making changes.

**Tasks:**
1. Add analytics events for all ribbon interactions (click, hover, shortcut use)
2. Capture baseline metrics:
   - Click counts per command (30-day period)
   - Time-to-find for key commands (usability test, n=5)
   - Current visual alignment score (manual audit)
   - Error rates (misclicks, undo frequency)
3. Document current state with screenshots
4. Set up A/B testing infrastructure (if needed)

**Dependencies:** None

**Risks:**
- Analytics implementation may take longer than expected
- Baseline period delays subsequent phases

**QA Checklist:**
- [ ] Analytics events fire for all 42 commands
- [ ] Data pipeline verified with test events
- [ ] Baseline report generated

---

### Phase 1: Grid + Metrics Standardization

**Scope:** Standardize layout tokens without changing IA or components.

**Tasks:**
1. Audit and document all current spacing values
2. Create unified spacing token set (see Appendix A)
3. Update `global.css` with new tokens
4. Apply consistent `--ribbon-group-body-height` to all groups
5. Standardize `gap` values across all layouts
6. Implement baseline alignment (4px grid)
7. Add visual debug mode toggle for alignment verification

**Dependencies:** Phase 0 baseline established

**Risks:**
- Existing component overrides may conflict with new tokens
- Visual regressions in edge cases

**QA Checklist:**
- [ ] All groups render at exactly 68px body height
- [ ] Gap consistency: all gaps use token values
- [ ] Baseline alignment: labels align within 2px
- [ ] No visual regressions (compare screenshots)
- [ ] Debug mode shows alignment grid correctly

---

### Phase 2: Component Refactor + Unified States

**Scope:** Consolidate button components; implement consistent states.

**Tasks:**
1. Refactor button components:
   - Merge overlapping functionality
   - Implement 3-tier hierarchy (Large, Standard, Compact)
   - Add consistent prop interface
2. Implement state system:
   - Create state CSS classes
   - Add hover/pressed/active/disabled styles
   - Implement stub state with visual distinction
3. Create `RibbonSplitButton` component
4. Standardize `RibbonToggleGroup` variants
5. Update all existing usages

**Dependencies:** Phase 1 tokens in place

**Risks:**
- API changes may break existing code
- State conflicts between old and new systems

**QA Checklist:**
- [ ] 3 button variants cover all use cases
- [ ] All states visually distinct and accessible
- [ ] Split button functions correctly
- [ ] Toggle groups handle all current scenarios
- [ ] No functionality regressions

---

### Phase 3: IA Reorganization + Command Migration

**Scope:** Implement new tab structure and migrate commands.

**Tasks:**
1. Create new tab configuration (`ribbonConfigV2.ts`)
2. Implement 4-tab structure (Home, Draw, Annotate, View)
3. Migrate all commands per migration map (Section 6)
4. Update group layouts to match proposed structure
5. Add feature flag for gradual rollout
6. Update keyboard shortcuts for tab switching
7. Implement contextual group rules

**Dependencies:** Phase 2 components ready

**Risks:**
- User confusion during transition
- Muscle memory disruption for existing users
- Feature flag complexity

**QA Checklist:**
- [ ] All 42 commands accessible (zero functionality loss)
- [ ] Tab switching works (number keys, click)
- [ ] Commands in correct locations per migration map
- [ ] Contextual groups appear without reflow
- [ ] Feature flag allows rollback

---

### Phase 4: Responsiveness + Overflow System

**Scope:** Implement adaptive density and overflow behavior.

**Tasks:**
1. Implement breakpoint detection system
2. Create collapse priority configuration
3. Build overflow menu component
4. Implement tier-based visibility rules
5. Add label shortening logic
6. Animate collapse/expand transitions
7. Implement "never hide" enforcement
8. Add overflow search functionality

**Dependencies:** Phase 3 IA complete

**Risks:**
- Complex state management for collapse tiers
- Performance impact from resize observers
- Overflow menu discoverability

**QA Checklist:**
- [ ] Graceful collapse at each breakpoint
- [ ] "Never hide" commands always visible
- [ ] Overflow menu accessible and searchable
- [ ] Animations smooth (60fps)
- [ ] No commands lost during collapse
- [ ] Keyboard navigation in overflow menu

---

### Phase 5: Polish + Accessibility

**Scope:** Final refinements, accessibility compliance, documentation.

**Tasks:**
1. Implement structured tooltip system
2. Add command palette (Cmd/Ctrl+K)
3. Audit and fix WCAG 2.1 AA compliance:
   - Contrast ratios
   - Focus indicators
   - Screen reader labels
4. Implement keyboard navigation improvements:
   - Roving tabindex
   - Skip links
   - Arrow key navigation within groups
5. Add mode indicators and feedback surfaces
6. Create user documentation
7. Conduct final usability testing

**Dependencies:** Phase 4 responsive system complete

**Risks:**
- Accessibility fixes may require component changes
- Command palette scope creep

**QA Checklist:**
- [ ] All tooltips follow standard structure
- [ ] Command palette functional with full command list
- [ ] WCAG 2.1 AA compliance verified
- [ ] Keyboard-only navigation possible for all actions
- [ ] Screen reader tested (VoiceOver, NVDA)
- [ ] Documentation complete
- [ ] Usability test scores improved from baseline

---

## 10. Acceptance Criteria and Success Metrics

### 10.1 Objective Acceptance Criteria

| Criterion | Target | Measurement Method |
|-----------|--------|-------------------|
| Baseline alignment | 100% of text on 4px grid | Visual audit with grid overlay |
| Group height variance | ±0px (all 68px) | Automated measurement |
| Gap consistency | 100% use tokens | Code audit |
| Command accessibility | 100% keyboard accessible | Manual testing |
| Contrast ratios | ≥4.5:1 all text | WCAG audit tool |
| Touch targets | ≥24x24px | Component measurement |
| Functionality preservation | 42/42 commands | Feature checklist |

### 10.2 Usability Metrics

| Metric | Baseline (Current) | Target | Method |
|--------|-------------------|--------|--------|
| Time to find "Export" | TBD | -30% | Task timing test |
| Time to find "Measure" | TBD | -40% | Task timing test |
| Tab switches per task | TBD | -25% | Analytics |
| Shortcut discovery rate | TBD | +50% | Survey |
| User satisfaction (SUS) | TBD | +15 points | SUS questionnaire |

### 10.3 Lightweight Usability Test Plan

#### Test Scenarios

| # | Scenario | Success Measure | Participant |
|---|----------|-----------------|-------------|
| 1 | "Save your current drawing" | Complete in <10s | Novice |
| 2 | "Draw a rectangle and a circle" | Complete in <20s | Novice |
| 3 | "Change the fill color to blue" | Complete in <15s | Novice |
| 4 | "Export your project as JSON" | Complete in <15s | Novice |
| 5 | "Undo your last action twice" | Complete in <5s | Novice |
| 6 | "Draw a line, then select and duplicate it" | Complete in <30s | Novice |
| 7 | "Find the Measure tool" | Complete in <10s | Novice |
| 8 | "Add text and make it bold" | Complete in <20s | Expert |
| 9 | "Use keyboard shortcuts to draw and undo" | Identify shortcuts in <30s | Expert |
| 10 | "Find a command using the command palette" | Complete in <10s | Expert |

#### Participant Profiles

| Type | Criteria | Count |
|------|----------|-------|
| Novice | Never used ElectroCad; some CAD familiarity | 3 |
| Expert | 10+ hours ElectroCad usage | 2 |

#### Success Measures

- **Task completion rate:** ≥90% for all scenarios
- **Time on task:** Within target for ≥80% of attempts
- **Error rate:** <10% misclicks/wrong paths
- **Satisfaction:** ≥4/5 on ease-of-use rating

---

## 11. Appendices

### Appendix A: UI Tokens Table

#### Spacing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | No spacing |
| `--space-0-5` | 2px | Minimal gap |
| `--space-1` | 4px | Tight gap (baseline unit) |
| `--space-2` | 8px | Standard gap |
| `--space-3` | 12px | Group padding |
| `--space-4` | 16px | Section spacing |
| `--space-5` | 20px | Large spacing |
| `--space-6` | 24px | Extra-large spacing |

#### Sizing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ribbon-height` | 86px | Total ribbon height |
| `--ribbon-group-body-height` | 68px | Group content area |
| `--ribbon-group-label-height` | 18px | Group label area |
| `--ribbon-btn-lg-height` | 52px | Large button |
| `--ribbon-btn-md-height` | 32px | Standard button |
| `--ribbon-btn-sm-height` | 24px | Compact button |
| `--ribbon-icon-lg` | 20px | Large icon |
| `--ribbon-icon-md` | 16px | Standard icon |
| `--ribbon-icon-sm` | 14px | Compact icon |
| `--ribbon-group-min-width` | 64px | Minimum group width |
| `--ribbon-group-max-width` | 320px | Maximum group width |

#### Typography Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--ribbon-font-size-label` | 10px | Group labels |
| `--ribbon-font-size-control` | 12px | Button labels, inputs |
| `--ribbon-font-size-large-btn` | 10px | Large button labels |
| `--ribbon-line-height-label` | 18px | Group labels |
| `--ribbon-line-height-control` | 16px | Control text |
| `--ribbon-font-weight-label` | 500 | Group labels |
| `--ribbon-font-weight-control` | 400 | Control text |

#### Color Tokens (Ribbon-Specific)

| Token | Light Value | Dark Value | Usage |
|-------|-------------|------------|-------|
| `--ribbon-bg` | — | #1e293b | Ribbon background |
| `--ribbon-border` | — | #334155 | Group dividers |
| `--ribbon-text` | — | #e2e8f0 | Primary text |
| `--ribbon-text-muted` | — | #94a3b8 | Secondary text |
| `--ribbon-active` | — | #3b82f6 | Active state |
| `--ribbon-hover` | — | #334155 | Hover state |

### Appendix B: Component Catalog Checklist

| Component | Exists | Standardized | States Complete | Accessible |
|-----------|--------|--------------|-----------------|------------|
| RibbonLargeButton | ✅ | ⬜ | ⬜ | ⬜ |
| RibbonButton | ✅ | ⬜ | ⬜ | ⬜ |
| RibbonSmallButton | ✅ | ⬜ | ⬜ | ⬜ |
| RibbonIconButton | ✅ | ⬜ | ⬜ | ⬜ |
| RibbonSplitButton | ⬜ | ⬜ | ⬜ | ⬜ |
| RibbonDropdown | ✅ (custom) | ⬜ | ⬜ | ⬜ |
| RibbonToggleGroup | ✅ | ⬜ | ⬜ | ⬜ |
| RibbonSegmentedControl | ✅ (via ToggleGroup) | ⬜ | ⬜ | ⬜ |
| RibbonNumericInput | ✅ (custom) | ⬜ | ⬜ | ⬜ |
| RibbonColorSwatch | ✅ (custom) | ⬜ | ⬜ | ⬜ |
| RibbonGroup | ✅ | ⬜ | N/A | ⬜ |
| RibbonDivider | ✅ | ⬜ | N/A | ⬜ |
| RibbonOverflowMenu | ⬜ | ⬜ | ⬜ | ⬜ |
| RibbonTooltip | ⬜ (basic) | ⬜ | ⬜ | ⬜ |

### Appendix C: Final Ribbon Review Checklist

#### Pre-Release Checklist

**Layout & Spacing**
- [ ] All groups render at 68px body height
- [ ] All spacing uses defined tokens
- [ ] Baseline alignment verified at 4px grid
- [ ] Group widths within defined tiers
- [ ] Dividers correctly positioned

**Components**
- [ ] All buttons follow 3-tier hierarchy
- [ ] States (hover, pressed, active, disabled) implemented
- [ ] Stub state visually distinct
- [ ] Toggle states clear (on/off/mixed)
- [ ] Split buttons function correctly
- [ ] Dropdowns have consistent styling

**Information Architecture**
- [ ] All 42 commands accessible
- [ ] Commands in correct tabs/groups per migration map
- [ ] Tab order logical (Home, Draw, Annotate, View)
- [ ] Group order logical within tabs
- [ ] Contextual groups appear correctly

**Responsiveness**
- [ ] Collapse at Tier 1 (1200-1399px) works
- [ ] Collapse at Tier 2 (1000-1199px) works
- [ ] Collapse at Tier 3 (800-999px) works
- [ ] Collapse at Tier 4 (<800px) works
- [ ] "Never hide" commands always visible
- [ ] Overflow menu functional and accessible
- [ ] Animations smooth (no jank)

**States & Feedback**
- [ ] Active tool clearly indicated
- [ ] Mode indication visible
- [ ] Feedback on command execution
- [ ] ESC cancels current mode
- [ ] Status bar shows hints

**Accessibility**
- [ ] Contrast ratios ≥4.5:1
- [ ] Focus indicators visible
- [ ] Keyboard navigation complete
- [ ] Screen reader labels present
- [ ] Tooltips follow standard structure
- [ ] Touch targets ≥24x24px

**Documentation**
- [ ] Token documentation updated
- [ ] Component usage guidelines written
- [ ] User-facing documentation complete
- [ ] Changelog entry prepared

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-19 | AI-Assisted Analysis | Initial document |

---

*End of Ribbon UI/UX Optimization Report*
