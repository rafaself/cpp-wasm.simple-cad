# PDF Import Investigation Report

## 1. Reproduction of Issues

### A. Spurious Diagonal Lines (Phantom Paths)
**Symptom:** Long lines connecting unrelated points (e.g., top-right to plan content) that do not exist in the PDF.
**Reproduction:**
A synthetic test case with disjoint subpaths (multiple `moveTo` operations in a single `constructPath`) reproduced the issue.
```typescript
// Input: M 10,10 L 20,20; M 50,50 L 60,60
// Output: Polyline [10,10, 20,20, 50,50, 60,60]
```
The renderer draws a line from (20,20) to (50,50), creating a "diagonal" connection where there should be a gap.

### B. Stroke Width 0 (Invisible vs Labeled 0)
**Symptom:** Lines are visible on canvas but show "0" width in Ribbon.
**Reproduction:**
Verified via code analysis and test:
1. `pdfToShapes.ts` preserves `w 0` operator as `shape.strokeWidth: 0`.
2. `ShapeRenderer.ts` has a fallback: `ctx.lineWidth = baseWidth || 2`.
3. `0 || 2` evaluates to `2` (relative to scale).
4. Result: `strokeWidth` is 0 (Ribbon source), but rendered width is ~2px.

### C. Incorrect Fills
**Symptom:** "Things fill when they should be stroke-only".
**Finding:**
- `pdfToShapes.ts` currently converts **all** filled paths (including rectangles) to `polyline` with `fillEnabled: false`.
- **Paradox:** The current code *removes* fills. It is impossible for `polyline` to fill in the current renderer.
- **Likely Cause:** If the user sees "fills", they might be misinterpreting:
  - Very thick strokes (due to scaling issues).
  - Inverted Geometry (text/images flipped Y) appearing as blocks?
  - Or the version running in production differs from the source I analyzed.
- **Note:** `type: 'rect'` is **never** emitted by the current `pdfToShapes.ts`.

### D. Coordinate / Fidelity Issues
**Symptom:** Inverted elements, offsets.
**Finding:**
- PDF Origin: Bottom-Left (Y-up).
- `page.getViewport`: Transforms to Top-Left (Y-down).
- `pdfToShapes`: Normalizes to (0,0) top-left based on bounding box.
- `ShapeRenderer`:
  - `polyline`/`line`: Draws directly (assumes Canvas coords).
  - `text`/`image`/`rect(svg)`: Applies `scale(1, -1)` (flips Y).
- **Conflict:** Using `getViewport` flips the Y-axis. But `ShapeRenderer` (for text) expects Y-up data (to flip it back?). This double-flip logic (or lack thereof for lines) causes inconsistency.

---

## 2. Root Cause Analysis

| Symptom | Root Cause | Certainty |
| :--- | :--- | :--- |
| **Diagonal Lines** | `pdfToShapes.ts` naively merges all subpaths in a `constructPath` block into a single `polyline`. It ignores intermediate `moveTo` (M) commands after the start, treating them as implicit `lineTo` or just accumulating points. | **100% (Confirmed by Test)** |
| **Stroke Width 0** | Mismatch between Data (`0`) and Renderer (`|| 2`). The renderer overrides the "hairline" value with a default visible width, while the UI reports the raw data. | **100% (Confirmed by Code)** |
| **Incorrect Fills** | Likely a misunderstanding of the visual result (e.g. thick strokes). The current code actively strips fills by converting everything to unclosed `polyline`s. | **High** |
| **Inversion** | Use of `page.getViewport` (Y-down) combined with `ShapeRenderer`'s inconsistent Y-handling (some shapes flip, some don't). | **High** |

---

## 3. Fix Plan (Minimal Changes)

### Fix 1: Handle Multiple MoveTo in Paths (Diagonal Lines)
**Target:** `frontend/features/import/utils/pdfToShapes.ts`
**Logic:**
Inside the processing loop for `pathSegments`, instead of creating one giant `polyline`, we must **split** the segments whenever a new `M` (MoveTo) is encountered (except the very first one).
- Iterate through `finalSegments`.
- Collect points.
- If `type === 'M'` and we already have points, **push** the current shape and start a new one.

### Fix 2: Normalize Stroke Width 0 (Ribbon Consistency)
**Target:** `frontend/features/import/utils/pdfToShapes.ts`
**Logic:**
Map `w=0` (hairline) to a concrete minimum value (e.g., `1px` or `0.5px` equivalent) at import time.
- `const width = currentState.lineWidth === 0 ? 1 : currentState.lineWidth;`
- This ensures `shape.strokeWidth` matches what the user likely sees (approx 1px), and the Ribbon will show "1" (or "0.X") instead of "0".
- **Benefit:** `ShapeRenderer`'s `|| 2` fallback won't trigger for `1`, making it deterministic.

### Fix 3: Restore Fills (Fidelity) - *Optional/Phase 2*
To fix "Incorrect Fills" (by actually supporting them correctly):
- If `isFill` is true, we should use a `shape.type` that supports fill (like `path` or `polygon`).
- Since `pdfToShapes` currently only supports `polyline`, we might need to introduce `fillEnabled: true` for `polyline` if it is closed, OR convert `rect`s to `type: 'rect'`.
- **Recommendation:** For this strict "Investigation" task, we acknowledge the limitation. To avoid *phantom* fills (if any), ensure `fillEnabled` remains explicitly `false` for strokes.

### Fix 4: Coordinate Normalization
**Target:** `frontend/features/import/utils/pdfToShapes.ts`
**Logic:**
- Remove `page.getViewport` dependency for the transform matrix.
- Construct a custom matrix that scales (1 unit = 1 px) but **does not flip Y** (keep Y-up).
- Normalize the final shapes by finding the BBox and shifting to (0,0).
- This ensures consistency with the Editor's CAD-like (Y-up) expectation.

---

## 4. Test Strategy

1. **Unit Test (`pdfToShapes.test.ts`):**
   - Add the "Disjoint Path" test case I created. Assert that it produces **2 shapes** (or valid subpaths), not 1 merged shape.
   - Add a "Stroke Width" test case. Assert that `width: 0` becomes `width: 1` (or configured min).

2. **Visual Verification:**
   - Import a Plan PDF.
   - **Check:** No diagonal lines from top-right.
   - **Check:** Select a hairline wall/line. Ribbon should say "1" (or similar), not "0".
   - **Check:** Text is readable (not upside down).
