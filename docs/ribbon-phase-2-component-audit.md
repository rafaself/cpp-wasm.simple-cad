# Ribbon Phase 2 Component Audit

**Phase:** 2 — Component Refactor + Unified States
**Date:** 2026-01-19
**Status:** Audit Complete

---

## Current Component Inventory

### Button Components

| Component | Lines | Height | Width | Icon Size | Usage |
|-----------|-------|--------|-------|-----------|-------|
| **RibbonButton** | 116 | 32px (h-8) | Variable | 16px (sm) | Standard flex-row buttons |
| **RibbonLargeButton** | 93 | 52px | min-64px | 20px (lg) | Primary commands (vertical) |
| **RibbonSmallButton** | 92 | 24px | w-28 default | 14px (sm) | Grid/stack layouts |
| **RibbonIconButton** | 82 | 28px/32px | 28px/32px | 16px/20px | Toggle buttons in groups |

**Total:** 4 button components, 383 lines of code

### Layout Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| **RibbonGroup** | 96 | Group container with layouts |
| **RibbonToggleGroup** | 71 | Toggle button group container |
| **RibbonControlWrapper** | 35 | Vertical centering wrapper |
| **RibbonDivider** | 23 | Visual separator |

---

## Component Overlap Analysis

### Functional Overlaps

#### 1. **Height Management**

All components independently manage heights:

```typescript
// RibbonButton
className="h-8"  // 32px

// RibbonLargeButton
className="h-[52px]"  // 52px

// RibbonSmallButton
className="!h-[24px]"  // 24px

// RibbonIconButton
sm: 'h-7 w-7'  // 28px
md: 'h-8 w-8'  // 32px
```

**Issue:** No single source of truth for button heights
**Fix:** Use CSS custom properties from Phase 1

#### 2. **State Management**

All components implement active state differently:

```typescript
// RibbonButton
variant={isActive ? 'primary' : 'secondary'}

// RibbonLargeButton
variant={isActive ? 'primary' : 'secondary'}

// RibbonSmallButton
variant={isActive ? 'primary' : 'secondary'}

// RibbonIconButton
variant={isActive ? 'primary' : VARIANT_MAP[variant]}
```

**Issue:** Inconsistent variant mapping logic
**Fix:** Centralized state-to-variant mapping function

#### 3. **Debug Mode Integration**

All components duplicate debug class logic:

```typescript
const debugClass = isRibbonDebugEnabled() ? ' ribbon-debug-control' : ''
```

**Issue:** Repeated code in every component
**Fix:** Shared utility function or base component

#### 4. **Tracking Integration**

RibbonButton, RibbonLargeButton, RibbonSmallButton all have:

```typescript
const tracking = useRibbonTracking(tabId, groupId)
const handleClick = () => {
  tracking.trackClick(itemId, itemType)
  onClick(item)
}
```

**Issue:** RibbonIconButton missing analytics tracking
**Fix:** Consistent tracking across all buttons

### Structural Overlaps

#### 5. **Props Interface**

Common props across all components:
- `onClick` / `item`
- `isActive`
- `disabled`
- `title` (tooltip)
- `icon`
- `label`

**Opportunity:** Shared base props interface

#### 6. **Variant Mapping**

Each component maps to Button primitive variants:

```typescript
// Different approaches to same goal
let variant: ButtonVariant = 'secondary'
if (isActive) variant = 'primary'
```

**Opportunity:** Unified variant resolution function

---

## State System Analysis

### Current State Handling

| State | RibbonButton | RibbonLargeButton | RibbonSmallButton | RibbonIconButton |
|-------|--------------|-------------------|-------------------|------------------|
| **Default** | secondary | secondary | secondary | ghost |
| **Hover** | Built-in | Built-in | Built-in | Built-in |
| **Pressed** | Built-in | Built-in | Built-in | Built-in |
| **Active** | primary | primary | primary | primary |
| **Disabled** | opacity | opacity | opacity | opacity |
| **Danger** | Custom class | Custom class | Custom class | danger variant |
| **Mixed** | ❌ None | ❌ None | ❌ None | ❌ None |

### Issues Identified

1. **No Mixed State** — Multi-selection scenarios not supported
2. **Inconsistent Danger Handling** — Some use custom classes, some use variant
3. **No Stub Visual** — Stub status only shows as disabled
4. **No Loading State** — No visual feedback for async actions

### Recommended State System

```typescript
type RibbonButtonState =
  | 'default'    // Normal state
  | 'hover'      // Mouse over
  | 'pressed'    // Mouse down
  | 'active'     // Tool/action active
  | 'disabled'   // Cannot interact
  | 'mixed'      // Multi-selection with different values
  | 'loading'    // Async action in progress
  | 'stub'       // Coming soon (distinct from disabled)

type RibbonButtonIntent =
  | 'default'    // Normal action
  | 'primary'    // Primary action
  | 'danger'     // Destructive action
  | 'warning'    // Caution required
  | 'success'    // Positive action
```

---

## Component Consolidation Strategy

### Current Hierarchy (Problem)

```
┌─────────────────┐
│   RibbonButton  │ (116 lines)
├─────────────────┤
│ RibbonLargeBtn  │ (93 lines)
├─────────────────┤
│ RibbonSmallBtn  │ (92 lines)
├─────────────────┤
│ RibbonIconBtn   │ (82 lines)
└─────────────────┘
Total: 383 lines
```

**Issues:**
- Duplicate logic across components
- No shared base functionality
- Inconsistent prop interfaces
- Hard to maintain consistency

### Proposed Hierarchy (Solution)

```
┌──────────────────────────────┐
│   RibbonButtonBase           │ ← Shared logic (80 lines)
│   - State management         │
│   - Tracking integration     │
│   - Debug mode               │
│   - Variant resolution       │
└──────────────────────────────┘
          ▲
          │ extends
    ┌─────┴─────┬─────────┬──────────┐
    │           │         │          │
┌───┴────┐ ┌───┴────┐ ┌──┴─────┐ ┌──┴────────┐
│Standard│ │ Large  │ │ Small  │ │   Icon    │
│ (40)   │ │  (35)  │ │  (35)  │ │   (30)    │
└────────┘ └────────┘ └────────┘ └───────────┘

Total: 220 lines (43% reduction)
```

### New Component: RibbonSplitButton

```
┌────────────────────────────┐
│  RibbonSplitButton         │
│  ┌──────────┬────────────┐ │
│  │ Primary  │  Dropdown  │ │
│  │ Action   │   Menu     │ │
│  └──────────┴────────────┘ │
└────────────────────────────┘
```

**Usage:**
- Shape tools with variants (e.g., Line → Dashed Line, Arrow Line)
- Actions with options (e.g., Save → Save As, Save Copy)

---

## Refactoring Plan

### Phase 2.1: Create Base Component

**File:** `RibbonButtonBase.tsx`

**Responsibilities:**
- State-to-variant resolution
- Analytics tracking
- Debug mode integration
- Common prop handling
- Keyboard event handling

**Interface:**
```typescript
interface RibbonButtonBaseProps {
  // Core
  onClick: () => void
  children: React.ReactNode

  // State
  isActive?: boolean
  isDisabled?: boolean
  isMixed?: boolean
  isLoading?: boolean
  isStub?: boolean

  // Intent
  intent?: 'default' | 'primary' | 'danger' | 'warning' | 'success'

  // Appearance
  size?: 'sm' | 'md' | 'lg'
  variant?: 'standard' | 'large' | 'small' | 'icon'

  // Metadata
  title?: string
  ariaLabel?: string
  ariaPressed?: boolean

  // Tracking
  trackingId?: string
  trackingType?: 'tool' | 'action' | 'custom'
  tabId?: string
  groupId?: string

  // Styling
  className?: string
}
```

### Phase 2.2: Refactor Existing Components

**RibbonButton** → Thin wrapper around RibbonButtonBase
**RibbonLargeButton** → Thin wrapper with size='lg'
**RibbonSmallButton** → Thin wrapper with size='sm'
**RibbonIconButton** → Thin wrapper with variant='icon'

### Phase 2.3: Create Split Button

**File:** `RibbonSplitButton.tsx`

**Interface:**
```typescript
interface RibbonSplitButtonProps {
  // Primary action
  label: string
  icon?: React.ReactNode
  onClick: () => void

  // Dropdown
  items: Array<{
    id: string
    label: string
    icon?: React.ReactNode
    onClick: () => void
    disabled?: boolean
  }>

  // State
  isActive?: boolean
  disabled?: boolean

  // Tracking
  tabId: string
  groupId: string
}
```

### Phase 2.4: Enhance Toggle Group

**Current Issues:**
- Only supports 'default' and 'segmented' variants
- No radio button semantics
- No multi-select support

**Enhancements:**
```typescript
interface RibbonToggleGroupProps {
  // Existing
  variant?: 'default' | 'segmented'
  width?: 'auto' | 'fit'
  children: React.ReactNode

  // NEW
  mode?: 'single' | 'multiple'  // Radio vs checkbox semantics
  orientation?: 'horizontal' | 'vertical'
  value?: string | string[]      // Controlled value
  onChange?: (value: string | string[]) => void
  allowNone?: boolean            // Can all be deselected?
}
```

---

## State System Implementation

### CSS State Classes

```css
/* Base States */
.ribbon-btn-default { /* Normal state */ }
.ribbon-btn-hover:hover { /* Hover state */ }
.ribbon-btn-pressed:active { /* Mouse down */ }
.ribbon-btn-active { /* Tool/action active */ }
.ribbon-btn-disabled { /* Cannot interact */ }

/* Special States */
.ribbon-btn-mixed {
  /* Mixed state indicator */
  background: repeating-linear-gradient(
    45deg,
    var(--surface-2),
    var(--surface-2) 2px,
    var(--surface-3) 2px,
    var(--surface-3) 4px
  );
}

.ribbon-btn-loading {
  /* Loading spinner */
  position: relative;
  pointer-events: none;
}

.ribbon-btn-loading::after {
  content: '';
  position: absolute;
  /* Spinner animation */
}

.ribbon-btn-stub {
  /* Coming soon indicator */
  border-style: dashed;
  opacity: 0.6;
}

.ribbon-btn-stub::after {
  content: '⏱';
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 8px;
  opacity: 0.5;
}

/* Intent Classes */
.ribbon-btn-intent-default { /* Normal */ }
.ribbon-btn-intent-primary { /* Primary action */ }
.ribbon-btn-intent-danger { /* Destructive */ }
.ribbon-btn-intent-warning { /* Caution */ }
.ribbon-btn-intent-success { /* Positive */ }
```

### State Resolution Logic

```typescript
function resolveButtonVariant(
  state: RibbonButtonState,
  intent: RibbonButtonIntent,
  isActive: boolean
): ButtonVariant {
  // Priority order:
  // 1. Disabled/Loading/Stub → specific handling
  // 2. Active → primary
  // 3. Intent → map to variant
  // 4. Default → secondary

  if (state === 'disabled') return 'secondary'  // With opacity
  if (state === 'loading') return 'secondary'   // With spinner
  if (state === 'stub') return 'secondary'      // With dashed border

  if (isActive) return 'primary'

  switch (intent) {
    case 'primary': return 'primary'
    case 'danger': return 'danger'
    case 'warning': return 'secondary'  // Custom class
    case 'success': return 'secondary'  // Custom class
    default: return 'secondary'
  }
}
```

---

## Mixed State Implementation

### Use Cases

1. **Text Formatting** — Multiple text items with different styles
   - Bold: Some bold, some not → Mixed
   - Alignment: Different alignments → Mixed

2. **Layer Properties** — Multiple layers with different settings
   - Visibility: Some visible, some hidden → Mixed
   - Lock: Some locked, some unlocked → Mixed

3. **Shape Properties** — Multiple shapes with different colors
   - Stroke: Different colors → Mixed (show "?")
   - Fill: Different fills → Mixed

### Visual Treatment

```
┌────────────┐
│     ?      │  ← Mixed state shows "?" or "—"
│   Mixed    │
└────────────┘
```

**Implementation:**
```typescript
interface MixedStateProps {
  isMixed: boolean
  mixedLabel?: string  // Default: "—"
  mixedIcon?: React.ReactNode  // Default: "?"
}

// Usage
<RibbonIconButton
  icon={isBoldMixed ? <span>?</span> : <Bold />}
  isActive={isBoldActive}
  isMixed={isBoldMixed}
  variant={isBoldMixed ? 'warning' : 'default'}
/>
```

---

## Implementation Priority

### High Priority (Core Refactor)

1. ✅ **Create RibbonButtonBase** — Foundation for all buttons
2. ✅ **Implement state system** — CSS classes + resolution logic
3. ✅ **Refactor existing components** — Use base component
4. ✅ **Add analytics to RibbonIconButton** — Missing tracking

### Medium Priority (New Features)

5. ⚠️ **Create RibbonSplitButton** — New component
6. ⚠️ **Enhance RibbonToggleGroup** — Radio/checkbox modes
7. ⚠️ **Implement mixed state** — Visual indicator

### Low Priority (Polish)

8. 🔷 **Add loading state** — Async action feedback
9. 🔷 **Enhance stub state** — Visual distinction
10. 🔷 **Document component API** — Usage guidelines

---

## Breaking Changes Assessment

### Non-Breaking (Safe)

✅ **Internal refactoring** — Base component is internal
✅ **CSS additions** — New state classes don't affect existing
✅ **Prop additions** — Optional props, backward compatible

### Potentially Breaking

⚠️ **RibbonIconButton tracking** — Need to add tabId/groupId props
⚠️ **RibbonToggleGroup API** — New mode/value props

**Mitigation:** Make all new props optional with sensible defaults

---

## Testing Strategy

### Unit Tests Needed

```typescript
describe('RibbonButtonBase', () => {
  it('resolves variant from state and intent')
  it('applies debug class when enabled')
  it('tracks clicks with analytics')
  it('handles mixed state')
  it('shows loading spinner')
  it('shows stub indicator')
})

describe('RibbonSplitButton', () => {
  it('triggers primary action on main button click')
  it('opens dropdown on arrow click')
  it('selects dropdown item')
  it('closes dropdown on outside click')
})
```

### Visual Regression Tests

- Screenshot each button variant
- Test each state (hover, active, disabled)
- Test mixed state indicator
- Test stub state indicator

### Integration Tests

- Test button in all group layouts
- Test with analytics tracking
- Test keyboard navigation
- Test screen reader labels

---

## Expected Outcomes

### Code Reduction

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Total Lines | 383 | ~220 | -43% |
| Duplicate Logic | High | Low | -70% |
| Maintainability | Medium | High | +40% |

### Consistency Improvements

| Aspect | Before | After |
|--------|--------|-------|
| State Handling | Inconsistent | Unified |
| Tracking | 3/4 components | 4/4 components |
| Debug Mode | Duplicated | Centralized |
| Variant Logic | Per-component | Shared |

### New Capabilities

✅ **Mixed state support** — Multi-selection scenarios
✅ **Split button** — Action + options pattern
✅ **Loading state** — Async feedback
✅ **Enhanced toggle group** — Radio/checkbox modes

---

## Next Steps

1. **Review this audit** — Validate approach
2. **Create RibbonButtonBase** — Foundation component
3. **Implement state system** — CSS + logic
4. **Refactor components** — One by one
5. **Create split button** — New component
6. **Test thoroughly** — All variants and states

---

*Audit completed: 2026-01-19*
