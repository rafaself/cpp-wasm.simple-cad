# Text System (Engine-Native)

> High-performance text system with layout in C++.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TEXT PIPELINE                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Input (JS)          Engine (C++)              Output        │
│  ─────────           ───────────               ──────        │
│  TextTool      →     TextStore           →     TextQuads     │
│  handleClick()       (entities, content)       (GPU buffer)  │
│  handleDrag()                                                │
│  handleInputDelta()  TextLayoutEngine    →     GlyphAtlas    │
│                      (line breaking,           (texture)     │
│                       glyph positioning)                     │
│                                                              │
│                      FontManager                             │
│                      (FreeType integration)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Design Principles

| Principle                | Implementation                       |
| ------------------------ | ------------------------------------ |
| **Engine-Authoritative** | All text state lives in C++          |
| **Rich Text First**      | Multiple style runs per entity       |
| **Zero JS Layout**       | Line breaking and positioning in C++ |
| **GPU-Ready Output**     | Quads ready for WebGL                |

---

## 3. Text Modes

| Mode           | Behavior                              | Creation |
| -------------- | ------------------------------------- | -------- |
| **AutoWidth**  | Grows horizontally, no automatic wrap | Click    |
| **FixedWidth** | Word-wrap at width limit              | Drag     |

```typescript
// AutoWidth
textTool.handleClick(worldX, worldY);

// FixedWidth
textTool.handleDrag(x0, y0, x1, y1);
```

---

## 4. Rich Text Model

### TextRec (Entity)

```cpp
struct TextRec {
    uint32_t id;
    uint32_t drawOrder;
    float x, y;           // Anchor (top-left, Y-Up)
    float rotation;
    float scaleX, scaleY;
    TextBoxMode boxMode;
    TextAlign align;
    float constraintWidth; // For FixedWidth

    // Layout results (computed)
    float layoutWidth;
    float layoutHeight;
    uint32_t lineCount;

    // Content references
    uint32_t contentOffset;
    uint32_t contentLength;
    uint32_t runsOffset;
    uint32_t runsCount;
};
```

### TextRun (Style)

```cpp
struct TextRun {
    uint32_t startIndex;  // UTF-8 byte offset
    uint32_t length;      // UTF-8 byte length
    uint32_t fontId;
    float fontSize;
    uint32_t colorRGBA;   // 0xRRGGBBAA
    TextStyleFlags flags; // Bold, Italic, Underline, Strike
};
```

---

## 5. Commands

| Command             | Payload              | Usage               |
| ------------------- | -------------------- | ------------------- |
| `UpsertText`        | Full text entity     | Create/replace text |
| `DeleteText`        | textId               | Remove text         |
| `InsertTextContent` | textId, index, utf8  | Insert characters   |
| `DeleteTextContent` | textId, start, end   | Delete range        |
| `SetTextCaret`      | textId, index        | Position caret      |
| `SetTextSelection`  | textId, start, end   | Select range        |
| `ApplyTextStyle`    | textId, range, style | Apply formatting    |
| `SetTextAlign`      | textId, align        | Align text          |

---

## 6. Queries

### Content

```typescript
const meta = runtime.getTextContentMeta(textId);
// meta.ptr: WASM pointer to UTF-8
// meta.byteCount: size
// meta.exists: whether entity exists

// Read string (when needed for UI)
const bytes = new Uint8Array(
  runtime.module.HEAPU8.buffer,
  meta.ptr,
  meta.byteCount
);
const content = new TextDecoder().decode(bytes);
```

### Bounds

```typescript
const bounds = runtime.getTextBounds(textId);
// { minX, minY, maxX, maxY, valid }
```

### Caret Position

```typescript
const pos = runtime.getTextCaretPosition(textId, charIndex);
// { x, y, height, lineIndex }
// Coordinates in text local space
```

### Style Snapshot (for UI)

```typescript
const snapshot = runtime.getTextStyleSnapshot(textId);
// {
//   fontId, fontSize, fontIdTriState, fontSizeTriState,
//   styleTriStateFlags, align,
//   caretLogical, selectionStartLogical, selectionEndLogical,
//   ...
// }
```

For non-editing selection, use `runtime.getTextStyleSummary(textId)` to
summarize the full text range (including mixed states).

### Hit Testing

```typescript
const hit = runtime.hitTestText(textId, localX, localY);
// { charIndex, lineIndex, isLeadingEdge }
```

---

## 7. TextTool (Frontend)

Location: `frontend/engine/tools/TextTool.ts`

### Lifecycle

```typescript
// Initialization
textTool.initialize(runtime);
textTool.loadFont(fontId, fontData);
textTool.setStyleDefaults({ fontId, fontSize, colorRGBA, flags, align });

// Create text
textTool.handleClick(worldX, worldY);          // AutoWidth
textTool.handleDrag(x0, y0, x1, y1);           // FixedWidth

// Edit existing text
textTool.handlePointerDown(textId, localX, localY, shiftKey, ...);
textTool.handlePointerMove(textId, localX, localY);
textTool.handlePointerUp();

// Process input
textTool.handleInputDelta(delta: TextInputDelta);
textTool.handleSelectionChange(start, end);

// Apply styles
textTool.applyTextAlign(align);
textTool.applyBoldStyle(textId, bold);
textTool.applyFontIdToText(textId, fontId);
```

### TextInputDelta

```typescript
interface TextInputDelta {
  beforeSelection: string;
  selection: string;
  afterSelection: string;
  caretBefore: number;
  selectionStartBefore: number;
  selectionEndBefore: number;
}
```

---

## 8. Rendering Pipeline

```
1. Engine calculates layout (line breaking, glyph positions)
2. Engine generates text quads (6 vertices per glyph)
3. Engine updates glyph atlas (texture)
4. Frontend reads buffers via WASM pointers
5. WebGL renders quads with atlas texture
```

### Buffers

```typescript
// Text quads - format: [x, y, z, u, v, r, g, b, a] per vertex
const quadMeta = runtime.getTextQuadBufferMeta();

// Atlas texture - single channel (SDF or grayscale)
const atlasMeta = runtime.getAtlasTextureMeta();

// Dirty flags
if (runtime.isTextQuadsDirty()) {
  runtime.rebuildTextQuadBuffer();
}
if (runtime.isAtlasDirty()) {
  uploadAtlasTexture();
  runtime.clearAtlasDirty();
}
```

---

## 9. Caret/Selection Overlay

Caret and selection can be rendered:

**Option A: Engine (preferred for performance)**

- Engine includes caret/selection quads in buffer
- Single render pass

**Option B: React Overlay (current)**

- Frontend reads caret position from Engine
- Renders via CSS/SVG
- More styling flexibility

```typescript
// Get caret position for overlay
const caretPos = runtime.getTextCaretPosition(textId, caretIndex);
// Convert to screen space and render
```

---

## 10. Performance Considerations

| Operation       | Complexity   | Notes                                  |
| --------------- | ------------ | -------------------------------------- |
| Layout          | O(n)         | n = characters, only when text changes |
| Hit test        | O(log lines) | Binary search on lines                 |
| Glyph lookup    | O(1)         | Hash map                               |
| Quad generation | O(glyphs)    | Only when dirty                        |

### Hot Paths

- `hitTestText()` — called on pointermove during drag
- `getTextCaretPosition()` — called for overlay update
- `rebuildTextQuadBuffer()` — batch, not per glyph

---

## 11. Extensibility

### Adding New Font

```typescript
// 1. Load font data
const fontData = await fetch('/fonts/MyFont.ttf').then(r => r.arrayBuffer());

// 2. Register in Engine
const fontId = textTool.loadFont(MY_FONT_ID, new Uint8Array(fontData));

// 3. Use
textTool.setStyleDefaults({ fontId: MY_FONT_ID, ... });
```

### Adding New Style

1. Add flag in `TextStyleFlags` (C++)
2. Update `TextRun` struct
3. Implement rendering in layout engine
4. Expose via `ApplyTextStyle` command
5. Add UI in frontend

---

## 12. Critical Rules

| ✅ DO                                      | ❌ DON'T                                |
| ------------------------------------------ | --------------------------------------- |
| Use `getTextContentMeta()` to read content | Keep content string copy in React       |
| Use commands to modify text                | Do string manipulation in JS            |
| Trust Engine for layout                    | Calculate line breaks in frontend       |
| Use `getTextCaretPosition()` for overlay   | Calculate glyph position in JS          |
| Batch style changes when possible          | Multiple `ApplyTextStyle` per keystroke |
