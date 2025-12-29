// Text navigation methods for TextLayoutEngine
// Part of text_layout.h class split for SRP compliance

#include "engine/text/text_layout.h"
#include <algorithm>
#include <cctype>

namespace engine::text {

// Helper for simple UTF-8 decoding
static std::uint32_t decodeUtf8(std::string_view sv, std::uint32_t& pos) {
    if (pos >= sv.size()) return 0;
    unsigned char c = static_cast<unsigned char>(sv[pos]);
    if (c < 0x80) {
        pos++;
        return c;
    }
    std::uint32_t val = 0;
    std::uint32_t len = 0;
    if ((c & 0xE0) == 0xC0) { val = c & 0x1F; len = 2; }
    else if ((c & 0xF0) == 0xE0) { val = c & 0x0F; len = 3; }
    else if ((c & 0xF8) == 0xF0) { val = c & 0x07; len = 4; }
    else { pos++; return 0xFFFD; } // Error
    
    for (std::uint32_t i = 1; i < len; ++i) {
        if (pos + i >= sv.size()) break;
        val = (val << 6) | (static_cast<unsigned char>(sv[pos + i]) & 0x3F);
    }
    pos += len;
    return val;
}

static bool isWordChar(std::uint32_t cp) {
    // Basic alphanumeric check + some symbols
    // Expand as needed for CJK/Emoji
    if (cp < 0x80) return std::isalnum(cp) || cp == '_';
    // Assume non-ascii non-symbol/punctuation is word char?
    // Rough heuristic: CJK/Emoji are word chars.
    // Punctuation/Symbols are not.
    // Without full ICU, hard to be perfect.
    // For now, treat all high-bit chars as word parts to group Emojis together?
    return true; 
}

// =============================================================================
// Visual Navigation
// =============================================================================

std::uint32_t TextLayoutEngine::getVisualPrevCharIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) return 0;

    std::string_view content = textStore_->getContent(textId);
    
    // Find Gap
    int gapIndex = -1;
    bool found = false;
    
    int numGlyphs = static_cast<int>(layout->glyphs.size());
    
    // Default to "End of text" gap if not found
    gapIndex = numGlyphs;
    
    // Try to find exact match for charIndex among glyph boundaries
    for (int i = 0; i < numGlyphs; ++i) {
        const ShapedGlyph& g = layout->glyphs[i];
        bool isRTL = (g.flags & 1); 
        
        // Start of glyph (logical)
        if (charIndex == g.clusterIndex) {
            // LTR: Left Edge -> Gap i
            // RTL: Right Edge -> Gap i+1
            gapIndex = isRTL ? (i + 1) : i;
            found = true;
            break;
        }
    }
    
    if (!found) {
        // charIndex might be at the end of the logical content (byteCount).
        if (charIndex >= content.size()) {
             gapIndex = numGlyphs;
        }
    }
    
    // Move Visual Left
    int newGap = gapIndex - 1;
    if (newGap < 0) newGap = 0;
    
    // Map Gap -> charIndex
    if (newGap == numGlyphs) {
        const LayoutLine& lastLine = layout->lines.back();
        return lastLine.startByte + lastLine.byteCount;
    }
    
    const ShapedGlyph& g = layout->glyphs[newGap];
    bool isRTL = (g.flags & 1);
    
    if (isRTL) {
        // Gap i is Left Edge of RTL Glyph i.
        // Logical: End of Glyph i. (Start + Len).
        std::uint32_t len = nextCharBoundary(content, g.clusterIndex) - g.clusterIndex;
        return g.clusterIndex + len; 
    } else {
        // Gap i is Left Edge of LTR Glyph i.
        // Logical: Start of Glyph i.
        return g.clusterIndex;
    }
}

std::uint32_t TextLayoutEngine::getVisualNextCharIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) return charIndex;
    
    std::string_view content = textStore_->getContent(textId);
    int numGlyphs = static_cast<int>(layout->glyphs.size());
    
    // Map charIndex -> Gap ID
    int gapIndex = numGlyphs; // Default to end
    
    for (int i = 0; i < numGlyphs; ++i) {
        const ShapedGlyph& g = layout->glyphs[i];
        bool isRTL = (g.flags & 1);
        
        if (charIndex == g.clusterIndex) {
            gapIndex = isRTL ? (i + 1) : i; // LTR Start=Left=Gap i. RTL Start=Right=Gap i+1.
            break;
        }
    }
    
    // Move Visual Right
    int newGap = gapIndex + 1;
    if (newGap > numGlyphs) newGap = numGlyphs;
    
    // Map Gap -> charIndex
    if (newGap == numGlyphs) {
        const LayoutLine& lastLine = layout->lines.back();
        return lastLine.startByte + lastLine.byteCount;
    }
    
    const ShapedGlyph& g = layout->glyphs[newGap];
    bool isRTL = (g.flags & 1);
    
    if (isRTL) {
        return g.clusterIndex;
    } else {
        return g.clusterIndex; 
    }
}

// =============================================================================
// Word Navigation
// =============================================================================

std::uint32_t TextLayoutEngine::getWordLeftIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) return 0;
    
    std::string_view content = textStore_->getContent(textId);
    int numGlyphs = static_cast<int>(layout->glyphs.size());
    
    // Find current gap/glyph index
    int currentGap = numGlyphs;
    for (int i = 0; i < numGlyphs; ++i) {
        const ShapedGlyph& g = layout->glyphs[i];
        bool isRTL = (g.flags & 1);
        if (charIndex == g.clusterIndex) {
            currentGap = isRTL ? (i + 1) : i;
            break;
        }
    }
    
    // Scan backwards visually
    // State machine: 
    // 0: Skipping Space
    // 1: Skipping Word
    // Stop if state 1 and char is space.
    int state = 0; 
    
    int i = currentGap - 1; // Start scanning at glyph before gap
    int boundaryGap = 0; // Default to start
    
    while (i >= 0) {
        const ShapedGlyph& g = layout->glyphs[i];
        
        // Decode first codepoint of cluster
        std::uint32_t p = g.clusterIndex;
        std::uint32_t cp = decodeUtf8(content, p);
        
        // Determine type
        bool isW = isWordChar(cp) && !std::isspace(cp);
        bool isSp = std::isspace(cp); // std::isspace handles ASCII only usually, careful
        if (cp >= 0x80) isSp = false; // Assume high chars are not whitespace
        
        if (state == 0) {
            if (!isSp) {
                state = 1; // Found word end
            }
        } else if (state == 1) {
            if (isSp || !isW) {
                // Word Boundary found (change from Word to Space/Other)
                boundaryGap = i + 1; // Gap AFTER current glyph (between i and i+1)
                break;
            }
        }
        i--;
    }
    
    if (i < 0) boundaryGap = 0; // Start of text
    
    // Map Gap -> Char Index
    if (boundaryGap == numGlyphs) {
         const LayoutLine& lastLine = layout->lines.back();
         return lastLine.startByte + lastLine.byteCount;
    }
    
    if (boundaryGap == 0) {
        return 0;
    }
    
    const ShapedGlyph& g = layout->glyphs[boundaryGap];
    bool isRTL = (g.flags & 1);
    if (isRTL) {
        // Gap i (Right Edge of RTL Glyph). But Cluster is Start(Right).
        std::uint32_t p = g.clusterIndex;
        std::uint32_t nextP = nextCharBoundary(content, p);
        return nextP; // Heuristic
    } else {
        // Gap i is Left Edge of LTR Glyph. Start.
        return g.clusterIndex;
    }
}

std::uint32_t TextLayoutEngine::getWordRightIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) return charIndex;
    
    std::string_view content = textStore_->getContent(textId);
    int numGlyphs = static_cast<int>(layout->glyphs.size());
    
    int currentGap = numGlyphs;
    for (int i = 0; i < numGlyphs; ++i) {
        const ShapedGlyph& g = layout->glyphs[i];
        bool isRTL = (g.flags & 1);
        if (charIndex == g.clusterIndex) {
            currentGap = isRTL ? (i + 1) : i;
            break;
        }
    }
    
    // Scan forwards visually
    int i = currentGap; // Start at glyph AFTER gap
    
    bool startedOnSpace = false;
    if (i < numGlyphs) {
        const ShapedGlyph& g = layout->glyphs[i];
        std::uint32_t p = g.clusterIndex;
        std::uint32_t cp = decodeUtf8(content, p);
        if (std::isspace(cp) && cp < 0x80) startedOnSpace = true;
    }
    
    while (i < numGlyphs) {
        const ShapedGlyph& g = layout->glyphs[i];
        std::uint32_t p = g.clusterIndex;
        std::uint32_t cp = decodeUtf8(content, p);
        bool isSp = (cp < 0x80 && std::isspace(cp));
        
        if (!startedOnSpace) {
            if (isSp) {
                startedOnSpace = true;
            }
        } 
        
        if (startedOnSpace) {
            if (!isSp) {
                // Found next word start
                currentGap = i; // Gap BEFORE this glyph
                break;
            }
        }
        i++;
    }
    
    if (i == numGlyphs) currentGap = numGlyphs;
    
    // Map Gap -> CharIndex
    if (currentGap == numGlyphs) {
         const LayoutLine& lastLine = layout->lines.back();
         return lastLine.startByte + lastLine.byteCount;
    }
    
    const ShapedGlyph& g = layout->glyphs[currentGap];
    bool isRTL = (g.flags & 1);
    if (isRTL) {
        std::uint32_t p = g.clusterIndex;
        std::uint32_t nextP = nextCharBoundary(content, p);
        return nextP; 
    } else {
        return g.clusterIndex;
    }
}

// =============================================================================
// Line Navigation
// =============================================================================

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

std::uint32_t TextLayoutEngine::getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) return charIndex;

    TextCaretPosition currentPos = getCaretPosition(textId, charIndex);
    if (currentPos.lineIndex == 0) {
        // Already at top line, go to start
        return 0; 
    }

    std::uint32_t targetLineIndex = currentPos.lineIndex - 1;
    return getCharIndexAtX(textId, targetLineIndex, currentPos.x);
}

std::uint32_t TextLayoutEngine::getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) return charIndex;

    TextCaretPosition currentPos = getCaretPosition(textId, charIndex);
    if (currentPos.lineIndex >= layout->lines.size() - 1) {
        // Already at bottom line, go to end of last line
        const LayoutLine& lastLine = layout->lines.back();
        return lastLine.startByte + lastLine.byteCount;
    }

    std::uint32_t targetLineIndex = currentPos.lineIndex + 1;
    return getCharIndexAtX(textId, targetLineIndex, currentPos.x);
}

} // namespace engine::text
