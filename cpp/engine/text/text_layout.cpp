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
        textRec->y - layout.totalHeight, // minY is below anchor
        textRec->x + finalWidth,
        textRec->y                      // maxY is anchor (top)
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
    float x = line.xOffset;
    for (std::uint32_t i = 0; i < line.glyphCount; ++i) {
        std::uint32_t glyphIdx = line.startGlyph + i;
        if (glyphIdx >= layout->glyphs.size()) {
            break;
        }
        
        const ShapedGlyph& glyph = layout->glyphs[glyphIdx];
        float glyphWidth = glyph.xAdvance;
        bool isRTL = (glyph.flags & 1);
        
        // Check if click is in this glyph
        // x matches Left Edge of glyph.
        if (localX < x + glyphWidth) {
            float center = x + glyphWidth / 2.0f;
            bool leftHalf = (localX < center);
            
            // Logic:
            // LTR: Left Half -> Start (clusterIndex). Right Half -> End (Next).
            // RTL: Left Half -> End (Next). Right Half -> Start (clusterIndex).
            // "Next" means logical next char.
            
            bool returnStart = isRTL ? !leftHalf : leftHalf;
            
            if (returnStart) {
                return glyph.clusterIndex;
            } else {
                // Return "End" of this grapheme.
                // We estimate "End" as start of next glyph or next char boundary.
                // Assuming 1 glyph = 1 grapheme cluster mostly.
                // If next glyph exists and is part of same run...
                 // To match Standard Editor behavior (e.g. VSCode):
                 // Click Right of 'a' -> caret between 'a' and 'b'.
                 // That is 'b'.clusterIndex.
                 
                 // If we are consistent with getVisualNextCharIndex logic:
                 // "Gap" logic.
                 // LTR Left Half -> Gap i (Left of G) -> G.clusterIndex.
                 // LTR Right Half -> Gap i+1 (Right of G) -> G+1.clusterIndex.
                 
                 // RTL Left Half -> Gap i (Left of G) -> G+1.clusterIndex? (Wait, Left of G is End of G in RTL).
                 // RTL Left Edge is Logical End.
                 // Correct.
                 
                 return nextCharBoundary(textStore_->getContent(textId), glyph.clusterIndex);
            }
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
    
    // Calculate Y position (Top of line) in Text Local Space (Y-Up).
    // Origin (0,0) is top-left. -Y is down.
    float yTop = 0.0f;
    for (std::uint32_t i = 0; i < lineIndex; ++i) {
        yTop -= layout->lines[i].lineHeight; // Move DOWN (negative Y)
    }
    
    pos.y = yTop;
    
    // Calculate X position by summing advances up to charIndex
    float x = line.xOffset;

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
        
        // Next line Y (Top of next line, Bottom of current)
        float nextY = y - line.lineHeight;

        // Check if this line overlaps with selection
        if (lineEnd > startIndex && lineStart < endIndex) {
            // Calculate selection bounds on this line
            std::uint32_t selStart = std::max(startIndex, lineStart);
            std::uint32_t selEnd = std::min(endIndex, lineEnd);
            
            TextCaretPosition startPos = getCaretPosition(textId, selStart);
            TextCaretPosition endPos = getCaretPosition(textId, selEnd);
            
            SelectionRect rect;
            rect.x = startPos.x;
            rect.y = nextY; // Rect Y is the BOTTOM of the rectangle in Y-Up (standard for our rects?)
            // Wait, usually rect[x, y, w, h] means minX, minY, w, h.
            // If minY is nextY, and maxY is y.
            rect.width = endPos.x - startPos.x;
            rect.height = line.lineHeight;
            rect.lineIndex = lineIdx;
            
            if (rect.width > 0) {
                rects.push_back(rect);
            }
        }
        
        y = nextY;
    }
    
    return rects;
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
    
    // Select font variant based on run flags (Bold/Italic)
    bool isBold = hasFlag(run.flags, TextStyleFlags::Bold);
    bool isItalic = hasFlag(run.flags, TextStyleFlags::Italic);
    std::uint32_t fontId = fontManager_->getFontVariant(run.fontId, isBold, isItalic);

    // Get shape plan from cache or create new one
    const FontHandle* fontHandle = fontManager_->getFont(fontId);
    if (!fontHandle || !fontHandle->hbFont) return false;
    hb_font_t* hbFont = fontHandle->hbFont;
    
    // Configure font size
    fontManager_->setFontSize(fontId, run.fontSize);
    
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
    
    // Shape with ligatures disabled for CAD precision
    // We want individual characters to be distinct, avoiding the 'fi' merger
    hb_feature_t features[2];
    hb_feature_from_string("-liga", -1, &features[0]); // Disable standard ligatures
    hb_feature_from_string("-clig", -1, &features[1]); // Disable contextual ligatures
    
    hb_shape(hbFont, hbBuffer_, features, 2);
    
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
        
        // Determine direction from buffer properties
        hb_direction_t dir = hb_buffer_get_direction(hbBuffer_);
        glyph.flags = (dir == HB_DIRECTION_RTL) ? 1 : 0;
        
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
    currentLine.ascent = 0.0f;
    currentLine.descent = 0.0f;
    currentLine.lineHeight = 0.0f;
    
    float currentWidth = 0.0f;
    std::uint32_t lastBreakGlyph = 0;
    std::uint32_t lastBreakByte = 0;
    float widthAtLastBreak = 0.0f;
    std::uint32_t glyphsInCurrentLine = 0;
    std::uint32_t currentRunIdx = 0;

    auto updateMetrics = [&](std::uint32_t clusterIndex) {
        // Find the run this cluster belongs to (runs are assumes sorted)
        while (currentRunIdx + 1 < runs.size() && runs[currentRunIdx + 1].startIndex <= clusterIndex) {
            currentRunIdx++;
        }
        const auto& run = runs[currentRunIdx];
        FontMetrics m = fontManager_->getScaledMetrics(run.fontId, run.fontSize);
        currentLine.ascent = std::max(currentLine.ascent, m.ascender);
        currentLine.descent = std::max(currentLine.descent, -m.descender);
        currentLine.lineHeight = std::max(currentLine.lineHeight, m.ascender - m.descender + m.lineGap);
    };

    for (std::uint32_t i = 0; i < glyphs.size(); ++i) {
        const ShapedGlyph& glyph = glyphs[i];
        float glyphWidth = glyph.xAdvance;
        
        updateMetrics(glyph.clusterIndex);

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
                currentLine.width = 0.0f;
                currentLine.ascent = 0.0f;
                currentLine.descent = 0.0f;
                currentLine.lineHeight = 0.0f;
                currentWidth = 0.0f;
                lastBreakGlyph = i + 1;
                lastBreakByte = glyph.clusterIndex + 1;
                widthAtLastBreak = 0.0f;
                glyphsInCurrentLine = 0;
                continue;
            }
            
            // Track word break opportunities
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
                    currentLine.glyphCount = lastBreakGlyph - currentLine.startGlyph;
                    currentLine.byteCount = lastBreakByte - currentLine.startByte;
                    currentLine.width = widthAtLastBreak;
                    
                    // We need to re-calculate metrics for this truncated line!
                    // Reset and scan only glyphs within this line.
                    currentLine.ascent = 0; currentLine.descent = 0; currentLine.lineHeight = 0;
                    std::uint32_t rIdx = 0;
                    for (std::uint32_t k = currentLine.startGlyph; k < lastBreakGlyph; ++k) {
                        while (rIdx + 1 < runs.size() && runs[rIdx + 1].startIndex <= glyphs[k].clusterIndex) rIdx++;
                        FontMetrics m = fontManager_->getScaledMetrics(runs[rIdx].fontId, runs[rIdx].fontSize);
                        currentLine.ascent = std::max(currentLine.ascent, m.ascender);
                        currentLine.descent = std::max(currentLine.descent, -m.descender);
                        currentLine.lineHeight = std::max(currentLine.lineHeight, m.ascender - m.descender + m.lineGap);
                    }
                    outLines.push_back(currentLine);
                    
                    // Start new line after break
                    currentLine.startGlyph = lastBreakGlyph;
                    currentLine.startByte = lastBreakByte;
                    currentLine.ascent = 0; currentLine.descent = 0; currentLine.lineHeight = 0;
                    currentWidth = currentWidth - widthAtLastBreak + glyphWidth;
                } else {
                    currentLine.glyphCount = i - currentLine.startGlyph;
                    currentLine.byteCount = glyph.clusterIndex - currentLine.startByte;
                    currentLine.width = currentWidth;
                    
                    currentLine.ascent = 0; currentLine.descent = 0; currentLine.lineHeight = 0;
                    std::uint32_t rIdx = 0;
                    for (std::uint32_t k = currentLine.startGlyph; k < i; ++k) {
                        while (rIdx + 1 < runs.size() && runs[rIdx + 1].startIndex <= glyphs[k].clusterIndex) rIdx++;
                        FontMetrics m = fontManager_->getScaledMetrics(runs[rIdx].fontId, runs[rIdx].fontSize);
                        currentLine.ascent = std::max(currentLine.ascent, m.ascender);
                        currentLine.descent = std::max(currentLine.descent, -m.descender);
                        currentLine.lineHeight = std::max(currentLine.lineHeight, m.ascender - m.descender + m.lineGap);
                    }
                    outLines.push_back(currentLine);
                    
                    currentLine.startGlyph = i;
                    currentLine.startByte = glyph.clusterIndex;
                    currentLine.ascent = 0; currentLine.descent = 0; currentLine.lineHeight = 0;
                    currentWidth = glyphWidth;
                }
                
                lastBreakGlyph = currentLine.startGlyph;
                lastBreakByte = currentLine.startByte;
                widthAtLastBreak = 0.0f;
                glyphsInCurrentLine = 1;

                // Update metrics for the first glyph of the new line
                updateMetrics(glyphs[currentLine.startGlyph].clusterIndex);
                continue;
            }
        }
        
        currentWidth += glyphWidth;
        glyphsInCurrentLine++;
    }
    
    // Add final line
    if (currentLine.startGlyph < glyphs.size()) {
        currentLine.glyphCount = static_cast<std::uint32_t>(glyphs.size()) - currentLine.startGlyph;
        currentLine.byteCount = static_cast<std::uint32_t>(content.size()) - currentLine.startByte;
        currentLine.width = currentWidth;
        outLines.push_back(currentLine);
    }
    
    // Handle trailing newline: add empty line for caret positioning
    // This ensures that when content ends with '\n', the caret can be placed on the new line
    if (!content.empty() && content.back() == '\n') {
        LayoutLine trailingLine{};
        trailingLine.startGlyph = static_cast<std::uint32_t>(glyphs.size());
        trailingLine.glyphCount = 0;
        trailingLine.startByte = static_cast<std::uint32_t>(content.size());
        trailingLine.byteCount = 0;
        trailingLine.width = 0.0f;
        
        // Get metrics from last run for consistent line height
        if (!runs.empty()) {
            const auto& lastRun = runs.back();
            FontMetrics m = fontManager_->getScaledMetrics(lastRun.fontId, lastRun.fontSize);
            trailingLine.ascent = m.ascender;
            trailingLine.descent = -m.descender;
            trailingLine.lineHeight = m.ascender - m.descender + m.lineGap;
        }
        
        outLines.push_back(trailingLine);
    }
}


void TextLayoutEngine::positionLines(
    const TextRec& text,
    std::vector<LayoutLine>& lines,
    float totalWidth
) {
    // For FixedWidth mode, we align relative to the constraint width.
    // For AutoWidth mode, we align relative to the widest line (totalWidth),
    // which effectively makes alignment have no visual impact unless we 
    // are in a context where the container is larger than the text.
    float containerWidth = totalWidth;
    if (text.boxMode == TextBoxMode::FixedWidth && text.constraintWidth > 0) {
        containerWidth = text.constraintWidth;
    }

    for (auto& line : lines) {
        if (text.align == TextAlign::Center) {
            line.xOffset = (containerWidth - line.width) * 0.5f;
        } else if (text.align == TextAlign::Right) {
            line.xOffset = (containerWidth - line.width);
        } else {
            line.xOffset = 0.0f;
        }
        
        // Clamp to positive to prevent text going outside the box to the left
        if (line.xOffset < 0.0f) line.xOffset = 0.0f;
    }
}

std::uint32_t TextLayoutEngine::findLineAtY(const TextLayout& layout, float y) const {
    if (layout.lines.empty()) {
        return 0;
    }
    
    float currentY = 0.0f;
    for (std::size_t i = 0; i < layout.lines.size(); ++i) {
        float nextY = currentY - layout.lines[i].lineHeight; // Move DOWN (negative Y)
        // In Y-Up, the line spans [nextY, currentY].
        // If y is greater than nextY, it's inside this line (or above it).
        if (y > nextY || i == layout.lines.size() - 1) {
            return static_cast<std::uint32_t>(i);
        }
        currentY = nextY;
    }
    
    return static_cast<std::uint32_t>(layout.lines.size() - 1);
}

std::uint32_t TextLayoutEngine::findGlyphAtX(
    const TextLayout& layout,
    const LayoutLine& line,
    float x
) const {
    float currentX = line.xOffset;
    
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
