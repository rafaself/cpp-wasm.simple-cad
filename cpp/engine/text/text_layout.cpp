#include "engine/text/text_layout.h"

#include <hb.h>
#include <hb-ft.h>

#include <algorithm>
#include <cmath>
#include <cstring>

namespace engine::text {

TextLayoutEngine::TextLayoutEngine() = default;

TextLayoutEngine::~TextLayoutEngine() {
    if (hbBuffer_) {
        hb_buffer_destroy(hbBuffer_);
        hbBuffer_ = nullptr;
    }
}

void TextLayoutEngine::initialize(FontManager* fontManager, TextStore* textStore) {
    fontManager_ = fontManager;
    textStore_ = textStore;
    
    // Create reusable HarfBuzz buffer
    if (!hbBuffer_) {
        hbBuffer_ = hb_buffer_create();
    }
}

bool TextLayoutEngine::layoutText(std::uint32_t textId) {
    if (!isInitialized()) {
        return false;
    }
    
    const TextRec* textRec = textStore_->getText(textId);
    if (!textRec) {
        return false;
    }
    
    std::string_view content = textStore_->getContent(textId);
    const std::vector<TextRun>& runs = textStore_->getRuns(textId);
    
    // Create or get layout entry
    TextLayout& layout = layoutCache_[textId];
    layout.glyphs.clear();
    layout.lines.clear();
    layout.dirty = false;
    
    // Handle empty content
    if (content.empty() || runs.empty()) {
        // Even empty text has metrics
        float fontSize = runs.empty() ? 16.0f : runs[0].fontSize;
        FontMetrics metrics = fontManager_->getScaledMetrics(
            runs.empty() ? 0 : runs[0].fontId,
            fontSize
        );
        
        layout.totalWidth = 0.0f;
        layout.totalHeight = metrics.ascender - metrics.descender + metrics.lineGap;
        layout.baselineY = metrics.ascender;
        
        // Add empty line for caret positioning
        LayoutLine emptyLine{};
        emptyLine.startGlyph = 0;
        emptyLine.glyphCount = 0;
        emptyLine.startByte = 0;
        emptyLine.byteCount = 0;
        emptyLine.width = 0.0f;
        emptyLine.ascent = metrics.ascender;
        emptyLine.descent = -metrics.descender;
        emptyLine.lineHeight = layout.totalHeight;
        layout.lines.push_back(emptyLine);
        
        // Update TextStore with layout results
        textStore_->setLayoutResult(
            textId,
            layout.totalWidth,
            layout.totalHeight,
            textRec->x,
            textRec->y,
            textRec->x + layout.totalWidth,
            textRec->y + layout.totalHeight
        );
        
        return true;
    }
    
    // Shape each run
    for (const TextRun& run : runs) {
        // Extract the substring for this run
        std::uint32_t runEnd = std::min(
            run.startIndex + run.length,
            static_cast<std::uint32_t>(content.size())
        );
        
        if (run.startIndex >= content.size()) {
            continue;
        }
        
        std::string_view runContent = content.substr(run.startIndex, runEnd - run.startIndex);
        
        if (!shapeRun(runContent, run, layout.glyphs)) {
            // Shaping failed, but continue with other runs
            continue;
        }
    }
    
    // Perform line breaking
    breakLines(*textRec, content, layout.glyphs, runs, layout.lines);
    
    // Calculate total dimensions
    if (layout.lines.empty()) {
        layout.totalWidth = 0.0f;
        layout.totalHeight = 0.0f;
        layout.baselineY = 0.0f;
    } else {
        // Total width is max line width
        layout.totalWidth = 0.0f;
        for (const LayoutLine& line : layout.lines) {
            layout.totalWidth = std::max(layout.totalWidth, line.width);
        }
        
        // Total height is sum of line heights
        layout.totalHeight = 0.0f;
        for (const LayoutLine& line : layout.lines) {
            layout.totalHeight += line.lineHeight;
        }
        
        // Baseline of first line
        layout.baselineY = layout.lines[0].ascent;
    }
    
    // Apply alignment
    positionLines(*textRec, layout.lines, layout.totalWidth);
    
    // For FixedWidth mode, width is the constraint
    float finalWidth = layout.totalWidth;
    if (textRec->boxMode == TextBoxMode::FixedWidth && textRec->constraintWidth > 0) {
        finalWidth = textRec->constraintWidth;
    }
    
    // Update TextStore with layout results
    textStore_->setLayoutResult(
        textId,
        finalWidth,
        layout.totalHeight,
        textRec->x,
        textRec->y,
        textRec->x + finalWidth,
        textRec->y + layout.totalHeight
    );
    
    return true;
}

std::size_t TextLayoutEngine::layoutDirtyTexts() {
    if (!isInitialized()) {
        return 0;
    }
    
    std::vector<std::uint32_t> dirtyIds = textStore_->consumeDirtyIds();
    
    for (std::uint32_t id : dirtyIds) {
        layoutText(id);
    }
    
    return dirtyIds.size();
}

void TextLayoutEngine::layoutAllTexts() {
    if (!isInitialized()) {
        return;
    }
    
    for (std::uint32_t id : textStore_->getAllTextIds()) {
        layoutText(id);
    }
}

const TextLayout* TextLayoutEngine::getLayout(std::uint32_t textId) const {
    auto it = layoutCache_.find(textId);
    return (it != layoutCache_.end()) ? &it->second : nullptr;
}

void TextLayoutEngine::invalidateLayout(std::uint32_t textId) {
    auto it = layoutCache_.find(textId);
    if (it != layoutCache_.end()) {
        it->second.dirty = true;
    }
    textStore_->markDirty(textId);
}

void TextLayoutEngine::clearLayout(std::uint32_t textId) {
    layoutCache_.erase(textId);
}

void TextLayoutEngine::clearAllLayouts() {
    layoutCache_.clear();
}

// =============================================================================
// Hit Testing
// =============================================================================

TextHitResult TextLayoutEngine::hitTest(std::uint32_t textId, float localX, float localY) const {
    TextHitResult result{};
    result.charIndex = 0;
    result.lineIndex = 0;
    result.isLeadingEdge = true;
    
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) {
        return result;
    }
    
    // Find line by Y
    result.lineIndex = findLineAtY(*layout, localY);
    
    // Find character by X within that line
    result.charIndex = getCharIndexAtX(textId, result.lineIndex, localX);
    
    return result;
}

std::uint32_t TextLayoutEngine::getCharIndexAtX(
    std::uint32_t textId,
    std::uint32_t lineIndex,
    float localX
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || lineIndex >= layout->lines.size()) {
        return 0;
    }
    
    const LayoutLine& line = layout->lines[lineIndex];
    
    if (line.glyphCount == 0) {
        return line.startByte;
    }
    
    // Find glyph at X
    float x = 0.0f;
    for (std::uint32_t i = 0; i < line.glyphCount; ++i) {
        std::uint32_t glyphIdx = line.startGlyph + i;
        if (glyphIdx >= layout->glyphs.size()) {
            break;
        }
        
        const ShapedGlyph& glyph = layout->glyphs[glyphIdx];
        float glyphWidth = glyph.xAdvance;
        
        // Check if click is in this glyph
        if (localX < x + glyphWidth / 2.0f) {
            // Leading edge of this glyph
            return glyph.clusterIndex;
        }
        
        x += glyphWidth;
    }
    
    // Past end of line
    return line.startByte + line.byteCount;
}

// =============================================================================
// Caret Operations
// =============================================================================

TextCaretPosition TextLayoutEngine::getCaretPosition(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    TextCaretPosition pos{};
    pos.x = 0.0f;
    pos.y = 0.0f;
    pos.height = 16.0f;
    pos.lineIndex = 0;
    
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) {
        return pos;
    }
    
    // Find which line contains this character index
    std::uint32_t lineIndex = 0;
    for (std::size_t i = 0; i < layout->lines.size(); ++i) {
        const LayoutLine& line = layout->lines[i];
        std::uint32_t lineEnd = line.startByte + line.byteCount;
        
        if (charIndex <= lineEnd || i == layout->lines.size() - 1) {
            lineIndex = static_cast<std::uint32_t>(i);
            break;
        }
    }
    
    const LayoutLine& line = layout->lines[lineIndex];
    pos.lineIndex = lineIndex;
    pos.height = line.lineHeight;
    
    // Calculate Y position.
    // We return caret.y at the baseline (not the top of line) to match
    // how the render path places glyphs (baseline = line.ascent from line top).
    float yTop = 0.0f;
    for (std::uint32_t i = 0; i < lineIndex; ++i) {
        yTop += layout->lines[i].lineHeight;
    }
    pos.y = yTop + line.ascent;
    
    // Calculate X position by summing advances up to charIndex
    float x = 0.0f;
    for (std::uint32_t i = 0; i < line.glyphCount; ++i) {
        std::uint32_t glyphIdx = line.startGlyph + i;
        if (glyphIdx >= layout->glyphs.size()) {
            break;
        }
        
        const ShapedGlyph& glyph = layout->glyphs[glyphIdx];
        
        if (glyph.clusterIndex >= charIndex) {
            break;
        }
        
        x += glyph.xAdvance;
    }
    pos.x = x;
    
    return pos;
}

std::vector<TextLayoutEngine::SelectionRect> TextLayoutEngine::getSelectionRects(
    std::uint32_t textId,
    std::uint32_t startIndex,
    std::uint32_t endIndex
) const {
    std::vector<SelectionRect> rects;
    
    if (startIndex >= endIndex) {
        return rects;
    }
    
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) {
        return rects;
    }
    
    float y = 0.0f;
    for (std::uint32_t lineIdx = 0; lineIdx < layout->lines.size(); ++lineIdx) {
        const LayoutLine& line = layout->lines[lineIdx];
        std::uint32_t lineStart = line.startByte;
        std::uint32_t lineEnd = line.startByte + line.byteCount;
        
        // Check if this line overlaps with selection
        if (lineEnd > startIndex && lineStart < endIndex) {
            // Calculate selection bounds on this line
            std::uint32_t selStart = std::max(startIndex, lineStart);
            std::uint32_t selEnd = std::min(endIndex, lineEnd);
            
            TextCaretPosition startPos = getCaretPosition(textId, selStart);
            TextCaretPosition endPos = getCaretPosition(textId, selEnd);
            
            SelectionRect rect;
            rect.x = startPos.x;
            rect.y = y;
            rect.width = endPos.x - startPos.x;
            rect.height = line.lineHeight;
            rect.lineIndex = lineIdx;
            
            if (rect.width > 0) {
                rects.push_back(rect);
            }
        }
        
        y += line.lineHeight;
    }
    
    return rects;
}

// =============================================================================
// Navigation
// =============================================================================

std::uint32_t TextLayoutEngine::getPrevCharIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    if (charIndex == 0) {
        return 0;
    }
    
    std::string_view content = textStore_->getContent(textId);
    return prevCharBoundary(content, charIndex);
}

std::uint32_t TextLayoutEngine::getNextCharIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    std::string_view content = textStore_->getContent(textId);
    if (charIndex >= content.size()) {
        return static_cast<std::uint32_t>(content.size());
    }
    
    return nextCharBoundary(content, charIndex);
}

std::uint32_t TextLayoutEngine::getLineStartIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) {
        return 0;
    }
    
    for (const LayoutLine& line : layout->lines) {
        if (charIndex >= line.startByte && charIndex <= line.startByte + line.byteCount) {
            return line.startByte;
        }
    }
    
    return layout->lines.back().startByte;
}

std::uint32_t TextLayoutEngine::getLineEndIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) {
        return 0;
    }
    
    for (const LayoutLine& line : layout->lines) {
        if (charIndex >= line.startByte && charIndex <= line.startByte + line.byteCount) {
            return line.startByte + line.byteCount;
        }
    }
    
    const LayoutLine& last = layout->lines.back();
    return last.startByte + last.byteCount;
}

// =============================================================================
// Internal Methods
// =============================================================================

bool TextLayoutEngine::shapeRun(
    std::string_view content,
    const TextRun& run,
    std::vector<ShapedGlyph>& outGlyphs
) {
    if (content.empty()) {
        return true;
    }
    
    // Get font
    FontHandle* font = fontManager_->getFontMutable(run.fontId);
    if (!font || !font->hbFont) {
        return false;
    }
    
    // Set font size
    fontManager_->setFontSize(run.fontId, run.fontSize);
    
    // Reset HarfBuzz buffer
    hb_buffer_reset(hbBuffer_);
    
    // Add text to buffer first (guess_segment_properties needs content)
    hb_buffer_add_utf8(hbBuffer_, content.data(), static_cast<int>(content.size()), 0, -1);
    
    // Let HarfBuzz automatically detect direction, script, and language
    // from the actual text content. This enables proper handling of:
    // - RTL scripts (Hebrew, Arabic, etc.)
    // - Non-Latin scripts (CJK, Cyrillic, Greek, etc.)
    // - Mixed-direction text (bidi)
    hb_buffer_guess_segment_properties(hbBuffer_);
    
    // Shape
    hb_shape(font->hbFont, hbBuffer_, nullptr, 0);
    
    // Extract glyph info
    unsigned int glyphCount = 0;
    hb_glyph_info_t* glyphInfo = hb_buffer_get_glyph_infos(hbBuffer_, &glyphCount);
    hb_glyph_position_t* glyphPos = hb_buffer_get_glyph_positions(hbBuffer_, &glyphCount);
    
    if (!glyphInfo || !glyphPos) {
        return false;
    }
    
    // Scale factor for HarfBuzz positions (26.6 fixed point to float)
    float scale = 1.0f / 64.0f;
    
    for (unsigned int i = 0; i < glyphCount; ++i) {
        ShapedGlyph glyph;
        glyph.glyphId = glyphInfo[i].codepoint;
        glyph.clusterIndex = run.startIndex + glyphInfo[i].cluster;
        glyph.xAdvance = glyphPos[i].x_advance * scale;
        glyph.yAdvance = glyphPos[i].y_advance * scale;
        glyph.xOffset = glyphPos[i].x_offset * scale;
        glyph.yOffset = glyphPos[i].y_offset * scale;
        
        outGlyphs.push_back(glyph);
    }
    
    return true;
}

void TextLayoutEngine::breakLines(
    const TextRec& text,
    std::string_view content,
    const std::vector<ShapedGlyph>& glyphs,
    const std::vector<TextRun>& runs,
    std::vector<LayoutLine>& outLines
) {
    if (glyphs.empty()) {
        return;
    }
    
    // Get font metrics for line height calculation
    float fontSize = runs.empty() ? 16.0f : runs[0].fontSize;
    std::uint32_t fontId = runs.empty() ? 0 : runs[0].fontId;
    FontMetrics metrics = fontManager_->getScaledMetrics(fontId, fontSize);
    
    float lineHeight = metrics.ascender - metrics.descender + metrics.lineGap;
    float ascent = metrics.ascender;
    float descent = -metrics.descender;
    
    // Determine constraint width
    float maxWidth = (text.boxMode == TextBoxMode::FixedWidth && text.constraintWidth > 0)
        ? text.constraintWidth
        : std::numeric_limits<float>::max();
    
    LayoutLine currentLine{};
    currentLine.startGlyph = 0;
    currentLine.glyphCount = 0;
    currentLine.startByte = 0;
    currentLine.byteCount = 0;
    currentLine.width = 0.0f;
    currentLine.ascent = ascent;
    currentLine.descent = descent;
    currentLine.lineHeight = lineHeight;
    
    float currentWidth = 0.0f;
    std::uint32_t lastBreakGlyph = 0;
    std::uint32_t lastBreakByte = 0;
    float widthAtLastBreak = 0.0f;
    std::uint32_t glyphsInCurrentLine = 0;
    
    for (std::uint32_t i = 0; i < glyphs.size(); ++i) {
        const ShapedGlyph& glyph = glyphs[i];
        float glyphWidth = glyph.xAdvance;
        
        // Check for explicit newline
        if (glyph.clusterIndex < content.size()) {
            char ch = content[glyph.clusterIndex];
            if (ch == '\n') {
                // End current line (excluding newline character)
                currentLine.glyphCount = i - currentLine.startGlyph;
                currentLine.byteCount = glyph.clusterIndex - currentLine.startByte;
                currentLine.width = currentWidth;
                outLines.push_back(currentLine);
                
                // Start new line
                currentLine.startGlyph = i + 1;
                currentLine.startByte = glyph.clusterIndex + 1;
                currentLine.glyphCount = 0;
                currentLine.byteCount = 0;
                currentWidth = 0.0f;
                lastBreakGlyph = i + 1;
                lastBreakByte = glyph.clusterIndex + 1;
                widthAtLastBreak = 0.0f;
                glyphsInCurrentLine = 0;
                continue;
            }
            
            // Track word break opportunities (space, hyphen)
            if (ch == ' ' || ch == '-' || ch == '\t') {
                lastBreakGlyph = i + 1;
                lastBreakByte = glyph.clusterIndex + 1;
                widthAtLastBreak = currentWidth + glyphWidth;
            }
        }
        
        // Check for word wrap (FixedWidth mode only)
        if (text.boxMode == TextBoxMode::FixedWidth) {
            if (currentWidth + glyphWidth > maxWidth && glyphsInCurrentLine > 0) {
                // Need to wrap
                if (lastBreakGlyph > currentLine.startGlyph) {
                    // Wrap at last break point
                    currentLine.glyphCount = lastBreakGlyph - currentLine.startGlyph;
                    currentLine.byteCount = lastBreakByte - currentLine.startByte;
                    currentLine.width = widthAtLastBreak;
                    outLines.push_back(currentLine);
                    
                    // Start new line after break
                    currentLine.startGlyph = lastBreakGlyph;
                    currentLine.startByte = lastBreakByte;
                    currentWidth = currentWidth - widthAtLastBreak + glyphWidth;
                } else {
                    // Force break mid-word
                    currentLine.glyphCount = i - currentLine.startGlyph;
                    currentLine.byteCount = glyph.clusterIndex - currentLine.startByte;
                    currentLine.width = currentWidth;
                    outLines.push_back(currentLine);
                    
                    currentLine.startGlyph = i;
                    currentLine.startByte = glyph.clusterIndex;
                    currentWidth = glyphWidth;
                }
                
                currentLine.glyphCount = 0;
                currentLine.byteCount = 0;
                lastBreakGlyph = currentLine.startGlyph;
                lastBreakByte = currentLine.startByte;
                widthAtLastBreak = 0.0f;
                glyphsInCurrentLine = 1;  // Current glyph starts the new line
                continue;
            }
        }
        
        currentWidth += glyphWidth;
        glyphsInCurrentLine++;
    }
    
    // Add final line
    if (currentLine.startGlyph <= glyphs.size()) {
        currentLine.glyphCount = static_cast<std::uint32_t>(glyphs.size()) - currentLine.startGlyph;
        currentLine.byteCount = static_cast<std::uint32_t>(content.size()) - currentLine.startByte;
        currentLine.width = currentWidth;
        outLines.push_back(currentLine);
    }
}

void TextLayoutEngine::positionLines(
    const TextRec& text,
    std::vector<LayoutLine>& lines,
    float totalWidth
) {
    // For now, alignment affects line X offset calculation in rendering
    // The actual offset will be computed based on line.width vs totalWidth
    
    // This function could store per-line X offsets if needed
    // For now, alignment is handled during rendering based on text.align
    
    (void)text;
    (void)lines;
    (void)totalWidth;
}

std::uint32_t TextLayoutEngine::findLineAtY(const TextLayout& layout, float y) const {
    if (layout.lines.empty()) {
        return 0;
    }
    
    float currentY = 0.0f;
    for (std::size_t i = 0; i < layout.lines.size(); ++i) {
        float lineBottom = currentY + layout.lines[i].lineHeight;
        if (y < lineBottom || i == layout.lines.size() - 1) {
            return static_cast<std::uint32_t>(i);
        }
        currentY = lineBottom;
    }
    
    return static_cast<std::uint32_t>(layout.lines.size() - 1);
}

std::uint32_t TextLayoutEngine::findGlyphAtX(
    const TextLayout& layout,
    const LayoutLine& line,
    float x
) const {
    float currentX = 0.0f;
    
    for (std::uint32_t i = 0; i < line.glyphCount; ++i) {
        std::uint32_t glyphIdx = line.startGlyph + i;
        if (glyphIdx >= layout.glyphs.size()) {
            break;
        }
        
        float glyphWidth = layout.glyphs[glyphIdx].xAdvance;
        if (x < currentX + glyphWidth / 2.0f) {
            return glyphIdx;
        }
        currentX += glyphWidth;
    }
    
    return line.startGlyph + line.glyphCount;
}

float TextLayoutEngine::getGlyphX(const TextLayout& layout, std::uint32_t glyphIndex) const {
    // Find which line contains this glyph
    for (const LayoutLine& line : layout.lines) {
        if (glyphIndex >= line.startGlyph && glyphIndex < line.startGlyph + line.glyphCount) {
            float x = 0.0f;
            for (std::uint32_t i = line.startGlyph; i < glyphIndex; ++i) {
                if (i < layout.glyphs.size()) {
                    x += layout.glyphs[i].xAdvance;
                }
            }
            return x;
        }
    }
    return 0.0f;
}

bool TextLayoutEngine::isCharBoundary(std::string_view content, std::uint32_t byteIndex) {
    if (byteIndex == 0 || byteIndex >= content.size()) {
        return true;
    }
    
    // UTF-8 continuation bytes start with 10xxxxxx
    unsigned char c = static_cast<unsigned char>(content[byteIndex]);
    return (c & 0xC0) != 0x80;
}

std::uint32_t TextLayoutEngine::prevCharBoundary(std::string_view content, std::uint32_t byteIndex) {
    if (byteIndex == 0 || content.empty()) {
        return 0;
    }
    
    std::uint32_t pos = byteIndex - 1;
    while (pos > 0 && !isCharBoundary(content, pos)) {
        --pos;
    }
    return pos;
}

std::uint32_t TextLayoutEngine::nextCharBoundary(std::string_view content, std::uint32_t byteIndex) {
    if (byteIndex >= content.size()) {
        return static_cast<std::uint32_t>(content.size());
    }
    
    std::uint32_t pos = byteIndex + 1;
    while (pos < content.size() && !isCharBoundary(content, pos)) {
        ++pos;
    }
    return pos;
}

} // namespace engine::text
