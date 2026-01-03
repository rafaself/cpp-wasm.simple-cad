/**
 * Text Commands Integration Tests
 * 
 * Tests for text command parsing and execution through CadEngine.
 * These tests verify the engine-side text pipeline integration.
 */

#include <gtest/gtest.h>
#include "engine/engine.h"
#include "engine/command/commands.h"
#include "engine/command/command_dispatch.h"
#include "engine/core/types.h"
#include "tests/test_accessors.h"
#include <cstring>
#include <string>
#include <vector>
#include <fstream>

#include "engine/text/text_style_contract.h"

// Helper class to build command buffers
class CommandBufferBuilder {
public:
    void pushU32(std::uint32_t v) {
        std::uint8_t b[4];
        std::memcpy(b, &v, 4);
        buffer_.insert(buffer_.end(), b, b + 4);
    }
    
    void pushFloat(float v) {
        std::uint8_t b[4];
        std::memcpy(b, &v, 4);
        buffer_.insert(buffer_.end(), b, b + 4);
    }
    
    void pushBytes(const void* data, std::size_t size) {
        const auto* bytes = reinterpret_cast<const std::uint8_t*>(data);
        buffer_.insert(buffer_.end(), bytes, bytes + size);
    }
    
    void writeHeader(std::uint32_t commandCount) {
        pushU32(0x43445745); // magic "EWDC"
        pushU32(2);          // version
        pushU32(commandCount);
        pushU32(0);          // padding
    }
    
    void writeCommandHeader(CommandOp op, std::uint32_t id, std::uint32_t payloadBytes) {
        pushU32(static_cast<std::uint32_t>(op));
        pushU32(id);
        pushU32(payloadBytes);
        pushU32(0); // reserved
    }
    
    const std::uint8_t* data() const { return buffer_.data(); }
    std::uint32_t size() const { return static_cast<std::uint32_t>(buffer_.size()); }
    
    void clear() { buffer_.clear(); }
    
private:
    std::vector<std::uint8_t> buffer_;
};

// Test fixture with engine instance
class TextCommandsTest : public ::testing::Test {
protected:
    void SetUp() override {
        engine_ = std::make_unique<CadEngine>();
    }
    
    void TearDown() override {
        engine_.reset();
    }
    
    // Apply a command buffer to the engine
    EngineError applyCommands(const CommandBufferBuilder& builder) {
        auto commandCallback = [](void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount) -> EngineError {
            return engine::dispatchCommand(reinterpret_cast<CadEngine*>(ctx), op, id, payload, payloadByteCount);
        };
        return engine::parseCommandBuffer(
            builder.data(),
            builder.size(),
            commandCallback,
            engine_.get()
        );
    }

    bool upsertSimpleText(std::uint32_t id, const std::string& content, TextStyleFlags flags = TextStyleFlags::None) {
        TextPayloadHeader header{};
        header.x = 0.0f;
        header.y = 0.0f;
        header.rotation = 0.0f;
        header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
        header.align = static_cast<std::uint8_t>(TextAlign::Left);
        header.constraintWidth = 0.0f;
        header.runCount = 1;
        header.contentLength = static_cast<std::uint32_t>(content.size());

        TextRunPayload run{};
        run.startIndex = 0;
        run.length = header.contentLength;
        run.fontId = 0;
        run.fontSize = 16.0f;
        run.colorRGBA = 0xFFFFFFFFu;
        run.flags = static_cast<std::uint8_t>(flags);

        auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
        return textSystem.store.upsertText(id, header, &run, 1, content.data(), header.contentLength);
    }
    
    std::unique_ptr<CadEngine> engine_;
};

// =============================================================================
// UpsertText Command Tests
// =============================================================================

TEST_F(TextCommandsTest, UpsertText_Simple) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    // Build UpsertText payload
    const char* content = "Hello";
    const std::uint32_t contentLen = 5;
    
    TextPayloadHeader header{};
    header.x = 100.0f;
    header.y = 200.0f;
    header.rotation = 0.0f;
    header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    header.align = static_cast<std::uint8_t>(TextAlign::Left);
    header.constraintWidth = 0.0f;
    header.runCount = 1;
    header.contentLength = contentLen;
    
    TextRunPayload run{};
    run.startIndex = 0;
    run.length = contentLen;
    run.fontId = 0;
    run.fontSize = 16.0f;
    run.colorRGBA = 0x000000FF; // Black, full alpha
    run.flags = 0;
    
    const std::size_t payloadSize = sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + contentLen;
    builder.writeCommandHeader(CommandOp::UpsertText, 1, static_cast<std::uint32_t>(payloadSize));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, contentLen);
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
    
    // Verify text was stored
    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
    const TextRec* text = textSystem.store.getText(1);
    ASSERT_NE(text, nullptr);
    EXPECT_FLOAT_EQ(text->x, 100.0f);
    EXPECT_FLOAT_EQ(text->y, 200.0f);
    EXPECT_EQ(text->contentLength, contentLen);
}

TEST_F(TextCommandsTest, UpsertText_MultipleRuns) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    // "Hello World" with two runs
    const char* content = "Hello World";
    const std::uint32_t contentLen = 11;
    
    TextPayloadHeader header{};
    header.x = 0.0f;
    header.y = 0.0f;
    header.rotation = 0.0f;
    header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    header.align = static_cast<std::uint8_t>(TextAlign::Left);
    header.constraintWidth = 0.0f;
    header.runCount = 2;
    header.contentLength = contentLen;
    
    TextRunPayload runs[2];
    runs[0].startIndex = 0;
    runs[0].length = 6; // "Hello "
    runs[0].fontId = 0;
    runs[0].fontSize = 16.0f;
    runs[0].colorRGBA = 0xFF0000FF; // Red
    runs[0].flags = 0;
    
    runs[1].startIndex = 6;
    runs[1].length = 5; // "World"
    runs[1].fontId = 0;
    runs[1].fontSize = 16.0f;
    runs[1].colorRGBA = 0x0000FFFF; // Blue
    runs[1].flags = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    
    const std::size_t payloadSize = sizeof(TextPayloadHeader) + 2 * sizeof(TextRunPayload) + contentLen;
    builder.writeCommandHeader(CommandOp::UpsertText, 2, static_cast<std::uint32_t>(payloadSize));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(runs, sizeof(runs));
    builder.pushBytes(content, contentLen);
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
    
    // Verify text was stored with two runs
    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
    const TextRec* text = textSystem.store.getText(2);
    ASSERT_NE(text, nullptr);
    EXPECT_EQ(text->runsCount, 2u);
    
    const auto& storedRuns = textSystem.store.getRuns(2);
    EXPECT_EQ(storedRuns.size(), 2u);
    EXPECT_EQ(storedRuns[0].colorRGBA, 0xFF0000FFu);
    EXPECT_EQ(storedRuns[1].colorRGBA, 0x0000FFFFu);
}

TEST_F(TextCommandsTest, UpsertText_InvalidPayloadSize) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    // Payload too small for header
    builder.writeCommandHeader(CommandOp::UpsertText, 1, sizeof(TextPayloadHeader) - 1);
    std::vector<std::uint8_t> shortPayload(sizeof(TextPayloadHeader) - 1, 0);
    builder.pushBytes(shortPayload.data(), shortPayload.size());
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::InvalidPayloadSize);
}

// =============================================================================
// DeleteText Command Tests
// =============================================================================

TEST_F(TextCommandsTest, DeleteText_Existing) {
    // First create a text
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "Test";
    TextPayloadHeader header{};
    header.x = 0.0f;
    header.y = 0.0f;
    header.runCount = 1;
    header.contentLength = 4;
    
    TextRunPayload run{};
    run.startIndex = 0;
    run.length = 4;
    run.fontSize = 16.0f;
    
    const std::size_t payloadSize = sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 4;
    builder.writeCommandHeader(CommandOp::UpsertText, 10, static_cast<std::uint32_t>(payloadSize));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 4);
    
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
    EXPECT_NE(textSystem.store.getText(10), nullptr);
    
    // Now delete it
    builder.clear();
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::DeleteText, 10, 0);
    
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    EXPECT_EQ(textSystem.store.getText(10), nullptr);
}

TEST_F(TextCommandsTest, DeleteText_NonExisting) {
    // Deleting non-existing text should not fail (idempotent)
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::DeleteText, 999, 0);
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
}

// =============================================================================
// SetTextCaret Command Tests
// =============================================================================

TEST_F(TextCommandsTest, SetTextCaret) {
    // Create text first
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "Hello";
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 5;
    
    TextRunPayload run{};
    run.length = 5;
    run.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 1, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 5));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 5);
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    
    // Set caret
    builder.clear();
    builder.writeHeader(1);
    
    TextCaretPayload caretPayload{};
    caretPayload.textId = 1;
    caretPayload.caretIndex = 3;
    
    builder.writeCommandHeader(CommandOp::SetTextCaret, 0, sizeof(TextCaretPayload));
    builder.pushBytes(&caretPayload, sizeof(caretPayload));
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
    
    // Verify caret was set
    const auto caretState = CadEngineTestAccessor::textSystem(*engine_).store.getCaretState(1);
    ASSERT_TRUE(caretState.has_value());
    EXPECT_EQ(caretState->caretIndex, 3u);
}

TEST_F(TextCommandsTest, SetTextCaret_InvalidPayloadSize) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::SetTextCaret, 0, sizeof(TextCaretPayload) - 1);
    std::vector<std::uint8_t> shortPayload(sizeof(TextCaretPayload) - 1, 0);
    builder.pushBytes(shortPayload.data(), shortPayload.size());
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::InvalidPayloadSize);
}

// =============================================================================
// SetTextSelection Command Tests
// =============================================================================

TEST_F(TextCommandsTest, SetTextSelection) {
    // Create text first
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "Hello World";
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 11;
    
    TextRunPayload run{};
    run.length = 11;
    run.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 5, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 11));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 11);
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    
    // Set selection
    builder.clear();
    builder.writeHeader(1);
    
    TextSelectionPayload selPayload{};
    selPayload.textId = 5;
    selPayload.selectionStart = 0;
    selPayload.selectionEnd = 5; // Select "Hello"
    
    builder.writeCommandHeader(CommandOp::SetTextSelection, 0, sizeof(TextSelectionPayload));
    builder.pushBytes(&selPayload, sizeof(selPayload));
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
    
    // Verify selection was set
    const auto caretState = CadEngineTestAccessor::textSystem(*engine_).store.getCaretState(5);
    ASSERT_TRUE(caretState.has_value());
    EXPECT_EQ(caretState->selectionStart, 0u);
    EXPECT_EQ(caretState->selectionEnd, 5u);
}

// =============================================================================
// InsertTextContent Command Tests
// =============================================================================

TEST_F(TextCommandsTest, InsertTextContent) {
    // Create text first
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "HWorld";
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 6;
    
    TextRunPayload run{};
    run.length = 6;
    run.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 1, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 6));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 6);
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    
    // Insert "ello " at index 1
    builder.clear();
    builder.writeHeader(1);
    
    const char* insertText = "ello ";
    TextInsertPayloadHeader insertHeader{};
    insertHeader.textId = 1;
    insertHeader.insertIndex = 1;
    insertHeader.byteLength = 5;
    
    builder.writeCommandHeader(CommandOp::InsertTextContent, 0, sizeof(TextInsertPayloadHeader) + 5);
    builder.pushBytes(&insertHeader, sizeof(insertHeader));
    builder.pushBytes(insertText, 5);
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
    
    // Verify content changed
    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
    std::string_view storedContent = textSystem.store.getContent(1);
    EXPECT_EQ(storedContent, "Hello World");
}

TEST_F(TextCommandsTest, InsertTextContent_InvalidPayloadSize) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::InsertTextContent, 0, sizeof(TextInsertPayloadHeader) - 1);
    std::vector<std::uint8_t> shortPayload(sizeof(TextInsertPayloadHeader) - 1, 0);
    builder.pushBytes(shortPayload.data(), shortPayload.size());
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::InvalidPayloadSize);
}

// =============================================================================
// DeleteTextContent Command Tests
// =============================================================================

TEST_F(TextCommandsTest, DeleteTextContent) {
    // Create text first
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "Hello World";
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 11;
    
    TextRunPayload run{};
    run.length = 11;
    run.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 1, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 11));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 11);
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    
    // Delete " World" (bytes 5-11)
    builder.clear();
    builder.writeHeader(1);
    
    TextDeletePayload deletePayload{};
    deletePayload.textId = 1;
    deletePayload.startIndex = 5;
    deletePayload.endIndex = 11;
    
    builder.writeCommandHeader(CommandOp::DeleteTextContent, 0, sizeof(TextDeletePayload));
    builder.pushBytes(&deletePayload, sizeof(deletePayload));
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
    
    // Verify content changed
    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
    std::string_view storedContent = textSystem.store.getContent(1);
    EXPECT_EQ(storedContent, "Hello");
}

// =============================================================================
// Multiple Commands Tests
// =============================================================================

TEST_F(TextCommandsTest, MultipleTextCommands) {
    CommandBufferBuilder builder;
    builder.writeHeader(3); // Create 3 texts
    
    // Text 1
    const char* content1 = "First";
    TextPayloadHeader header1{};
    header1.x = 10.0f;
    header1.runCount = 1;
    header1.contentLength = 5;
    TextRunPayload run1{};
    run1.length = 5;
    run1.fontSize = 12.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 1, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 5));
    builder.pushBytes(&header1, sizeof(header1));
    builder.pushBytes(&run1, sizeof(run1));
    builder.pushBytes(content1, 5);
    
    // Text 2
    const char* content2 = "Second";
    TextPayloadHeader header2{};
    header2.x = 20.0f;
    header2.runCount = 1;
    header2.contentLength = 6;
    TextRunPayload run2{};
    run2.length = 6;
    run2.fontSize = 14.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 2, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 6));
    builder.pushBytes(&header2, sizeof(header2));
    builder.pushBytes(&run2, sizeof(run2));
    builder.pushBytes(content2, 6);
    
    // Text 3
    const char* content3 = "Third";
    TextPayloadHeader header3{};
    header3.x = 30.0f;
    header3.runCount = 1;
    header3.contentLength = 5;
    TextRunPayload run3{};
    run3.length = 5;
    run3.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 3, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 5));
    builder.pushBytes(&header3, sizeof(header3));
    builder.pushBytes(&run3, sizeof(run3));
    builder.pushBytes(content3, 5);
    
    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
    
    // Verify all texts were created
    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
    EXPECT_NE(textSystem.store.getText(1), nullptr);
    EXPECT_NE(textSystem.store.getText(2), nullptr);
    EXPECT_NE(textSystem.store.getText(3), nullptr);
    EXPECT_EQ(textSystem.store.getTextCount(), 3u);
}

// =============================================================================
// Entity Map Integration Tests
// =============================================================================

TEST_F(TextCommandsTest, TextEntityInEntityMap) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "Test";
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 4;
    TextRunPayload run{};
    run.length = 4;
    run.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 42, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 4));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 4);
    
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    
    // Verify entity is in the map
    const auto& em = CadEngineTestAccessor::entityManager(*engine_);
    auto it = em.entities.find(42);
    ASSERT_NE(it, em.entities.end());
    EXPECT_EQ(it->second.kind, EntityKind::Text);
}

TEST_F(TextCommandsTest, DeleteTextRemovesFromEntityMap) {
    // Create text
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "Test";
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 4;
    TextRunPayload run{};
    run.length = 4;
    run.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 42, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 4));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 4);
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    
    // Delete it
    builder.clear();
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::DeleteText, 42, 0);
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    
    // Verify removed from entity map
    const auto& emAfter = CadEngineTestAccessor::entityManager(*engine_);
    auto it = emAfter.entities.find(42);
    EXPECT_EQ(it, emAfter.entities.end());
}

// =============================================================================
// ApplyTextStyle caret-only (collapsed selection) tests
// =============================================================================

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_MidRunInsertsZeroLengthRun) {
    ASSERT_TRUE(upsertSimpleText(100, "Hello"));

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 100;
    payload.rangeStartLogical = 2;
    payload.rangeEndLogical = 2;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 0; // set
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;

    EXPECT_TRUE(engine_->applyTextStyle(payload, nullptr, 0));

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(100);
    ASSERT_EQ(runs.size(), 3u);
    EXPECT_EQ(runs[0].startIndex, 0u);
    EXPECT_EQ(runs[0].length, 2u);
    EXPECT_FALSE(hasFlag(runs[0].flags, TextStyleFlags::Bold));

    EXPECT_EQ(runs[1].startIndex, 2u);
    EXPECT_EQ(runs[1].length, 0u);
    EXPECT_TRUE(hasFlag(runs[1].flags, TextStyleFlags::Bold));

    EXPECT_EQ(runs[2].startIndex, 2u);
    EXPECT_EQ(runs[2].length, 3u);
    EXPECT_FALSE(hasFlag(runs[2].flags, TextStyleFlags::Bold));
}

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_AtRunBoundaryBetweenRuns) {
    const std::string content = "HelloWorld"; // 10 chars

    TextPayloadHeader header{};
    header.x = 0.0f;
    header.y = 0.0f;
    header.rotation = 0.0f;
    header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    header.align = static_cast<std::uint8_t>(TextAlign::Left);
    header.constraintWidth = 0.0f;
    header.runCount = 2;
    header.contentLength = static_cast<std::uint32_t>(content.size());

    TextRunPayload runs[2] = {};
    runs[0].startIndex = 0;
    runs[0].length = 5; // Hello
    runs[0].fontId = 0;
    runs[0].fontSize = 16.0f;
    runs[0].colorRGBA = 0xFFFFFFFFu;
    runs[0].flags = static_cast<std::uint8_t>(TextStyleFlags::None);

    runs[1].startIndex = 5;
    runs[1].length = 5; // World
    runs[1].fontId = 0;
    runs[1].fontSize = 16.0f;
    runs[1].colorRGBA = 0xFFFFFFFFu;
    runs[1].flags = static_cast<std::uint8_t>(TextStyleFlags::Italic);

    ASSERT_TRUE(CadEngineTestAccessor::textSystem(*engine_).store.upsertText(101, header, runs, 2, content.data(), header.contentLength));

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 101;
    payload.rangeStartLogical = 5; // boundary between runs
    payload.rangeEndLogical = 5;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;

    EXPECT_TRUE(engine_->applyTextStyle(payload, nullptr, 0));

    const auto& storedRuns = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(101);
    ASSERT_EQ(storedRuns.size(), 3u);

    EXPECT_EQ(storedRuns[0].startIndex, 0u);
    EXPECT_EQ(storedRuns[0].length, 5u);
    EXPECT_FALSE(hasFlag(storedRuns[0].flags, TextStyleFlags::Bold));

    EXPECT_EQ(storedRuns[1].startIndex, 5u);
    EXPECT_EQ(storedRuns[1].length, 0u);
    EXPECT_TRUE(hasFlag(storedRuns[1].flags, TextStyleFlags::Bold));

    EXPECT_EQ(storedRuns[2].startIndex, 5u);
    EXPECT_EQ(storedRuns[2].length, 5u);
    EXPECT_TRUE(hasFlag(storedRuns[2].flags, TextStyleFlags::Italic));
}

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_AtContentEnd) {
    ASSERT_TRUE(upsertSimpleText(102, "Hello"));

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 102;
    payload.rangeStartLogical = 5; // end of content
    payload.rangeEndLogical = 5;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;

    EXPECT_TRUE(engine_->applyTextStyle(payload, nullptr, 0));

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(102);
    ASSERT_EQ(runs.size(), 2u);
    EXPECT_EQ(runs[0].startIndex, 0u);
    EXPECT_EQ(runs[0].length, 5u);
    EXPECT_FALSE(hasFlag(runs[0].flags, TextStyleFlags::Bold));

    EXPECT_EQ(runs[1].startIndex, 5u);
    EXPECT_EQ(runs[1].length, 0u);
    EXPECT_TRUE(hasFlag(runs[1].flags, TextStyleFlags::Bold));
}

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_OnEmptyContent) {
    ASSERT_TRUE(upsertSimpleText(103, ""));

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 103;
    payload.rangeStartLogical = 0;
    payload.rangeEndLogical = 0;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Underline);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Underline);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;

    EXPECT_TRUE(engine_->applyTextStyle(payload, nullptr, 0));

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(103);
    ASSERT_EQ(runs.size(), 1u);
    EXPECT_EQ(runs[0].startIndex, 0u);
    EXPECT_EQ(runs[0].length, 0u);
    EXPECT_TRUE(hasFlag(runs[0].flags, TextStyleFlags::Underline));
}

// =============================================================================
// Generation/Dirty Tracking Tests
// =============================================================================

TEST_F(TextCommandsTest, UpsertTextIncrementsGeneration) {
    std::uint32_t genBefore = CadEngineTestAccessor::generation(*engine_);
    
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    
    const char* content = "Test";
    TextPayloadHeader header{};
    header.runCount = 1;
    header.contentLength = 4;
    TextRunPayload run{};
    run.length = 4;
    run.fontSize = 16.0f;
    
    builder.writeCommandHeader(CommandOp::UpsertText, 1, static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + 4));
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes(content, 4);
    
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    EXPECT_GT(CadEngineTestAccessor::generation(*engine_), genBefore);
}

TEST_F(TextCommandsTest, SetTextAlignMarksTextDirtyForRelayout) {
    ASSERT_TRUE(upsertSimpleText(400, "Hello"));
    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);

    // Consume initial dirty state from creation
    EXPECT_EQ(textSystem.layoutEngine.layoutDirtyTexts(), 1u);
    EXPECT_EQ(textSystem.layoutEngine.layoutDirtyTexts(), 0u);

    CommandBufferBuilder builder;
    builder.writeHeader(1);
    TextAlignmentPayload alignPayload{};
    alignPayload.textId = 400;
    alignPayload.align = static_cast<std::uint8_t>(TextAlign::Center);

    builder.writeCommandHeader(CommandOp::SetTextAlign, 0, sizeof(TextAlignmentPayload));
    builder.pushBytes(&alignPayload, sizeof(alignPayload));

    EXPECT_EQ(applyCommands(builder), EngineError::Ok);

    const TextRec* rec = textSystem.store.getText(400);
    ASSERT_NE(rec, nullptr);
    EXPECT_EQ(rec->align, TextAlign::Center);

    // Alignment changes must force layout recomputation
    EXPECT_TRUE(textSystem.store.isDirty(400));
    EXPECT_EQ(textSystem.layoutEngine.layoutDirtyTexts(), 1u);
}

// =============================================================================
// PR1 Verification Tests
// =============================================================================

TEST_F(TextCommandsTest, PR1_VerifyCaretStyling_WithInsertion) {
    // Recipe:
    // - Create text "hello"
    // - Move caret between "e|l"
    // - Toggle Bold
    // - Insert "X"
    // - Result should be "heXllo" where only "X" is bold
    
    ASSERT_TRUE(upsertSimpleText(200, "hello"));
    
    // 1. Toggle Bold at index 2
    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 200;
    payload.rangeStartLogical = 2;
    payload.rangeEndLogical = 2;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 2; // Toggle
    payload.styleParamsLen = 0;
    
    EXPECT_TRUE(engine_->applyTextStyle(payload, nullptr, 0));
    
    // Verify intermediate state: 0-length run at 2
    auto runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(200);
    ASSERT_EQ(runs.size(), 3u);
    EXPECT_EQ(runs[1].startIndex, 2u);
    EXPECT_EQ(runs[1].length, 0u);
    EXPECT_TRUE(hasFlag(runs[1].flags, TextStyleFlags::Bold));
    
    // 2. Insert "X" at index 2
    // Use engine command or direct method. CadEngine::insertTextContent calls TextStore::insertContent
    EXPECT_TRUE(engine_->insertTextContent(200, 2, "X", 1));
    
    // 3. Verify final state
    // Content should be "heXllo"
    std::string_view content = CadEngineTestAccessor::textSystem(*engine_).store.getContent(200);
    EXPECT_EQ(content, "heXllo");
    
    // Runs should be: "he" (regular), "X" (Bold), "llo" (regular)
    runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(200);
    ASSERT_EQ(runs.size(), 3u);
    
    // "he"
    EXPECT_EQ(runs[0].startIndex, 0u);
    EXPECT_EQ(runs[0].length, 2u); 
    EXPECT_FALSE(hasFlag(runs[0].flags, TextStyleFlags::Bold));
    
    // "X" - should have inherited the 0-length run properties
    EXPECT_EQ(runs[1].startIndex, 2u);
    EXPECT_EQ(runs[1].length, 1u); 
    EXPECT_TRUE(hasFlag(runs[1].flags, TextStyleFlags::Bold));
    
    // "llo"
    EXPECT_EQ(runs[2].startIndex, 3u);
    EXPECT_EQ(runs[2].length, 3u); 
    EXPECT_FALSE(hasFlag(runs[2].flags, TextStyleFlags::Bold));
}

TEST_F(TextCommandsTest, ApplyTextStyle_MultipleTogglesAtCaret_SingleRun) {
    // Regression test for text duplication bug:
    // When toggling multiple styles (Bold, Italic, Underline) at caret,
    // should create ONE zero-length run with combined styles, not multiple.
    
    ASSERT_TRUE(upsertSimpleText(300, "hello"));
    
    // Set caret at position 5 (end of "hello")
    CadEngineTestAccessor::textSystem(*engine_).store.setCaret(300, 5);
    
    // Toggle Bold at caret position 5
    engine::text::ApplyTextStylePayload p1{};
    p1.textId = 300;
    p1.rangeStartLogical = 5;
    p1.rangeEndLogical = 5;
    p1.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    p1.flagsValue = p1.flagsMask;
    p1.mode = 0; // set
    p1.styleParamsVersion = 0;
    p1.styleParamsLen = 0;
    EXPECT_TRUE(engine_->applyTextStyle(p1, nullptr, 0));
    
    // Toggle Italic at same caret position
    engine::text::ApplyTextStylePayload p2 = p1;
    p2.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Italic);
    p2.flagsValue = p2.flagsMask;
    EXPECT_TRUE(engine_->applyTextStyle(p2, nullptr, 0));
    
    // Toggle Underline at same caret position
    engine::text::ApplyTextStylePayload p3 = p1;
    p3.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Underline);
    p3.flagsValue = p3.flagsMask;
    EXPECT_TRUE(engine_->applyTextStyle(p3, nullptr, 0));
    
    // Should have exactly ONE zero-length run at position 5, with Bold+Italic+Underline
    const auto& runsBeforeInsert = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(300);
    int zeroLengthCount = 0;
    for (const auto& r : runsBeforeInsert) {
        if (r.length == 0 && r.startIndex == 5) {
            zeroLengthCount++;
            // The single zero-length run should have all three styles
            EXPECT_TRUE(hasFlag(r.flags, TextStyleFlags::Bold));
            EXPECT_TRUE(hasFlag(r.flags, TextStyleFlags::Italic));
            EXPECT_TRUE(hasFlag(r.flags, TextStyleFlags::Underline));
        }
    }
    EXPECT_EQ(zeroLengthCount, 1) << "Should have exactly 1 zero-length run, not multiple";
    
    // Insert text "X"
    EXPECT_TRUE(engine_->insertTextContent(300, 5, "X", 1));
    
    // Content should be "helloX", NOT "helloXXX" (no duplication)
    std::string_view content = CadEngineTestAccessor::textSystem(*engine_).store.getContent(300);
    EXPECT_EQ(content, "helloX");
    
    // Verify runs: "hello" (no style), "X" (Bold+Italic+Underline)
    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(300);
    ASSERT_EQ(runs.size(), 2u);
    
    // "hello"
    EXPECT_EQ(runs[0].startIndex, 0u);
    EXPECT_EQ(runs[0].length, 5u);
    EXPECT_FALSE(hasFlag(runs[0].flags, TextStyleFlags::Bold));
    
    // "X" with all three styles
    EXPECT_EQ(runs[1].startIndex, 5u);
    EXPECT_EQ(runs[1].length, 1u);
    EXPECT_TRUE(hasFlag(runs[1].flags, TextStyleFlags::Bold));
    EXPECT_TRUE(hasFlag(runs[1].flags, TextStyleFlags::Italic));
    EXPECT_TRUE(hasFlag(runs[1].flags, TextStyleFlags::Underline));
}

// =============================================================================
// Vertical Displacement Reproduction Test
// =============================================================================

TEST_F(TextCommandsTest, Repro_VerticalDisplacement_FontSizeChange) {
    // Load font - use CMake-provided path for portability
    std::string fontPath = std::string(HARFBUZZ_SOURCE_DIR) + "/test/api/fonts/OpenSans-Regular.ttf";
    std::ifstream f(fontPath, std::ios::binary | std::ios::ate);
    ASSERT_TRUE(f.is_open()) << "Failed to open font file: " << fontPath;
    std::streamsize size = f.tellg();
    f.seekg(0, std::ios::beg);
    std::vector<char> fontData(size);
    if (f.read(fontData.data(), size)) {
        // Font ID 1
        ASSERT_TRUE(engine_->loadFont(1, reinterpret_cast<std::uintptr_t>(fontData.data()), size));
    }

    // 1. Create text with Font Size 16
    const float kInitialX = 100.0f;
    const float kInitialY = 200.0f; // Top anchor
    const char* content = "BaselineCheck";
    
    // Create text manually to ensure we control everything
    TextPayloadHeader header{};
    header.x = kInitialX;
    header.y = kInitialY;
    header.rotation = 0.0f;
    header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    header.align = static_cast<std::uint8_t>(TextAlign::Left);
    header.constraintWidth = 0.0f;
    header.runCount = 1;
    header.contentLength = static_cast<std::uint32_t>(strlen(content));
    
    TextRunPayload run{};
    run.startIndex = 0;
    run.length = header.contentLength;
    run.fontId = 1; // Use loaded font
    run.fontSize = 16.0f;
    run.colorRGBA = 0xFFFFFFFFu;
    run.flags = 0;
    
    // Use engine->upsertText to ensure entity registration and layout
    engine_->upsertText(300, header, &run, 1, content, header.contentLength);
    
    // Force layout to get metrics
    CadEngineTestAccessor::textSystem(*engine_).layoutEngine.layoutText(300);
    
    const TextRec* text1 = CadEngineTestAccessor::textSystem(*engine_).store.getText(300);
    const engine::text::TextLayout* layout1 = CadEngineTestAccessor::textSystem(*engine_).layoutEngine.getLayout(300);
    ASSERT_NE(text1, nullptr);
    ASSERT_NE(layout1, nullptr);
    ASSERT_FALSE(layout1->lines.empty());
    
    float initialAscent = layout1->lines[0].ascent;
    float initialAbsoluteBaseline = text1->y + initialAscent;
    
    printf("Initial: Y=%.2f Ascent=%.2f Baseline=%.2f\n", text1->y, initialAscent, initialAbsoluteBaseline);
    
    // 2. Apply Font Size 32
    // Using ApplyTextStyle command
    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 300;
    payload.rangeStartLogical = 0;
    payload.rangeEndLogical = 100; // Select all
    payload.flagsMask = 0;
    payload.flagsValue = 0;
    payload.mode = 0;
    
    const float kNewSize = 32.0f;
    // Build params: [tag:1][float:32.0]
    std::vector<std::uint8_t> params;
    params.push_back(engine::text::textStyleTagFontSize);
    float sizeVal = kNewSize;
    const std::uint8_t* valPtr = reinterpret_cast<const std::uint8_t*>(&sizeVal);
    params.insert(params.end(), valPtr, valPtr + sizeof(float));
    
    payload.styleParamsLen = static_cast<std::uint32_t>(params.size());
    
    EXPECT_TRUE(engine_->applyTextStyle(payload, params.data(), params.size()));
    
    // Force layout again (applyTextStyle does it, but just to be sure)
    
    const TextRec* text2 = CadEngineTestAccessor::textSystem(*engine_).store.getText(300);
    const engine::text::TextLayout* layout2 = CadEngineTestAccessor::textSystem(*engine_).layoutEngine.getLayout(300);
    ASSERT_NE(text2, nullptr);
    ASSERT_NE(layout2, nullptr);
    
    float newAscent = layout2->lines[0].ascent;
    float newAbsoluteBaseline = text2->y + newAscent;
    
    printf("New: Y=%.2f Ascent=%.2f Baseline=%.2f\n", text2->y, newAscent, newAbsoluteBaseline);

    EXPECT_FLOAT_EQ(text2->y, text1->y) 
        << "Top anchor (Y) should not move! Displacement: " << (text2->y - text1->y);
    
    EXPECT_GT(newAbsoluteBaseline, initialAbsoluteBaseline)
        << "Baseline should move downwards (larger Y in Y-Up) as font size increases with fixed top anchor";
}
