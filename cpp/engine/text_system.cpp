#include "engine/text_system.h"
#include <cstring>
#include <cmath>
#include <algorithm>
#include <iostream>

namespace {
// Map logical index (grapheme/codepoint approximation) to UTF-8 byte offset.
std::uint32_t logicalToByteIndex(std::string_view content, std::uint32_t logicalIndex) {
    std::uint32_t bytePos = 0;
    std::uint32_t logicalCount = 0;
    const std::size_t n = content.size();
    while (bytePos < n && logicalCount < logicalIndex) {
        const unsigned char c = static_cast<unsigned char>(content[bytePos]);
        // Continuation bytes have top bits 10xxxxxx
        if ((c & 0xC0) != 0x80) {
            logicalCount++;
        }
        bytePos++;
    }
    return static_cast<std::uint32_t>(bytePos);
}

std::uint32_t byteToLogicalIndex(std::string_view content, std::uint32_t byteIndex) {
    std::uint32_t logicalCount = 0;
    const std::size_t n = content.size();
    const std::size_t limit = std::min<std::size_t>(n, byteIndex);
    for (std::size_t i = 0; i < limit; ++i) {
        const unsigned char c = static_cast<unsigned char>(content[i]);
        if ((c & 0xC0) != 0x80) {
            logicalCount++;
        }
    }
    return logicalCount;
}
}

TextSystem::TextSystem() 
{
}

void TextSystem::initialize() {
    if (initialized) return;
    
    // Initialize sub-systems
    if (!fontManager.initialize()) {
        // Handle error?
        return; 
    }
    
    layoutEngine.initialize(&fontManager, &store);
    
    if (!glyphAtlas.initialize(&fontManager)) {
        fontManager.shutdown();
        return;
    }

    initialized = true;
}

bool TextSystem::loadFont(std::uint32_t fontId, const void* data, std::size_t size) {
    return loadFontEx(fontId, data, size, false, false);
}

bool TextSystem::loadFontEx(std::uint32_t fontId, const void* data, std::size_t size, bool bold, bool italic) {
    if (!initialized) initialize();
    return fontManager.registerFont(fontId, static_cast<const std::uint8_t*>(data), size, "External", bold, italic);
}

bool TextSystem::upsertText(
    std::uint32_t id,
    const TextPayloadHeader& header,
    const TextRunPayload* runs,
    std::uint32_t runCount,
    const char* content,
    std::uint32_t contentLen
) {
    if (!initialized) initialize();
    
    if (!store.upsertText(id, header, runs, runCount, content, contentLen)) {
        return false;
    }
    
    // layoutEngine.layoutText(id); // Lazy: moved to ensureLayout
    quadsDirty = true;
    return true;
}

bool TextSystem::deleteText(std::uint32_t id) {
    if (!store.hasText(id)) return false;
    
    store.deleteText(id);
    layoutEngine.clearLayout(id);
    quadsDirty = true;
    return true;
}

bool TextSystem::insertContent(std::uint32_t textId, std::uint32_t insertIndex, const char* content, std::uint32_t byteLen) {
    if (!store.insertContent(textId, insertIndex, content, byteLen)) {
        return false;
    }
    // layoutEngine.layoutText(textId); // Lazy
    quadsDirty = true;
    return true;
}

bool TextSystem::deleteContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex) {
    if (!store.deleteContent(textId, startIndex, endIndex)) {
        return false;
    }
    // layoutEngine.layoutText(textId); // Lazy
    quadsDirty = true;
    return true;
}

bool TextSystem::setTextAlign(std::uint32_t textId, TextAlign align) {
    if (!initialized) return false;
    TextRec* rec = store.getTextMutable(textId);
    if (!rec) return false;
    
    if (rec->align == align) return true;
    
    rec->align = align;
    store.markDirty(textId); // Force layout to recompute offsets for new alignment
    // layoutEngine.layoutText(textId); // Lazy
    quadsDirty = true;
    return true;
}

TextHitResult TextSystem::hitTest(std::uint32_t textId, float localX, float localY) const {
    if (!initialized) return TextHitResult{0, 0, true};
    // hitTest internally calls ensureLayout now
    return layoutEngine.hitTest(textId, localX, localY);
}

TextCaretPosition TextSystem::getCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return TextCaretPosition{0.0f, 0.0f, 0.0f, 0};
    return layoutEngine.getCaretPosition(textId, charIndex);
}

bool TextSystem::getBounds(std::uint32_t textId, float& minX, float& minY, float& maxX, float& maxY) {
    // Ensure layout is up-to-date
    // Ensure layout is up-to-date for this text
    layoutEngine.ensureLayout(textId);
    
    const TextRec*text = store.getText(textId);
    if (!text) return false;
    
    minX = text->minX;
    minY = text->minY;
    maxX = text->maxX;
    maxY = text->maxY;
    return true;
}

void TextSystem::rebuildQuadBuffer(const std::function<bool(std::uint32_t)>& isVisible) {
    const auto textIds = store.getAllTextIds();
    rebuildQuadBuffer(isVisible, textIds);
}

void TextSystem::rebuildQuadBuffer(const std::function<bool(std::uint32_t)>& isVisible, const std::vector<std::uint32_t>& drawOrder) {
    if (!initialized) {
        if (!quadBuffer.empty()) quadBuffer.clear();
        return;
    }
    
    // Ensure all dirty text layouts are updated
    std::size_t laidOutCount = layoutEngine.layoutDirtyTexts();
    
    // If nothing changed in layout, atlas, or explicit dirty flag, skip rebuilding
    if (laidOutCount == 0 && !glyphAtlas.isDirty() && !quadsDirty) {
        return;
    }

    quadBuffer.clear();
    quadsDirty = false;
    
    // Capture initial atlas version to detect resets
    std::uint32_t initialAtlasVersion = glyphAtlas.getVersion();
    
    // We might need to restart if atlas resets
    bool restart = false;
    
    do {
        if (restart) {
            quadBuffer.clear();
            initialAtlasVersion = glyphAtlas.getVersion();
            restart = false;
        }

        // For each text entity, generate quads for its glyphs
        for (std::uint32_t textId : drawOrder) {
            if (isVisible && !isVisible(textId)) {
                continue;
            }
            if (restart) break; // Break inner loop to restart outer loop

            const TextRec* text = store.getText(textId);
            if (!text) continue;
            
            // Ensure layout if somehow missed (though layoutDirtyTexts above covers most)
            // But layoutDirtyTexts relies on consuming dirty IDs. ensureLayout is safer if mixed.
            layoutEngine.ensureLayout(textId);

            const auto* layout = layoutEngine.getLayout(textId);
            if (!layout) continue;
            

        
        // Get the runs for color info
        const auto& runs = store.getRuns(textId);
        
        const float baseX = text->x;
        const float baseY = text->y;
        constexpr float z = 0.0f; // Text at z=0 for now
        
        // Track Y offset for lines (Y grows upward in this coordinate system)
        // First line starts at baseY, subsequent lines go DOWN (decreasing Y)
        float yOffset = 0.0f;
        
        // Process each line
        for (const auto& line : layout->lines) {
            // Baseline is at yOffset - line.ascent (ascent goes UP from baseline)
            // For Y-up: baseline is below the top of the line
            const float baseline = yOffset - line.ascent;
            
            // Accumulated pen position for glyph X (horizontal advance)
            float penX = line.xOffset;
            
            // Process glyphs in this line using the index range
            for (std::uint32_t gi = line.startGlyph; gi < line.startGlyph + line.glyphCount; ++gi) {
                if (gi >= layout->glyphs.size()) break;
                const auto& glyph = layout->glyphs[gi];
                
                // Get atlas entry for this glyph
                // Note: We need to know the fontId for the glyph, which requires looking up the run
                std::uint32_t fontId = 0;
                float fontSize = 16.0f;
                float r = 0.0f, g = 0.0f, b = 0.0f, a = 1.0f;
                TextStyleFlags styleFlags = TextStyleFlags::None;
                
                // Find the run this glyph belongs to for font and color
                for (const auto& run : runs) {
                    if (glyph.clusterIndex >= run.startIndex && glyph.clusterIndex < run.startIndex + run.length) {
                        fontId = run.fontId;
                        fontSize = run.fontSize;
                        styleFlags = run.flags;
                        // Extract color from RGBA packed value
                        std::uint32_t rgba = run.colorRGBA;
                        r = static_cast<float>((rgba >> 24) & 0xFF) / 255.0f;
                        g = static_cast<float>((rgba >> 16) & 0xFF) / 255.0f;
                        b = static_cast<float>((rgba >> 8) & 0xFF) / 255.0f;
                        a = static_cast<float>(rgba & 0xFF) / 255.0f;
                        break;
                    }
                }
                
                const auto* atlasEntry = glyphAtlas.getGlyph(fontId, glyph.glyphId, styleFlags);
                
                // version check
                if (glyphAtlas.getVersion() != initialAtlasVersion) {
                    restart = true;
                    break;
                }

                if (!atlasEntry || atlasEntry->width == 0.0f || atlasEntry->height == 0.0f) {
                    // Still advance penX for whitespace/missing glyphs
                    // We might still need to render decorations (underline/strike) for spaces!
                    if (hasFlag(styleFlags, TextStyleFlags::Underline) || hasFlag(styleFlags, TextStyleFlags::Strike)) {
                        // handled below
                    } else {
                        // Skip quad generation for whitespace if no decoration
                        // But MUST advance penX regardless
                    }
                }
                
                if (atlasEntry && atlasEntry->width > 0.0f && atlasEntry->height > 0.0f) {
                    // Use actual scale for glyph bitmap sizing
                    const float scale = fontSize / atlasEntry->fontSize;
                    // Note: engine.cpp used fontSize directly if atlasEntry sizes are normalized?
                    // engine.cpp: const float glyphX = baseX + (penX + glyph.xOffset) + atlasEntry->bearingX * fontSize;
                    // engine.cpp: const float glyphW = atlasEntry->width * fontSize;
                    // This assumes atlasEntry->width is in Ems or similar?
                    // Let's assume engine.cpp logic is correct.
                    
                    const float glyphX = baseX + (penX + glyph.xOffset) + atlasEntry->bearingX * fontSize;
                    const float glyphY = baseY + baseline + glyph.yOffset + (atlasEntry->bearingY - atlasEntry->height) * fontSize;
                    const float glyphW = atlasEntry->width * fontSize;
                    const float glyphH = atlasEntry->height * fontSize;
                    
                    const float u0 = atlasEntry->u0;
                    const float v0 = atlasEntry->v0;
                    const float u1 = atlasEntry->u1;
                    const float v1 = atlasEntry->v1;

                    // Triangle 1: (X, Y), (X+W, Y), (X+W, Y+H) -> BL, BR, TR
                    quadBuffer.push_back(glyphX);          quadBuffer.push_back(glyphY);          quadBuffer.push_back(z);
                    quadBuffer.push_back(u0);              quadBuffer.push_back(v1);              // BL -> Bottom UV
                    quadBuffer.push_back(r);               quadBuffer.push_back(g);               quadBuffer.push_back(b);               quadBuffer.push_back(a);
                    
                    quadBuffer.push_back(glyphX + glyphW); quadBuffer.push_back(glyphY);          quadBuffer.push_back(z);
                    quadBuffer.push_back(u1);              quadBuffer.push_back(v1);              // BR -> Bottom UV
                    quadBuffer.push_back(r);               quadBuffer.push_back(g);               quadBuffer.push_back(b);               quadBuffer.push_back(a);
                    
                    quadBuffer.push_back(glyphX + glyphW); quadBuffer.push_back(glyphY + glyphH); quadBuffer.push_back(z);
                    quadBuffer.push_back(u1);              quadBuffer.push_back(v0);              // TR -> Top UV
                    quadBuffer.push_back(r);               quadBuffer.push_back(g);               quadBuffer.push_back(b);               quadBuffer.push_back(a);
                    
                    // Triangle 2: (X, Y), (X+W, Y+H), (X, Y+H) -> BL, TR, TL
                    quadBuffer.push_back(glyphX);          quadBuffer.push_back(glyphY);          quadBuffer.push_back(z);
                    quadBuffer.push_back(u0);              quadBuffer.push_back(v1);              // BL -> Bottom UV
                    quadBuffer.push_back(r);               quadBuffer.push_back(g);               quadBuffer.push_back(b);               quadBuffer.push_back(a);
                    
                    quadBuffer.push_back(glyphX + glyphW); quadBuffer.push_back(glyphY + glyphH); quadBuffer.push_back(z);
                    quadBuffer.push_back(u1);              quadBuffer.push_back(v0);              // TR -> Top UV
                    quadBuffer.push_back(r);               quadBuffer.push_back(g);               quadBuffer.push_back(b);               quadBuffer.push_back(a);

                    quadBuffer.push_back(glyphX);          quadBuffer.push_back(glyphY + glyphH); quadBuffer.push_back(z);
                    quadBuffer.push_back(u0);              quadBuffer.push_back(v0);              // TL -> Top UV
                    quadBuffer.push_back(r);               quadBuffer.push_back(g);               quadBuffer.push_back(b);               quadBuffer.push_back(a);
                }
                
                // --- DECORATION RENDERING (Underline / Strikethrough) ---
                if (hasFlag(styleFlags, TextStyleFlags::Underline) || hasFlag(styleFlags, TextStyleFlags::Strike)) {
                    const auto& whiteRect = glyphAtlas.getWhitePixelRect();
                    const float whiteU = (whiteRect.x + 0.5f) / static_cast<float>(glyphAtlas.getWidth());
                    const float whiteV = (whiteRect.y + 0.5f) / static_cast<float>(glyphAtlas.getHeight());
                    
                    const float decStartX = baseX + penX;
                    // Extend slightly (0.5px) to ensure overlap and continuous line, avoiding subpixel gaps
                    const float decWidth = glyph.xAdvance + 0.5f; 
                    
                    auto drawLine = [&](float localY, float thickness) {
                        const float x0 = decStartX;
                        const float x1 = decStartX + decWidth;
                        // Correction: baseline already includes yOffset. Do NOT add yOffset again!
                        const float y0 = baseY + baseline + localY;
                        const float y1 = y0 + thickness;
                        
                        // BL
                        quadBuffer.push_back(x0); quadBuffer.push_back(y0); quadBuffer.push_back(z);
                        quadBuffer.push_back(whiteU); quadBuffer.push_back(whiteV);
                        quadBuffer.push_back(r); quadBuffer.push_back(g); quadBuffer.push_back(b); quadBuffer.push_back(a);
                        // BR
                        quadBuffer.push_back(x1); quadBuffer.push_back(y0); quadBuffer.push_back(z);
                        quadBuffer.push_back(whiteU); quadBuffer.push_back(whiteV);
                        quadBuffer.push_back(r); quadBuffer.push_back(g); quadBuffer.push_back(b); quadBuffer.push_back(a);
                        // TR
                        quadBuffer.push_back(x1); quadBuffer.push_back(y1); quadBuffer.push_back(z);
                        quadBuffer.push_back(whiteU); quadBuffer.push_back(whiteV);
                        quadBuffer.push_back(r); quadBuffer.push_back(g); quadBuffer.push_back(b); quadBuffer.push_back(a);
                        
                        // BL
                        quadBuffer.push_back(x0); quadBuffer.push_back(y0); quadBuffer.push_back(z);
                        quadBuffer.push_back(whiteU); quadBuffer.push_back(whiteV);
                        quadBuffer.push_back(r); quadBuffer.push_back(g); quadBuffer.push_back(b); quadBuffer.push_back(a);
                        // TR
                        quadBuffer.push_back(x1); quadBuffer.push_back(y1); quadBuffer.push_back(z);
                        quadBuffer.push_back(whiteU); quadBuffer.push_back(whiteV);
                        quadBuffer.push_back(r); quadBuffer.push_back(g); quadBuffer.push_back(b); quadBuffer.push_back(a);
                        // TL
                        quadBuffer.push_back(x0); quadBuffer.push_back(y1); quadBuffer.push_back(z);
                        quadBuffer.push_back(whiteU); quadBuffer.push_back(whiteV);
                        quadBuffer.push_back(r); quadBuffer.push_back(g); quadBuffer.push_back(b); quadBuffer.push_back(a);
                    };
                    
                    if (hasFlag(styleFlags, TextStyleFlags::Underline)) {
                        drawLine(-fontSize * 0.15f, fontSize * 0.06f);
                    }
                    if (hasFlag(styleFlags, TextStyleFlags::Strike)) {
                        drawLine(fontSize * 0.3f, fontSize * 0.06f);
                    }
                }
                
                // Advance pen position by glyph advance
                penX += glyph.xAdvance;
            }
            
            // Move yOffset to next line (decreasing Y for Y-up system)
            yOffset -= line.lineHeight;
        }
    }
    } while (restart);
}

bool TextSystem::isAtlasDirty() const {
    if (!initialized) return false;
    return glyphAtlas.isDirty();
}

void TextSystem::clearAtlasDirty() {
    if (initialized) glyphAtlas.clearDirty();
}

void TextSystem::clear() {
    store.clear();
    layoutEngine.clearAllLayouts();
    if (initialized) {
        glyphAtlas.clearAtlas();
    }
    quadBuffer.clear();
    quadsDirty = true;
}

std::uint32_t TextSystem::getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return 0;
    return layoutEngine.getVisualPrevCharIndex(textId, charIndex);
}

std::uint32_t TextSystem::getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return charIndex;
    return layoutEngine.getVisualNextCharIndex(textId, charIndex);
}

std::uint32_t TextSystem::getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return 0;
    return layoutEngine.getWordLeftIndex(textId, charIndex);
}

std::uint32_t TextSystem::getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return charIndex;
    return layoutEngine.getWordRightIndex(textId, charIndex);
}

std::uint32_t TextSystem::getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return 0;
    return layoutEngine.getLineStartIndex(textId, charIndex);
}

std::uint32_t TextSystem::getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return charIndex;
    return layoutEngine.getLineEndIndex(textId, charIndex);
}

std::uint32_t TextSystem::getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return charIndex;
    return layoutEngine.getLineUpIndex(textId, charIndex);
}

std::uint32_t TextSystem::getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!initialized) return charIndex;
    return layoutEngine.getLineDownIndex(textId, charIndex);
}

// ... applyTextStyle implementation ...
bool TextSystem::applyTextStyle(const engine::text::ApplyTextStylePayload& payload, const std::uint8_t* params, std::uint32_t paramsLen) {
    if (!store.hasText(payload.textId)) return false;

    // Parse style parameters (TLV)
    float newFontSize = 0.0f;
    std::uint32_t newFontId = 0;
    bool hasFontSize = false;
    bool hasFontId = false;

    if (params && paramsLen > 0) {
        const std::uint8_t* ptr = params;
        const std::uint8_t* end = params + paramsLen;
        while (ptr < end) {
            std::uint8_t tag = *ptr++;
            switch (tag) {
                case engine::text::textStyleTagFontSize:
                    if (ptr + sizeof(float) <= end) {
                        float val;
                        std::memcpy(&val, ptr, sizeof(float));
                        if (val > 4.0f && val < 1000.0f) {
                            newFontSize = val;
                            hasFontSize = true;
                        }
                        ptr += sizeof(float);
                    }
                    break;
                case engine::text::textStyleTagFontId:
                     if (ptr + sizeof(std::uint32_t) <= end) {
                        std::uint32_t val;
                        std::memcpy(&val, ptr, sizeof(std::uint32_t));
                        newFontId = val;
                        hasFontId = true;
                        ptr += sizeof(std::uint32_t);
                     }
                     break;
                default:
                    // Stop on unknown tag to avoid desync
                    ptr = end; 
                    break;
            }
        }
    }

    // Fetch content and runs
    const std::string_view content = store.getContent(payload.textId);
    const auto& runs = store.getRuns(payload.textId);
    if (runs.empty()) {
        return true; 
    }

    // Map logical indices
    std::uint32_t startLogical = payload.rangeStartLogical;
    std::uint32_t endLogical = payload.rangeEndLogical;
    if (startLogical > endLogical) std::swap(startLogical, endLogical);
    
    const std::uint32_t byteStart = logicalToByteIndex(content, startLogical);
    const std::uint32_t byteEnd = logicalToByteIndex(content, endLogical);

    if (byteStart > byteEnd) return true;

    const std::uint8_t mask = payload.flagsMask;
    const std::uint8_t value = static_cast<std::uint8_t>(payload.flagsValue & mask);

    auto applyFlagDelta = [&](TextStyleFlags current) -> TextStyleFlags {
        std::uint8_t f = static_cast<std::uint8_t>(current);
        switch (payload.mode) {
            case 0: // set
                f = static_cast<std::uint8_t>((f & ~mask) | value);
                break;
            case 1: // clear
                f = static_cast<std::uint8_t>(f & ~mask);
                break;
            case 2: // toggle
                f = static_cast<std::uint8_t>(f ^ mask);
                break;
        }
        return static_cast<TextStyleFlags>(f);
    };

    auto applyStyle = [&](TextRun& run) {
        run.flags = applyFlagDelta(run.flags);
        if (hasFontSize) run.fontSize = newFontSize;
        if (hasFontId) run.fontId = newFontId;
    };

    auto applyAndSave = [&](std::vector<TextRun>&& newRuns) -> bool {
        if (!store.setRuns(payload.textId, std::move(newRuns))) return false;
        
        // Force re-layout to update bounds
        layoutEngine.layoutText(payload.textId);
        
        quadsDirty = true;
        return true;
    };

    // Caret-only logic (Collapsed selection)
    if (byteStart == byteEnd) {
        std::vector<TextRun> newRuns = runs;
        
        // Look for existing 0-length run at byteStart
        for (auto& run : newRuns) {
            if (run.startIndex == byteStart && run.length == 0) {
                applyStyle(run);
                return applyAndSave(std::move(newRuns));
            }
        }
        
        // No existing 0-length run, create one.
        TextRun newRun{};
        newRun.startIndex = byteStart;
        newRun.length = 0;
        
        bool inserted = false;
        // Search for insertion point
        for (size_t i = 0; i < newRuns.size(); ++i) {
            const auto& r = newRuns[i];
            
            // If we are strictly IN this run (start < caret < end)
            if (byteStart > r.startIndex && byteStart < r.startIndex + r.length) {
                // If we want to support "Typing with Bold in the middle of a word",
                // we technically need to SPLIT the word run into [0,5) and [5,10), and insert [5,0) in between.
                
                TextRun firstHalf = r;
                firstHalf.length = byteStart - r.startIndex;
                
                TextRun secondHalf = r;
                secondHalf.startIndex = byteStart;
                secondHalf.length = r.length - firstHalf.length;
                
                newRun = r; // Inherit style
                newRun.startIndex = byteStart;
                newRun.length = 0;
                applyStyle(newRun);
                
                // Replace i with firstHalf, newRun, secondHalf
                newRuns[i] = firstHalf;
                newRuns.insert(newRuns.begin() + i + 1, {newRun, secondHalf});
                inserted = true;
                break;
            }
            // If caret is at START of run
            else if (r.startIndex == byteStart) {
                 // Insert before this run
                 newRun = r; // Inherit style
                 newRun.startIndex = byteStart;
                 newRun.length = 0;
                 applyStyle(newRun);
                 
                 newRuns.insert(newRuns.begin() + i, newRun);
                 inserted = true;
                 break;
            }
        }
        
        if (!inserted) {
            // Append at end
            // Inherit from last run if possible
            if (!runs.empty()) {
                newRun = runs.back();
            }
            newRun.startIndex = byteStart;
            newRun.length = 0;
            applyStyle(newRun);
            newRuns.push_back(newRun);
        }
        
        return applyAndSave(std::move(newRuns));
    }
    
    // Range logic
    std::vector<TextRun> newRuns;
    newRuns.reserve(runs.size() * 2);
    
    size_t currentByte = 0;
    size_t runIdx = 0;
    
    while (runIdx < runs.size()) {
        TextRun r = runs[runIdx];
        
        if (r.startIndex > currentByte) {
            currentByte = r.startIndex;
        }
        
        std::uint32_t runEnd = r.startIndex + r.length;
        std::uint32_t selStart = std::max(r.startIndex, byteStart);
        std::uint32_t selEnd = std::min(runEnd, byteEnd);
        
        if (selStart < selEnd) {
            // Run is touched by selection
            
            // 1. Pre-selection part
            if (r.startIndex < selStart) {
                TextRun pre = r;
                pre.length = selStart - r.startIndex;
                newRuns.push_back(pre);
            }
            
            // 2. Selected part
            TextRun sel = r;
            sel.startIndex = selStart;
            sel.length = selEnd - selStart;
            applyStyle(sel);
            newRuns.push_back(sel);
            
            // 3. Post-selection part
            if (runEnd > selEnd) {
                TextRun post = r;
                post.startIndex = selEnd;
                post.length = runEnd - selEnd;
                 newRuns.push_back(post);
            }
        } else {
            // No intersection, just copy
            newRuns.push_back(r);
        }
        
        runIdx++;
    }
    
    return applyAndSave(std::move(newRuns));
}
