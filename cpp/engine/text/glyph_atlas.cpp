#include "engine/text/glyph_atlas.h"

// FreeType includes
#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_OUTLINE_H

// msdfgen includes
#include <msdfgen.h>

#include <algorithm>
#include <cstring>
#include <cmath>

namespace engine::text {

// ============================================================================
// FreeType outline to msdfgen Shape conversion
// ============================================================================

namespace {

#define F26DOT6_TO_DOUBLE(x) (1.0/64.0 * double(x))

struct FtContext {
    msdfgen::Point2 position;
    msdfgen::Shape* shape;
    msdfgen::Contour* contour;
};

msdfgen::Point2 ftPoint2(const FT_Vector& vector) {
    return msdfgen::Point2(F26DOT6_TO_DOUBLE(vector.x), F26DOT6_TO_DOUBLE(vector.y));
}

int ftMoveTo(const FT_Vector* to, void* user) {
    FtContext* context = static_cast<FtContext*>(user);
    if (!(context->contour && context->contour->edges.empty())) {
        context->contour = &context->shape->addContour();
    }
    context->position = ftPoint2(*to);
    return 0;
}

int ftLineTo(const FT_Vector* to, void* user) {
    FtContext* context = static_cast<FtContext*>(user);
    msdfgen::Point2 endpoint = ftPoint2(*to);
    if (endpoint != context->position) {
        context->contour->addEdge(msdfgen::EdgeHolder(context->position, endpoint));
        context->position = endpoint;
    }
    return 0;
}

int ftConicTo(const FT_Vector* control, const FT_Vector* to, void* user) {
    FtContext* context = static_cast<FtContext*>(user);
    msdfgen::Point2 ctrl = ftPoint2(*control);
    msdfgen::Point2 endpoint = ftPoint2(*to);
    context->contour->addEdge(msdfgen::EdgeHolder(context->position, ctrl, endpoint));
    context->position = endpoint;
    return 0;
}

int ftCubicTo(const FT_Vector* control1, const FT_Vector* control2, const FT_Vector* to, void* user) {
    FtContext* context = static_cast<FtContext*>(user);
    msdfgen::Point2 ctrl1 = ftPoint2(*control1);
    msdfgen::Point2 ctrl2 = ftPoint2(*control2);
    msdfgen::Point2 endpoint = ftPoint2(*to);
    context->contour->addEdge(msdfgen::EdgeHolder(context->position, ctrl1, ctrl2, endpoint));
    context->position = endpoint;
    return 0;
}

bool loadGlyphShape(msdfgen::Shape& output, FT_Face face, std::uint32_t glyphId) {
    FT_Error error = FT_Load_Glyph(face, glyphId, FT_LOAD_NO_SCALE);
    if (error) {
        return false;
    }
    
    if (face->glyph->format != FT_GLYPH_FORMAT_OUTLINE) {
        return false;  // Not an outline glyph (e.g., bitmap glyph)
    }
    
    output.contours.clear();
    output.inverseYAxis = false;
    
    FtContext context = {};
    context.shape = &output;
    context.contour = nullptr;
    
    FT_Outline_Funcs ftFunctions = {};
    ftFunctions.move_to = reinterpret_cast<FT_Outline_MoveToFunc>(&ftMoveTo);
    ftFunctions.line_to = reinterpret_cast<FT_Outline_LineToFunc>(&ftLineTo);
    ftFunctions.conic_to = reinterpret_cast<FT_Outline_ConicToFunc>(&ftConicTo);
    ftFunctions.cubic_to = reinterpret_cast<FT_Outline_CubicToFunc>(&ftCubicTo);
    ftFunctions.shift = 0;
    ftFunctions.delta = 0;
    
    error = FT_Outline_Decompose(&face->glyph->outline, &ftFunctions, &context);
    if (error) {
        return false;
    }
    
    // Remove empty contours
    if (!output.contours.empty() && output.contours.back().edges.empty()) {
        output.contours.pop_back();
    }
    
    return true;
}

} // anonymous namespace

// ============================================================================
// GlyphAtlas Implementation
// ============================================================================

GlyphAtlas::GlyphAtlas()
    : fontManager_(nullptr)
    , dirty_(false)
    , version_(0)
{
}

GlyphAtlas::~GlyphAtlas() {
    shutdown();
}

bool GlyphAtlas::initialize(FontManager* fontManager, const Config& config) {
    if (!fontManager || !fontManager->isInitialized()) {
        return false;
    }
    
    fontManager_ = fontManager;
    config_ = config;
    
    // Create the atlas packer
    packer_ = std::make_unique<AtlasPacker>(config_.width, config_.height, config_.padding);
    
    // Allocate texture buffer (RGBA)
    std::size_t bufferSize = getTextureDataSize();
    textureData_ = std::make_unique<std::uint8_t[]>(bufferSize);
    
    // Initialize to transparent black
    std::memset(textureData_.get(), 0, bufferSize);
    
    dirty_ = true;
    version_ = 1;
    
    return true;
}

void GlyphAtlas::shutdown() {
    glyphCache_.clear();
    packer_.reset();
    textureData_.reset();
    fontManager_ = nullptr;
    dirty_ = false;
    version_ = 0;
}

const GlyphAtlasEntry* GlyphAtlas::getGlyph(std::uint32_t fontId, std::uint32_t glyphId) {
    GlyphKey key = makeKey(fontId, glyphId);
    
    auto it = glyphCache_.find(key);
    if (it != glyphCache_.end()) {
        return &it->second;
    }
    
    // Generate the glyph
    return generateGlyph(fontId, glyphId);
}

bool GlyphAtlas::hasGlyph(std::uint32_t fontId, std::uint32_t glyphId) const {
    return glyphCache_.find(makeKey(fontId, glyphId)) != glyphCache_.end();
}

std::size_t GlyphAtlas::preloadAscii(std::uint32_t fontId) {
    if (!isInitialized()) {
        return 0;
    }
    
    const FontHandle* font = fontManager_->getFont(fontId);
    if (!font || !font->ftFace) {
        return 0;
    }
    
    std::size_t count = 0;
    FT_Face face = font->ftFace;
    
    // ASCII printable range: 32 (space) to 126 (~)
    for (std::uint32_t codepoint = 32; codepoint <= 126; ++codepoint) {
        FT_UInt glyphIndex = FT_Get_Char_Index(face, codepoint);
        if (glyphIndex != 0) {
            if (getGlyph(fontId, glyphIndex) != nullptr) {
                ++count;
            }
        }
    }
    
    return count;
}

std::size_t GlyphAtlas::preloadString(std::uint32_t fontId, const char* text, std::size_t length) {
    if (!isInitialized() || !text || length == 0) {
        return 0;
    }
    
    const FontHandle* font = fontManager_->getFont(fontId);
    if (!font || !font->ftFace) {
        return 0;
    }
    
    FT_Face face = font->ftFace;
    std::size_t count = 0;
    
    // Simple UTF-8 decoding
    std::size_t i = 0;
    while (i < length) {
        std::uint32_t codepoint = 0;
        std::uint8_t byte = static_cast<std::uint8_t>(text[i]);
        
        if ((byte & 0x80) == 0) {
            // ASCII
            codepoint = byte;
            i += 1;
        } else if ((byte & 0xE0) == 0xC0) {
            // 2-byte sequence
            if (i + 1 < length) {
                codepoint = ((byte & 0x1F) << 6) |
                           (static_cast<std::uint8_t>(text[i + 1]) & 0x3F);
            }
            i += 2;
        } else if ((byte & 0xF0) == 0xE0) {
            // 3-byte sequence
            if (i + 2 < length) {
                codepoint = ((byte & 0x0F) << 12) |
                           ((static_cast<std::uint8_t>(text[i + 1]) & 0x3F) << 6) |
                           (static_cast<std::uint8_t>(text[i + 2]) & 0x3F);
            }
            i += 3;
        } else if ((byte & 0xF8) == 0xF0) {
            // 4-byte sequence
            if (i + 3 < length) {
                codepoint = ((byte & 0x07) << 18) |
                           ((static_cast<std::uint8_t>(text[i + 1]) & 0x3F) << 12) |
                           ((static_cast<std::uint8_t>(text[i + 2]) & 0x3F) << 6) |
                           (static_cast<std::uint8_t>(text[i + 3]) & 0x3F);
            }
            i += 4;
        } else {
            // Invalid UTF-8, skip byte
            i += 1;
            continue;
        }
        
        if (codepoint > 0) {
            FT_UInt glyphIndex = FT_Get_Char_Index(face, codepoint);
            if (glyphIndex != 0) {
                if (getGlyph(fontId, glyphIndex) != nullptr) {
                    ++count;
                }
            }
        }
    }
    
    return count;
}

std::size_t GlyphAtlas::getTextureDataSize() const {
    return static_cast<std::size_t>(config_.width) * config_.height * 4;  // RGBA
}

float GlyphAtlas::getUsageRatio() const {
    return packer_ ? packer_->getUsageRatio() : 0.0f;
}

const GlyphAtlasEntry* GlyphAtlas::generateGlyph(std::uint32_t fontId, std::uint32_t glyphId) {
    if (!isInitialized()) {
        return nullptr;
    }
    
    const FontHandle* font = fontManager_->getFont(fontId);
    if (!font || !font->ftFace) {
        return nullptr;
    }
    
    FT_Face face = font->ftFace;
    
    // Load glyph shape from FreeType
    msdfgen::Shape shape;
    if (!loadGlyphShape(shape, face, glyphId)) {
        // Glyph has no outline (e.g., space character)
        // Create a valid but empty entry
        GlyphKey key = makeKey(fontId, glyphId);
        GlyphAtlasEntry entry = {};
        entry.glyphId = glyphId;
        entry.fontId = fontId;
        entry.fontSize = static_cast<float>(config_.msdfSize);
        entry.u0 = entry.v0 = entry.u1 = entry.v1 = 0.0f;
        entry.width = entry.height = 0.0f;
        entry.bearingX = entry.bearingY = 0.0f;
        
        // Get advance from FreeType
        FT_Load_Glyph(face, glyphId, FT_LOAD_NO_SCALE);
        entry.advance = static_cast<float>(face->glyph->advance.x) / static_cast<float>(face->units_per_EM);
        
        entry.atlasX = entry.atlasY = 0;
        entry.atlasW = entry.atlasH = 0;
        
        auto result = glyphCache_.emplace(key, entry);
        return &result.first->second;
    }
    
    // Check if shape has contours
    if (shape.contours.empty()) {
        // Empty shape (like space)
        GlyphKey key = makeKey(fontId, glyphId);
        GlyphAtlasEntry entry = {};
        entry.glyphId = glyphId;
        entry.fontId = fontId;
        entry.fontSize = static_cast<float>(config_.msdfSize);
        
        FT_Load_Glyph(face, glyphId, FT_LOAD_NO_SCALE);
        entry.advance = static_cast<float>(face->glyph->advance.x) / static_cast<float>(face->units_per_EM);
        
        auto result = glyphCache_.emplace(key, entry);
        return &result.first->second;
    }
    
    // Normalize shape and assign edge colors
    shape.normalize();
    msdfgen::edgeColoringSimple(shape, 3.0);
    
    // Get glyph bounds
    msdfgen::Shape::Bounds bounds = shape.getBounds();
    double glyphWidth = bounds.r - bounds.l;
    double glyphHeight = bounds.t - bounds.b;
    
    // Calculate scale to fit in msdfSize while maintaining aspect ratio
    double unitsPerEM = static_cast<double>(face->units_per_EM);
    double scale = static_cast<double>(config_.msdfSize) / unitsPerEM;
    
    // Calculate MSDF bitmap size (add margin for the SDF range)
    double margin = config_.msdfPixelRange;
    std::uint32_t bitmapWidth = static_cast<std::uint32_t>(std::ceil(glyphWidth * scale + 2 * margin));
    std::uint32_t bitmapHeight = static_cast<std::uint32_t>(std::ceil(glyphHeight * scale + 2 * margin));
    
    // Clamp to reasonable size
    bitmapWidth = std::max(1u, std::min(bitmapWidth, config_.msdfSize * 2));
    bitmapHeight = std::max(1u, std::min(bitmapHeight, config_.msdfSize * 2));
    
    // Try to pack into atlas
    auto packResult = packer_->pack(
        static_cast<std::uint16_t>(bitmapWidth),
        static_cast<std::uint16_t>(bitmapHeight)
    );
    
    if (!packResult) {
        // Atlas is full
        return nullptr;
    }
    
    // Generate MSDF
    msdfgen::Bitmap<float, 3> msdf(bitmapWidth, bitmapHeight);
    
    // Calculate projection: translate shape so bounds.l,bounds.b maps to margin,margin
    // then scale by 'scale'
    msdfgen::Vector2 translate(margin / scale - bounds.l, margin / scale - bounds.b);
    msdfgen::Vector2 scaleVec(scale, scale);
    msdfgen::Projection projection(scaleVec, translate);
    
    msdfgen::generateMSDF(msdf, shape, projection, config_.msdfPixelRange);
    
    // Copy to atlas texture
    copyToTexture(*packResult, msdf(0, 0), bitmapWidth, bitmapHeight);
    
    // Create atlas entry
    GlyphKey key = makeKey(fontId, glyphId);
    GlyphAtlasEntry entry;
    entry.glyphId = glyphId;
    entry.fontId = fontId;
    entry.fontSize = static_cast<float>(config_.msdfSize);
    
    // UV coordinates (normalized 0-1)
    entry.u0 = static_cast<float>(packResult->x) / static_cast<float>(config_.width);
    entry.v0 = static_cast<float>(packResult->y) / static_cast<float>(config_.height);
    entry.u1 = static_cast<float>(packResult->x + bitmapWidth) / static_cast<float>(config_.width);
    entry.v1 = static_cast<float>(packResult->y + bitmapHeight) / static_cast<float>(config_.height);
    
    // Glyph metrics (normalized to em units)
    entry.width = static_cast<float>(glyphWidth / unitsPerEM);
    entry.height = static_cast<float>(glyphHeight / unitsPerEM);
    entry.bearingX = static_cast<float>(bounds.l / unitsPerEM);
    entry.bearingY = static_cast<float>(bounds.t / unitsPerEM);
    
    // Advance
    FT_Load_Glyph(face, glyphId, FT_LOAD_NO_SCALE);
    entry.advance = static_cast<float>(face->glyph->advance.x) / static_cast<float>(unitsPerEM);
    
    // Atlas position
    entry.atlasX = packResult->x;
    entry.atlasY = packResult->y;
    entry.atlasW = static_cast<std::uint16_t>(bitmapWidth);
    entry.atlasH = static_cast<std::uint16_t>(bitmapHeight);
    
    auto result = glyphCache_.emplace(key, entry);
    
    dirty_ = true;
    ++version_;
    
    return &result.first->second;
}

void GlyphAtlas::copyToTexture(
    const AtlasPacker::Rect& rect,
    const float* msdfData,
    std::uint32_t msdfWidth,
    std::uint32_t msdfHeight
) {
    if (!textureData_ || !msdfData) {
        return;
    }
    
    std::uint32_t atlasWidth = config_.width;
    
    for (std::uint32_t y = 0; y < msdfHeight; ++y) {
        for (std::uint32_t x = 0; x < msdfWidth; ++x) {
            // Source: msdfgen uses row-major, bottom-to-top
            // We need to flip Y for OpenGL texture coordinates
            std::uint32_t srcY = msdfHeight - 1 - y;
            const float* srcPixel = msdfData + (srcY * msdfWidth + x) * 3;
            
            // Destination: atlas uses row-major, top-to-bottom (standard image format)
            std::uint32_t dstX = rect.x + x;
            std::uint32_t dstY = rect.y + y;
            std::uint8_t* dstPixel = textureData_.get() + (dstY * atlasWidth + dstX) * 4;
            
            // Convert float [-1, 1] to uint8 [0, 255]
            // MSDF values are in [-range, range] where range is pixelRange
            // We normalize to [0, 1] then to [0, 255]
            auto floatToU8 = [](float f) -> std::uint8_t {
                float clamped = std::max(0.0f, std::min(1.0f, f * 0.5f + 0.5f));
                return static_cast<std::uint8_t>(clamped * 255.0f + 0.5f);
            };
            
            dstPixel[0] = floatToU8(srcPixel[0]);  // R
            dstPixel[1] = floatToU8(srcPixel[1]);  // G
            dstPixel[2] = floatToU8(srcPixel[2]);  // B
            dstPixel[3] = 255;                      // A (fully opaque)
        }
    }
}

void GlyphAtlas::clearAtlas() {
    if (textureData_) {
        std::memset(textureData_.get(), 0, getTextureDataSize());
    }
    if (packer_) {
        packer_->reset();
    }
    glyphCache_.clear();
    dirty_ = true;
    ++version_;
}

} // namespace engine::text
