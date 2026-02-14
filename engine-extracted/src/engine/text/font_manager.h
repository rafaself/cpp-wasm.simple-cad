#ifndef ELETROCAD_ENGINE_TEXT_FONT_MANAGER_H
#define ELETROCAD_ENGINE_TEXT_FONT_MANAGER_H

#include "engine/core/types.h"
#include "engine/text/text_types.h"
#include <cstdint>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

// Forward declarations for FreeType/HarfBuzz
typedef struct FT_LibraryRec_* FT_Library;
typedef struct FT_FaceRec_* FT_Face;
typedef struct hb_font_t hb_font_t;
typedef struct hb_buffer_t hb_buffer_t;

namespace engine::text {

/**
 * FontHandle: Wrapper for a loaded font with FreeType face and HarfBuzz font.
 */
struct FontHandle {
    std::uint32_t id;
    std::string familyName;
    bool bold;
    bool italic;
    
    FT_Face ftFace;
    hb_font_t* hbFont;
    
    // Cached metrics (at 1 unit scale, multiply by fontSize)
    FontMetrics metrics;
    
    // Font data storage (kept alive while face is loaded)
    std::vector<std::uint8_t> fontData;
};

/**
 * FontManager: Manages font loading, caching, and provides access to FreeType/HarfBuzz.
 * 
 * Responsibilities:
 * - Initialize/cleanup FreeType library
 * - Load fonts from memory or file
 * - Cache loaded fonts by ID
 * - Provide FontHandle for shaping operations
 * - Manage default/fallback fonts
 */
class FontManager {
public:
    FontManager();
    ~FontManager();
    
    // Non-copyable
    FontManager(const FontManager&) = delete;
    FontManager& operator=(const FontManager&) = delete;
    
    /**
     * Initialize the font system. Must be called before any other operations.
     * @return True if initialization succeeded
     */
    bool initialize();
    
    /**
     * Shutdown and cleanup all resources.
     */
    void shutdown();
    
    /**
     * Check if the font system is initialized.
     */
    bool isInitialized() const { return initialized_; }
    
    // =========================================================================
    // Font Loading
    // =========================================================================
    
    /**
     * Load a font from memory.
     * @param fontData Raw TTF/OTF data (will be copied and owned by FontManager)
     * @param dataSize Size of font data in bytes
     * @param familyName Optional family name override
     * @param bold Whether this is a bold variant
     * @param italic Whether this is an italic variant
     * @return Font ID, or 0 on failure
     */
    std::uint32_t loadFontFromMemory(
        const std::uint8_t* fontData,
        std::size_t dataSize,
        const std::string& familyName = "",
        bool bold = false,
        bool italic = false
    );
    
    /**
     * Load a font from file path (primarily for testing/development).
     * @param filePath Path to TTF/OTF file
     * @param bold Whether this is a bold variant
     * @param italic Whether this is an italic variant
     * @return Font ID, or 0 on failure
     */
    std::uint32_t loadFontFromFile(
        const std::string& filePath,
        bool bold = false,
        bool italic = false
    );
    
    /**
     * Register a built-in/embedded font.
     * @param fontId Specific font ID to use
     * @param fontData Raw TTF/OTF data
     * @param dataSize Size of font data
     * @param familyName Family name
     * @param bold Bold variant
     * @param italic Italic variant
     * @return True if registration succeeded
     */
    bool registerFont(
        std::uint32_t fontId,
        const std::uint8_t* fontData,
        std::size_t dataSize,
        const std::string& familyName,
        bool bold = false,
        bool italic = false
    );
    
    /**
     * Unload a font by ID.
     * @param fontId Font to unload
     * @return True if font was found and unloaded
     */
    bool unloadFont(std::uint32_t fontId);
    
    // =========================================================================
    // Font Access
    // =========================================================================
    
    /**
     * Get a font handle by ID.
     * @param fontId Font ID (0 = default font)
     * @return Pointer to FontHandle, or nullptr if not found
     */
    const FontHandle* getFont(std::uint32_t fontId) const;
    FontHandle* getFontMutable(std::uint32_t fontId);
    
    /**
     * Get the default font ID.
     */
    std::uint32_t getDefaultFontId() const { return defaultFontId_; }
    
    /**
     * Set the default font ID.
     */
    void setDefaultFontId(std::uint32_t fontId) { defaultFontId_ = fontId; }
    
    /**
     * Check if a font is loaded.
     */
    bool hasFont(std::uint32_t fontId) const;
    
    /**
     * Get all loaded font IDs.
     */
    std::vector<std::uint32_t> getLoadedFontIds() const;
    

    /**
     * Get a specific variant of a font (Bold/Italic) within the same family.
     * @param baseFontId The font ID to start logic from (fallback)
     * @param bold Requested bold state
     * @param italic Requested italic state
     * @return FontID of the variant, or baseFontId if not found
     */
    std::uint32_t getFontVariant(std::uint32_t baseFontId, bool bold, bool italic) const;    
    
    // =========================================================================
    // Font Metrics
    // =========================================================================
    
    /**
     * Get font metrics for a font at a specific size.
     * @param fontId Font ID
     * @param fontSize Size in canvas units
     * @return Scaled metrics, or default metrics if font not found
     */
    FontMetrics getScaledMetrics(std::uint32_t fontId, float fontSize) const;
    
    /**
     * Set the font size for FreeType operations.
     * @param fontId Font to configure
     * @param fontSize Size in pixels
     * @return True if successful
     */
    bool setFontSize(std::uint32_t fontId, float fontSize);
    
    // =========================================================================
    // FreeType Access (for GlyphAtlas)
    // =========================================================================
    
    /**
     * Get the FreeType library handle.
     */
    FT_Library getFTLibrary() const { return ftLibrary_; }
    
    /**
     * Get FreeType face for a font.
     */
    FT_Face getFTFace(std::uint32_t fontId) const;
    
private:
    bool initialized_ = false;
    FT_Library ftLibrary_ = nullptr;
    
    std::unordered_map<std::uint32_t, std::unique_ptr<FontHandle>> fonts_;
    // Map family name -> List of Font IDs
    std::unordered_map<std::string, std::vector<std::uint32_t>> familyMap_;
    
    std::uint32_t nextFontId_ = 1;
    std::uint32_t defaultFontId_ = 0;
    
    // Helper to create FontHandle from loaded FT_Face
    std::unique_ptr<FontHandle> createFontHandle(
        std::uint32_t id,
        FT_Face face,
        std::vector<std::uint8_t>&& fontData,
        const std::string& familyName,
        bool bold,
        bool italic
    );
    
    // Extract metrics from FT_Face
    FontMetrics extractMetrics(FT_Face face) const;
};

} // namespace engine::text

#endif // ELETROCAD_ENGINE_TEXT_FONT_MANAGER_H
