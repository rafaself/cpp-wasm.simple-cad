#include <gtest/gtest.h>
#include "engine/text/text_store.h"
#include "engine/text/font_manager.h"
#include "engine/text/text_layout.h"
#include <cstring>
#include <vector>

using namespace engine::text;

class TextCoordinateSystemTest : public ::testing::Test {
protected:
    TextStore store;
    FontManager fontManager;
    TextLayoutEngine layoutEngine;
    std::uint32_t testFontId = 0;
    
    void SetUp() override {
        ASSERT_TRUE(fontManager.initialize());
        layoutEngine.initialize(&fontManager, &store);
        
        // Try to load a font to ensure metrics are valid
        std::vector<std::string> fontPaths = {
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf"
        };
        
        for (const std::string& path : fontPaths) {
            testFontId = fontManager.loadFontFromFile(path);
            if (testFontId != 0) break;
        }
    }
    
    void TearDown() override {
        layoutEngine.clearAllLayouts();
        fontManager.shutdown();
    }

    bool createText(std::uint32_t id, const char* content) {
        TextPayloadHeader header{};
        header.x = 0; header.y = 0;
        header.rotation = 0.0f;
        header.boxMode = 0; // AutoWidth
        header.align = 0; // Left
        header.runCount = 1;
        header.contentLength = static_cast<std::uint32_t>(std::strlen(content));
        
        TextRunPayload run{};
        run.startIndex = 0;
        run.length = header.contentLength;
        run.fontId = testFontId;
        run.fontSize = 16.0f;
        run.colorRGBA = 0xFFFFFFFF;
        
        return store.upsertText(id, header, &run, 1, content, header.contentLength);
    }
};

/**
 * Verifies that the engine uses a Y-Up coordinate system for lines.
 * Lines should move towards negative Y.
 */
TEST_F(TextCoordinateSystemTest, LineVerticalProgressionYUp) {
    if (testFontId == 0) GTEST_SKIP() << "Font not found";

    createText(1, "Line 1\nLine 2\nLine 3");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    ASSERT_EQ(layout->lines.size(), 3u);

    // Get caret positions for each line
    TextCaretPosition line0 = layoutEngine.getCaretPosition(1, 0); // Start of "Line 1"
    TextCaretPosition line1 = layoutEngine.getCaretPosition(1, 7); // Start of "Line 2"
    TextCaretPosition line2 = layoutEngine.getCaretPosition(1, 14); // Start of "Line 3"

    // In Y-Up: 0 > -16 > -32
    EXPECT_LT(line1.y, line0.y) << "Line 1 Y should be below (more negative) than Line 0";
    EXPECT_LT(line2.y, line1.y) << "Line 2 Y should be below (more negative) than Line 1";
    
    float h = layout->lines[0].lineHeight;
    EXPECT_NEAR(line0.y, 0.0f, 0.1f); 
    EXPECT_NEAR(line1.y, -h, 0.1f);
    EXPECT_NEAR(line2.y, -2.0f * h, 0.1f);
}

/**
 * Verifies that findLineAtY correctly handles Y-Up coordinates.
 * Hit testing a negative Y should find subsequent lines.
 */
TEST_F(TextCoordinateSystemTest, HitTestYUp) {
    if (testFontId == 0) GTEST_SKIP() << "Font not found";

    createText(1, "Line 1\nLine 2\nLine 3");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    ASSERT_NE(layout, nullptr);
    float h = layout->lines[0].lineHeight;

    // Y = -5.0f -> Line 0 (assuming lineHeight around 16)
    TextHitResult hit0 = layoutEngine.hitTest(1, 0.0f, -5.0f);
    EXPECT_EQ(hit0.lineIndex, 0u);

    // Y = -(h + 5.0f) -> Line 1
    TextHitResult hit1 = layoutEngine.hitTest(1, 0.0f, -(h + 5.0f));
    EXPECT_EQ(hit1.lineIndex, 1u);

    // Y = -(2*h + 5.0f) -> Line 2
    TextHitResult hit2 = layoutEngine.hitTest(1, 0.0f, -(2 * h + 5.0f));
    EXPECT_EQ(hit2.lineIndex, 2u);
}

/**
 * Verifies that selection rectangles are correctly calculated for Y-Up.
 * Y should be the bottom edge of the rectangle.
 */
TEST_F(TextCoordinateSystemTest, SelectionRectYUp) {
    if (testFontId == 0) GTEST_SKIP() << "Font not found";

    createText(1, "Line 1\nLine 2");
    layoutEngine.layoutText(1);
    
    const TextLayout* layout = layoutEngine.getLayout(1);
    float h = layout->lines[0].lineHeight;

    // Selection on second line
    // "Line 1\n" is 7 bytes.
    auto rects = layoutEngine.getSelectionRects(1, 7, 13); // Select "Line 2"
    ASSERT_EQ(rects.size(), 1u);
    
    // Y for second line should be around -32 (representing bottom edge)
    EXPECT_NEAR(rects[0].y, -2.0f * h, 2.0f);
    EXPECT_NEAR(rects[0].height, h, 0.1f);
}
