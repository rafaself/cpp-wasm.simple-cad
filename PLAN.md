## ✅ Goal
Replace the fallback Oriented Bounding Box (OBB) overlay with a true-contour overlay and vertex grips for `EntityKind.Polygon`.

---

## 🧩 Phase 1: Engine Upgrade — Contour & Grip Output

### 🔧 1. Update `getSelectionOutlineMeta()` (engine)
- For `EntityKind::Polygon`:
  - Output a `Polygon` or `Polyline` primitive with the **real vertices**.
  - Use existing regular polygon point generator if shape is parametric.
  - Close the polygon by repeating the first point if needed.

### 🔧 2. Update `getSelectionHandleMeta()`
- Instead of 4 OBB corners, push **vertex grip handles**:
  - One grip per vertex.
  - Optional: add midpoint grips (can be Phase 2).
  - Include metadata `{ kind: GripKind.Vertex, index: N }` for edit operations.

### 🔧 3. Update `getOrientedHandleMeta()` (optional but recommended)
- Return `valid = false` and `hasResizeHandles = false` for polygons.
- This signals the frontend to skip OBB overlays entirely.

---

## 🧩 Phase 2: Frontend Routing Logic Fix

### 🔄 4. Modify `isVertexOnly` logic in `ShapeOverlay.tsx`
- Include `EntityKind.Polygon` as vertex-only:
  ```ts
  const isVertexOnly =
    kind === EntityKind.Line ||
    kind === EntityKind.Arrow ||
    kind === EntityKind.Polyline ||
    kind === EntityKind.Polygon;
  ```

### 🔄 5. Add fallback handling
- If vertex data isn’t yet provided (older engine or regression), show a soft warning or skip grips — but **do not fallback to OBB**.

---

## 🧪 Phase 3: Testing & Validation

### 🧪 6. Test Scenarios
- Regular polygons with 3–12 sides.
- Zoom in/out, rotate shape, drag vertex.
- Combine with snapping and multi-selection.
- Ensure grips remain stable across zoom/transform.

---

## 🚫 Not Included (Future Phases)
- Edge/midpoint grips for polygon edge drag (Phase 2).
- Perpendicular edge drag.
- Constraint snapping or parametric polygon lock-in.

---

## 📦 Outcome
- Polygon selection behaves CAD-like.
- No more 4-corner box.
- Vertex editing available immediately.
- Matches polyline/line behavior, ensures UI consistency.
