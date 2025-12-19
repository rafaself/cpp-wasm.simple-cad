## 2024-05-22 - Inconsistent Theming in Modals
**Learning:** Detected a visual inconsistency where `RadiusInputModal` uses a light theme (`bg-white`) while other canvas overlays like `PolygonModal` use the application's dark theme (`bg-slate-900`). This breaks visual continuity.
**Action:** When implementing or refactoring UI components, always cross-reference with existing similar components to ensure thematic consistency.

## 2024-05-22 - Modal Backdrop Regression
**Learning:** Adding a click-to-dismiss backdrop to a component that renders immediately after a click event can lead to race conditions where the opening click also triggers the dismissal.
**Action:** Implement a short mount-time check or `stopPropagation` to prevent the opening event from closing the modal.

## 2025-12-15 - Semantic Interactive Elements
**Learning:** Found interactive color pickers implemented as `div`s, making them inaccessible to keyboard users. Also, toggle buttons lacked `aria-pressed` state.
**Action:** Always use `<button>` for click interactions (even for color swatches) and ensure toggle states are communicated via ARIA attributes.

## 2025-12-16 - Focus Visibility
**Learning:** When converting interactive `div`s to `button`s, default browser focus styles may be suppressed or look inconsistent. Explicit `focus-visible` styles are essential for keyboard navigation.
**Action:** Always add `focus-visible:ring` (or similar) when making custom elements interactive.

## 2025-12-17 - Icon-Only Button Accessibility
**Learning:** Key navigation and status bar components contained icon-only buttons that relied solely on `title` attributes or visual icons, making them inaccessible to screen readers.
**Action:** Enforce `aria-label` on all icon-only buttons to ensure they are accessible, using the same text as the `title` attribute where appropriate.
