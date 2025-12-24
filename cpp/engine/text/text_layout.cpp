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
    float x = 0.0f;
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
// Navigation
// =============================================================================

std::uint32_t TextLayoutEngine::getVisualPrevCharIndex(
    std::uint32_t textId,
    std::uint32_t charIndex
) const {
    const TextLayout* layout = getLayout(textId);
    if (!layout || layout->lines.empty()) return 0;

    // 1. Find Current Position (Line & Glyph)
    // If charIndex is at end of line (logical), we need to know WHICH line.
    // getCaretPosition handles this by line end checks.
    
    // We iterate lines to find where charIndex fits.
    // For visual movement, we just want the visual sequence of glyphs.
    // The "Visual Stream" is just 0..glyphCount-1 in `layout->glyphs`.
    // (Assuming line wrapping flows naturally).
    
    // Find glyph index corresponding to charIndex
    // Since charIndex might be at End of Line (not matching any glyph cluster start generally, unless it is a cluster start),
    // we need to be careful.
    // Often charIndex = start + len.
    // If we are at End of Sequence, visual prev is Last Glyph.
    
    // Reverse map charIndex -> Glyph Index (or "After Glyph X").
    // Since glyphs are in visual order:
    // If we are "Before Glyph I" (caret at glyph[I].clusterIndex), Prev is "Before Glyph I-1" (caret at glyph[I-1].clusterIndex)?
    // Wait. "Before Glyph I" means caret is at the visual Left of Glyph I (in LTR).
    // Visual Prev -> Left.
    // So we want to be "Before Glyph I-1".
    
    // BUT, clusterIndex is the LOGICAL start.
    // For LTR: ClusterIndex is Left Edge.
    // For RTL: ClusterIndex is Right Edge (Start of Char).
    // If glyph is RTL, "Before Glyph I" (Left) is NOT `clusterIndex`. `clusterIndex` is Right edge.
    // Left (Visual Prev of RTL Glyph) is "After Glyph I" logically? (index + len?) 
    // Or just `next_glyph_start`?
    
    // Let's simplify:
    // We treat the caret as a position in the Visual Gaps.
    // Gap 0: Before Glyph 0.
    // Gap 1: Between Glyph 0 and 1.
    // ...
    // Gap N: After Glyph N-1.
    // Total gaps: N+1.
    // We map `charIndex` to a Gap ID.
    // Then decrement/increment Gap ID.
    // Then map Gap ID back to `charIndex`.
    
    // Map charIndex -> Gap ID
    // We scan glyphs.
    // If LTR Glyph:
    //   Caret at `clusterIndex` -> Left Edge -> Gap `i`.
    //   Caret at `clusterIndex + len` -> Right Edge -> Gap `i+1`.
    // If RTL Glyph:
    //   Caret at `clusterIndex` -> Right Edge -> Gap `i+1`.
    //   Caret at `clusterIndex + len` -> Left Edge -> Gap `i`.
    
    // We need `isRTL` flag! I added it to `ShapedGlyph` but haven't populated it.
    // Assuming LTR for now until shapeRun is updated.
    
    std::string_view content = textStore_->getContent(textId);
    
    // Find Gap
    int gapIndex = -1;
    bool found = false;
    
    // We check all glyphs. A glyph spans [clusterIndex, clusterIndex + len]. (Usually).
    // Actually len is not stored. We infer from next cluster?
    // But clusters might be reordered.
    // Ideally we assume caret is at *some* valid boundary.
    
    // Fallback simple implementation for now (strictly assuming LTR or "Cluster Start" logic):
    // Find glyph where `clusterIndex == glyph.clusterIndex`.
    // If found at `i`, return `glyphs[i-1].clusterIndex`.
    // If charIndex > all clusters, return `glyphs.back().clusterIndex`.
    
    // This is naive and fails for Bidi. But requested "Visual" requires tracking gaps.
    // Let's implement the Gap search properly but default RTL flag to 0 for now.
    
    int numGlyphs = static_cast<int>(layout->glyphs.size());
    
    // Default to "End of text" gap if not found
    gapIndex = numGlyphs;
    
    // Try to find exact match for charIndex among glyph boundaries
    for (int i = 0; i < numGlyphs; ++i) {
        const ShapedGlyph& g = layout->glyphs[i];
        bool isRTL = (g.flags & 1); 
        
        // Calculate length of this glyph's cluster (approximation or need text scan?)
        // Standard approach: length is difference to next logical cluster? No, too hard with reordering.
        // We can check `isCharBoundary` loop to find length of codepoint?
        // Let's assume grapheme length for now?
        // Actually, we just check if `charIndex` matches Start or End of this glyph.
        
        // Start of glyph (logical)
        if (charIndex == g.clusterIndex) {
            // LTR: Left Edge -> Gap i
            // RTL: Right Edge -> Gap i+1
            gapIndex = isRTL ? (i + 1) : i;
            found = true;
            break;
        }
        
        // We handle "End of glyph" implies we need to know the length.
        // We'll rely on the fact that if we aren't at Start, we might be at End?
        // But multiple glyphs share boundaries.
    }
    
    if (!found) {
        // charIndex might be at the end of the logical content (byteCount).
        if (charIndex >= content.size()) {
             // Logic: Logical End.
             // If LTR text: Logical End = Visual End = Gap N.
             // If RTL text: Logical End = Visual Start = Gap 0 (usually? No, start of string is right-most).
             // Let's assume Gap N for simplicity if we can't map.
             gapIndex = numGlyphs;
        }
    }
    
    // Move Visual Left
    int newGap = gapIndex - 1;
    if (newGap < 0) newGap = 0;
    
    // Map Gap -> charIndex
    if (newGap == numGlyphs) {
        // Visual End.
        // For LTR: Logical End of last glyph.
        // For RTL: Logical Start of last glyph (if reversed).
        // Safest: Use content.size()? No, line breaks might exist.
        // Use `lines.back().startByte + ...`
        const LayoutLine& lastLine = layout->lines.back();
        return lastLine.startByte + lastLine.byteCount;
    }
    
    const ShapedGlyph& g = layout->glyphs[newGap];
    bool isRTL = (g.flags & 1);
    
    if (isRTL) {
        // Gap i is Left Edge of RTL Glyph i.
        // Logical: End of Glyph i. (Start + Len).
        // We need length.
        std::uint32_t len = nextCharBoundary(content, g.clusterIndex) - g.clusterIndex;
        // Grapheme might be longer.
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
    
    // If not found and charIndex is content size (End), Logic depends on text direction.
    // If LTR, End=Gap N.
    // If RTL, End=Gap 0.
    // Assuming LTR default: Gap N.
    
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
        // Gap i is Right Edge of RTL Glyph i.
        // Logical: Start of Glyph i.
        return g.clusterIndex;
    } else {
        // Gap i is Left Edge of LTR Glyph i.
        // Logical: Start of Glyph i.
        // We want GAP i -> LEFT of Glyph i.
        // If we are at Gap i, and move Right to Gap i+1.
        // Gap i+1 is Right Edge of LTR Glyph i.
        // Logical: End (Start + len).
        // Wait.
        // getVisualPrev mapped NewGap to CharIndex.
        // getVisualNext maps NewGap to CharIndex.
        // Same logic.
        return g.clusterIndex; 
        
        // Wait. If Gap i (Left of G) -> charIndex G.start.
        // If I move Right to Gap i+1 (Right of G).
        // Gap i+1 corresponds to Left of G+1.
        // charIndex (G+1).start.
        // So standard logic returns `g.clusterIndex`.
    }
}

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
    // Let's assume all > 127 are word chars except specific ranges if we knew them.
    // For now, treat all high-bit chars as word parts to group Emojis together?
    return true; 
}

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
                return layout->glyphs[boundaryGap - 1].clusterIndex + (/* length? no, gap logic */ 0); 
                // Return start of the glyph that follows the boundary.
                // boundaryGap is "After i". 
                // If i was space, we stopped AT i. We want gap 'i+1'.
                
                // Let's use the helper logic to map Gap -> CharIndex.
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
    
    const ShapedGlyph& g = layout->glyphs[boundaryGap];
    bool isRTL = (g.flags & 1);
    if (isRTL) {
        // Gap i (Right Edge of RTL Glyph). But Cluster is Start(Right).
        // Wait. Gap i is Left of Glyph i.
        // For visual, Left of Glyph i.
        // If RTL, Left Edge is END.
        std::uint32_t p = g.clusterIndex;
        // Assume grapheme length
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
    // State: 0=Skipping Word (if on word), 1=Skipping Space
    // Logic: Word Right usually jumps to NEXT word start.
    // If on Word: Skip Word, Skip Space -> Start of Next Word.
    // If on Space: Skip Space -> Start of Next Word.
    
    // Check char at current pos to determine initial state?
    // Simplified:
    // 1. Skip non-space (Word)
    // 2. Skip space
    
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
    
    // ... same gap mapping logic ...
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
    
    // Shape with ligatures disabled for CAD precision
    // We want individual characters to be distinct, avoiding the 'fi' merger
    hb_feature_t features[2];
    hb_feature_from_string("-liga", -1, &features[0]); // Disable standard ligatures
    hb_feature_from_string("-clig", -1, &features[1]); // Disable contextual ligatures
    
    hb_shape(font->hbFont, hbBuffer_, features, 2);
    
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
