#include <gtest/gtest.h>
#include "engine/text/text_store.h"
#include <cstring>

using namespace engine::text;

class TextStoreTest : public ::testing::Test {
protected:
    TextStore store;

    // Helper to create a simple text entity
    bool createSimpleText(std::uint32_t id, const char* content, float x = 0, float y = 0) {
        TextPayloadHeader header{};
        header.x = x;
        header.y = y;
        header.rotation = 0.0f;
        header.boxMode = 0;  // AutoWidth
        header.align = 0;    // Left
        header.constraintWidth = 0.0f;
        header.runCount = 1;
        header.contentLength = static_cast<std::uint32_t>(std::strlen(content));

        TextRunPayload run{};
        run.startIndex = 0;
        run.length = header.contentLength;
        run.fontId = 0;
        run.fontSize = 16.0f;
        run.colorRGBA = 0xFFFFFFFF;
        run.flags = 0;

        return store.upsertText(id, header, &run, 1, content, header.contentLength);
    }
};

// =============================================================================
// Basic CRUD Tests
// =============================================================================

TEST_F(TextStoreTest, CreateText) {
    EXPECT_TRUE(createSimpleText(1, "Hello World"));
    EXPECT_TRUE(store.hasText(1));
    EXPECT_EQ(store.getTextCount(), 1);
}

TEST_F(TextStoreTest, GetText) {
    createSimpleText(1, "Hello");
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->id, 1);
    EXPECT_EQ(rec->contentLength, 5);
}

TEST_F(TextStoreTest, GetNonExistentText) {
    const TextRec* rec = store.getText(999);
    EXPECT_EQ(rec, nullptr);
}

TEST_F(TextStoreTest, DeleteText) {
    createSimpleText(1, "Hello");
    EXPECT_TRUE(store.hasText(1));
    
    EXPECT_TRUE(store.deleteText(1));
    EXPECT_FALSE(store.hasText(1));
    EXPECT_EQ(store.getTextCount(), 0);
}

TEST_F(TextStoreTest, DeleteNonExistentText) {
    EXPECT_FALSE(store.deleteText(999));
}

TEST_F(TextStoreTest, UpdateText) {
    createSimpleText(1, "Hello");
    EXPECT_EQ(store.getContent(1), "Hello");
    
    // Update with new content
    createSimpleText(1, "World");
    EXPECT_EQ(store.getContent(1), "World");
    EXPECT_EQ(store.getTextCount(), 1);  // Still only one entity
}

TEST_F(TextStoreTest, MultipleTexts) {
    createSimpleText(1, "First");
    createSimpleText(2, "Second");
    createSimpleText(3, "Third");
    
    EXPECT_EQ(store.getTextCount(), 3);
    EXPECT_EQ(store.getContent(1), "First");
    EXPECT_EQ(store.getContent(2), "Second");
    EXPECT_EQ(store.getContent(3), "Third");
}

TEST_F(TextStoreTest, GetAllTextIds) {
    createSimpleText(10, "A");
    createSimpleText(20, "B");
    createSimpleText(30, "C");
    
    auto ids = store.getAllTextIds();
    EXPECT_EQ(ids.size(), 3);
    
    // IDs should be present (order not guaranteed)
    EXPECT_TRUE(std::find(ids.begin(), ids.end(), 10) != ids.end());
    EXPECT_TRUE(std::find(ids.begin(), ids.end(), 20) != ids.end());
    EXPECT_TRUE(std::find(ids.begin(), ids.end(), 30) != ids.end());
}

// =============================================================================
// Content Operations Tests
// =============================================================================

TEST_F(TextStoreTest, GetContent) {
    createSimpleText(1, "Hello World");
    EXPECT_EQ(store.getContent(1), "Hello World");
}

TEST_F(TextStoreTest, GetContentNonExistent) {
    EXPECT_EQ(store.getContent(999), "");
}

TEST_F(TextStoreTest, InsertContentAtBeginning) {
    createSimpleText(1, "World");
    EXPECT_TRUE(store.insertContent(1, 0, "Hello ", 6));
    EXPECT_EQ(store.getContent(1), "Hello World");
}

TEST_F(TextStoreTest, InsertContentAtEnd) {
    createSimpleText(1, "Hello");
    EXPECT_TRUE(store.insertContent(1, 5, " World", 6));
    EXPECT_EQ(store.getContent(1), "Hello World");
}

TEST_F(TextStoreTest, InsertContentInMiddle) {
    createSimpleText(1, "HeWorld");
    EXPECT_TRUE(store.insertContent(1, 2, "llo ", 4));
    EXPECT_EQ(store.getContent(1), "Hello World");
}

TEST_F(TextStoreTest, InsertContentUpdatesLength) {
    createSimpleText(1, "Hi");
    store.insertContent(1, 2, "!", 1);
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->contentLength, 3);
}

TEST_F(TextStoreTest, DeleteContentFromBeginning) {
    createSimpleText(1, "Hello World");
    EXPECT_TRUE(store.deleteContent(1, 0, 6));
    EXPECT_EQ(store.getContent(1), "World");
}

TEST_F(TextStoreTest, DeleteContentFromEnd) {
    createSimpleText(1, "Hello World");
    EXPECT_TRUE(store.deleteContent(1, 5, 11));
    EXPECT_EQ(store.getContent(1), "Hello");
}

TEST_F(TextStoreTest, DeleteContentFromMiddle) {
    createSimpleText(1, "Hello World");
    EXPECT_TRUE(store.deleteContent(1, 5, 6));
    EXPECT_EQ(store.getContent(1), "HelloWorld");
}

TEST_F(TextStoreTest, DeleteAllContent) {
    createSimpleText(1, "Hello");
    EXPECT_TRUE(store.deleteContent(1, 0, 5));
    EXPECT_EQ(store.getContent(1), "");
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->contentLength, 0);
}

// =============================================================================
// Run Tests
// =============================================================================

TEST_F(TextStoreTest, SingleRunCreatedByDefault) {
    createSimpleText(1, "Hello");
    
    const auto& runs = store.getRuns(1);
    EXPECT_EQ(runs.size(), 1);
    EXPECT_EQ(runs[0].startIndex, 0);
    EXPECT_EQ(runs[0].length, 5);
}

TEST_F(TextStoreTest, MultipleRuns) {
    TextPayloadHeader header{};
    header.x = 0;
    header.y = 0;
    header.rotation = 0.0f;
    header.boxMode = 0;
    header.align = 0;
    header.constraintWidth = 0.0f;
    header.runCount = 2;
    header.contentLength = 11;  // "Hello World"

    TextRunPayload runs[2] = {};
    // "Hello" - bold
    runs[0].startIndex = 0;
    runs[0].length = 5;
    runs[0].fontId = 0;
    runs[0].fontSize = 16.0f;
    runs[0].colorRGBA = 0xFF0000FF;  // Red
    runs[0].flags = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    
    // " World" - normal
    runs[1].startIndex = 5;
    runs[1].length = 6;
    runs[1].fontId = 0;
    runs[1].fontSize = 16.0f;
    runs[1].colorRGBA = 0x00FF00FF;  // Green
    runs[1].flags = 0;

    store.upsertText(1, header, runs, 2, "Hello World", 11);
    
    const auto& storedRuns = store.getRuns(1);
    EXPECT_EQ(storedRuns.size(), 2);
    EXPECT_EQ(storedRuns[0].colorRGBA, 0xFF0000FF);
    EXPECT_EQ(storedRuns[1].colorRGBA, 0x00FF00FF);
    EXPECT_TRUE(hasFlag(storedRuns[0].flags, TextStyleFlags::Bold));
    EXPECT_FALSE(hasFlag(storedRuns[1].flags, TextStyleFlags::Bold));
}

TEST_F(TextStoreTest, RunsAdjustedOnInsert) {
    // Create text with two runs: "Hello" + " World"
    TextPayloadHeader header{};
    header.runCount = 2;
    header.contentLength = 11;

    TextRunPayload runs[2] = {};
    runs[0].startIndex = 0;
    runs[0].length = 5;
    runs[1].startIndex = 5;
    runs[1].length = 6;

    store.upsertText(1, header, runs, 2, "Hello World", 11);
    
    // Insert "XXX" at position 5 (between Hello and World)
    store.insertContent(1, 5, "XXX", 3);
    
    const auto& storedRuns = store.getRuns(1);
    EXPECT_EQ(storedRuns.size(), 2);
    EXPECT_EQ(storedRuns[0].startIndex, 0);
    EXPECT_EQ(storedRuns[0].length, 8);  // "HelloXXX"
    EXPECT_EQ(storedRuns[1].startIndex, 8);  // Shifted by 3
    EXPECT_EQ(storedRuns[1].length, 6);  // " World" unchanged
}

TEST_F(TextStoreTest, TypingAfterSplitRunKeepsBoldSegmentContiguous) {
    TextPayloadHeader header{};
    header.runCount = 3;
    header.contentLength = 4;  // "como"

    TextRunPayload runs[3] = {};
    runs[0].startIndex = 0;
    runs[0].length = 2;
    runs[0].fontId = 0;
    runs[0].fontSize = 16.0f;
    runs[0].colorRGBA = 0xFFFFFFFF;
    runs[0].flags = 0;

    runs[1].startIndex = 2;
    runs[1].length = 0;  // Typing run (bold)
    runs[1].fontId = 0;
    runs[1].fontSize = 16.0f;
    runs[1].colorRGBA = 0xFFFFFFFF;
    runs[1].flags = static_cast<std::uint8_t>(TextStyleFlags::Bold);

    runs[2].startIndex = 2;
    runs[2].length = 2;
    runs[2].fontId = 0;
    runs[2].fontSize = 16.0f;
    runs[2].colorRGBA = 0xFFFFFFFF;
    runs[2].flags = 0;

    store.upsertText(1, header, runs, 3, "como", 4);

    store.insertContent(1, 2, "t", 1);
    store.insertContent(1, 3, "e", 1);

    EXPECT_EQ(store.getContent(1), "cotemo");

    const auto& storedRuns = store.getRuns(1);
    ASSERT_EQ(storedRuns.size(), 3u);
    EXPECT_EQ(storedRuns[0].startIndex, 0u);
    EXPECT_EQ(storedRuns[0].length, 2u);
    EXPECT_EQ(storedRuns[1].startIndex, 2u);
    EXPECT_EQ(storedRuns[1].length, 2u);
    EXPECT_TRUE(hasFlag(storedRuns[1].flags, TextStyleFlags::Bold));
    EXPECT_EQ(storedRuns[2].startIndex, 4u);
    EXPECT_EQ(storedRuns[2].length, 2u);
    const auto endIndex = storedRuns.back().startIndex + storedRuns.back().length;
    EXPECT_EQ(endIndex, store.getContent(1).size());
}

TEST_F(TextStoreTest, TypingAtStartAfterStyleToggleExtendsBoldRun) {
    TextPayloadHeader header{};
    header.runCount = 2;
    header.contentLength = 4;  // "como"

    TextRunPayload runs[2] = {};
    runs[0].startIndex = 0;
    runs[0].length = 0;  // Typing run (bold)
    runs[0].fontId = 0;
    runs[0].fontSize = 16.0f;
    runs[0].colorRGBA = 0xFFFFFFFF;
    runs[0].flags = static_cast<std::uint8_t>(TextStyleFlags::Bold);

    runs[1].startIndex = 0;
    runs[1].length = 4;
    runs[1].fontId = 0;
    runs[1].fontSize = 16.0f;
    runs[1].colorRGBA = 0xFFFFFFFF;
    runs[1].flags = 0;

    store.upsertText(2, header, runs, 2, "como", 4);

    store.insertContent(2, 0, "a", 1);
    store.insertContent(2, 1, "b", 1);

    EXPECT_EQ(store.getContent(2), "abcomo");

    const auto& storedRuns = store.getRuns(2);
    ASSERT_EQ(storedRuns.size(), 2u);
    EXPECT_EQ(storedRuns[0].startIndex, 0u);
    EXPECT_EQ(storedRuns[0].length, 2u);
    EXPECT_TRUE(hasFlag(storedRuns[0].flags, TextStyleFlags::Bold));
    EXPECT_EQ(storedRuns[1].startIndex, 2u);
    EXPECT_EQ(storedRuns[1].length, 4u);
    const auto endIndex = storedRuns.back().startIndex + storedRuns.back().length;
    EXPECT_EQ(endIndex, store.getContent(2).size());
}

// =============================================================================
// Caret & Selection Tests
// =============================================================================

TEST_F(TextStoreTest, SetCaret) {
    createSimpleText(1, "Hello");
    store.setCaret(1, 3);
    
    auto state = store.getCaretState(1);
    ASSERT_TRUE(state.has_value());
    EXPECT_EQ(state->textId, 1);
    EXPECT_EQ(state->caretIndex, 3);
}

TEST_F(TextStoreTest, CaretClampedToContentLength) {
    createSimpleText(1, "Hi");  // 2 characters
    store.setCaret(1, 100);  // Way past end
    
    auto state = store.getCaretState(1);
    ASSERT_TRUE(state.has_value());
    EXPECT_EQ(state->caretIndex, 2);  // Clamped to end
}

TEST_F(TextStoreTest, SetSelection) {
    createSimpleText(1, "Hello World");
    store.setSelection(1, 0, 5);  // Select "Hello"
    
    auto state = store.getCaretState(1);
    ASSERT_TRUE(state.has_value());
    EXPECT_EQ(state->selectionStart, 0);
    EXPECT_EQ(state->selectionEnd, 5);
}

TEST_F(TextStoreTest, ClearCaretState) {
    createSimpleText(1, "Hello");
    store.setCaret(1, 2);
    EXPECT_TRUE(store.getCaretState(1).has_value());
    
    store.clearCaretState();
    EXPECT_FALSE(store.getCaretState(1).has_value());
}

TEST_F(TextStoreTest, CaretClearedOnTextDelete) {
    createSimpleText(1, "Hello");
    store.setCaret(1, 2);
    
    store.deleteText(1);
    EXPECT_FALSE(store.getCaretState(1).has_value());
}

// =============================================================================
// Dirty Tracking Tests
// =============================================================================

TEST_F(TextStoreTest, NewTextMarkedDirty) {
    createSimpleText(1, "Hello");
    EXPECT_TRUE(store.hasDirtyEntities());
    
    auto dirty = store.consumeDirtyIds();
    EXPECT_EQ(dirty.size(), 1);
    EXPECT_EQ(dirty[0], 1);
}

TEST_F(TextStoreTest, ConsumeDirtyClears) {
    createSimpleText(1, "Hello");
    store.consumeDirtyIds();
    
    EXPECT_FALSE(store.hasDirtyEntities());
}

TEST_F(TextStoreTest, ContentInsertMarksDirty) {
    createSimpleText(1, "Hello");
    store.consumeDirtyIds();  // Clear initial dirty
    
    store.insertContent(1, 0, "X", 1);
    EXPECT_TRUE(store.hasDirtyEntities());
}

TEST_F(TextStoreTest, ContentDeleteMarksDirty) {
    createSimpleText(1, "Hello");
    store.consumeDirtyIds();
    
    store.deleteContent(1, 0, 1);
    EXPECT_TRUE(store.hasDirtyEntities());
}

// =============================================================================
// Layout Result Tests
// =============================================================================

TEST_F(TextStoreTest, SetLayoutResult) {
    createSimpleText(1, "Hello");
    
    store.setLayoutResult(1, 100.0f, 20.0f, 0.0f, 0.0f, 100.0f, 20.0f);
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_FLOAT_EQ(rec->layoutWidth, 100.0f);
    EXPECT_FLOAT_EQ(rec->layoutHeight, 20.0f);
    EXPECT_FLOAT_EQ(rec->minX, 0.0f);
    EXPECT_FLOAT_EQ(rec->minY, 0.0f);
    EXPECT_FLOAT_EQ(rec->maxX, 100.0f);
    EXPECT_FLOAT_EQ(rec->maxY, 20.0f);
}

// =============================================================================
// Bulk Operations Tests
// =============================================================================

TEST_F(TextStoreTest, Clear) {
    createSimpleText(1, "A");
    createSimpleText(2, "B");
    createSimpleText(3, "C");
    store.setCaret(1, 0);
    
    store.clear();
    
    EXPECT_EQ(store.getTextCount(), 0);
    EXPECT_FALSE(store.hasText(1));
    EXPECT_FALSE(store.hasDirtyEntities());
    EXPECT_FALSE(store.getCaretState(1).has_value());
}

// =============================================================================
// Box Mode & Alignment Tests
// =============================================================================

TEST_F(TextStoreTest, AutoWidthMode) {
    TextPayloadHeader header{};
    header.boxMode = 0;  // AutoWidth
    header.constraintWidth = 200.0f;  // Should be ignored
    header.runCount = 0;
    header.contentLength = 5;

    store.upsertText(1, header, nullptr, 0, "Hello", 5);
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->boxMode, TextBoxMode::AutoWidth);
}

TEST_F(TextStoreTest, FixedWidthMode) {
    TextPayloadHeader header{};
    header.boxMode = 1;  // FixedWidth
    header.constraintWidth = 200.0f;
    header.runCount = 0;
    header.contentLength = 5;

    store.upsertText(1, header, nullptr, 0, "Hello", 5);
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->boxMode, TextBoxMode::FixedWidth);
    EXPECT_FLOAT_EQ(rec->constraintWidth, 200.0f);
}

TEST_F(TextStoreTest, TextAlignment) {
    TextPayloadHeader header{};
    header.align = 2;  // Right
    header.runCount = 0;
    header.contentLength = 5;

    store.upsertText(1, header, nullptr, 0, "Hello", 5);
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->align, TextAlign::Right);
}

// =============================================================================
// UTF-8 Edge Cases
// =============================================================================

TEST_F(TextStoreTest, EmptyContent) {
    TextPayloadHeader header{};
    header.runCount = 0;
    header.contentLength = 0;

    EXPECT_TRUE(store.upsertText(1, header, nullptr, 0, "", 0));
    EXPECT_EQ(store.getContent(1), "");
    
    const TextRec* rec = store.getText(1);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->contentLength, 0);
}

TEST_F(TextStoreTest, Utf8MultibyteContent) {
    // "Olá" in UTF-8 is 4 bytes (O=1, l=1, á=2)
    const char* utf8 = "Ol\xC3\xA1";  // "Olá"
    
    TextPayloadHeader header{};
    header.runCount = 0;
    header.contentLength = 4;

    store.upsertText(1, header, nullptr, 0, utf8, 4);
    
    EXPECT_EQ(store.getContent(1), "Olá");
    EXPECT_EQ(store.getContent(1).size(), 4);
}
