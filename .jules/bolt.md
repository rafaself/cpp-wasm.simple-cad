## 2024-05-21 - Canvas Re-render Optimization
**Learning:** `useDataStore(s => s.shapes)` triggers re-renders on ANY shape change (reference equality), causing full canvas redraws even for off-screen changes. This is a bottleneck for large drawings.
**Action:** Use `useRef` and `subscribe` to manually detect changes. Only trigger re-render if the set of visible shape IDs changes or if a visible shape's reference changes. This skips rendering for all off-screen modifications.

## 2024-05-22 - Granular Store Subscriptions
**Learning:** Subscribing to full Zustand stores (e.g., `useUIStore()`) in high-frequency components like `DynamicOverlay` causes unnecessary re-renders when unrelated state changes (e.g., UI modals).
**Action:** Always use granular selectors (e.g., `useUIStore(s => s.activeTool)`) or manual subscriptions to isolate updates to only relevant state changes.

## 2024-05-23 - [Manual Subscriptions vs Hooks in Dynamic Overlays]
**Learning:** Replacing a manual `useDataStore.subscribe` with a `useShallow` hook in `DynamicOverlay` caused a regression where selection handles didn't update during shape manipulation. The manual subscription guaranteed immediate updates on shape reference changes, which the hook might have missed or delayed during the interaction loop.
**Action:** Be extremely cautious when refactoring manual subscriptions in high-frequency interaction components. Verify dynamic behavior (dragging, resizing) explicitly, not just static rendering.
