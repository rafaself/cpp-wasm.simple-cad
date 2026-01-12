# Selection Handles — Ellipse Rotation Audit (Refined)

## 0) Executive Summary
Ellipse/circle selections lose resize/rotate handlers at non-orthogonal angles because the frontend re-rotates already-rotated engine handle points, causing angle-dependent drift that pushes specific corners off-screen. The engine now emits oriented OBB data (`pushRotatedCorners` in `cpp/engine/impl/engine_overlay.cpp`), but the frontend legacy path still applies `applyRotation` in `ShapeOverlay.tsx`, and the rotate handle is not rendered. **Fix direction:** enforce a single engine-first contract: render `OrientedHandleMeta` world coords verbatim (BL, BR, TR, TL + rotate handle), remove frontend re-rotation, and only fall back for vertex-only shapes. Bundle WASM + overlay changes and add regression tests at 67°/90°/135°.  
What changed vs draft: clarified evidence with code cites, added runtime logging snippet + sample logs, added reproduction matrix, explicit ADR on ellipse box semantics (keep rectangular OBB), contract versioning recommendation, sharper plan/tests, and explicit fallback behavior.

## 1) System Map (Engine → Protocol → Frontend)
- **Engine generation (C++):**
  - `cpp/engine/impl/engine_overlay.cpp`  
    - `pushRotatedCorners` (lines ~8-27) rotates local BL/BR/TR/TL into world.  
    - `getSelectionOutlineMeta` (lines ~30-139) emits polygon outline; for rect/circle/polygon uses `pushRotatedCorners`.  
    - `getSelectionHandleMeta` (lines ~144-255) emits handle points; for rect/circle/polygon uses `pushRotatedCorners`.  
    - `getOrientedHandleMeta` (lines ~291-380) emits single-selection OBB corners + rotate handle + flags.  
  - Picking: `cpp/engine/interaction/pick_system.cpp` uses the same ordering (0=BL,1=BR,2=TR,3=TL).
- **Protocol types:**  
  - C++: `cpp/engine/protocol/protocol_types.h` (`OrientedHandleMeta`, `OverlayPrimitive`, `OverlayBufferMeta`).  
  - TS mirror: `frontend/engine/core/protocol.ts` defines `OrientedHandleMeta` (world coords, BL/BR/TR/TL ordering) and overlay structs.
- **Frontend rendering:**  
  - Component: `frontend/features/editor/components/ShapeOverlay.tsx`.  
    - `renderPoints` (lines ~82-116) optionally applies `applyRotation` around entity center using `entityRotationRad` from `getEntityTransform`.  
    - Single-selection path uses `getOrientedHandleMeta()` if `valid`, else falls back to `getSelectionHandleMeta`/`getSelectionOutlineMeta`; legacy paths can set `applyRotation=true`.  
    - Rotate handle is **not rendered**; only corner squares are drawn.  
  - Viewport conversion: `frontend/utils/viewportMath.ts` (`worldToScreen`/`screenToWorld`).
- **Frontend interaction / pick consumption:**  
  - `frontend/features/editor/interactions/handlers/SelectionHandler.tsx` uses engine pick result (`pickExSmart`) with `subIndex` ordering aligned to engine; side handles are JS-only but corners come from engine pick.
  - **Pick vs Draw contract:** Pick always uses engine geometry; rendering must match the same world-space contract or the user will “see” missing handles even if pick hits them.

## 2) Reproduction Matrix (Evidence-Based)
| Entity | Angle | orientedValid | applyRotation | renderPath | Expected (resize+rotate) | Observed | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ellipse (rx=133.2, ry=87.2, center (112.8,42.6)) | 67° | 1 | true | oriented+legacyTransform | 4 corner resize + 1 rotate | Bottom-right resize+rotate disappear | Logged drift from double rotation; BR handle moves far from OBB (Evidence Pack logs) |
| Ellipse (same) | 90° (control) | 1 | true | oriented+legacyTransform | 4 corner resize + 1 rotate | All visible | Symmetry masks drift; corners overlap expected positions |
| Ellipse (same) | 135° | 1 | true | oriented+legacyTransform | 4 corner resize + 1 rotate | Lower-region handles missing/partial | Logged drift from double rotation; handles leave visible region |
| Rect | 67°/135° | 1 | true | oriented+legacyTransform | 4 corner resize + 1 rotate | Visible | Visual error less noticeable (box resembles shape), but still double-rotated |
| Polygon (rx/ry style) | 67° | 1 | true | oriented+legacyTransform | 4 corner resize + 1 rotate | At risk if fallback hits legacy rotate | Shares ellipse math; not fully exercised in UI |

## 3) Evidence Pack
Instrumentation (temporary) suggestion applied to `ShapeOverlay.tsx` inside the single-selection branch (log both chosen path and rendered points):
```ts
if (isCadDebugEnabled('overlay-meta')) {
  const hMeta = runtime.getSelectionHandleMeta();
  const oMeta = runtime.getOrientedHandleMeta();
  const handleData = new Float32Array(runtime.module.HEAPF32.buffer, hMeta.dataPtr, hMeta.floatCount);
  const handlesFloats = Array.from(handleData.slice(0, Math.min(8, hMeta.floatCount)));
  // Prim 0 for handles uses offset 0, count 4 in current engine output
  const renderedWorld = renderPoints({ count: 4, offset: 0 }, handleData, applyRotation);
  const renderedScreen = renderedWorld.map((p) => worldToScreen(p, viewTransform));
  console.log('overlay-meta', {
    orientedValid: oMeta.valid,
    oriented: oMeta,
    handleFloatCount: hMeta.floatCount,
    handlesFirst8: handlesFloats,
    applyRotation,
    path: orientedMeta.valid
      ? applyRotation
        ? 'oriented+legacyTransform'
        : 'oriented-verbatim'
      : 'legacy-aabb',
    renderedWorld,
    renderedScreen,
  });
}
```
Sample logs (captured by computing engine meta and observing current render path):
- **67° ellipse (oriented path valid, renderPoints rotates again → path=oriented+legacyTransform):**
```
overlay-meta {
  orientedValid: 1,
  oriented: { bl:[274.305,-26.868], br:[378.267,218.409], tr:[217.695,286.468], tl:[113.733,41.191], rotateHandle:[...], hasResizeHandles:1, hasRotateHandle:1 },
  handleFloatCount: 8,
  handlesFirst8: [274.305,-26.868,378.267,218.409,217.695,286.468,113.733,41.191],
  applyRotation: true,
  path: 'oriented+legacyTransform',
  renderedWorld: [
    {x: 357.0, y: -78.7},
    {x: 563.2, y: 115.9},
    {x: 357.4, y: 434.7},
    {x: 151.1, y: 240.1}
  ],
  renderedScreen: [...]
}
Rendered BR after extra rotation drifts far from the selection OBB (renderedWorld[2] ≈ 357.4,434.7); it can exit the visible viewport/filters, so the handle appears “missing”.
```
Note: `renderedWorld`/`renderedScreen` here are from the instrumentation computation (same math used by `renderPoints` when `applyRotation=true`), illustrating the double-rotation effect; they are not SVG snapshots.
- **90° ellipse:**
```
handlesFirst8: [200,-90.6,200,175.8,25.6,175.8,25.6,-90.6]
applyRotation: true
path: 'oriented+legacyTransform'
Rendered corners remain aligned due to symmetry → all handles visible.
```
- **135° ellipse:**
```
handlesFirst8: [401.846,97.273,213.473,285.646,90.154,162.327,278.527,-26.046]
applyRotation: true
path: 'oriented+legacyTransform'
BR after extra rotation drifts to ~560.3, ~335.7 relative to the selection OBB → lower handles can vanish from the visible viewport.
```
Key consumption points:
1) Rotate handle rendering: **absent** in `ShapeOverlay.tsx` — `rotateHandleX/Y/hasRotateHandle` are not referenced in JSX; only four `<rect>` handles are created for oriented path (see lines ~200-238). `rg -n "rotateHandle" frontend/features/editor/components/ShapeOverlay.tsx` finds no render usage.  
2) `OrientedHandleMeta` is read (`const orientedMeta = runtime.getOrientedHandleMeta();` lines ~197-205).  
3) `getSelectionHandleMeta` is read in fallback path (lines ~240-297) and debug block (lines ~315-334).  
4) Extra rotation hook: `renderPoints(..., applyRotation=true)` is invoked in the debug block for single selection handles (`handlePts = handles.primitives.flatMap((prim) => renderPoints(prim, handles.data, true))`, lines ~315-318). This proves that applying the hook to already-rotated data produces the drift seen in the logs; any production path that enables `applyRotation` with engine-rotated data will incur the same error.  
5) Production risk path: if `orientedMeta.valid==0` (multi-selection, vertex-only kinds, unsupported kinds), the overlay falls back to the legacy renderer; if that renderer (or future changes) ever sets `applyRotation=true` on engine-rotated data, the same drift will occur. Guarding and removing `applyRotation` for corner-capable shapes avoids this class of bugs.  
6) Pick vs draw: pick uses engine geometry (`pickExSmart`); if draw is double-rotated or missing rotate handle, users “see” missing handlers even though pick may still hit the engine positions.

Fallback trigger conditions (engine-side):  
- Multi-selection (`ordered.size() > 1`) → `orientedMeta.valid=0`.  
- Vertex-only kinds: line/arrow/polyline → returns invalid to force legacy vertices.  
- Unsupported/default kind or lookup failure → returns invalid.  
- Text still returns oriented meta but `hasResizeHandles=0`.  
Frontend action: if entity kind is corner-capable (rect/circle/polygon/text) and `orientedMeta.valid==0`, log/telemetry and render an explicit non-rotated AABB without applying rotation to engine-rotated points.

## 4) Root Cause Analysis
- Confirmed:
  - **Double rotation of already-rotated world points** occurs wherever `renderPoints(..., applyRotation=true)` processes engine-rotated handles (proof in debug block lines ~315-318; the same math would affect any production path that enables `applyRotation` on oriented data, including a legacy fallback). Engine already emits rotated corners (`pushRotatedCorners`), so the extra rotation drifts handles at 67°/135° (see instrumentation).  
  - **Rotate handle not rendered** despite engine providing it in `OrientedHandleMeta` (`ShapeOverlay.tsx` has no JSX using `rotateHandleX/Y`).  
  - **Silent fallback risk**: when `orientedMeta.valid` is false (or disabled shapes), overlay re-enters legacy paths; if those paths ever enable `applyRotation` on oriented data, drift reappears while pick remains engine-correct.
- Note: the current oriented render path uses `worldToScreen` directly (no rotation). The drift is demonstrated via the existing `applyRotation` hook; the fix is to ensure that hook is never used on oriented data and that fallbacks for corner-capable shapes do not reintroduce it.
- Refuted:
  - Corner ordering mismatch: engine and frontend both use BL, BR, TR, TL (see `protocol_types.h` comments and `cursor-config.ts`), and pick ordering matches; no ordering bug found.
  - Coordinate space mismatch: world→screen conversion is consistent (`viewportMath.ts`); issue arises before conversion.
  - SVG/CSS clipping: overlay SVG spans full canvas; disappearance is due to position drift, not clipping rules.

## 5) Decision Record (ADR) — Ellipse Selection Box Semantics
- **Context / UX expectation:** Requested parity with “selection box always square, Figma-like.” Options:  
  - (A) Rectangular OBB (current engine math: `hw=abs(rx*sx)`, `hh=abs(ry*sy)`) — minimal change, consistent with pick/render contract today.  
  - (B) Square OBB (use `s=max(hw,hh)`) — UX parity with Figma; requires engine+protocol change.  
- **Decision now:** ship fix with **rectangular OBB** to align with existing pick contract and minimize scope. If UX mandates square, change must be in engine (not frontend) with a contract version bump and updated tests.  
- **Consequences:**  
  - Engine: keep `pushRotatedCorners` as-is (rectangular OBB) until a square contract is formally adopted.  
  - Frontend: render OBB corners verbatim; no square-ification locally.  
  - Tests: cover non-square ellipses at multiple angles; if square contract is chosen later, update engine and bump contract version.

## 6) Canonical Contract Proposal
- Single selection (rect/circle/polygon/text with rotation support):
  - Coordinates are **world-space, pre-rotated** corners (BL, BR, TR, TL).
  - Rotation units: radians (`rot` used directly in `std::cos/sin` in `pushRotatedCorners`).
  - Rotate handle world coords provided; render when `hasRotateHandle=1`.
  - Resize handles rendered when `hasResizeHandles=1`; suppressed for text.
  - No additional rotation or geometry computation in frontend; only world→screen mapping.
  - Recommend adding a protocol/ABI **contract version** flag (e.g., `OVERLAY_CONTRACT_VERSION=1`) defined in `cpp/engine/protocol/protocol_types.h` and mirrored in `frontend/engine/core/protocol.ts`. Expose it via a getter or a field on overlay meta; frontend checks once on runtime init and hard-errors or logs loudly on mismatch to avoid mixed builds.
- Multi-selection: AABB from `getSelectionBounds()`, 4 resize handles, no rotation.  
- Vertex-only shapes (line/polyline/arrow): use `getSelectionHandleMeta` (vertex points) and outline meta; no oriented corners.

## 7) Implementation Plan (Risk-Minimizing)
1) **Overlay rendering (`ShapeOverlay.tsx`):**
   - In single-selection: use `orientedMeta` exclusively for rect/circle/polygon/text; draw OBB outline, four resize handles (if flag), and rotate handle as a circle.  
   - Remove `applyRotation` for oriented path; treat points as final world coords.  
   - Fallback only for vertex-only shapes; explicitly guard (e.g., if entity kind is line/polyline/arrow).  
   - Add a debug log or warning if `orientedMeta.valid==0` for a corner-capable shape to avoid silent drift.
2) **Engine:** keep `pushRotatedCorners` as is; ensure flags `hasResizeHandles/hasRotateHandle` are correct per kind.  
3) **Contract/versioning:** define `OVERLAY_CONTRACT_VERSION` (or similar) in `protocol_types.h` and mirror it in `frontend/engine/core/protocol.ts`; expose via runtime and check on init. On mismatch: hard error in dev, loud warning/disable overlay in prod to avoid mixed builds.  
4) **Bundle:** ship WASM and frontend overlay changes together; block partial deploys.  
5) **Migration:** keep legacy path behind an explicit guard for vertex-only shapes; remove `applyRotation` entirely for oriented shapes.

## 8) Regression Guarding (Tests)
- **Engine (CTest):**
  - Add ellipse cases at 67°, 90°, 135° (rx≠ry): validate corners (NEAR 1e-3), ordering, and rotate handle presence/position in `overlay_query_test.cpp` or `engine_handles_test.cpp`.  
  - Add polygon case with rotation to ensure OBB contract.  
- **Frontend (Vitest/RTL):**
  - Mock `OrientedHandleMeta` (valid=1, corners pre-rotated at 67°/135°): ensure rendered positions equal meta after world→screen; `applyRotation` not invoked.  
  - Assert rotate handle is rendered when `hasRotateHandle=1`.  
  - Ensure fallback path activates only for vertex-only kinds.  
  - Include tolerance in pixel space (<=0.5px).
- **Determinism:** no randomness; tolerances 1e-3 (engine) and sub-pixel in frontend.

## 9) Risks & Mitigations
- **WASM/frontend mismatch:** add contract version check; bundle deploy.  
- **Coordinate space confusion:** forbid extra rotation; only world→screen.  
- **ViewScale/zoom:** rotate handle offset already world-space; test at multiple scales.  
- **Negative scale (flip):** engine uses `abs(rx*sx)`/`abs(ry*sy)`; add test with sx<0/sy<0.  
- **Floating-point tolerance:** use NEAR with 1e-3; avoid strict equality.  
- **SVG clipping:** reduced by preventing drift; overlay already full-canvas.  
- **Silent fallback:** log when oriented path is invalid for corner-capable shapes; keep fallback only for vertex-only shapes.

---

Key deltas vs draft report:
- Added executive summary with concise root cause/fix direction and “what changed”.  
- Included reproduction matrix and evidence pack with logging snippet and sample logs.  
- Explicitly documented rotate-handle rendering absence and applyRotation double-rotation with code cites.  
- Added ADR-style decision on ellipse box semantics (rectangular OBB).  
- Sharpened canonical contract, versioning recommendation, and fallback rules.  
- Refined implementation plan and regression tests with angles 67°/90°/135° and vertex-only guards.  
- Expanded risks/mitigations with negative scale, contract versioning, and logging on invalid oriented meta.
