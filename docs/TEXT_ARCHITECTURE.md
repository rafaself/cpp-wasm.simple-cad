# Text Architecture (Engine-Native)

This document describes the engine-native text architecture implemented in PRs 1-7.

## Overview

The text system is fully implemented in the C++ WASM engine, providing:

- **High Performance**: Text layout, shaping, and atlas management run in native code
- **Rich Text**: Multiple styled runs within a single text entity
- **MSDF Rendering**: Crisp text at any zoom level via Multi-channel Signed Distance Fields
- **Interactive Editing**: Hit testing, caret positioning, and selection support

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (TypeScript)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   TextTool.ts   │───▶│  TextBridge.ts  │───▶│   commandBuffer.ts     │  │
│  │ (user gestures) │    │ (high-level API)│    │ (binary serialization) │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
│           │                                                │                │
│           ▼                                                ▼                │
│  ┌─────────────────┐                          ┌────────────────────────┐   │
│  │TextCaretOverlay │                          │  WASM Linear Memory    │   │
│  │TextInputProxy   │                          │  (shared buffers)      │   │
│  │  (DOM overlay)  │                          └────────────────────────┘   │
│  └─────────────────┘                                       │                │
├────────────────────────────────────────────────────────────┼────────────────┤
│                                                            ▼                │
│                              WASM Engine (C++)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   TextStore     │───▶│TextLayoutEngine │───▶│    GlyphAtlas          │  │
│  │ (entity storage)│    │ (shaping/layout)│    │ (MSDF texture packing) │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
│           │                      │                         │                │
│           ▼                      ▼                         ▼                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐  │
│  │   FontManager   │    │  AtlasPacker    │    │   Text Quad Buffer     │  │
│  │ (font loading)  │    │ (bin packing)   │    │   (render vertices)    │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                            │                │
│                              WebGL2 Renderer                                │
├────────────────────────────────────────────────────────────┼────────────────┤
│  ┌─────────────────────────────────────────────────────────▼──────────────┐ │
│  │                    TextRenderPass.ts                                   │ │
│  │  - Reads quad buffer from WASM memory                                  │ │
│  │  - Uploads atlas texture when dirty                                    │ │
│  │  - MSDF shader for crisp rendering                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### Frontend Components

| Component            | Location                                             | Purpose                                                                 |
| -------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| **TextTool**         | `frontend/features/editor/tools/TextTool.ts`         | Handles user gestures (click, drag, keyboard) for text creation/editing |
| **TextBridge**       | `frontend/wasm/textBridge.ts`                        | High-level API for text operations, wraps command buffer                |
| **TextInputProxy**   | `frontend/components/TextInputProxy.tsx`             | Hidden input for IME/keyboard capture                                   |
| **TextCaretOverlay** | `frontend/components/TextCaretOverlay.tsx`           | Renders caret and selection highlights                                  |
| **TextRenderPass**   | `frontend/engine/renderers/webgl2/textRenderPass.ts` | WebGL2 rendering with MSDF shader                                       |
| **Text Types**       | `frontend/types/text.ts`                             | TypeScript type definitions mirroring C++                               |

### Engine Components (C++)

| Component            | Location                                     | Purpose                                         |
| -------------------- | -------------------------------------------- | ----------------------------------------------- |
| **TextStore**        | `cpp/engine/text/text_store.{h,cpp}`         | Entity storage, content buffers, dirty tracking |
| **FontManager**      | `cpp/engine/text/font_manager.{h,cpp}`       | Font loading, metrics, FreeType integration     |
| **TextLayoutEngine** | `cpp/engine/text/text_layout_engine.{h,cpp}` | Text shaping, line breaking, bounds             |
| **GlyphAtlas**       | `cpp/engine/text/glyph_atlas.{h,cpp}`        | MSDF texture atlas management                   |
| **AtlasPacker**      | `cpp/engine/text/atlas_packer.{h,cpp}`       | Bin-packing for glyph rectangles                |
| **Commands**         | `cpp/engine/commands.{h,cpp}`                | Command buffer parsing for text ops             |

## Data Flow

### 1. Text Creation

```
User clicks canvas
    │
    ▼
TextTool.handlePointerDown()
    │
    ▼
TextBridge.createText(x, y, content, runs)
    │
    ▼
CommandBuffer writes TEXT_UPSERT command
    │
    ▼
WASM applyCommandBuffer()
    │
    ▼
TextStore.upsertText() → TextLayoutEngine.layoutText()
    │
    ▼
GlyphAtlas updated → quad buffer rebuilt
    │
    ▼
TextRenderPass reads buffers → renders to screen
```

### 2. Text Editing

```
User types on keyboard
    │
    ▼
TextInputProxy captures input
    │
    ▼
TextBridge.insertAt(textId, byteIndex, chars)
    │
    ▼
CommandBuffer writes TEXT_INSERT command
    │
    ▼
WASM applies edit → relayout
    │
    ▼
TextBridge.getCaretPosition() → overlay updates
```

## Buffer Formats

### Text Quad Buffer

Each glyph generates 6 vertices (2 triangles). Vertex format:

| Offset | Name | Type  | Description   |
| ------ | ---- | ----- | ------------- |
| 0      | x    | float | Position X    |
| 1      | y    | float | Position Y    |
| 2      | z    | float | Z-order       |
| 3      | u    | float | Texture U     |
| 4      | v    | float | Texture V     |
| 5      | r    | float | Color R (0-1) |
| 6      | g    | float | Color G (0-1) |
| 7      | b    | float | Color B (0-1) |
| 8      | a    | float | Color A (0-1) |

**Total**: 9 floats × 6 vertices = 54 floats per glyph

### Atlas Texture

- Format: **RGBA** (4 channels, 8 bits each)
  - R, G, B: MSDF distance fields for each channel
  - A: Always 255 (fully opaque)
- Size: 1024×1024 (default, configurable)
- Content: Multi-channel SDF glyph images generated via msdfgen
- Access: Read via `getAtlasTextureMeta()` → pixel data pointer
- Upload: Use `gl.RGBA8` / `gl.RGBA` with `gl.UNSIGNED_BYTE`

## Command Buffer Protocol

Text commands use the standard command buffer format with 32-bit opcode:

```
[4 bytes: opcode (u32)][variable payload]
```

The command buffer starts with a version header (version 2) followed by command sequences. Each command has a 4-byte opcode followed by its payload.

### Text Commands

| Opcode | Name               | Payload                                                                                                                           |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 0x20   | TEXT_UPSERT        | textId(4), x(4), y(4), rotation(4), boxMode(1), align(1), constraintWidth(4), runCount(4), [runs...], contentLen(4), [content...] |
| 0x21   | TEXT_DELETE        | textId(4)                                                                                                                         |
| 0x22   | TEXT_SET_CARET     | textId(4), byteIndex(4)                                                                                                           |
| 0x23   | TEXT_SET_SELECTION | textId(4), anchorByte(4), focusByte(4)                                                                                            |
| 0x24   | TEXT_INSERT        | textId(4), byteIndex(4), charCount(4), [utf8Chars...]                                                                             |
| 0x25   | TEXT_DELETE_RANGE  | textId(4), startByte(4), endByte(4)                                                                                               |

## Text Properties

### TextRec (Engine Entity)

```cpp
struct TextRec {
    uint32_t id;
    float x, y;                    // Anchor position (top-left)
    float rotation;                // Radians
    TextBoxMode boxMode;           // AutoWidth or FixedWidth
    TextAlign align;               // Left, Center, Right
    float constraintWidth;         // For FixedWidth mode

    // Layout results (computed)
    float boundingWidth;
    float boundingHeight;
    std::vector<LineInfo> lines;
};
```

### TextRun (Styling Span)

```cpp
struct TextRunPayload {
    uint32_t startByte;            // UTF-8 byte offset
    uint32_t length;               // UTF-8 byte length
    uint32_t fontId;               // Font identifier
    float fontSize;                // In canvas units
    uint32_t colorRGBA;            // 0xRRGGBBAA packed
    uint8_t flags;                 // Bold, Italic, etc.
};
```

## Testing

- **Unit Tests**: 118 tests in `cpp/build_native/` covering all C++ components
- **Run Tests**: `make -C cpp/build_native test` or `./cpp/build_native/engine_tests`

## Migration from Legacy System

PR8 removed the legacy text system:

- ~~`TextSdfLayer.tsx`~~: THREE.js instanced geometry (replaced by `TextRenderPass`)
- ~~`TextEditorOverlay.tsx`~~: DOM textarea editor (replaced by `TextInputProxy` + `TextCaretOverlay`)
- ~~`textSdf/fontAtlas.ts`~~: JS atlas management (replaced by C++ `GlyphAtlas`)

Integration points with TODO comments mark where the new `TextTool` should be wired in.

## Future Work

1. **Integration**: Wire `TextTool` into `EngineInteractionLayer.tsx` (see TODO comments)
2. **Multi-line Selection**: Selection spanning multiple lines
3. **Copy/Paste**: Clipboard integration
4. **Undo/Redo**: Text edit history integration
5. **Full Bidi**: Complex bidirectional text with visual reordering

## Implementation Notes

### Script Detection

The layout engine uses `hb_buffer_guess_segment_properties()` to automatically detect:

- Text direction (LTR, RTL)
- Script (Latin, Cyrillic, Hebrew, Arabic, CJK, etc.)
- Language (inferred from script)

This enables proper shaping for non-Latin scripts without manual configuration.

### Caret Position Semantics

`getCaretPosition()` returns:

- `x`: Horizontal position from text anchor
- `y`: **Baseline position** (yTop + ascent), not top of line
- `height`: Full line height (ascent + descent + lineGap)
- `lineIndex`: 0-based line number
