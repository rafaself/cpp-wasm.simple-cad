#ifndef ELETROCAD_ENGINE_TEXT_TYPES_H
#define ELETROCAD_ENGINE_TEXT_TYPES_H

#include "engine/core/types.h"
#include <cstdint>
#include <vector>
#include <string>

namespace engine::text {

// ============================================================================
// Internal Text Types (not exposed to JS directly)
// ============================================================================

// Shaped glyph info (output from HarfBuzz)
struct ShapedGlyph {
    std::uint32_t glyphId;      // Font-specific glyph index
    std::uint32_t clusterIndex; // UTF-8 byte index this glyph maps to
    float xAdvance;             // Horizontal advance
    float yAdvance;             // Vertical advance (usually 0 for LTR)
    float xOffset;              // Horizontal offset from baseline
    float yOffset;              // Vertical offset from baseline
    std::uint32_t flags;        // Bitfield: 1 = RTL
};

// A laid-out line of text
struct LayoutLine {
    std::uint32_t startGlyph;   // Index into shaped glyphs array
    std::uint32_t glyphCount;   // Number of glyphs in this line
    std::uint32_t startByte;    // UTF-8 byte offset of line start
    std::uint32_t byteCount;    // UTF-8 byte length of line
    float width;                // Total width of this line
    float ascent;               // Max ascent (above baseline)
    float descent;              // Max descent (below baseline)
    float lineHeight;           // Total line height
    float xOffset;              // Horizontal offset for alignment
};

// Complete layout result for a text entity
struct TextLayout {
    std::vector<ShapedGlyph> glyphs;
    std::vector<LayoutLine> lines;
    float totalWidth;           // Max line width
    float totalHeight;          // Sum of line heights
    float baselineY;            // Y offset to first baseline
    bool dirty;                 // Needs re-layout
};

// Glyph atlas entry (UV coordinates in atlas)
struct GlyphAtlasEntry {
    std::uint32_t glyphId;
    std::uint32_t fontId;
    float fontSize;             // Size bucket (e.g., 16, 32, 64)
    
    // UV coordinates in atlas texture (0-1 normalized)
    float u0, v0, u1, v1;
    
    // Glyph metrics in pixels at fontSize
    float width, height;
    float bearingX, bearingY;
    float advance;
    
    // Atlas slot info
    std::uint16_t atlasX, atlasY;  // Pixel position in atlas
    std::uint16_t atlasW, atlasH;  // Pixel size in atlas
};

// Render quad for a single glyph instance
struct TextQuad {
    // Position (world coordinates)
    float x, y;
    float width, height;
    
    // UV coordinates
    float u0, v0, u1, v1;
    
    // Color (RGBA, 0-1)
    float r, g, b, a;
    
    // Draw order (for z-sorting with shapes)
    std::uint32_t drawOrder;
};

// Font metrics cached per font
struct FontMetrics {
    float unitsPerEM;
    float ascender;             // Positive, above baseline
    float descender;            // Negative, below baseline
    float lineGap;
    float underlinePosition;
    float underlineThickness;
};

// Font identifier (for multi-font support)
struct FontId {
    std::uint32_t id;
    std::string familyName;
    bool bold;
    bool italic;
};

} // namespace engine::text

#endif // ELETROCAD_ENGINE_TEXT_TYPES_H
