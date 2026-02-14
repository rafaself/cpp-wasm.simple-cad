#include "engine/text/font_manager.h"
#include "engine/core/logging.h"

#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_TRUETYPE_TABLES_H

#include <hb.h>
#include <hb-ft.h>

#include <fstream>
#include <cstring>
#include <algorithm>

namespace engine::text {

FontManager::FontManager() = default;

FontManager::~FontManager() {
    shutdown();
}

bool FontManager::initialize() {
    if (initialized_) {
        return true;
    }
    
    FT_Error error = FT_Init_FreeType(&ftLibrary_);
    if (error) {
        return false;
    }
    
    initialized_ = true;
    return true;
}

void FontManager::shutdown() {
    if (!initialized_) {
        return;
    }
    
    // Cleanup all fonts
    for (auto& [id, handle] : fonts_) {
        if (handle) {
            if (handle->hbFont) {
                hb_font_destroy(handle->hbFont);
                handle->hbFont = nullptr;
            }
            if (handle->ftFace) {
                FT_Done_Face(handle->ftFace);
                handle->ftFace = nullptr;
            }
        }
    }
    fonts_.clear();
    
    if (ftLibrary_) {
        FT_Done_FreeType(ftLibrary_);
        ftLibrary_ = nullptr;
    }
    
    initialized_ = false;
}

std::uint32_t FontManager::loadFontFromMemory(
    const std::uint8_t* fontData,
    std::size_t dataSize,
    const std::string& familyName,
    bool bold,
    bool italic
) {
    if (!initialized_ || !fontData || dataSize == 0) {
        return 0;
    }
    
    // Copy font data (FreeType requires data to stay valid)
    std::vector<std::uint8_t> dataCopy(fontData, fontData + dataSize);
    
    FT_Face face = nullptr;
    FT_Error error = FT_New_Memory_Face(
        ftLibrary_,
        dataCopy.data(),
        static_cast<FT_Long>(dataCopy.size()),
        0,  // face index
        &face
    );
    
    if (error || !face) {
        return 0;
    }
    
    // Determine family name
    std::string family = familyName;
    if (family.empty() && face->family_name) {
        family = face->family_name;
    }
    if (family.empty()) {
        family = "Unknown";
    }
    
    std::uint32_t fontId = nextFontId_++;
    auto handle = createFontHandle(fontId, face, std::move(dataCopy), family, bold, italic);
    
    if (!handle) {
        FT_Done_Face(face);
        return 0;
    }
    
    fonts_[fontId] = std::move(handle);
    
    // Register in family map
    if (!familyName.empty()) {
        familyMap_[familyName].push_back(fontId);
    }
    
    // Set as default if first font loaded
    if (defaultFontId_ == 0) {
        defaultFontId_ = fontId;
    }
    
    return fontId;
}

std::uint32_t FontManager::loadFontFromFile(
    const std::string& filePath,
    bool bold,
    bool italic
) {
    if (!initialized_) {
        return 0;
    }
    
    // Read file into memory
    std::ifstream file(filePath, std::ios::binary | std::ios::ate);
    if (!file.is_open()) {
        return 0;
    }
    
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);
    
    std::vector<std::uint8_t> buffer(static_cast<std::size_t>(size));
    if (!file.read(reinterpret_cast<char*>(buffer.data()), size)) {
        return 0;
    }
    
    return loadFontFromMemory(buffer.data(), buffer.size(), "", bold, italic);
}

bool FontManager::registerFont(
    std::uint32_t fontId,
    const std::uint8_t* fontData,
    std::size_t dataSize,
    const std::string& familyName,
    bool bold,
    bool italic
) {
    if (!initialized_ || !fontData || dataSize == 0) {
        return false;
    }
    
    // Check if ID already exists
    if (fonts_.find(fontId) != fonts_.end()) {
        return false;
    }
    
    // Copy font data
    std::vector<std::uint8_t> dataCopy(fontData, fontData + dataSize);
    
    FT_Face face = nullptr;
    FT_Error error = FT_New_Memory_Face(
        ftLibrary_,
        dataCopy.data(),
        static_cast<FT_Long>(dataCopy.size()),
        0,
        &face
    );
    
    if (error || !face) {
        return false;
    }
    
    // Determine family name from font file if not provided
    std::string family = familyName;
    if (family.empty() && face->family_name) {
        family = face->family_name;
    }
    if (family.empty()) {
        family = "Unknown";
    }
    
    auto handle = createFontHandle(fontId, face, std::move(dataCopy), family, bold, italic);
    
    if (!handle) {
        FT_Done_Face(face);
        return false;
    }
    
    fonts_[fontId] = std::move(handle);
    
    // Register in family map for variant lookup (use resolved family name)
    if (!family.empty()) {
        familyMap_[family].push_back(fontId);
        ENGINE_LOG_DEBUG("[FontManager] registerFont: fontId=%u family='%s' bold=%d italic=%d (familyMapSize=%zu)",
                         fontId, family.c_str(), bold, italic, familyMap_[family].size());
    }
    
    // Update nextFontId if necessary
    if (fontId >= nextFontId_) {
        nextFontId_ = fontId + 1;
    }
    
    // Set as default if first font
    if (defaultFontId_ == 0) {
        defaultFontId_ = fontId;
    }
    
    return true;
}

bool FontManager::unloadFont(std::uint32_t fontId) {
    auto it = fonts_.find(fontId);
    if (it == fonts_.end()) {
        return false;
    }
    
    auto& handle = it->second;
    if (handle) {
        if (handle->hbFont) {
            hb_font_destroy(handle->hbFont);
        }
        if (handle->ftFace) {
            FT_Done_Face(handle->ftFace);
        }
    }
    
    fonts_.erase(it);
    
    // Update default font if we just unloaded it
    if (defaultFontId_ == fontId) {
        defaultFontId_ = fonts_.empty() ? 0 : fonts_.begin()->first;
    }
    
    return true;
}

const FontHandle* FontManager::getFont(std::uint32_t fontId) const {
    // If fontId is 0, return default font
    std::uint32_t actualId = (fontId == 0) ? defaultFontId_ : fontId;
    
    auto it = fonts_.find(actualId);
    return (it != fonts_.end()) ? it->second.get() : nullptr;
}

FontHandle* FontManager::getFontMutable(std::uint32_t fontId) {
    std::uint32_t actualId = (fontId == 0) ? defaultFontId_ : fontId;
    
    auto it = fonts_.find(actualId);
    return (it != fonts_.end()) ? it->second.get() : nullptr;
}

bool FontManager::hasFont(std::uint32_t fontId) const {
    if (fontId == 0) {
        return defaultFontId_ != 0 && fonts_.find(defaultFontId_) != fonts_.end();
    }
    return fonts_.find(fontId) != fonts_.end();
}

std::vector<std::uint32_t> FontManager::getLoadedFontIds() const {
    std::vector<std::uint32_t> ids;
    ids.reserve(fonts_.size());
    for (const auto& [id, _] : fonts_) {
        ids.push_back(id);
    }
    return ids;
}


std::uint32_t FontManager::getFontVariant(std::uint32_t baseFontId, bool bold, bool italic) const {
    // 1. Get base family
    const FontHandle* base = getFont(baseFontId);
    if (!base) {
        ENGINE_LOG_DEBUG("[FontManager] getFontVariant: base font %u not found", baseFontId);
        return baseFontId;
    }

    const std::string& family = base->familyName;
    if (family.empty()) {
        ENGINE_LOG_DEBUG("[FontManager] getFontVariant: base font %u has empty family", baseFontId);
        return baseFontId;
    }

    // 2. Look up family variants
    auto it = familyMap_.find(family);
    if (it == familyMap_.end()) {
        ENGINE_LOG_DEBUG("[FontManager] getFontVariant: family '%s' not in familyMap (mapSize=%zu)",
                         family.c_str(), familyMap_.size());
        return baseFontId;
    }

    // 3. Find best match
    // Priority: Exact match > Partial match (e.g. Bold requested, but found BoldItalic? No, usually strict on traits)
    // We want the font that matches the expected traits.
    ENGINE_LOG_DEBUG("[FontManager] getFontVariant: searching family '%s' with %zu fonts for bold=%d italic=%d",
                     family.c_str(), it->second.size(), bold, italic);
    
    for (std::uint32_t id : it->second) {
        const FontHandle* h = getFont(id);
        if (h) {
            ENGINE_LOG_DEBUG("[FontManager]   font %u: bold=%d italic=%d", id, h->bold, h->italic);
        }
        if (h && h->bold == bold && h->italic == italic) {
            ENGINE_LOG_DEBUG("[FontManager]   MATCH: returning font %u", id);
            return id;
        }
    }
    
    // Fallback: If we can't find exact match, return base.
    ENGINE_LOG_DEBUG("[FontManager]   NO MATCH: returning base %u", baseFontId);
    return baseFontId;
}

FontMetrics FontManager::getScaledMetrics(std::uint32_t fontId, float fontSize) const {
    const FontHandle* handle = getFont(fontId);
    if (!handle) {
        // Return default metrics
        FontMetrics defaults{};
        defaults.unitsPerEM = 1000.0f;
        defaults.ascender = fontSize * 0.8f;
        defaults.descender = fontSize * -0.2f;
        defaults.lineGap = fontSize * 0.1f;
        defaults.underlinePosition = fontSize * -0.1f;
        defaults.underlineThickness = fontSize * 0.05f;
        return defaults;
    }
    
    float scale = fontSize / handle->metrics.unitsPerEM;
    
    FontMetrics scaled{};
    scaled.unitsPerEM = handle->metrics.unitsPerEM;
    scaled.ascender = handle->metrics.ascender * scale;
    scaled.descender = handle->metrics.descender * scale;
    scaled.lineGap = handle->metrics.lineGap * scale;
    scaled.underlinePosition = handle->metrics.underlinePosition * scale;
    scaled.underlineThickness = handle->metrics.underlineThickness * scale;
    
    return scaled;
}

bool FontManager::setFontSize(std::uint32_t fontId, float fontSize) {
    FontHandle* handle = getFontMutable(fontId);
    if (!handle || !handle->ftFace) {
        return false;
    }
    
    // Set char size using 72 DPI to ensure 1 point = 1 pixel mapping
    // We use FT_Set_Char_Size instead of Pixel_Sizes to support fractional sizes (26.6 fixed point)
    // This provides exact geometric parity with web/Figma logical pixels
    FT_Error error = FT_Set_Char_Size(
        handle->ftFace,
        0,                                      // char_width (0 = same as height)
        static_cast<FT_F26Dot6>(fontSize * 64), // char_height in 1/64th of points
        72,                                     // horizontal resolution
        72                                      // vertical resolution
    );
    
    if (error) {
        return false;
    }
    
    // Notify HarfBuzz that the underlying FT_Face has changed (e.g. metrics/size)
    // This is better than manually setting scale because it updates all FT-derived metrics
    if (handle->hbFont) {
        hb_ft_font_changed(handle->hbFont);
    }
    
    return true;
}

FT_Face FontManager::getFTFace(std::uint32_t fontId) const {
    const FontHandle* handle = getFont(fontId);
    return handle ? handle->ftFace : nullptr;
}

std::unique_ptr<FontHandle> FontManager::createFontHandle(
    std::uint32_t id,
    FT_Face face,
    std::vector<std::uint8_t>&& fontData,
    const std::string& familyName,
    bool bold,
    bool italic
) {
    auto handle = std::make_unique<FontHandle>();
    handle->id = id;
    handle->familyName = familyName;
    handle->bold = bold;
    handle->italic = italic;
    handle->ftFace = face;
    handle->fontData = std::move(fontData);
    
    // Create HarfBuzz font from FreeType face
    handle->hbFont = hb_ft_font_create(face, nullptr);
    if (!handle->hbFont) {
        return nullptr;
    }
    
    // Extract metrics
    handle->metrics = extractMetrics(face);
    
    return handle;
}

FontMetrics FontManager::extractMetrics(FT_Face face) const {
    FontMetrics metrics{};
    
    if (!face) {
        metrics.unitsPerEM = 1000.0f;
        metrics.ascender = 800.0f;
        metrics.descender = -200.0f;
        metrics.lineGap = 0.0f;
        metrics.underlinePosition = -100.0f;
        metrics.underlineThickness = 50.0f;
        return metrics;
    }
    
    metrics.unitsPerEM = static_cast<float>(face->units_per_EM);
    metrics.ascender = static_cast<float>(face->ascender);
    metrics.descender = static_cast<float>(face->descender);
    metrics.lineGap = static_cast<float>(face->height - face->ascender + face->descender);
    metrics.underlinePosition = static_cast<float>(face->underline_position);
    metrics.underlineThickness = static_cast<float>(face->underline_thickness);
    
    // Try to get OS/2 table for more accurate metrics
    TT_OS2* os2 = static_cast<TT_OS2*>(FT_Get_Sfnt_Table(face, FT_SFNT_OS2));
    if (os2) {
        // sTypoAscender/Descender are generally more reliable
        if (os2->sTypoAscender != 0 || os2->sTypoDescender != 0) {
            metrics.ascender = static_cast<float>(os2->sTypoAscender);
            metrics.descender = static_cast<float>(os2->sTypoDescender);
            metrics.lineGap = static_cast<float>(os2->sTypoLineGap);
        }
    }
    
    return metrics;
}

} // namespace engine::text
