#ifndef ELETROCAD_ENGINE_TEXT_GLYPH_ATLAS_H
#define ELETROCAD_ENGINE_TEXT_GLYPH_ATLAS_H

#include "engine/text/text_types.h"
#include "engine/text/atlas_packer.h"
#include "engine/text/font_manager.h"
#include <cstdint>
#include <memory>
#include <unordered_map>
#include <vector>

namespace engine::text {

/**
 * GlyphAtlas: MSDF glyph atlas for high-quality text rendering.
 * 
 * Responsibilities:
 * - Generate MSDF bitmaps for glyphs using msdfgen
 * - Pack glyphs into an atlas texture using AtlasPacker
 * - Cache glyph entries for fast lookup
 * - Provide texture data buffer for WebGL upload
 * 
 * The atlas uses RGBA format where RGB contains the MSDF and A is always 255.
 * This allows for efficient WebGL texture uploads.
 */
class GlyphAtlas {
public:
    /**
     * Configuration for atlas creation.
     */
    struct Config {
        std::uint16_t width = 2048;     // Atlas width in pixels
        std::uint16_t height = 2048;    // Atlas height in pixels
        std::uint16_t padding = 8;      // Padding between glyphs (must be >= msdfPixelRange to avoid bleeding)
        float msdfPixelRange = 8.0f;    // MSDF distance range in pixels (increased for smoother gradients)
        std::uint32_t msdfSize = 96;    // MSDF bitmap size (square) - High quality
    };
    
    GlyphAtlas();
    ~GlyphAtlas();
    
    // Non-copyable
    GlyphAtlas(const GlyphAtlas&) = delete;
    GlyphAtlas& operator=(const GlyphAtlas&) = delete;
    
    /**
     * Initialize the atlas with a font manager and configuration.
     */
    bool initialize(FontManager* fontManager, const Config& config);
    
    /**
     * Initialize the atlas with default configuration.
     */
    bool initialize(FontManager* fontManager) {
        return initialize(fontManager, Config{});
    }
    
    /**
     * Check if initialized.
     */
    bool isInitialized() const { return fontManager_ != nullptr && textureData_ != nullptr; }
    
    /**
     * Shutdown and release resources.
     */
    void shutdown();
    
    /**
     * Clear the entire atlas (for reset/rebuild).
     */
    void clearAtlas();
    
    // =========================================================================
    // Glyph Operations
    // =========================================================================
    
    /**
     * Get or generate a glyph entry.
     * If the glyph is not in the atlas, it will be generated and packed.
     * @param fontId Font identifier
     * @param glyphId Glyph index from HarfBuzz/FreeType
     * @return Pointer to atlas entry, or nullptr if generation failed
     */
    const GlyphAtlasEntry* getGlyph(
        std::uint32_t fontId,
        std::uint32_t glyphId,
        TextStyleFlags style = TextStyleFlags::None
    );
    
    /**
     * Check if a glyph is already in the atlas.
     */
    bool hasGlyph(
        std::uint32_t fontId,
        std::uint32_t glyphId,
        TextStyleFlags style = TextStyleFlags::None
    ) const;
    
    /**
     * Pre-generate glyphs for common ASCII range (32-126).
     * @param fontId Font to generate glyphs for
     * @return Number of glyphs successfully generated
     */
    std::size_t preloadAscii(std::uint32_t fontId);
    
    /**
     * Pre-generate glyphs for a string.
     * @param fontId Font to use
     * @param text UTF-8 text string
     * @return Number of glyphs successfully generated
     */
    std::size_t preloadString(std::uint32_t fontId, const char* text, std::size_t length);
    
    // =========================================================================
    // Texture Access
    // =========================================================================
    
    /**
     * Get pointer to texture data buffer.
     * Format: RGBA, 8 bits per channel.
     */
    const std::uint8_t* getTextureData() const { return textureData_.get(); }
    
    /**
     * Get texture data buffer size in bytes.
     */
    std::size_t getTextureDataSize() const;
    
    /**
     * Get texture dimensions.
     */
    std::uint16_t getWidth() const { return config_.width; }
    std::uint16_t getHeight() const { return config_.height; }
    
    /**
     * Check if texture needs re-upload (new glyphs added).
     */
    bool isDirty() const { return dirty_; }
    
    /**
     * Clear dirty flag after texture upload.
     */
    void clearDirty() { dirty_ = false; }
    
    /**
     * Get texture version number (increments on each modification).
     */
    std::uint32_t getVersion() const { return version_; }
    
    // =========================================================================
    // Statistics
    // =========================================================================
    
    /**
     * Get number of glyphs in atlas.
     */
    std::size_t getGlyphCount() const { return glyphCache_.size(); }
    
    /**
     * Get atlas usage ratio (0.0 - 1.0).
     */
    float getUsageRatio() const;
    
    /**
     * Get MSDF configuration.
     */
    const Config& getConfig() const { return config_; }

    /**
     * Get the UV rectangle for a solid white pixel (1,1,1,1).
     * Used for drawing geometric primitives (underline, strike, cursor).
     */
    const AtlasPacker::Rect& getWhitePixelRect() const { return whitePixelRect_; }

private:
    // Key for glyph cache: (fontId << 32) | glyphId
    using GlyphKey = std::uint64_t;
    
    static GlyphKey makeKey(std::uint32_t fontId, std::uint32_t glyphId, TextStyleFlags style) {
        constexpr std::uint8_t faceAffectingMask =
            static_cast<std::uint8_t>(TextStyleFlags::Bold) |
            static_cast<std::uint8_t>(TextStyleFlags::Italic);
        const std::uint64_t styleBits = static_cast<std::uint64_t>(static_cast<std::uint8_t>(style) & faceAffectingMask);
        return (static_cast<std::uint64_t>(fontId) << 32) |
               (static_cast<std::uint64_t>(glyphId) << 8) |
               styleBits;
    }
    
    /**
     * Generate MSDF bitmap for a glyph and pack it into the atlas.
     */
    const GlyphAtlasEntry* generateGlyph(
        std::uint32_t fontId,
        std::uint32_t glyphId,
        TextStyleFlags style,
        bool isRetry = false
    );
    
    /**
     * Copy MSDF bitmap data to atlas texture.
     */
    void copyToTexture(const AtlasPacker::Rect& rect, const float* msdfData, 
                       std::uint32_t msdfWidth, std::uint32_t msdfHeight);
    

    
    FontManager* fontManager_;
    Config config_;
    
    std::unique_ptr<AtlasPacker> packer_;
    std::unique_ptr<std::uint8_t[]> textureData_;
    
    std::unordered_map<GlyphKey, GlyphAtlasEntry> glyphCache_;
    
    bool dirty_;
    std::uint32_t version_;
    AtlasPacker::Rect whitePixelRect_{};
};

} // namespace engine::text

#endif // ELETROCAD_ENGINE_TEXT_GLYPH_ATLAS_H
