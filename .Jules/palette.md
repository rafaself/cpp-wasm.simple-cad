## 2024-05-22 - Inconsistent Theming in Modals
**Learning:** Detected a visual inconsistency where `RadiusInputModal` uses a light theme (`bg-white`) while other canvas overlays like `PolygonModal` use the application's dark theme (`bg-slate-900`). This breaks visual continuity.
**Action:** When implementing or refactoring UI components, always cross-reference with existing similar components to ensure thematic consistency.

## 2024-05-22 - Modal Backdrop Regression
**Learning:** Adding a click-to-dismiss backdrop to a component that renders immediately after a click event can lead to race conditions where the opening click also triggers the dismissal.
**Action:** Implement a short mount-time check or `stopPropagation` to prevent the opening event from closing the modal.
