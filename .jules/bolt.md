## 2024-05-21 - Canvas Re-render Optimization
**Learning:** `useDataStore(s => s.shapes)` triggers re-renders on ANY shape change (reference equality), causing full canvas redraws even for off-screen changes. This is a bottleneck for large drawings.
**Action:** Use `useRef` and `subscribe` to manually detect changes. Only trigger re-render if the set of visible shape IDs changes or if a visible shape's reference changes. This skips rendering for all off-screen modifications.
