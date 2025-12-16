# DXF → .nshapes — Technical Review & Analysis (Text Handling)

## 1. List of Identified Issues

### 1.1 Text Scale & Size Loss (Hierarchy Collapse)
**Observation:** All imported texts appear with the same font size, regardless of their original size in the DXF file (e.g., Titles vs. Labels).
**Code Evidence:** The conversion logic explicitly clamps the text height to a hardcoded minimum value.
```typescript
// dxfToShapes.ts
const MIN_TEXT_SIZE = 12;
const h = Math.max(baseHeight * Math.abs(transform.scaleY), MIN_TEXT_SIZE);
```
**Impact:** Any text smaller than 12 units (after scaling) is forced to 12. If the global scale leads to most texts being "small" in canvas units (e.g., 2.5 or 5.0), they all get flattened to 12, destroying the visual hierarchy.

### 1.2 Original Text Scale Not Preserved
**Observation:** Imported text sizes do not match the expected real-world scale and often appear smaller or uniform.
**Code Evidence:**
- The scaling relies on `DXF_UNITS` mapping and a heuristic for unitless files.
- The `transform.scaleY` is applied to `baseHeight`.
- However, if the `globalScale` is underestimated (e.g., treating Meters as Centimeters), the calculated height `baseHeight * scale` becomes tiny, triggering the `MIN_TEXT_SIZE` clamp mentioned above.
- This creates a "floor" effect where everything is 12px, decoupling the text size from the geometry scale.

### 1.3 Text Encoding Errors (Critical)
**Observation:** Portuguese characters (`ç`, `ã`, `á`) render as `?` or garbage characters.
**Code Evidence:**
```typescript
// dxfToShapes.ts
const textContent = entity.text || (entity as any).value;
```
- The code reads the string directly from the `dxf-parser` output.
- There is **no encoding conversion** step (e.g., `iconv-lite` or similar).
- DXF files historically use **CP1252 (ANSI)** or **CP850**, but modern JS environments and `dxf-parser` often assume **UTF-8** by default.
- When a CP1252 byte sequence is read as UTF-8, characters with the 8th bit set (like accented vowels) become replacement characters (`?`) or mojibake.

### 1.4 Horizontal Text Offset (Positioning Bug)
**Observation:** Text appears shifted to the right, with the shift increasing for longer texts.
**Code Evidence:**
- **Importer:** Ignores DXF alignment columns. It blindly uses the insertion point:
  ```typescript
  const textPoint = entity.startPoint || entity.position;
  // ... maps to shape.x, shape.y
  ```
- **Renderer:** Explicitly enforces Left Alignment:
  ```typescript
  // ShapeRenderer.ts
  ctx.textAlign = 'left';
  ```
- **The Mismatch:** A DXF text defined as **"Center Aligned"** at `(100, 100)` means the text *center* is at 100. The renderer takes `(100, 100)` and draws the text *starting* at 100 (Left Aligned). This shifts the text visually to the right by half its width (for Center) or full width (for Right aligned).

---

## 2. Probable Root Causes

### A. The "Minimum Size" Clamp
The primary cause of the "Size Loss" is the defensive coding in `dxfToShapes.ts`: `MIN_TEXT_SIZE = 12`. This was likely added to prevent unreadable microscopic text, but it aggressively overwrites legitimate scale variations when the coordinate system units (e.g., Meters) result in small numerical values before zoom.

### B. Mismatched Coordinate Systems & Alignment
DXF defines text origin based on `halign` (Left, Center, Right, Aligned, Fit, Middle) and `valign` (Baseline, Bottom, Middle, Top). The `.nshapes` renderer operates on a simplified model:
- **Anchor:** Always Bottom-Left (effectively, due to the transform stack).
- **Alignment:** defaults to `left`.
The importer fails to normalize the DXF "Alignment Point" to a "Top-Left" corner required by the renderer, nor does it pass the alignment property to the renderer to handle.

### C. Missing Encoding Handshake
The pipeline assumes the input string is valid JavaScript UTF-16/UTF-8. It ignores the DXF `$DWGCODEPAGE` header (if present) and does not attempt to transcode binary strings from common CAD encodings (Windows-1252).

---

## 3. What Is Missing in the Current Conversion

1.  **Alignment Mapping**:
    - Reading `entity.halign` and `entity.valign`.
    - Calculating the correct `x, y` for the Top-Left corner (based on estimated text width) OR passing `align: 'center'` to the `Shape` object.
    - Currently, `align` property on `Shape` exists but is never set by the DXF importer.

2.  **Encoding Handling**:
    - Detection of source encoding (via header or heuristic).
    - decoding of raw bytes to UTF-8 strings.

3.  **MText formatting**:
    - DXF `MTEXT` contains formatting codes (e.g., `\P` for newlines, `\C1` for colors, `\H` for height changes).
    - The current importer reads `entity.text` raw. These control characters are likely being rendered literally or causing layout issues.

4.  **Width Factor**:
    - DXF supports `widthFactor` (stretching text horizontally). The importer ignores this.

---

## 4. Concrete Improvement Directions

### Immediate Fixes (High Value)

1.  **Remove or Lower `MIN_TEXT_SIZE`**:
    - **Action**: Change `MIN_TEXT_SIZE` to `0.1` or remove the `Math.max` clamp entirely.
    - **Why**: Let the text be small if the drawing is in Meters. The user can zoom in. Do not destroy data.

2.  **Implement Alignment Handling**:
    - **Action**: Map DXF `halign` (0, 1, 2) to `.nshapes` `align` ('left', 'center', 'right').
    - **Constraint**: `ShapeRenderer` supports `align`, so simply passing this property will fix the "Shift to Right" issue for Center/Right aligned text.
    - **Code Change**:
      ```typescript
      // Map DXF alignment to internal shape alignment
      const alignMap = { 0: 'left', 1: 'center', 2: 'right', 4: 'center' /* Middle */ };
      const alignment = alignMap[entity.halign] || 'left';

      shapes.push({
          // ...
          align: alignment
      });
      ```

3.  **Fix Encoding (Backend or Worker)**:
    - **Action**: Since `dxf-parser` runs in a Worker, we should ensure the file is read as `ISO-8859-1` (binary safe) and then decoded based on common probabilities (UTF-8 first, then CP1252 fallback) if the specific header is missing.

### Strategic Improvements (Long Term)

4.  **Accurate Bounding Box Calculation**:
    - For proper collision detection and "Fit" alignment, we need to calculate text metrics (width/height) during import (using a canvas measureText proxy or font metrics library).

5.  **MText Control Code Stripper**:
    - Implement a Regex parser to strip MText control sequences (`\\P`, `\\A1;`, `{...}`) to show clean text content.
