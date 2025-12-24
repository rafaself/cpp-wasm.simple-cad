#include <gtest/gtest.h>
#include "engine/text/atlas_packer.h"
#include "engine/text/glyph_atlas.h"
#include "engine/text/font_manager.h"
#include <ft2build.h>
#include FT_FREETYPE_H
#include <vector>
#include <cstring>

using namespace engine::text;

// =============================================================================
// AtlasPacker Tests
// =============================================================================

class AtlasPackerTest : public ::testing::Test {
protected:
    void SetUp() override {}
    void TearDown() override {}
};

TEST_F(AtlasPackerTest, Construction) {
    AtlasPacker packer(512, 512, 1);
    
    EXPECT_EQ(packer.getWidth(), 512);
    EXPECT_EQ(packer.getHeight(), 512);
    EXPECT_EQ(packer.getUsedPixels(), 0u);
    EXPECT_FLOAT_EQ(packer.getUsageRatio(), 0.0f);
}

TEST_F(AtlasPackerTest, PackSingleRect) {
    AtlasPacker packer(256, 256, 1);
    
    auto result = packer.pack(32, 32);
    ASSERT_TRUE(result.has_value());
    
    EXPECT_EQ(result->width, 32);
    EXPECT_EQ(result->height, 32);
    EXPECT_GT(packer.getUsedPixels(), 0u);
}

TEST_F(AtlasPackerTest, PackMultipleRects) {
    AtlasPacker packer(256, 256, 1);
    
    std::vector<AtlasPacker::Rect> rects;
    for (int i = 0; i < 10; ++i) {
        auto result = packer.pack(32, 32);
        ASSERT_TRUE(result.has_value()) << "Failed to pack rect " << i;
        rects.push_back(*result);
    }
    
    // Verify no overlaps
    for (std::size_t i = 0; i < rects.size(); ++i) {
        for (std::size_t j = i + 1; j < rects.size(); ++j) {
            const auto& a = rects[i];
            const auto& b = rects[j];
            
            // Check for non-overlap (with 1px padding)
            bool overlaps = !(a.x + a.width + 1 <= b.x ||
                             b.x + b.width + 1 <= a.x ||
                             a.y + a.height + 1 <= b.y ||
                             b.y + b.height + 1 <= a.y);
            EXPECT_FALSE(overlaps) << "Rects " << i << " and " << j << " overlap";
        }
    }
}

TEST_F(AtlasPackerTest, PackUntilFull) {
    AtlasPacker packer(128, 128, 1);
    
    int successCount = 0;
    while (true) {
        auto result = packer.pack(32, 32);
        if (!result) {
            break;
        }
        ++successCount;
        
        // Safety limit
        if (successCount > 100) {
            FAIL() << "Packer accepted too many rects";
        }
    }
    
    // With 128x128 atlas and 33x33 rects (32 + 1 padding), we should fit about 9 rects
    // (3 rows x 3 columns = 9, but depends on initial padding)
    EXPECT_GT(successCount, 0);
    EXPECT_LT(successCount, 20);  // Should not fit too many
}

TEST_F(AtlasPackerTest, CanFit) {
    AtlasPacker packer(256, 256, 1);
    
    EXPECT_TRUE(packer.canFit(32, 32));
    EXPECT_TRUE(packer.canFit(254, 254));  // 254 + 1 padding = 255, fits in 256
    EXPECT_FALSE(packer.canFit(257, 32));  // Too wide
    EXPECT_FALSE(packer.canFit(32, 257));  // Too tall
    EXPECT_FALSE(packer.canFit(256, 256)); // 256 + 1 padding > 256
}

TEST_F(AtlasPackerTest, Reset) {
    AtlasPacker packer(256, 256, 1);
    
    // Pack some rects
    packer.pack(32, 32);
    packer.pack(32, 32);
    EXPECT_GT(packer.getUsedPixels(), 0u);
    
    // Reset
    packer.reset();
    EXPECT_EQ(packer.getUsedPixels(), 0u);
    EXPECT_EQ(packer.getShelfCount(), 0u);
}

TEST_F(AtlasPackerTest, PackZeroSize) {
    AtlasPacker packer(256, 256, 1);
    
    auto result = packer.pack(0, 0);
    EXPECT_TRUE(result.has_value());  // Should succeed but be empty
    EXPECT_EQ(result->width, 0);
    EXPECT_EQ(result->height, 0);
}

TEST_F(AtlasPackerTest, DifferentSizes) {
    AtlasPacker packer(512, 512, 1);
    
    // Pack rects of different heights
    auto r1 = packer.pack(64, 32);
    auto r2 = packer.pack(32, 64);
    auto r3 = packer.pack(48, 48);
    
    ASSERT_TRUE(r1.has_value());
    ASSERT_TRUE(r2.has_value());
    ASSERT_TRUE(r3.has_value());
    
    // All should have correct dimensions
    EXPECT_EQ(r1->width, 64);
    EXPECT_EQ(r1->height, 32);
    EXPECT_EQ(r2->width, 32);
    EXPECT_EQ(r2->height, 64);
    EXPECT_EQ(r3->width, 48);
    EXPECT_EQ(r3->height, 48);
}

// =============================================================================
// GlyphAtlas Tests
// =============================================================================

class GlyphAtlasTest : public ::testing::Test {
protected:
    FontManager fontManager;
    GlyphAtlas atlas;
    bool fontLoaded = false;
    std::uint32_t testFontId = 0;
    
    void SetUp() override {
        ASSERT_TRUE(fontManager.initialize());
        
        // Try to load a system font
        std::vector<std::string> fontPaths = {
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "C:\\Windows\\Fonts\\arial.ttf"
        };
        
        for (const std::string& path : fontPaths) {
            testFontId = fontManager.loadFontFromFile(path);
            if (testFontId != 0) {
                fontLoaded = true;
                break;
            }
        }
    }
    
    void TearDown() override {
        atlas.shutdown();
        fontManager.shutdown();
    }
};

TEST_F(GlyphAtlasTest, Initialization) {
    GlyphAtlas::Config config;
    config.width = 512;
    config.height = 512;
    
    EXPECT_TRUE(atlas.initialize(&fontManager, config));
    EXPECT_TRUE(atlas.isInitialized());
    EXPECT_EQ(atlas.getWidth(), 512);
    EXPECT_EQ(atlas.getHeight(), 512);
    EXPECT_NE(atlas.getTextureData(), nullptr);
}

TEST_F(GlyphAtlasTest, InitializationWithNullManager) {
    EXPECT_FALSE(atlas.initialize(nullptr));
    EXPECT_FALSE(atlas.isInitialized());
}

TEST_F(GlyphAtlasTest, TextureDataSize) {
    GlyphAtlas::Config config;
    config.width = 256;
    config.height = 256;
    
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    // RGBA = 4 bytes per pixel
    std::size_t expectedSize = 256 * 256 * 4;
    EXPECT_EQ(atlas.getTextureDataSize(), expectedSize);
}

TEST_F(GlyphAtlasTest, GetGlyphNoFont) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    // Invalid font ID should return nullptr
    const GlyphAtlasEntry* entry = atlas.getGlyph(999, 0);
    EXPECT_EQ(entry, nullptr);
}

TEST_F(GlyphAtlasTest, GetGlyphValid) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    // Get glyph for 'A' (we need to get glyph index from codepoint)
    const FontHandle* font = fontManager.getFont(testFontId);
    ASSERT_NE(font, nullptr);
    
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'A');
    ASSERT_NE(glyphIndex, 0u);
    
    const GlyphAtlasEntry* entry = atlas.getGlyph(testFontId, glyphIndex);
    ASSERT_NE(entry, nullptr);
    
    EXPECT_EQ(entry->glyphId, glyphIndex);
    EXPECT_EQ(entry->fontId, testFontId);
    EXPECT_GT(entry->atlasW, 0);
    EXPECT_GT(entry->atlasH, 0);
}

TEST_F(GlyphAtlasTest, GetGlyphCached) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'B');
    
    // First call generates glyph
    const GlyphAtlasEntry* entry1 = atlas.getGlyph(testFontId, glyphIndex);
    ASSERT_NE(entry1, nullptr);
    
    // Second call should return same entry (cached)
    const GlyphAtlasEntry* entry2 = atlas.getGlyph(testFontId, glyphIndex);
    EXPECT_EQ(entry1, entry2);
}

TEST_F(GlyphAtlasTest, StyleVariantsAreDistinct) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }

    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));

    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'E');

    const GlyphAtlasEntry* normal = atlas.getGlyph(testFontId, glyphIndex, TextStyleFlags::None);
    const GlyphAtlasEntry* bold = atlas.getGlyph(testFontId, glyphIndex, TextStyleFlags::Bold);
    const GlyphAtlasEntry* italic = atlas.getGlyph(testFontId, glyphIndex, TextStyleFlags::Italic);

    ASSERT_NE(normal, nullptr);
    ASSERT_NE(bold, nullptr);
    ASSERT_NE(italic, nullptr);

    EXPECT_NE(normal, bold);
    EXPECT_NE(normal, italic);
    EXPECT_NE(bold, italic);

    EXPECT_TRUE(atlas.hasGlyph(testFontId, glyphIndex, TextStyleFlags::Bold));
    EXPECT_TRUE(atlas.hasGlyph(testFontId, glyphIndex, TextStyleFlags::Italic));
}

TEST_F(GlyphAtlasTest, HasGlyph) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'C');
    
    EXPECT_FALSE(atlas.hasGlyph(testFontId, glyphIndex));
    
    atlas.getGlyph(testFontId, glyphIndex);
    
    EXPECT_TRUE(atlas.hasGlyph(testFontId, glyphIndex));
}

TEST_F(GlyphAtlasTest, PreloadAscii) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    std::size_t count = atlas.preloadAscii(testFontId);
    
    // ASCII printable is 95 characters (32-126)
    EXPECT_GT(count, 90u);  // Allow some failures for missing glyphs
    EXPECT_LE(count, 95u);
    
    // Verify some common characters are in atlas
    const FontHandle* font = fontManager.getFont(testFontId);
    EXPECT_TRUE(atlas.hasGlyph(testFontId, FT_Get_Char_Index(font->ftFace, 'a')));
    EXPECT_TRUE(atlas.hasGlyph(testFontId, FT_Get_Char_Index(font->ftFace, 'Z')));
    EXPECT_TRUE(atlas.hasGlyph(testFontId, FT_Get_Char_Index(font->ftFace, '0')));
}

TEST_F(GlyphAtlasTest, PreloadString) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    const char* text = "Hello World!";
    std::size_t count = atlas.preloadString(testFontId, text, std::strlen(text));
    
    // "Hello World!" has 10 unique characters (space counts)
    EXPECT_GE(count, 8u);  // At least most should succeed
}

TEST_F(GlyphAtlasTest, DirtyFlag) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    EXPECT_TRUE(atlas.isDirty());  // Dirty after init
    atlas.clearDirty();
    EXPECT_FALSE(atlas.isDirty());
    
    // Adding a glyph should make it dirty again
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'X');
    atlas.getGlyph(testFontId, glyphIndex);
    
    EXPECT_TRUE(atlas.isDirty());
}

TEST_F(GlyphAtlasTest, VersionIncrement) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    std::uint32_t version1 = atlas.getVersion();
    
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'Y');
    atlas.getGlyph(testFontId, glyphIndex);
    
    std::uint32_t version2 = atlas.getVersion();
    EXPECT_GT(version2, version1);
}

TEST_F(GlyphAtlasTest, UVCoordinates) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    config.width = 1024;
    config.height = 1024;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'M');
    
    const GlyphAtlasEntry* entry = atlas.getGlyph(testFontId, glyphIndex);
    ASSERT_NE(entry, nullptr);
    
    // UV coordinates should be normalized [0, 1]
    EXPECT_GE(entry->u0, 0.0f);
    EXPECT_LE(entry->u0, 1.0f);
    EXPECT_GE(entry->v0, 0.0f);
    EXPECT_LE(entry->v0, 1.0f);
    EXPECT_GE(entry->u1, 0.0f);
    EXPECT_LE(entry->u1, 1.0f);
    EXPECT_GE(entry->v1, 0.0f);
    EXPECT_LE(entry->v1, 1.0f);
    
    // u1 > u0 and v1 > v0
    EXPECT_GT(entry->u1, entry->u0);
    EXPECT_GT(entry->v1, entry->v0);
}

TEST_F(GlyphAtlasTest, SpaceGlyph) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, ' ');
    
    // Space character should still return a valid entry
    const GlyphAtlasEntry* entry = atlas.getGlyph(testFontId, glyphIndex);
    ASSERT_NE(entry, nullptr);
    
    // Space has no visual glyph, so atlas dimensions should be 0
    EXPECT_EQ(entry->atlasW, 0);
    EXPECT_EQ(entry->atlasH, 0);
    
    // But advance should be positive
    EXPECT_GT(entry->advance, 0.0f);
}

TEST_F(GlyphAtlasTest, GlyphMetrics) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'g');
    
    const GlyphAtlasEntry* entry = atlas.getGlyph(testFontId, glyphIndex);
    ASSERT_NE(entry, nullptr);
    
    // 'g' has descender, so bearingY should be less than height
    // These are normalized metrics
    EXPECT_GT(entry->width, 0.0f);
    EXPECT_GT(entry->height, 0.0f);
    EXPECT_GT(entry->advance, 0.0f);
}

TEST_F(GlyphAtlasTest, AtlasUsageGrowth) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    config.width = 256;
    config.height = 256;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    float usage1 = atlas.getUsageRatio();
    EXPECT_GT(usage1, 0.0f);
    EXPECT_LT(usage1, 0.01f); // Should be very small (4 pixels)
    
    atlas.preloadAscii(testFontId);
    
    float usage2 = atlas.getUsageRatio();
    EXPECT_GT(usage2, usage1);
    EXPECT_GT(usage2, 0.0f);
    EXPECT_LE(usage2, 1.0f);
}

TEST_F(GlyphAtlasTest, TextureDataContainsPixels) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    GlyphAtlas::Config config;
    config.width = 256;
    config.height = 256;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    
    // Generate some glyphs
    const FontHandle* font = fontManager.getFont(testFontId);
    FT_UInt glyphIndex = FT_Get_Char_Index(font->ftFace, 'W');
    atlas.getGlyph(testFontId, glyphIndex);
    
    // Check that texture has non-zero pixels
    const std::uint8_t* data = atlas.getTextureData();
    ASSERT_NE(data, nullptr);
    
    std::size_t dataSize = atlas.getTextureDataSize();
    bool hasNonZero = false;
    for (std::size_t i = 0; i < dataSize; i += 4) {
        if (data[i] != 0 || data[i+1] != 0 || data[i+2] != 0) {
            hasNonZero = true;
            break;
        }
    }
    
    EXPECT_TRUE(hasNonZero) << "Texture should contain non-zero MSDF data";
}

TEST_F(GlyphAtlasTest, Shutdown) {
    GlyphAtlas::Config config;
    ASSERT_TRUE(atlas.initialize(&fontManager, config));
    EXPECT_TRUE(atlas.isInitialized());
    
    atlas.shutdown();
    
    EXPECT_FALSE(atlas.isInitialized());
    EXPECT_EQ(atlas.getTextureData(), nullptr);
    EXPECT_EQ(atlas.getGlyphCount(), 0u);
}
