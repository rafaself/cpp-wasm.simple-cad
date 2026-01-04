#include "engine/text_system.h"
#include "engine/core/string_utils.h"
#include <cstring>
#include <cmath>
#include <algorithm>
#include <iostream>

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
    quadCache.erase(id);
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

bool TextSystem::replaceContent(
    std::uint32_t textId,
    std::uint32_t startIndex,
    std::uint32_t endIndex,
    const char* content,
    std::uint32_t byteLen
) {
    if (startIndex > endIndex) std::swap(startIndex, endIndex);
    if (!store.deleteContent(textId, startIndex, endIndex)) {
        return false;
    }
    if (!store.insertContent(textId, startIndex, content, byteLen)) {
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

namespace {
struct RunStyle {
    std::uint32_t start;
    std::uint32_t end;
    std::uint32_t fontId;
    float fontSize;
    TextStyleFlags flags;
    float r;
    float g;
    float b;
    float a;
};

std::vector<RunStyle> buildRunStyles(const std::vector<TextRun>& runs) {
    std::vector<RunStyle> styles;
    styles.reserve(runs.size());
    for (const auto& run : runs) {
        if (run.length == 0) {
            continue;
        }
        RunStyle style{};
        style.start = run.startIndex;
        style.end = run.startIndex + run.length;
        style.fontId = run.fontId;
        style.fontSize = run.fontSize;
        style.flags = run.flags;
        const std::uint32_t rgba = run.colorRGBA;
        style.r = static_cast<float>((rgba >> 24) & 0xFF) / 255.0f;
        style.g = static_cast<float>((rgba >> 16) & 0xFF) / 255.0f;
        style.b = static_cast<float>((rgba >> 8) & 0xFF) / 255.0f;
        style.a = static_cast<float>(rgba & 0xFF) / 255.0f;
        styles.push_back(style);
    }
    return styles;
}

const RunStyle* resolveRunStyle(
    const std::vector<RunStyle>& styles,
    std::size_t& cursor,
    std::uint32_t clusterIndex
) {
    if (styles.empty()) {
        return nullptr;
    }
    if (cursor >= styles.size()) {
        cursor = styles.size() - 1;
    }
    const RunStyle* current = &styles[cursor];
    if (clusterIndex >= current->start && clusterIndex < current->end) {
        return current;
    }
    if (clusterIndex >= current->end) {
        while (cursor + 1 < styles.size() && clusterIndex >= styles[cursor].end) {
            cursor++;
        }
        current = &styles[cursor];
        if (clusterIndex >= current->start && clusterIndex < current->end) {
            return current;
        }
    }

    auto it = std::upper_bound(
        styles.begin(),
        styles.end(),
        clusterIndex,
        [](std::uint32_t value, const RunStyle& style) { return value < style.start; }
    );
    if (it == styles.begin()) {
        return nullptr;
    }
    --it;
    if (clusterIndex >= it->start && clusterIndex < it->end) {
        cursor = static_cast<std::size_t>(it - styles.begin());
        return &(*it);
    }
    return nullptr;
}

void appendGlyphQuad(
    std::vector<float>& buffer,
    float x,
    float y,
    float z,
    float w,
    float h,
    float u0,
    float v0,
    float u1,
    float v1,
    float r,
    float g,
    float b,
    float a
) {
    buffer.push_back(x);         buffer.push_back(y);         buffer.push_back(z);
    buffer.push_back(u0);        buffer.push_back(v1);
    buffer.push_back(r);         buffer.push_back(g);         buffer.push_back(b);         buffer.push_back(a);

    buffer.push_back(x + w);     buffer.push_back(y);         buffer.push_back(z);
    buffer.push_back(u1);        buffer.push_back(v1);
    buffer.push_back(r);         buffer.push_back(g);         buffer.push_back(b);         buffer.push_back(a);

    buffer.push_back(x + w);     buffer.push_back(y + h);     buffer.push_back(z);
    buffer.push_back(u1);        buffer.push_back(v0);
    buffer.push_back(r);         buffer.push_back(g);         buffer.push_back(b);         buffer.push_back(a);

    buffer.push_back(x);         buffer.push_back(y);         buffer.push_back(z);
    buffer.push_back(u0);        buffer.push_back(v1);
    buffer.push_back(r);         buffer.push_back(g);         buffer.push_back(b);         buffer.push_back(a);

    buffer.push_back(x + w);     buffer.push_back(y + h);     buffer.push_back(z);
    buffer.push_back(u1);        buffer.push_back(v0);
    buffer.push_back(r);         buffer.push_back(g);         buffer.push_back(b);         buffer.push_back(a);

    buffer.push_back(x);         buffer.push_back(y + h);     buffer.push_back(z);
    buffer.push_back(u0);        buffer.push_back(v0);
    buffer.push_back(r);         buffer.push_back(g);         buffer.push_back(b);         buffer.push_back(a);
}

void appendSolidQuad(
    std::vector<float>& buffer,
    float x0,
    float y0,
    float x1,
    float y1,
    float z,
    float u,
    float v,
    float r,
    float g,
    float b,
    float a
) {
    buffer.push_back(x0); buffer.push_back(y0); buffer.push_back(z);
    buffer.push_back(u);  buffer.push_back(v);
    buffer.push_back(r);  buffer.push_back(g);  buffer.push_back(b);  buffer.push_back(a);

    buffer.push_back(x1); buffer.push_back(y0); buffer.push_back(z);
    buffer.push_back(u);  buffer.push_back(v);
    buffer.push_back(r);  buffer.push_back(g);  buffer.push_back(b);  buffer.push_back(a);

    buffer.push_back(x1); buffer.push_back(y1); buffer.push_back(z);
    buffer.push_back(u);  buffer.push_back(v);
    buffer.push_back(r);  buffer.push_back(g);  buffer.push_back(b);  buffer.push_back(a);

    buffer.push_back(x0); buffer.push_back(y0); buffer.push_back(z);
    buffer.push_back(u);  buffer.push_back(v);
    buffer.push_back(r);  buffer.push_back(g);  buffer.push_back(b);  buffer.push_back(a);

    buffer.push_back(x1); buffer.push_back(y1); buffer.push_back(z);
    buffer.push_back(u);  buffer.push_back(v);
    buffer.push_back(r);  buffer.push_back(g);  buffer.push_back(b);  buffer.push_back(a);

    buffer.push_back(x0); buffer.push_back(y1); buffer.push_back(z);
    buffer.push_back(u);  buffer.push_back(v);
    buffer.push_back(r);  buffer.push_back(g);  buffer.push_back(b);  buffer.push_back(a);
}

bool buildTextQuads(
    engine::text::GlyphAtlas& glyphAtlas,
    const engine::text::TextLayout& layout,
    const TextRec& text,
    const std::vector<RunStyle>& runStyles,
    std::vector<float>& out,
    std::uint32_t expectedAtlasResetVersion,
    bool& restartRequested
) {
    if (runStyles.empty() || layout.lines.empty()) {
        return true;
    }

    const auto& whiteRect = glyphAtlas.getWhitePixelRect();
    const float whiteU = (whiteRect.x + 0.5f) / static_cast<float>(glyphAtlas.getWidth());
    const float whiteV = (whiteRect.y + 0.5f) / static_cast<float>(glyphAtlas.getHeight());

    const float baseX = text.x;
    const float baseY = text.y;
    constexpr float z = 0.0f;

    std::size_t runCursor = 0;
    float yOffset = 0.0f;

    for (const auto& line : layout.lines) {
        const float baseline = yOffset - line.ascent;
        float penX = line.xOffset;

        for (std::uint32_t gi = line.startGlyph; gi < line.startGlyph + line.glyphCount; ++gi) {
            if (gi >= layout.glyphs.size()) break;
            const auto& glyph = layout.glyphs[gi];

            const RunStyle* style = resolveRunStyle(runStyles, runCursor, glyph.clusterIndex);
            if (!style) {
                penX += glyph.xAdvance;
                continue;
            }

            const auto* atlasEntry = glyphAtlas.getGlyph(style->fontId, glyph.glyphId, style->flags);

            if (glyphAtlas.getResetVersion() != expectedAtlasResetVersion) {
                restartRequested = true;
                return false;
            }

            if (atlasEntry && atlasEntry->width > 0.0f && atlasEntry->height > 0.0f) {
                const float glyphX = baseX + (penX + glyph.xOffset) + atlasEntry->bearingX * style->fontSize;
                const float glyphY = baseY + baseline + glyph.yOffset +
                    (atlasEntry->bearingY - atlasEntry->height) * style->fontSize;
                const float glyphW = atlasEntry->width * style->fontSize;
                const float glyphH = atlasEntry->height * style->fontSize;

                appendGlyphQuad(
                    out,
                    glyphX,
                    glyphY,
                    z,
                    glyphW,
                    glyphH,
                    atlasEntry->u0,
                    atlasEntry->v0,
                    atlasEntry->u1,
                    atlasEntry->v1,
                    style->r,
                    style->g,
                    style->b,
                    style->a
                );
            }

            if (hasFlag(style->flags, TextStyleFlags::Underline) || hasFlag(style->flags, TextStyleFlags::Strike)) {
                const float decStartX = baseX + penX;
                const float decWidth = glyph.xAdvance + 0.5f;

                auto drawLine = [&](float localY, float thickness) {
                    const float x0 = decStartX;
                    const float x1 = decStartX + decWidth;
                    const float y0 = baseY + baseline + localY;
                    const float y1 = y0 + thickness;

                    appendSolidQuad(out, x0, y0, x1, y1, z, whiteU, whiteV, style->r, style->g, style->b, style->a);
                };

                if (hasFlag(style->flags, TextStyleFlags::Underline)) {
                    drawLine(-style->fontSize * 0.15f, style->fontSize * 0.06f);
                }
                if (hasFlag(style->flags, TextStyleFlags::Strike)) {
                    drawLine(style->fontSize * 0.3f, style->fontSize * 0.06f);
                }
            }

            penX += glyph.xAdvance;
        }

        yOffset -= line.lineHeight;
    }

    return true;
}
} // namespace

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
    const auto dirtyIds = layoutEngine.layoutDirtyTexts();
    const bool atlasReset = glyphAtlas.getResetVersion() != quadCacheAtlasResetVersion;
    
    // If nothing changed in layout or explicit dirty flag, skip rebuilding
    if (!atlasReset && dirtyIds.empty() && !quadsDirty) {
        return;
    }

    const bool forceFullRebuild = atlasReset || quadCache.empty() || (quadsDirty && dirtyIds.empty());
    std::vector<std::uint32_t> rebuildIds;
    if (forceFullRebuild) {
        quadCache.clear();
        quadCacheAtlasResetVersion = glyphAtlas.getResetVersion();
        rebuildIds = store.getAllTextIds();
    } else {
        rebuildIds = dirtyIds;
    }

    bool restart = false;
    do {
        if (restart) {
            quadCache.clear();
            quadCacheAtlasResetVersion = glyphAtlas.getResetVersion();
            rebuildIds = store.getAllTextIds();
            restart = false;
        }

        for (std::uint32_t textId : rebuildIds) {
            const TextRec* text = store.getText(textId);
            if (!text) {
                quadCache.erase(textId);
                continue;
            }

            layoutEngine.ensureLayout(textId);
            const auto* layout = layoutEngine.getLayout(textId);
            if (!layout) {
                quadCache.erase(textId);
                continue;
            }

            const auto& runs = store.getRuns(textId);
            const auto runStyles = buildRunStyles(runs);

            auto& entry = quadCache[textId];
            entry.quads.clear();
            if (!runStyles.empty() && !layout->glyphs.empty()) {
                entry.quads.reserve(layout->glyphs.size() * 54);
                if (!buildTextQuads(
                        glyphAtlas,
                        *layout,
                        *text,
                        runStyles,
                        entry.quads,
                        quadCacheAtlasResetVersion,
                        restart
                    )) {
                    if (restart) break;
                }
            }
        }
    } while (restart);

    quadBuffer.clear();
    for (std::uint32_t textId : drawOrder) {
        if (isVisible && !isVisible(textId)) {
            continue;
        }
        auto it = quadCache.find(textId);
        if (it == quadCache.end() || it->second.quads.empty()) {
            continue;
        }
        const auto& quads = it->second.quads;
        quadBuffer.insert(quadBuffer.end(), quads.begin(), quads.end());
    }

    quadsDirty = false;
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
    quadCache.clear();
    quadCacheAtlasResetVersion = 0;
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
    
    const std::uint32_t byteStart = engine::logicalToByteIndex(content, startLogical);
    const std::uint32_t byteEnd = engine::logicalToByteIndex(content, endLogical);

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
