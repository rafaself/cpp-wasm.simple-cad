# Investigation Report: PDF Import Huge Offsets

## 1. Reproduction
A synthetic test case was created in `frontend/features/import/utils/pdfToShapes.test.ts` to simulate nested PDF transformations (Translation followed by Scaling).

**Scenario:**
1.  **Reference:** Line at `(0,0)`.
2.  **Transform:**
    *   `cm [1, 0, 0, 1, 100, 100]` (Translate 100, 100)
    *   `cm [2, 0, 0, 2, 0, 0]` (Scale 2, 2)
    *   Draw Line at `(0,0)`.

**Expected Coordinate:**
*   Point `(0,0)` in local space.
*   Apply Scale (2x) -> `(0,0)`.
*   Apply Translate (+100) -> `(100, 100)`.
*   Result: `(100, 100)`.

**Actual Coordinate:**
*   Result: `(200, 200)`.
*   Displacement: `(100, 100)` extra offset.

## 2. Raw Evidence
Instrumentation of `frontend/features/import/utils/pdfToShapes.ts` yielded the following logs:

```
[DEBUG] cm input: [1, 0, 0, 1, 100, 100]
[DEBUG] CTM before: [1,0,0,1,0,0]
[DEBUG] CTM after:  [1,0,0,1,100,100]  <-- Correct (Identity * Translate)
[DEBUG] cm input: [2, 0, 0, 2, 0, 0]
[DEBUG] CTM before: [1,0,0,1,100,100]
[DEBUG] CTM after:  [2,0,0,2,200,200]  <-- INCORRECT. Translation (100) was scaled by (2).
```

## 3. Analysis
The code performs matrix multiplication as:
`CTM_new = multiplyMatrix(CTM_old, M_new)`

Assuming Row Vector convention (`v' = v * M`):
`CTM_new = CTM_old * M_new`

For the sequence `Translate (T)` then `Scale (S)`:
`CTM = T * S`
`[1 0 0 1 100 100] * [2 0 0 2 0 0] = [2 0 0 2 200 200]`

However, logically, the new transform `S` is applied *within* the coordinate system defined by `T`.
For a point `P`:
`P_global = P * S * T` (Scale first, then Translate).
So `CTM` should be `S * T`.
`[2 0 0 2 0 0] * [1 0 0 1 100 100] = [2 0 0 2 100 100]`

The current implementation reverses the multiplication order, effectively applying the Parent Transform (`T`) *before* the Child Transform (`S`) to the coordinate axes.
This effectively means `P_global = P * T * S`.
`P` (in child) is Translated (by 100), becoming `P+100`.
Then Scaled (by 2), becoming `2(P+100) = 2P + 200`.
This doubles the translation offset.

**Diagnosis:**
The "Huge Offsets" are caused by `Translate * Scale` logic where `Scale * Translate` is expected. Any scaling factor applied *after* a translation (in the matrix stack) will amplify that translation erroneously.
For example, if a "Floor Plan" block is translated by `100,000` units (common in CAD) and then internally scaled (e.g. unit conversion), the translation could be multiplied, throwing the element millions of units away.

## 4. Root Cause Conclusion
**Reversed Matrix Multiplication Order.**
The function `multiplyMatrix(currentState.ctm, [args])` applies the new transform as a *post-multiplication* to the CTM, whereas standard hierarchical scene graph logic (and PDF `cm` operator semantics in this context) requires *pre-multiplication* (applying the new local transform before the existing global transform).

## 5. Fix Plan
1.  **Modify `frontend/features/import/utils/pdfToShapes.ts`**:
    *   Swap arguments in `multiplyMatrix`.
    *   Change: `currentState.ctm = multiplyMatrix(currentState.ctm, [a, b, c, d, e, f]);`
    *   To: `currentState.ctm = multiplyMatrix([a, b, c, d, e, f], currentState.ctm);`
2.  **Verify**:
    *   Run the regression test `should handle nested transforms correctly`.
    *   Assert it passes.
3.  **Safety**:
    *   No side effects expected as this corrects a fundamental logic error.
