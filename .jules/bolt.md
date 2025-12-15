## 2024-05-21 - Canvas Re-render Optimization
**Learning:** `useDataStore(s => s.shapes)` triggers re-renders on ANY shape change (reference equality), causing full canvas redraws even for off-screen changes. This is a bottleneck for large drawings.
**Action:** Use `useRef` and `subscribe` to manually detect changes. Only trigger re-render if the set of visible shape IDs changes or if a visible shape's reference changes. This skips rendering for all off-screen modifications.

## 2025-05-22 - DynamicOverlay Performance
**Learning:** High-frequency canvas overlays should avoid full store subscriptions. Reactivity to specific subsets (like selection) must be handled manually (subscribe + forceUpdate) to avoid unnecessary diffs. Spatial indexing is essential for O(N) interactions like snapping.
**Action:** Replace `useStore()` with `useStore.getState()` + selective subscription. Use `spatialIndex.query()` instead of iterating all shapes.
