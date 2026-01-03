#include "engine/text/text_layout.h"

namespace engine::text {

TextHitResult TextLayoutEngine::hitTest(std::uint32_t textId, float localX, float localY) {
    TextHitResult result{};
    result.charIndex = 0;
    result.lineIndex = 0;
    result.isLeadingEdge = true;
    
    if (!ensureLayout(textId)) {
        return result;
    }
    
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
            
            bool returnStart = isRTL ? !leftHalf : leftHalf;
            
            if (returnStart) {
                return glyph.clusterIndex;
            } else {
                return nextCharBoundary(textStore_->getContent(textId), glyph.clusterIndex);
            }
        }
        
        x += glyphWidth;
    }
    
    // Past end of line
    return line.startByte + line.byteCount;
}

TextCaretPosition TextLayoutEngine::getCaretPosition(
    std::uint32_t textId,
    std::uint32_t charIndex
) {
    TextCaretPosition pos{};
    pos.x = 0.0f;
    pos.y = 0.0f;
    pos.height = 16.0f;
    pos.lineIndex = 0;
    
    if (!ensureLayout(textId)) {
        return pos;
    }
    
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

