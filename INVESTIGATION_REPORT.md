# PDF Text Import Investigation Report

## 1. Problem Analysis

### Symptoms
- **Inverted Text:** Text rendered on the canvas is vertically mirrored (upside down).
- **Broken Text:** Unexpected line breaks occur where they shouldn't.
- **Degraded Typography:** Font sizes and proportions may not match the original PDF.

### Comparison
| Feature | Original PDF | Imported Canvas (Current) |
| :--- | :--- | :--- |
| **Orientation** | Upright (Readable) | **Inverted Vertically** |
| **Coordinate System** | PDF Native (Y-Up) | **Canvas Space (Y-Down)** |
| **Line Breaks** | Controlled by layout | **Forced by wrapping logic** |

---

## 2. Root Cause Diagnosis

### A. Inverted Text (Primary Issue)
The root cause is a **double-flip conflict** between the `pdfToShapes` importer and the `ShapeRenderer`.

1.  **Importer (`pdfToShapes.ts`):**
    - Uses `page.getViewport({ scale: 1.0 })`.
    - The standard PDF Viewport transform flips the Y-axis (PDF Y-Up → Canvas Y-Down).
    - It generates shapes with coordinates in this **Y-Down Canvas Space**.
    - For example, Top-Left of page becomes `(0,0)`, Bottom-Left becomes `(0, H)`.

2.  **Renderer (`ShapeRenderer.ts`):**
    - The renderer for `type: 'text'` contains a hardcoded flip:
      ```typescript
      ctx.scale(1, -1);
      ```
    - This flip is intended for a **Y-Up Global World** (standard Cartesian CAD), where `ctx.fillText` needs to be flipped to render upright.
    - However, the PDF Import produces shapes in a **Y-Down** coordinate system.
    - When Y-Down text shapes are rendered with `scale(1, -1)` in a Y-Down canvas context, the text becomes **upside down**.

### B. Broken Text (Secondary Issue)
The renderer forces text wrapping using `getWrappedLines` based on the shape's `width`.
- PDF text items have precise widths based on font metrics.
- Canvas text rendering (`ctx.measureText`) often yields slightly wider values than PDF metrics (due to font substitution).
- If `ctx.measureText(text).width > shape.width`, the renderer wraps the text.
- Since PDF text is often imported as individual lines or small blocks, this wrapping splits lines unnecessarily.

---

## 3. Fix Plan

### Step 1: Fix Text Orientation
We need to disable the `ctx.scale(1, -1)` flip specifically for imported PDF text, while preserving it for standard CAD text (if that is the convention).

**Proposed Action:**
- Add a property `unflipY: boolean` (or similar) to the `Shape` interface (or reuse `scaleY`).
- In `pdfToShapes.ts`, set `scaleY: -1` (to counteract the hardcoded flip) OR introduce a flag to skip the flip.
- **Preferred Approach:** Modify `ShapeRenderer.ts` to respect `shape.scaleY` for text.
  - Current: `ctx.scale(1, -1);` (Hardcoded)
  - New: `ctx.scale(1, shape.scaleY ?? -1);`
- In `pdfToShapes.ts`, set `scaleY: 1` for text shapes. This tells the renderer "This text is already upright in the coordinate system, do not flip it."
  - Wait, if the default is `-1` (flip), and we want NO flip, we need `scaleY` to be `1`?
  - If we use `ctx.scale(1, shape.scaleY ?? -1)`:
    - Default (undefined): `scale(1, -1)` -> Flips Y (Standard CAD behavior).
    - PDF Text (`scaleY: 1`): `scale(1, 1)` -> No Flip. Text renders upright in Y-Down space.

### Step 2: Fix Unwanted Line Breaks
We must prevent the renderer from wrapping PDF text, as line breaks are already handled by the PDF structure.

**Proposed Action:**
- In `pdfToShapes.ts`, ensure text shapes are flagged to avoid wrapping, OR ensure the `width` provided is sufficient.
- **Better approach:** Add `noWrap: true` to the Shape properties or logic.
- **Feasible approach (minimal change):** In `pdfToShapes.ts`, when creating the text shape, set `width` to `undefined` (let it auto-size) OR set it significantly larger if alignment isn't critical.
- However, we want to respect alignment.
- **Refined Plan:** Modify `ShapeRenderer.ts` to support a `textAutoResize` or `noWrap` property.
  - If `noWrap` is true, skip `getWrappedLines`.
- Alternatively, in `pdfToShapes.ts`, set the `width` to `item.width * 1.5` to provide a safety buffer against font metric differences, but this might affect background fill.
- **Best Safe Fix:** In `ShapeRenderer.ts`, check if `shape.id` starts with `pdf-` or add a `noWrap` property. Let's add `textWrapping: 'none'` property to Shape.

### Step 3: Fix Font Proportions
- `pdfToShapes.ts` calculates `fontSize` using `Math.abs(transform[3])`. This is correct for height.
- Ensure `ShapeRenderer` uses the correct baseline. `pdfToShapes` provides the baseline position, but `ShapeRenderer` uses `textBaseline = 'top'`.
- **Adjustment:** In `pdfToShapes.ts`, offset the `y` coordinate by `fontSize` (approx) to align Top-Left.
- PDF `(x, y)` is Baseline. Canvas Top-Left is `y - ascent`.
- Since we are in Y-Down space: `y_top = y_baseline - fontSize`.
- We should adjust `y` in `pdfToShapes` so that the Top-aligned renderer places it correctly.

## 4. Summary of Changes
1.  **Frontend (`pdfToShapes.ts`):**
    - Set `scaleY: 1` on generated text shapes.
    - Set `textWrapping: 'none'` (new prop) on text shapes.
    - Adjust `y` coordinate: `y: item.y - item.fontSize` (approximate alignment correction for 'top' baseline).

2.  **Frontend (`ShapeRenderer.ts`):**
    - Update `ctx.scale(1, -1)` to `ctx.scale(1, shape.scaleY ?? -1)`.
    - Respect `shape.textWrapping === 'none'` to skip `getWrappedLines`.

3.  **Frontend (`types/index.ts`):**
    - Add `textWrapping?: 'none' | 'wrap'` to `Shape`.

## 5. Verification
- Import `test.pdf` (or similar).
- Verify text is readable (not upside down).
- Verify long lines are not split.
- Verify text position matches geometry (approximately).
