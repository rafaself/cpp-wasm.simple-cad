# DXF Text Import Investigation Report (JULES)

## 1. Minimal Reproducible Cases
Tests were conducted using synthetic DXF data to simulate various `TEXT`, `MTEXT`, and `INSERT` (Block) configurations.

| Case | DXF Entity | Configuration | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Case 1** | `TEXT` | Basic text at `(0,0)`, Height 1. | `scaleY: -100`. Visual bounds: `[0, 100]` (Upright). | ✅ Correct (Standard) |
| **Case 2** | `INSERT` | Scale `(2, 2)`. Text inside. | `scaleY: -200`. Visual bounds: `[0, 200]` (Upright). | ✅ Correct (Scaled) |
| **Case 3** | `INSERT` | Scale `(1, -1)` (Mirror Y). | **BUG:** `scaleY` remains `-100` (Negative). Visual bounds: `[0, 100]` (Upright). | ❌ **Failed** (Should be Mirrored/Inverted) |

**Observed Failures:**
1.  **Mirroring Failure in Blocks:** Text inside a Block with negative scale (`yScale: -1`) is **not** receiving the inverted `scaleY` sign. It renders upright instead of mirrored.
2.  **Renderer Logic Assumption:** The renderer applies a hardcoded shift (`sy + height`) that assumes standard upright orientation. If corrected to support mirrored text (positive `scaleY`), this shift would incorrectly displace the text by `2x Height`.

---

## 2. Hypothesis Validation: The Contract Mismatch

The core issue is a disagreement on coordinate handling and orientation between the Importer (`dxfToShapes.ts`) and the Renderer (`ShapeRenderer.ts`).

| Component | Assumption / Behavior | Consequence |
| :--- | :--- | :--- |
| **Importer** | Calculates `scaleY` via matrix decomposition. **Fails to flip sign** when block matrix is mirrored. | Mirrored blocks render upright (ignoring the flip). |
| **Renderer** | `ctx.translate(sy + height * abs(sY))` | Moves origin to "Top" of text box, assuming text draws "Down" (Local) -> "Up" (World). |
| **Renderer** | `ctx.scale(sX, sY)` | `sY < 0` (Standard) -> Correctly draws "Up" from shifted origin.<br>`sY > 0` (Mirrored) -> Draws "Down" (World) but starts at shifted origin (`sy+h`), resulting in text at `[sy+h .. sy+2h]` instead of `[sy .. sy-h]`. |

**Conclusion:**
*   **Root Cause 1:** `dxfToShapes.ts` has a bug in the `INSERT` loop where it ignores the determinant of the transformation matrix, forcing `scaleY` to match the child shape's sign (usually negative) regardless of parent mirroring.
*   **Root Cause 2:** `ShapeRenderer.ts` contains "magic number" logic (`+ textHeight`) that is valid *only* for standard upright text. It breaks when handling inverted/mirrored text.

---

## 3. Root Cause Analysis

### Cause 1: Missing Mirror Check in Block Expansion (`dxfToShapes.ts`)
In `processEntity` for `INSERT`, the code iterates over cached block shapes:
```typescript
// Current Buggy Code
const sx_new = Math.sqrt(...); // Magnitude (Always Positive)
clone.scaleY = (s.scaleY||-1) * sx_new; // Multiplies by -1, ignoring M_final determinant
```
This fails to account for `M_final` having a negative determinant (Mirror), causing `scaleY` to be negative (Upright) even when it should be positive (Mirrored).

### Cause 2: Hardcoded Upright Shift (`ShapeRenderer.ts`)
The renderer uses:
```typescript
ctx.translate(sx, sy + textHeight * Math.abs(sY));
```
This shift compensates for `textBaseline = 'top'` by moving the origin up by `Height`.
*   **Standard (`sY < 0`)**: Shift Up (`+H`). Draw Down (Local) -> Up (World). Result: `[H .. 0]`. Matches Baseline at `0`.
*   **Mirrored (`sY > 0`)**: Shift Up (`+H`). Draw Down (Local) -> Down (World). Result: `[H .. 2H]`. **Offset by 2H**.
    *   *Correct behavior for Mirrored*: Should draw `[0 .. -H]`. Requires Origin `0` (or `sy`) and Draw Down.

---

## 4. Implementation Plan

### Fix 1: `dxfToShapes.ts` (Correctly Sign Scale)
Modify the `INSERT` handling to check the determinant of `M_final`. If negative (Mirrored), flip the sign of the resulting `scaleY`.

**Pseudo-code:**
```typescript
// Inside INSERT case, iterating cachedShapes:
const det = M_final.a * M_final.d - M_final.b * M_final.c;
const isMirrored = det < 0;

// Apply mirroring to the child's scaleY
// If child is standard (-1) and Parent is Mirrored (-1), result should be (+1).
// If child is standard (-1) and Parent is Standard (+1), result should be (-1).
const parentSign = isMirrored ? -1 : 1;
clone.scaleY = (s.scaleY || -1) * sx_new * parentSign;
```

### Fix 2: `ShapeRenderer.ts` (Remove Absolute Shift)
Remove `Math.abs` from the vertical translation. Use the signed `sY` to determine the direction of the shift.

**Pseudo-code:**
```typescript
// OLD: ctx.translate(sx, sy + textHeight * Math.abs(sY));

// NEW: Subtract the scaled height.
// If sY = -1 (Standard): sy - H*(-1) = sy + H. (Unchanged).
// If sY = +1 (Mirrored): sy - H*(1)  = sy - H. (Correct shift to allow drawing 0..-H).
ctx.translate(sx, sy - textHeight * sY);
```

---

## 5. Testing Recommendations
No new complex fixtures are needed. The synthetic reproduction script (`debug_text_reproduction.test.ts`) proved sufficient.

**Regression Test Steps:**
1.  Create a DXF with:
    *   Standard Text.
    *   Text inside a Block.
    *   Text inside a **Mirrored Block (Scale Y = -1)**.
2.  Assert that the Mirrored Text `Shape`:
    *   Has `scaleY > 0` (Positive).
3.  (Optional) Verify Visual Bounds:
    *   Standard Text: Bottom at `y`.
    *   Mirrored Text: Top at `y` (extends to `y - height`).

## 6. Encoding Note
Encoding issues (e.g. `ç` -> `?`) are likely due to `dxf-parser` or `TextDecoder` usage in `usePlanImport.ts`. The current logic attempts UTF-8 then falls back to Windows-1252. If issues persist, ensure the Worker receives the correctly decoded string.
