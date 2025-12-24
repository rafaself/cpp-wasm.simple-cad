# Text Overlay Coordinates Verification Checklist

This checklist confirms that the text caret and selection overlay correctly align with the rendered text across different coordinate transformations (specifically Y-up vs Y-down) and rotations.

## Pre-requisites

- Application running in development mode.
- Text Tool active.
- (Optional) `window.DEBUG_TEXT_OVERLAY = true` in console to visualize overlay origin/bounds.

## 1. Zero Rotation (0°)

**Setup:** Creates standard horizontal text.

- [ ] Create text "Test".
- [ ] Verify **Caret** appears at end of text.
- [ ] Move caret to start ('|Test'). Verify caret is at left edge.
- [ ] Select "Te". Verify blue selection overlay covers "Te" exactly.
- [ ] Verify Origin: If debug enabled, red origin dot should be at top-left of the text bounding box.

## 2. 90° Rotation (Vertical Up)

**Setup:** Create text, select it with Select Tool, rotate 90° CCW (text reads bottom-to-top).

- [ ] Double click to edit.
- [ ] Verify **Caret** aligns with the rotated text baseline.
- [ ] Move caret. It should move visually "up" (along the text's local X axis).
- [ ] Select "Te". Verify selection rect matches the rotated alignment.
- [ ] **Critical Check**: Ensure caret/selection is NOT strictly horizontal or flipped on wrong side of axis.

## 3. 180° Rotation (Upside Down)

**Setup:** Rotate text 180°.

- [ ] Double click to edit.
- [ ] Verify **Caret** is properly upside down relative to screen, but correct relative to text characters.
- [ ] Type characters. Verify caret advances locally "right" (visually left on screen).
- [ ] Select range. Verify highlight covers correct glyphs.

## 4. -90° / 270° Rotation (Vertical Down)

**Setup:** Rotate text -90° (or 270°).

- [ ] Text reads top-to-bottom.
- [ ] Verify caret moves visually "down" as you type.
- [ ] Verify selection rects align.

## 5. Zoom & Pan

**Setup:** Zoom in very close, Pan canvas.

- [ ] Verify overlay stays "glued" to the text.
- [ ] Verify caret stroke width remains visible (roughly constant screen pixel width or appropriately scaled).

## Debug Helper

If `window.DEBUG_TEXT_OVERLAY = true` is set in the console:

- **Red Dot**: Local (0,0) of the overlay. Should match the text's anchor point.
- **Green Border**: Layout bounds of the overlay container.
