#include <gtest/gtest.h>
#include "engine/text/text_store.h"
#include "engine/text/font_manager.h"
#include "engine/text/text_layout.h"
#include <cstring>
#include <fstream>
#include <vector>

using namespace engine::text;

// =============================================================================
// Test Fixture with Font Setup
// =============================================================================

class TextLayoutTest : public ::testing::Test {
protected:
    TextStore store;
    FontManager fontManager;
    TextLayoutEngine layoutEngine;
    
    // Sample font data (we'll try to load a system font in SetUp)
    bool fontLoaded = false;
    std::uint32_t testFontId = 0;
    
    void SetUp() override {
        ASSERT_TRUE(fontManager.initialize());
        layoutEngine.initialize(&fontManager, &store);
        
        // Try to load a common system font for testing
        // On Linux, try common font paths
        std::vector<std::string> fontPaths = {
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
            "/System/Library/Fonts/Helvetica.ttc",  // macOS
            "C:\\Windows\\Fonts\\arial.ttf"          // Windows
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
        layoutEngine.clearAllLayouts();
        fontManager.shutdown();
    }
    
    // Helper to create text with specific properties
    bool createText(std::uint32_t id, const char* content, 
                   TextBoxMode boxMode = TextBoxMode::AutoWidth,
                   float constraintWidth = 0.0f,
                   TextAlign align = TextAlign::Left) {
        TextPayloadHeader header{};
        header.x = 0;
        header.y = 0;
        header.rotation = 0.0f;
        header.boxMode = static_cast<std::uint8_t>(boxMode);
        header.align = static_cast<std::uint8_t>(align);
        header.constraintWidth = constraintWidth;
        header.runCount = 1;
        header.contentLength = static_cast<std::uint32_t>(std::strlen(content));
        
        TextRunPayload run{};
        run.startIndex = 0;
        run.length = header.contentLength;
        run.fontId = testFontId;
        run.fontSize = 16.0f;
        run.colorRGBA = 0xFFFFFFFF;
        run.flags = 0;
        
        return store.upsertText(id, header, &run, 1, content, header.contentLength);
    }
};

// =============================================================================
// FontManager Tests
// =============================================================================

TEST_F(TextLayoutTest, FontManagerInitialization) {
    EXPECT_TRUE(fontManager.isInitialized());
}

TEST_F(TextLayoutTest, FontLoading) {
    // This test might be skipped if no fonts are available
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    EXPECT_NE(testFontId, 0u);
    EXPECT_TRUE(fontManager.hasFont(testFontId));
    
    const FontHandle* font = fontManager.getFont(testFontId);
    ASSERT_NE(font, nullptr);
    EXPECT_NE(font->ftFace, nullptr);
    EXPECT_NE(font->hbFont, nullptr);
}

TEST_F(TextLayoutTest, FontMetrics) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    FontMetrics metrics = fontManager.getScaledMetrics(testFontId, 16.0f);
    
    EXPECT_GT(metrics.ascender, 0.0f);
    EXPECT_LT(metrics.descender, 0.0f);
    EXPECT_GT(metrics.unitsPerEM, 0.0f);
}

TEST_F(TextLayoutTest, DefaultFontFallback) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // Font ID 0 should return default font
    const FontHandle* defaultFont = fontManager.getFont(0);
    const FontHandle* explicitFont = fontManager.getFont(testFontId);
    
    EXPECT_EQ(defaultFont, explicitFont);
}

// =============================================================================
// TextLayoutEngine Basic Tests
// =============================================================================

TEST_F(TextLayoutTest, LayoutEngineInitialization) {
    EXPECT_TRUE(layoutEngine.isInitialized());
}

TEST_F(TextLayoutTest, LayoutEmptyText) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "");
    EXPECT_TRUE(layoutEngine.layoutText(1));
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    EXPECT_EQ(layout->glyphs.size(), 0u);
    EXPECT_EQ(layout->lines.size(), 1u);  // Empty text still has one line
    EXPECT_GT(layout->totalHeight, 0.0f);  // Has line height
}

TEST_F(TextLayoutTest, LayoutSimpleText) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello");
    EXPECT_TRUE(layoutEngine.layoutText(1));
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    EXPECT_EQ(layout->glyphs.size(), 5u);  // 5 characters
    EXPECT_EQ(layout->lines.size(), 1u);
    EXPECT_GT(layout->totalWidth, 0.0f);
    EXPECT_GT(layout->totalHeight, 0.0f);
}

TEST_F(TextLayoutTest, LayoutDirtyTracking) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello");
    createText(2, "World");
    
    // Should have 2 dirty texts
    std::size_t count = layoutEngine.layoutDirtyTexts();
    EXPECT_EQ(count, 2u);
    
    // Both should now be laid out
    EXPECT_NE(layoutEngine.getLayout(1), nullptr);
    EXPECT_NE(layoutEngine.getLayout(2), nullptr);
    
    // No more dirty texts
    count = layoutEngine.layoutDirtyTexts();
    EXPECT_EQ(count, 0u);
}

// =============================================================================
// Line Breaking Tests
// =============================================================================

TEST_F(TextLayoutTest, ExplicitNewline) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello\nWorld");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    EXPECT_EQ(layout->lines.size(), 2u);
}

TEST_F(TextLayoutTest, MultipleNewlines) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Line1\nLine2\nLine3");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    EXPECT_EQ(layout->lines.size(), 3u);
}

TEST_F(TextLayoutTest, AutoWidthNoWrap) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // Long text should NOT wrap in AutoWidth mode
    createText(1, "This is a very long line that should not wrap automatically", 
               TextBoxMode::AutoWidth);
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    EXPECT_EQ(layout->lines.size(), 1u);
}

TEST_F(TextLayoutTest, FixedWidthWordWrap) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // First layout without constraint to get natural width
    const char* longText = "Hello World This is a longer text that needs wrapping in a narrow box";
    createText(1, longText, TextBoxMode::AutoWidth);
    layoutEngine.layoutText(1);
    
    const TextLayout* autoLayout = layoutEngine.getLayout(1);
    ASSERT_NE(autoLayout, nullptr);
    float naturalWidth = autoLayout->totalWidth;
    ASSERT_GT(naturalWidth, 100.0f);  // Ensure text is reasonably long
    
    // Verify the text record was created with correct box mode
    const TextRec* rec2 = store.getText(1);
    ASSERT_NE(rec2, nullptr);
    EXPECT_EQ(rec2->boxMode, TextBoxMode::AutoWidth);
    
    // Now create text with FixedWidth mode and narrow constraint
    float narrowConstraint = 100.0f;  // Very narrow width
    createText(2, longText, TextBoxMode::FixedWidth, narrowConstraint);
    
    // Verify box mode is correctly set
    const TextRec* rec = store.getText(2);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->boxMode, TextBoxMode::FixedWidth);
    EXPECT_FLOAT_EQ(rec->constraintWidth, narrowConstraint);
    
    layoutEngine.layoutText(2);
    
    const TextLayout* layout = layoutEngine.getLayout(2);
    ASSERT_NE(layout, nullptr);
    
    // With such a narrow constraint for this long text, it must wrap
    // Note: If this test still fails, the word wrap implementation needs debugging
    EXPECT_GT(layout->lines.size(), 1u)
        << "Expected text to wrap with constraint=" << narrowConstraint 
        << ", natural width=" << naturalWidth
        << ", result lines=" << layout->lines.size()
        << ", boxMode=" << static_cast<int>(rec->boxMode);
}

TEST_F(TextLayoutTest, FixedWidthLargeConstraint) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // With a very large constraint, text should NOT wrap
    createText(1, "Hello World", TextBoxMode::FixedWidth, 1000.0f);
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    EXPECT_EQ(layout->lines.size(), 1u);
}

// =============================================================================
// Hit Testing Tests
// =============================================================================

TEST_F(TextLayoutTest, HitTestEmpty) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "");
    layoutEngine.layoutText(1);
    
    TextHitResult result = layoutEngine.hitTest(1, 0.0f, 0.0f);
    EXPECT_EQ(result.charIndex, 0u);
    EXPECT_EQ(result.lineIndex, 0u);
}

TEST_F(TextLayoutTest, HitTestSimple) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello");
    layoutEngine.layoutText(1);
    
    // Hit at start
    TextHitResult result = layoutEngine.hitTest(1, 0.0f, 5.0f);
    EXPECT_EQ(result.charIndex, 0u);
    
    // Hit at end (far right)
    const TextLayout* layout = layoutEngine.getLayout(1);
    result = layoutEngine.hitTest(1, layout->totalWidth + 10.0f, 5.0f);
    EXPECT_EQ(result.charIndex, 5u);  // Past end
}

TEST_F(TextLayoutTest, HitTestMultiLine) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Line1\nLine2");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    ASSERT_EQ(layout->lines.size(), 2u);
    
    // Hit in first line
    TextHitResult result1 = layoutEngine.hitTest(1, 5.0f, 5.0f);
    EXPECT_EQ(result1.lineIndex, 0u);
    
    // Hit in second line
    float secondLineY = layout->lines[0].lineHeight + 5.0f;
    TextHitResult result2 = layoutEngine.hitTest(1, 5.0f, secondLineY);
    EXPECT_EQ(result2.lineIndex, 1u);
}

// =============================================================================
// Caret Position Tests
// =============================================================================

TEST_F(TextLayoutTest, CaretPositionStart) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello");
    layoutEngine.layoutText(1);
    
    TextCaretPosition pos = layoutEngine.getCaretPosition(1, 0);
    EXPECT_FLOAT_EQ(pos.x, 0.0f);
    // Caret Y is at the baseline (yTop + ascent), which is > 0 for first line
    EXPECT_GE(pos.y, 0.0f);
    EXPECT_GT(pos.height, 0.0f);
}

TEST_F(TextLayoutTest, CaretPositionMiddle) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello");
    layoutEngine.layoutText(1);
    
    // Caret at position 2 should be after "He"
    TextCaretPosition pos = layoutEngine.getCaretPosition(1, 2);
    EXPECT_GT(pos.x, 0.0f);  // Should be past the start
}

TEST_F(TextLayoutTest, CaretPositionSecondLine) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello\nWorld");
    layoutEngine.layoutText(1);
    
    // Caret at start of second line (after \n)
    TextCaretPosition pos = layoutEngine.getCaretPosition(1, 6);  // "Hello\n" is 6 bytes
    EXPECT_EQ(pos.lineIndex, 1u);
    EXPECT_GT(pos.y, 0.0f);  // Should be on second line
}

// =============================================================================
// Navigation Tests
// =============================================================================

TEST_F(TextLayoutTest, PrevCharIndex) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello");
    layoutEngine.layoutText(1);
    
    EXPECT_EQ(layoutEngine.getVisualPrevCharIndex(1, 0), 0u);  // At start
    EXPECT_EQ(layoutEngine.getVisualPrevCharIndex(1, 1), 0u);  // 'e' -> 'H'
    EXPECT_EQ(layoutEngine.getVisualPrevCharIndex(1, 5), 4u);  // End -> 'o'
}

TEST_F(TextLayoutTest, NextCharIndex) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello");
    layoutEngine.layoutText(1);
    
    EXPECT_EQ(layoutEngine.getVisualNextCharIndex(1, 0), 1u);  // 'H' -> 'e'
    EXPECT_EQ(layoutEngine.getVisualNextCharIndex(1, 4), 5u);  // 'o' -> end
    EXPECT_EQ(layoutEngine.getVisualNextCharIndex(1, 5), 5u);  // At end
}

TEST_F(TextLayoutTest, LineStartEndIndex) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello\nWorld");
    layoutEngine.layoutText(1);
    
    // First line
    EXPECT_EQ(layoutEngine.getLineStartIndex(1, 2), 0u);
    EXPECT_EQ(layoutEngine.getLineEndIndex(1, 2), 5u);  // "Hello" (before \n)
    
    // Second line
    EXPECT_EQ(layoutEngine.getLineStartIndex(1, 8), 6u);  // "World" starts at 6
    EXPECT_EQ(layoutEngine.getLineEndIndex(1, 8), 11u);  // "World" is 5 chars
}

// =============================================================================
// UTF-8 Tests
// =============================================================================

TEST_F(TextLayoutTest, Utf8Navigation) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // "Olá" is 4 bytes: O(1) + l(1) + á(2)
    createText(1, "Ol\xC3\xA1");  // "Olá"
    layoutEngine.layoutText(1);
    
    // From position 2 (start of á), next should be 4 (end)
    EXPECT_EQ(layoutEngine.getVisualNextCharIndex(1, 2), 4u);
    
    // From position 4 (end), prev should be 2 (start of á)
    EXPECT_EQ(layoutEngine.getVisualPrevCharIndex(1, 4), 2u);
}

TEST_F(TextLayoutTest, Utf8Shaping) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // "Olá" - 3 visual characters but 4 bytes
    createText(1, "Ol\xC3\xA1");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    
    // Should have 3 glyphs for 3 visual characters
    EXPECT_EQ(layout->glyphs.size(), 3u);
}

// =============================================================================
// Non-Latin Script Tests (hb_buffer_guess_segment_properties)
// =============================================================================

TEST_F(TextLayoutTest, CyrillicShaping) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // "Привет" (Hello in Russian) - 12 UTF-8 bytes, 6 characters
    // П(2) + р(2) + и(2) + в(2) + е(2) + т(2)
    createText(1, "\xD0\x9F\xD1\x80\xD0\xB8\xD0\xB2\xD0\xB5\xD1\x82");
    
    // Should not crash - layout might succeed or fail depending on font support
    bool success = layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    if (layout && layout->glyphs.size() == 6) {
        // Font supports Cyrillic
        EXPECT_EQ(layout->lines.size(), 1u);
        EXPECT_GT(layout->totalWidth, 0.0f);
    } else {
        // Font may not support Cyrillic - that's OK, just verify no crash
        SUCCEED() << "Font may not fully support Cyrillic, but shaping didn't crash";
    }
    (void)success;  // Suppress unused variable warning
}

TEST_F(TextLayoutTest, GreekShaping) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // "Ελληνικά" (Greek) - various characters
    createText(1, "\xCE\x95\xCE\xBB\xCE\xBB\xCE\xB7\xCE\xBD\xCE\xB9\xCE\xBA\xCE\xAC");
    
    // Should not crash
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    if (layout && layout->glyphs.size() > 0) {
        EXPECT_EQ(layout->lines.size(), 1u);
    }
    SUCCEED() << "Greek shaping completed without crash";
}

TEST_F(TextLayoutTest, HebrewShapingRTL) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // "שלום" (Shalom - Hello in Hebrew) - RTL script
    // This tests that hb_buffer_guess_segment_properties detects RTL
    createText(1, "\xD7\xA9\xD7\x9C\xD7\x95\xD7\x9D");
    
    // Should not crash - layout might succeed or fail depending on font support
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    // Note: Even if font doesn't have Hebrew glyphs, layout should exist
    ASSERT_NE(layout, nullptr);
    
    // Verify basic layout structure is valid
    EXPECT_GE(layout->lines.size(), 1u);
    SUCCEED() << "Hebrew RTL shaping completed without crash";
}

TEST_F(TextLayoutTest, ArabicShapingRTL) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // "مرحبا" (Marhaba - Hello in Arabic) - RTL script with contextual shaping
    createText(1, "\xD9\x85\xD8\xB1\xD8\xAD\xD8\xA8\xD8\xA7");
    
    // Should not crash
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    EXPECT_GE(layout->lines.size(), 1u);
    SUCCEED() << "Arabic RTL shaping completed without crash";
}

TEST_F(TextLayoutTest, MixedScriptShaping) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    // Mixed Latin and extended Latin: "Héllo Wörld"
    createText(1, "H\xC3\xA9llo W\xC3\xB6rld");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    // 11 visual characters: H é l l o   W ö r l d
    EXPECT_EQ(layout->glyphs.size(), 11u);
    EXPECT_EQ(layout->lines.size(), 1u);
}

// =============================================================================
// Selection Tests
// =============================================================================

TEST_F(TextLayoutTest, SelectionRects) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello World");
    layoutEngine.layoutText(1);
    
    // Select "ello "
    auto rects = layoutEngine.getSelectionRects(1, 1, 6);
    ASSERT_EQ(rects.size(), 1u);  // Single line selection
    EXPECT_GT(rects[0].width, 0.0f);
}

TEST_F(TextLayoutTest, SelectionRectsMultiLine) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello\nWorld");
    layoutEngine.layoutText(1);
    
    // Select from "ello" to "Wor" (crosses lines)
    auto rects = layoutEngine.getSelectionRects(1, 1, 9);
    EXPECT_GE(rects.size(), 2u);  // At least 2 lines
}

// =============================================================================
// Layout Results Update Tests
// =============================================================================

TEST_F(TextLayoutTest, LayoutResultsUpdateStore) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    createText(1, "Hello World");
    layoutEngine.layoutText(1);
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    
    // Layout results should be written back to store
    EXPECT_GT(rec->layoutWidth, 0.0f);
    EXPECT_GT(rec->layoutHeight, 0.0f);
    EXPECT_GE(rec->maxX, rec->minX);
    EXPECT_GE(rec->maxY, rec->minY);
}

TEST_F(TextLayoutTest, FixedWidthLayoutResults) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }
    
    float constraintWidth = 100.0f;
    createText(1, "Hello", TextBoxMode::FixedWidth, constraintWidth);
    layoutEngine.layoutText(1);
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    
    // In FixedWidth mode, layoutWidth should be the constraint
    EXPECT_FLOAT_EQ(rec->layoutWidth, constraintWidth);
}

// =============================================================================
// Implementation & Fix Verification Tests (Added by AntiGravity)
// =============================================================================

TEST_F(TextLayoutTest, VerifyCaretYDirection) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }

    createText(1, "First\nSecond");
    layoutEngine.layoutText(1);
    
    // Get caret on first line
    TextCaretPosition caret1 = layoutEngine.getCaretPosition(1, 0); // Start of "First"
    
    // Get caret on second line
    // "First\n" is 6 bytes. Position 6 puts it at start of "Second"
    TextCaretPosition caret2 = layoutEngine.getCaretPosition(1, 6);
    
    // In our Y-Up coordinate system, where lines go downwards:
    // Line 1 Y should be LESS than Line 0 Y.
    EXPECT_LT(caret2.y, caret1.y) << "Caret Y should decrease for subsequent lines (Y-Up system)";
    
    // Verify line index
    EXPECT_EQ(caret1.lineIndex, 0u);
    EXPECT_EQ(caret2.lineIndex, 1u);
}

TEST_F(TextLayoutTest, VerifyCaretAlignment) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }

    createText(1, "Test");
    layoutEngine.layoutText(1);
    
    // Metrics for the font size 16.0f
    FontMetrics metrics = fontManager.getScaledMetrics(testFontId, 16.0f);
    
    // Get caret
    TextCaretPosition caret = layoutEngine.getCaretPosition(1, 0);
    
    // Verify height matches logic (should be equal to lineHeight)
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    ASSERT_GE(layout->lines.size(), 1u);
    
    EXPECT_FLOAT_EQ(caret.height, layout->lines[0].lineHeight) 
        << "Caret height should match line height";
        
    // Verify Y position centering logic
    // pos.y = (baseline + logicalBottom) * 0.5f
    // baseline = 0 - ascent
    // logicalBottom = 0 - lineHeight
    
    float ascent = layout->lines[0].ascent;
    float lineHeight = layout->lines[0].lineHeight;
    float expectedY = (-ascent + -lineHeight) * 0.5f;
    
    EXPECT_NEAR(caret.y, expectedY, 0.001f) 
        << "Caret Y should be centered between baseline and logical bottom";
}

TEST_F(TextLayoutTest, VerifyFontSizeEffects) {
    if (!fontLoaded) {
        GTEST_SKIP() << "No system font available for testing";
    }

    // Layout with size 16
    createText(1, "WWWW"); // Wide characters
    layoutEngine.layoutText(1);
    float width16 = layoutEngine.getLayout(1)->totalWidth;
    
    // Manually create text with size 32
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 4;
    TextRunPayload run{};
    run.length = 4;
    run.fontId = testFontId;
    run.fontSize = 32.0f; // Double size
    
    store.upsertText(2, header, &run, 1, "WWWW", 4);
    layoutEngine.layoutText(2);
    float width32 = layoutEngine.getLayout(2)->totalWidth;
    
    // Width 32 should be approx double Width 16
    // If HarfBuzz wasn't fully updated, metrics might lag
    EXPECT_GT(width32, width16 * 1.8f);
    EXPECT_LT(width32, width16 * 2.2f);
}
