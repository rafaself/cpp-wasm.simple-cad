#include "engine/text/text_layout.h"

#include <algorithm>

namespace engine::text {

std::vector<TextLayoutEngine::SelectionRect> TextLayoutEngine::getSelectionRects(
    std::uint32_t textId,
    std::uint32_t startIndex,
    std::uint32_t endIndex
) {
    std::vector<SelectionRect> rects;
    
    if (startIndex >= endIndex) {
        return rects;
    }
    
    if (!ensureLayout(textId)) {
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

} // namespace engine::text

