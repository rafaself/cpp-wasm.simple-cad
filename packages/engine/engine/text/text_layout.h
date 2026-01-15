#ifndef ELETROCAD_ENGINE_TEXT_LAYOUT_H
#define ELETROCAD_ENGINE_TEXT_LAYOUT_H

#include "engine/core/types.h"
#include "engine/text/text_types.h"
#include "engine/text/text_store.h"
#include "engine/text/font_manager.h"
#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

// Forward declarations
typedef struct hb_buffer_t hb_buffer_t;

namespace engine::text {

/**
 * TextLayoutEngine: Performs text shaping and layout using HarfBuzz/FreeType.
 * 
 * Responsibilities:
 * - Shape text using HarfBuzz (kerning, ligatures, bidi)
 * - Calculate glyph positions
 * - Line breaking (explicit \n and word wrap for FixedWidth)
 * - Compute layout bounds (width, height, AABB)
 * - Hit testing (point to character index)
 * - Caret position calculation
 * 
 * Non-responsibilities:
 * - Font loading (handled by FontManager)
 * - Glyph rasterization (handled by GlyphAtlas)
 * - Text storage (handled by TextStore)
 */
class TextLayoutEngine {
public:
    TextLayoutEngine();
    ~TextLayoutEngine();
    
    // Non-copyable
    TextLayoutEngine(const TextLayoutEngine&) = delete;
    TextLayoutEngine& operator=(const TextLayoutEngine&) = delete;
    
    /**
     * Initialize with references to font manager and text store.
     */
    void initialize(FontManager* fontManager, TextStore* textStore);
    
    /**
     * Check if initialized.
     */
    bool isInitialized() const { return fontManager_ != nullptr && textStore_ != nullptr; }
    
    // =========================================================================
    // Layout Operations
    // =========================================================================
    
    /**
     * Layout a single text entity.
     * @param textId ID of text entity in TextStore
     * @return True if layout succeeded
     */
    bool layoutText(std::uint32_t textId);
    
    /**
     * Layout all dirty text entities.
     * @return IDs of texts that were laid out
     */
    std::vector<std::uint32_t> layoutDirtyTexts();
    
    /**
     * Force re-layout of all texts.
     */
    void layoutAllTexts();

    /**
     * Ensure a specific text entity is laid out and up-to-date.
     * Checks dirty flags and re-layouts if necessary.
     * @param textId Text entity ID
     * @return True if text exists and is valid (freshly laid out or was already valid)
     */
    bool ensureLayout(std::uint32_t textId);
    
    /**
     * Get the layout result for a text entity.
     * @param textId Text entity ID
     * @return Pointer to TextLayout, or nullptr if not found
     */
    const TextLayout* getLayout(std::uint32_t textId) const;
    
    /**
     * Invalidate layout for a text (mark for re-layout).
     */
    void invalidateLayout(std::uint32_t textId);
    
    /**
     * Clear layout cache for a text.
     */
    void clearLayout(std::uint32_t textId);
    
    /**
     * Clear all layout caches.
     */
    void clearAllLayouts();
    
    // =========================================================================
    // Hit Testing
    // =========================================================================
    
    /**
     * Hit test a point against a text entity.
     * @param textId Text entity ID
     * @param localX X coordinate in text-local space
     * @param localY Y coordinate in text-local space
     * @return Hit result with character index
     */
    TextHitResult hitTest(std::uint32_t textId, float localX, float localY);
    
    /**
     * Get the character index at a given X position on a specific line.
     * @param textId Text entity ID
     * @param lineIndex Line number (0-based)
     * @param localX X coordinate in text-local space
     * @return Character index (byte offset)
     */
    std::uint32_t getCharIndexAtX(std::uint32_t textId, std::uint32_t lineIndex, float localX) const;
    
    // =========================================================================
    // Caret Operations
    // =========================================================================
    
    /**
     * Get caret position for rendering.
     * @param textId Text entity ID
     * @param charIndex Character index (byte offset)
     * @return Caret position in text-local space
     */
    TextCaretPosition getCaretPosition(std::uint32_t textId, std::uint32_t charIndex);
    
    /**
     * Get selection rectangles for a text range.
     * @param textId Text entity ID
     * @param startIndex Selection start (byte offset)
     * @param endIndex Selection end (byte offset)
     * @return List of selection rectangles (one per line)
     */
    struct SelectionRect {
        float x, y, width, height;
        std::uint32_t lineIndex;
    };
    std::vector<SelectionRect> getSelectionRects(
        std::uint32_t textId,
        std::uint32_t startIndex,
        std::uint32_t endIndex
    );
    
    // =========================================================================
    // Navigation
    // =========================================================================
    
    /**
     * Get the character index for the previous character.
     * @param textId Text entity ID
     * @param charIndex Current character index
     * @return Previous character index, or same if at start
     */
    /**
     * Get the previous character index visually (left).
     * @param textId Text entity ID
     * @param charIndex Current character index
     * @return New character index aligned to cluster boundary
     */
    std::uint32_t getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex);
    
    /**
     * Get the next character index visually (right).
     * @param textId Text entity ID
     * @param charIndex Current character index
     * @return New character index aligned to cluster boundary
     */
    std::uint32_t getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex);

    /**
     * Get the word boundary to the left.
     */
    std::uint32_t getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex);

    /**
     * Get the word boundary to the right.
     */
    std::uint32_t getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex);
    
    /**
     * Get the character index at the start of the line containing charIndex.
     */
    std::uint32_t getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex);
    
    /**
     * Get the character index at the end of the line containing charIndex.
     */
    std::uint32_t getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex);

    /**
     * Get the character index one line up from the current visual position.
     */
    std::uint32_t getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex);

    /**
     * Get the character index one line down from the current visual position.
     */
    std::uint32_t getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex);
    
private:
    FontManager* fontManager_ = nullptr;
    TextStore* textStore_ = nullptr;
    
    // Layout cache: textId -> TextLayout
    std::unordered_map<std::uint32_t, TextLayout> layoutCache_;
    
    // HarfBuzz buffer (reused for shaping)
    hb_buffer_t* hbBuffer_ = nullptr;
    
    // =========================================================================
    // Internal Layout Methods
    // =========================================================================
    
    /**
     * Shape a single run of text.
     * @param content UTF-8 text content
     * @param run Run styling information
     * @param outGlyphs Output shaped glyphs
     * @return True if shaping succeeded
     */
    bool shapeRun(
        std::string_view content,
        const TextRun& run,
        std::vector<ShapedGlyph>& outGlyphs
    );
    
    /**
     * Perform line breaking on shaped glyphs.
     * @param text TextRec with box mode and constraints
     * @param content UTF-8 content
     * @param glyphs Shaped glyphs
     * @param runs Text runs
     * @param outLines Output line information
     */
    void breakLines(
        const TextRec& text,
        std::string_view content,
        const std::vector<ShapedGlyph>& glyphs,
        const std::vector<TextRun>& runs,
        std::vector<LayoutLine>& outLines
    );
    
    /**
     * Calculate line positions based on alignment.
     */
    void positionLines(
        const TextRec& text,
        std::vector<LayoutLine>& lines,
        float totalWidth
    );
    
    /**
     * Find which line contains a given Y coordinate.
     */
    std::uint32_t findLineAtY(const TextLayout& layout, float y) const;
    
    /**
     * Find which glyph contains a given X coordinate on a line.
     */
    std::uint32_t findGlyphAtX(
        const TextLayout& layout,
        const LayoutLine& line,
        float x
    ) const;
    
    /**
     * Get the X position of a glyph within a line.
     */
    float getGlyphX(const TextLayout& layout, std::uint32_t glyphIndex) const;
    
    /**
     * Check if a byte index is at a UTF-8 character boundary.
     */
    static bool isCharBoundary(std::string_view content, std::uint32_t byteIndex);
    
    /**
     * Get the byte index of the previous UTF-8 character.
     */
    static std::uint32_t prevCharBoundary(std::string_view content, std::uint32_t byteIndex);
    
    /**
     * Get the byte index of the next UTF-8 character.
     */
    static std::uint32_t nextCharBoundary(std::string_view content, std::uint32_t byteIndex);
};

} // namespace engine::text

#endif // ELETROCAD_ENGINE_TEXT_LAYOUT_H
