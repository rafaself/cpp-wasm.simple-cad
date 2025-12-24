# Text Tool Implementation Plan — Engine-Native (Figma-like)

> **Date**: December 22, 2025  
> **Author**: AI Agent  
> **Scope**: Complete refactor of text tool from DOM/Canvas2D to Engine-First MSDF pipeline

---

## Executive Summary

This document outlines the implementation plan for replacing the existing DOM/Canvas2D text pipeline with a native C++/WASM engine-first architecture. The new system will use **FreeType** for metrics, **HarfBuzz** for shaping, and **msdfgen** for atlas generation, achieving Figma-like fidelity at any zoom level.

### Current State Analysis

| Component | Current Implementation | Target Implementation |
|-----------|----------------------|----------------------|
| Layout/Shaping | JS (`fontAtlas.ts`, `TextEditorOverlay.tsx`) | C++ `TextLayoutEngine` (HarfBuzz) |
| Atlas Generation | Canvas2D chamfer distance transform | MSDF via `msdfgen` in WASM |
| Rendering | THREE.js instanced geometry (`TextSdfLayer.tsx`) | WebGL2 `TextRenderPass` |
| Text Input | HTML `<textarea>` overlay | Invisible `TextInputProxy` |
| Hit-testing | JS geometry calculations | C++ engine AABB/glyph hit-test |

### Files to Remove

```
frontend/src/components/TextSdfLayer.tsx        (289 lines)
frontend/src/components/TextEditorOverlay.tsx   (193 lines)
frontend/src/next/textSdf/fontAtlas.ts          (187 lines)
```

---

## 1. PR Plan (8 PRs)

### PR 1: Engine Text Data Structures & CMake Dependencies

**Objective**: Establish C++ foundation with text data types and integrate FreeType/HarfBuzz/msdfgen.

**Changes**:
- Add `TextRec`, `TextRun` structs to `types.h`
- Add `UpsertText`, `DeleteText`, `SetCaret`, `HitTestText` command operations
- Configure CMake with FreeType, HarfBuzz, msdfgen via `FetchContent`
- Create `cpp/engine/text/` directory structure

**Files Changed**:
```
cpp/CMakeLists.txt                              # Add dependencies
cpp/engine/types.h                              # Add TextRec, TextRun, TextPayload
cpp/engine/text/text_store.h                    # NEW: TextStore class
cpp/engine/text/text_store.cpp                  # NEW: TextStore implementation
cpp/engine/text/text_types.h                    # NEW: Internal text types
```

**Tests**:
- Unit test: TextStore CRUD operations
- Compile test: FreeType/HarfBuzz headers available

**Risk**: Medium — Dependency integration may have version conflicts.  
**Mitigation**: Pin specific versions, test WASM build early.

---

### PR 2: TextLayoutEngine Core (Shaping + Metrics)

**Objective**: Implement HarfBuzz shaping and FreeType metrics extraction.

**Changes**:
- `TextLayoutEngine` class with single-line shaping
- Font loading from embedded data or fetch
- Glyph position calculation (kerning, ligatures)
- Line breaking for AutoWidth (`\n` only) and FixedWidth (word wrap)

**Files Changed**:
```
cpp/engine/text/text_layout.h                   # NEW: TextLayoutEngine interface
cpp/engine/text/text_layout.cpp                 # NEW: HarfBuzz/FreeType integration
cpp/engine/text/font_manager.h                  # NEW: Font loading/caching
cpp/engine/text/font_manager.cpp                # NEW: Font file management
cpp/tests/text_layout_test.cpp                  # NEW: Layout unit tests
```

**Tests**:
- Unit test: Single line shaping produces correct glyph count
- Unit test: Word wrap at constraint width
- Unit test: Multi-line with explicit `\n`
- Unit test: Bounds calculation matches expected AABB

**Risk**: High — HarfBuzz/FreeType integration complexity.  
**Mitigation**: Start with simple ASCII subset, expand to Unicode later.

---

### PR 3: GlyphAtlas with MSDF Generation

**Objective**: Implement atlas generation and texture management in C++.

**Changes**:
- `GlyphAtlas` class with bin-packing
- MSDF generation per glyph via msdfgen
- Atlas texture as RGBA buffer accessible from JS
- Glyph cache with LRU eviction (optional, can defer)

**Files Changed**:
```
cpp/engine/text/glyph_atlas.h                   # NEW: Atlas manager interface
cpp/engine/text/glyph_atlas.cpp                 # NEW: MSDF generation + packing
cpp/engine/text/atlas_packer.h                  # NEW: Bin packing algorithm
cpp/engine/text/atlas_packer.cpp                # NEW: Shelf/skyline packing
cpp/tests/glyph_atlas_test.cpp                  # NEW: Atlas unit tests
```

**Tests**:
- Unit test: Generate MSDF for ASCII 32-126
- Unit test: Atlas lookup returns correct UVs
- Unit test: New glyph triggers atlas update

**Risk**: Medium — msdfgen output quality tuning.  
**Mitigation**: Use msdfgen defaults, tune parameters iteratively.

---

### PR 4: Engine Commands & Bridge Integration

**Objective**: Expose text commands to JavaScript via Embind.

**Changes**:
- Implement `applyTextCommand` for UpsertText/DeleteText/SetCaret
- Add buffer getters for text quads (instancing data)
- Add atlas texture buffer getter
- Implement `hitTestText(x, y)` returning character index

**Files Changed**:
```
cpp/engine/bindings.cpp                         # Add text bindings
cpp/engine/commands.cpp                         # Add text command parsing
cpp/engine/engine.h                             # Add text vectors and methods
cpp/engine.cpp                                  # Implement text upsert/render
cpp/tests/commands_test.cpp                     # Add text command tests
```

**Bridge API**:
```typescript
interface TextBridge {
  upsertText(id: number, payload: TextPayload): void;
  deleteText(id: number): void;
  setCaret(textId: number, charIndex: number): void;
  setSelection(textId: number, start: number, end: number): void;
  hitTestText(textId: number, localX: number, localY: number): number;
  getCaretPosition(textId: number): { x: number, y: number, height: number };
  getTextBounds(textId: number): { width: number, height: number, minX: number, minY: number, maxX: number, maxY: number };
  getTextQuadBuffer(): BufferMeta;
  getAtlasTexture(): { ptr: number, width: number, height: number, generation: number };
}
```

**Tests**:
- Integration test: JS → UpsertText → getTextBounds returns valid AABB
- Integration test: hitTestText returns correct index

**Risk**: Low — Follows existing command pattern.  
**Mitigation**: Reuse existing buffer infrastructure.

---

### PR 5: TextInputProxy Component (Frontend)

**Objective**: Create invisible input proxy for keyboard/IME capture.

**Changes**:
- `TextInputProxy.tsx`: Hidden contenteditable or textarea
- Captures: keydown, keyup, input, compositionstart/update/end, paste, cut
- Sends deltas to engine (insert/delete/replace)
- Receives caret position from engine for visual sync

**Files Changed**:
```
frontend/components/TextInputProxy.tsx          # NEW: Input proxy component
frontend/wasm/textBridge.ts                     # NEW: Text-specific bridge layer
frontend/types/text.ts                          # NEW: Text TypeScript types
```

**Component Responsibilities**:
- **DOES**: Capture input, send deltas, position itself for IME popup
- **DOES NOT**: Measure text, calculate wraps, render text, manage selection visually

**Tests**:
- Unit test: Input event produces correct delta command
- Unit test: IME composition sequence handled correctly
- Manual test: Accented characters (é, ñ, ü) work

**Risk**: Medium — IME handling varies by browser/OS.  
**Mitigation**: Test on Chrome/Firefox/Safari, document known issues.

---

### PR 6: TextRenderPass (WebGL2)

**Objective**: Implement GPU text rendering with MSDF shader.

**Changes**:
- `TextRenderPass` class for instanced quad rendering
- MSDF fragment shader with proper antialiasing
- Integration with existing render pipeline via `drawOrder`
- Atlas texture upload from WASM memory

**Files Changed**:
```
frontend/engine/renderers/webgl2/textRenderPass.ts     # NEW: Text render pass
frontend/engine/renderers/webgl2/shaders/textMsdf.ts  # NEW: MSDF shader
frontend/engine/renderers/webgl2/webgl2TessellatedRenderer.ts  # Integrate text pass
```

**Shader Algorithm** (MSDF median):
```glsl
float median(float r, float g, float b) {
  return max(min(r, g), min(max(r, g), b));
}

void main() {
  vec3 msd = texture(uAtlas, vUv).rgb;
  float sd = median(msd.r, msd.g, msd.b);
  float screenPxDistance = screenPxRange * (sd - 0.5);
  float opacity = clamp(screenPxDistance + 0.5, 0.0, 1.0);
  outColor = vec4(uColor.rgb, uColor.a * opacity);
}
```

**Tests**:
- Visual test: Text renders without artifacts at 1x, 10x, 100x zoom
- Visual test: Text overlaps correctly with shapes via drawOrder

**Risk**: Medium — Shader tuning for different font sizes.  
**Mitigation**: Use `screenPxRange` based on atlas generation parameters.

---

### PR 7: TextTool Integration & UX

**Objective**: Wire up TextTool with new engine pipeline.

**Changes**:
- Refactor `TextTool` to use engine commands
- Implement AutoWidth (click) and FixedWidth (drag) creation modes
- Caret rendering (use engine position, draw quad or CSS pseudo-element)
- Selection rendering (background quads)
- Integration with existing tool switching

**Files Changed**:
```
frontend/features/editor/tools/TextTool.ts      # Refactor for engine-first
frontend/components/TextCaretOverlay.tsx        # NEW: Caret/selection visual
frontend/stores/useUIStore.ts                   # Update text editing state
frontend/features/editor/ribbon/components/TextControls.tsx  # Wire to new API
```

**UX Flows**:
1. **AutoWidth**: Click → create TextRec (boxMode=0) → focus TextInputProxy → type → grows horizontally
2. **FixedWidth**: Drag box → create TextRec (boxMode=1, constraintWidth=dragWidth) → type → wraps

**Tests**:
- E2E test: Create text by click, type, verify bounds
- E2E test: Create text by drag, type long text, verify wrap
- Manual test: Edit existing text, caret at click position

**Risk**: Low — Primarily integration work.  
**Mitigation**: Incremental testing of each flow.

---

### PR 8: Legacy Cleanup & Documentation

**Objective**: Remove old pipeline, finalize documentation, comprehensive QA.

**Changes**:
- Delete legacy text files
- Update imports and references
- Create internal documentation
- Final integration tests

**Files Deleted**:
```
frontend/src/components/TextSdfLayer.tsx
frontend/src/components/TextEditorOverlay.tsx
frontend/src/next/textSdf/fontAtlas.ts
frontend/src/next/textSdf/                      # entire directory
```

**Files Changed**:
```
frontend/App.tsx                                # Remove TextSdfLayer import
frontend/src/components/index.ts                # Update exports
docs/TEXT_ARCHITECTURE.md                       # NEW: Architecture doc
docs/TEXT_API.md                                # NEW: Bridge API doc
```

**Documentation Deliverables**:
- Architecture overview diagram
- Bridge command reference
- Debug guide (caret, layout, atlas inspection)
- Known limitations

**Tests**:
- Full regression test suite
- Performance benchmark: 1000 text entities at 60fps

**Risk**: Low — Cleanup is straightforward.  
**Mitigation**: Grep for any remaining references.

---

## 2. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| FreeType/HarfBuzz WASM binary size bloat | Medium | High | Use `-Os`, strip unused features, lazy font loading |
| IME composition bugs on Safari | High | Medium | Document limitations, implement workarounds |
| Atlas texture memory pressure | Low | Medium | Implement LRU eviction, limit atlas size |
| Caret position drift with complex scripts | Medium | High | Extensive testing with Arabic/Hebrew/Thai |
| Performance regression with many text entities | Low | High | Batch rendering, dirty flags, spatial indexing |
| HarfBuzz bidi support complexity | Medium | Medium | Start LTR-only, add RTL in Phase 2 |
| msdfgen output artifacts | Low | Medium | Tune generation parameters per font |

### Critical Path Dependencies

```
PR1 ──► PR2 ──► PR3 ──► PR4 ──► PR6
                 │              │
                 └──────────────┼──► PR7 ──► PR8
                                │
PR5 ────────────────────────────┘
```

- PR5 (TextInputProxy) can be developed in parallel with PR2-PR4
- PR6 depends on PR3 (atlas) and PR4 (buffers)
- PR7 integrates everything
- PR8 is cleanup

---

## 3. QA Checklist

### A. Creation Modes

| Test | Steps | Expected | Pass |
|------|-------|----------|------|
| AutoWidth click | 1. Select Text tool 2. Click on canvas 3. Type "Hello" | Text grows horizontally, no wrap | ☐ |
| AutoWidth Enter | 1. Continue typing 2. Press Enter 3. Type "World" | Two lines, height increases | ☐ |
| FixedWidth drag | 1. Select Text tool 2. Drag 200px wide box 3. Type long text | Text wraps at ~200px | ☐ |
| FixedWidth resize | 1. Select fixed-width text 2. Resize wider | Text reflows to fewer lines | ☐ |

### B. Editing

| Test | Steps | Expected | Pass |
|------|-------|----------|------|
| Click to place caret | 1. Click in middle of text | Caret appears at clicked position | ☐ |
| Arrow keys | 1. Press Left/Right arrows | Caret moves one character | ☐ |
| Selection drag | 1. Click and drag across text | Characters highlighted | ☐ |
| Copy/Paste | 1. Select text 2. Ctrl+C 3. Ctrl+V | Text duplicated | ☐ |
| IME (accents) | 1. Type `'` then `e` (compose) | "é" appears correctly | ☐ |
| IME (CJK) | 1. Switch to Chinese IME 2. Type pinyin | Characters composed correctly | ☐ |

### C. Rendering Quality

| Test | Steps | Expected | Pass |
|------|-------|----------|------|
| Zoom 1x | View text at normal zoom | Sharp, no blur | ☐ |
| Zoom 10x | Zoom in 10x | Still sharp, MSDF working | ☐ |
| Zoom 0.1x | Zoom out 10x | Readable, no moire | ☐ |
| Mixed zoom | Zoom while typing | No visual glitches | ☐ |

### D. Layout Accuracy

| Test | Steps | Expected | Pass |
|------|-------|----------|------|
| Bounds match visual | 1. Create text 2. Check layoutWidth/Height | AABB matches rendered bounds | ☐ |
| Kerning visible | Type "AV" or "To" | Letters properly kerned | ☐ |
| Line height | Multiple lines | Consistent spacing | ☐ |
| Alignment Left | Set align=left | Text left-aligned | ☐ |
| Alignment Center | Set align=center | Text centered | ☐ |
| Alignment Right | Set align=right | Text right-aligned | ☐ |

### E. Integration

| Test | Steps | Expected | Pass |
|------|-------|----------|------|
| drawOrder | 1. Create rect 2. Create text over it 3. Adjust order | Z-order respects drawOrder | ☐ |
| Selection box | Draw selection around text | Text selectable | ☐ |
| Undo/Redo | 1. Type text 2. Undo | Text reverts | ☐ |
| Save/Load | 1. Create text 2. Save 3. Reload | Text persists correctly | ☐ |

### F. Performance

| Test | Steps | Expected | Pass |
|------|-------|----------|------|
| 100 text entities | Create 100 texts | 60fps maintained | ☐ |
| 1000 characters | Single text with 1000 chars | No lag while typing | ☐ |
| Rapid typing | Type very fast | No dropped characters | ☐ |

---

## 4. Implementation Notes

### 4.1. IME Handling (Critical)

IME (Input Method Editor) for non-Latin scripts requires careful event handling:

```typescript
// TextInputProxy.tsx
const handleCompositionStart = (e: CompositionEvent) => {
  engine.beginComposition(activeTextId);
};

const handleCompositionUpdate = (e: CompositionEvent) => {
  // Show preview text without committing
  engine.updateComposition(activeTextId, e.data);
};

const handleCompositionEnd = (e: CompositionEvent) => {
  // Commit final composed string
  engine.commitComposition(activeTextId, e.data);
};

// IMPORTANT: During composition, ignore regular 'input' events
// to prevent double-insertion
```

**Browser Quirks**:
- Chrome: `compositionend` fires before final `input`
- Safari: Different event ordering for Korean IME
- Firefox: More predictable but test anyway

### 4.2. Bridge Efficiency

**Avoid per-keystroke string serialization:**

```cpp
// Bad: Serialize entire text content every keystroke
void updateText(uint32_t id, const std::string& fullContent);

// Good: Send only deltas
void insertText(uint32_t id, uint32_t charIndex, const char* text, uint32_t byteLen);
void deleteText(uint32_t id, uint32_t startIndex, uint32_t endIndex);
```

**Buffer sharing for render data:**

```typescript
// Read directly from WASM linear memory
const quadBuffer = new Float32Array(
  engine.HEAPF32.buffer,
  engine.getTextQuadBuffer().ptr,
  engine.getTextQuadBuffer().floatCount
);
// Zero-copy: JS typed array views WASM memory
```

### 4.3. Atlas Management

**Atlas structure:**
- 2048x2048 RGBA texture (16MB)
- Each glyph slot: 64x64 pixels (configurable)
- ~1024 glyphs per atlas
- Multiple atlases if needed (bind different texture unit)

**Generation parameters (msdfgen):**
```cpp
msdfgen::FreetypeHandle* ft = msdfgen::initializeFreetype();
msdfgen::FontHandle* font = msdfgen::loadFont(ft, fontPath);

msdfgen::Shape shape;
msdfgen::loadGlyph(shape, font, codepoint);
shape.normalize();
msdfgen::edgeColoringSimple(shape, 3.0);

msdfgen::Bitmap<float, 3> msdf(64, 64);
msdfgen::generateMSDF(msdf, shape, 4.0, 1.0, {32.0, 32.0}); // range, scale, translate
```

### 4.4. Caret Position Calculation

```cpp
struct CaretPosition {
    float x, y;      // Top-left of caret
    float height;    // Caret height (line height)
    uint32_t lineIndex;
};

CaretPosition TextLayoutEngine::getCaretPosition(uint32_t textId, uint32_t charIndex) {
    const TextRec& text = store.get(textId);
    const LayoutResult& layout = layoutCache[textId];
    
    // Find which line contains charIndex
    uint32_t lineStart = 0;
    for (const auto& line : layout.lines) {
        if (charIndex <= lineStart + line.charCount) {
            // Found the line
            float xOffset = 0;
            for (uint32_t i = lineStart; i < charIndex; i++) {
                xOffset += layout.advances[i];
            }
            return {
                text.x + xOffset,
                text.y + line.baseline,
                layout.lineHeight,
                line.index
            };
        }
        lineStart += line.charCount;
    }
    // End of text
    return { text.x + layout.width, text.y + layout.height - layout.lineHeight, layout.lineHeight, layout.lines.size() - 1 };
}
```

### 4.5. Hit Testing

```cpp
uint32_t TextLayoutEngine::hitTest(uint32_t textId, float localX, float localY) {
    const LayoutResult& layout = layoutCache[textId];
    
    // Find line by Y coordinate
    uint32_t lineIndex = std::min(
        static_cast<uint32_t>(localY / layout.lineHeight),
        static_cast<uint32_t>(layout.lines.size() - 1)
    );
    
    const Line& line = layout.lines[lineIndex];
    
    // Binary search or linear scan through glyphs
    float x = 0;
    uint32_t charIndex = line.startChar;
    for (uint32_t i = line.startChar; i < line.startChar + line.charCount; i++) {
        float advance = layout.advances[i];
        if (x + advance / 2 > localX) {
            return i; // Click was on left half of glyph
        }
        x += advance;
        charIndex = i + 1;
    }
    return charIndex; // End of line
}
```

### 4.6. Word Wrapping Algorithm (FixedWidth)

```cpp
std::vector<Line> TextLayoutEngine::wrapText(
    const std::u32string& content,
    const std::vector<TextRun>& runs,
    float constraintWidth
) {
    std::vector<Line> lines;
    Line currentLine = { 0, 0, 0.0f };
    float currentWidth = 0;
    uint32_t lastBreakPoint = 0;
    float widthAtLastBreak = 0;
    
    for (uint32_t i = 0; i < content.size(); i++) {
        char32_t ch = content[i];
        float advance = getAdvance(i);
        
        // Track potential break points (spaces, hyphens)
        if (ch == U' ' || ch == U'-') {
            lastBreakPoint = i + 1;
            widthAtLastBreak = currentWidth + advance;
        }
        
        // Check for explicit newline
        if (ch == U'\n') {
            currentLine.charCount = i - currentLine.startChar;
            currentLine.width = currentWidth;
            lines.push_back(currentLine);
            currentLine = { i + 1, 0, 0.0f };
            currentWidth = 0;
            continue;
        }
        
        // Check for wrap
        if (currentWidth + advance > constraintWidth && currentLine.charCount > 0) {
            if (lastBreakPoint > currentLine.startChar) {
                // Wrap at last break point
                currentLine.charCount = lastBreakPoint - currentLine.startChar;
                currentLine.width = widthAtLastBreak;
                lines.push_back(currentLine);
                currentLine = { lastBreakPoint, 0, 0.0f };
                currentWidth = currentWidth - widthAtLastBreak;
            } else {
                // Force break mid-word
                currentLine.charCount = i - currentLine.startChar;
                currentLine.width = currentWidth;
                lines.push_back(currentLine);
                currentLine = { i, 0, 0.0f };
                currentWidth = 0;
            }
        }
        
        currentWidth += advance;
    }
    
    // Final line
    if (currentLine.startChar < content.size()) {
        currentLine.charCount = content.size() - currentLine.startChar;
        currentLine.width = currentWidth;
        lines.push_back(currentLine);
    }
    
    return lines;
}
```

### 4.7. Dirty Flag Strategy

```cpp
class TextStore {
    std::unordered_map<uint32_t, TextRec> texts;
    std::unordered_set<uint32_t> dirtyLayout;  // Need re-shaping
    std::unordered_set<uint32_t> dirtyRender;  // Need buffer rebuild
    
    void markDirty(uint32_t id, DirtyFlags flags) {
        if (flags & DirtyFlags::Layout) dirtyLayout.insert(id);
        if (flags & DirtyFlags::Render) dirtyRender.insert(id);
    }
    
    void processFrame() {
        // Only re-layout dirty texts
        for (uint32_t id : dirtyLayout) {
            layoutEngine.relayout(id);
            dirtyRender.insert(id); // Layout change requires render update
        }
        dirtyLayout.clear();
        
        // Only rebuild render buffers for dirty texts
        if (!dirtyRender.empty()) {
            rebuildRenderBuffers();
            dirtyRender.clear();
        }
    }
};
```

---

## 5. Rollback Strategy

Each PR is designed to be independently revertible:

| PR | Rollback Impact |
|----|-----------------|
| PR1 | Safe: Only adds types, no behavior change |
| PR2 | Safe: Layout engine not yet integrated |
| PR3 | Safe: Atlas not yet used |
| PR4 | Medium: Bridge changes affect JS, but old code still present |
| PR5 | Safe: New component, old overlay still works |
| PR6 | Safe: New render pass, can disable |
| PR7 | Medium: Tool integration, need to restore old flows |
| PR8 | High: Deletes legacy code, need to restore from git |

**Recommendation**: Keep PR8 (cleanup) as a separate branch until full QA passes.

---

## 6. Timeline Estimate

| Phase | PRs | Estimated Time | Dependencies |
|-------|-----|----------------|--------------|
| Foundation | PR1, PR2 | 3-4 days | None |
| Atlas | PR3 | 2-3 days | PR2 |
| Integration | PR4, PR5 | 3-4 days | PR3 (partial) |
| Rendering | PR6 | 2-3 days | PR3, PR4 |
| UX | PR7 | 3-4 days | PR4, PR5, PR6 |
| Cleanup | PR8 | 1-2 days | PR7 |

**Total**: ~15-20 working days

---

## 7. Open Questions (Assumptions Made)

1. **Font embedding**: Assuming fonts will be fetched at runtime, not embedded in WASM binary. If embedding is required, binary size will increase significantly.

2. **Bidi support**: Assuming LTR-only for initial release. RTL/bidi support can be added in Phase 2 with HarfBuzz's full bidi implementation.

3. **Rich text editing UI**: Assuming toolbar-based style changes (select text, click Bold). Inline formatting shortcuts (Ctrl+B) will work via TextInputProxy.

4. **Font fallback**: Assuming single font family per TextRec. System font fallback for missing glyphs is deferred.

5. **Maximum text length**: No hard limit assumed, but performance testing should establish practical limits.

---

## Appendix A: Data Structure Reference

```cpp
// From text_implementation.md (canonical)
struct TextRun {
    uint32_t startIndex;
    uint32_t length;
    uint32_t fontId;
    float fontSize;
    uint32_t colorRGBA;
    uint8_t flags; // Bold=1, Italic=2, Underline=4, Strike=8
};

struct TextRec {
    uint32_t id;
    uint32_t drawOrder;
    
    float x, y;
    float rotation;
    
    uint8_t boxMode;       // 0=AutoWidth, 1=FixedWidth
    float constraintWidth; // Used if boxMode=1
    
    // Layout output (engine-computed)
    float layoutWidth;
    float layoutHeight;
    float minX, minY, maxX, maxY; // AABB
    
    // Content pointers (into global buffers)
    uint32_t contentOffset;
    uint32_t contentLength;
    uint32_t runsOffset;
    uint32_t runsCount;
    
    uint8_t align; // 0=Left, 1=Center, 2=Right
};
```

## Appendix B: Command Protocol

```
UpsertText Command (Op = 14):
┌──────────────┬───────────┬────────────────────────────────────┐
│ Field        │ Type      │ Description                        │
├──────────────┼───────────┼────────────────────────────────────┤
│ id           │ u32       │ Entity ID                          │
│ x            │ f32       │ Position X                         │
│ y            │ f32       │ Position Y                         │
│ rotation     │ f32       │ Rotation in radians                │
│ boxMode      │ u8        │ 0=AutoWidth, 1=FixedWidth          │
│ align        │ u8        │ 0=Left, 1=Center, 2=Right          │
│ constraintW  │ f32       │ Width constraint (if boxMode=1)    │
│ runCount     │ u32       │ Number of runs                     │
│ contentLen   │ u32       │ UTF-8 byte length of content       │
│ runs[]       │ TextRun[] │ Array of runs (20 bytes each)      │
│ content      │ bytes     │ UTF-8 encoded text content         │
└──────────────┴───────────┴────────────────────────────────────┘
```
