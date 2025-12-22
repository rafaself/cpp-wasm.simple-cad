/**
 * Text Commands Integration Tests
 * 
 * Tests for text command parsing and execution through CadEngine.
 * These tests verify the engine-side text pipeline integration.
 */

#include <gtest/gtest.h>
#include "engine/engine.h"
#include "engine/commands.h"
#include "engine/types.h"
#include <cstring>
#include <vector>

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
        return engine::parseCommandBuffer(
            builder.data(),
            builder.size(),
            &CadEngine::cad_command_callback,
            engine_.get()
        );
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
    const TextRec* text = engine_->textStore_.getText(1);
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
    const TextRec* text = engine_->textStore_.getText(2);
    ASSERT_NE(text, nullptr);
    EXPECT_EQ(text->runsCount, 2u);
    
    const auto& storedRuns = engine_->textStore_.getRuns(2);
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
    EXPECT_NE(engine_->textStore_.getText(10), nullptr);
    
    // Now delete it
    builder.clear();
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::DeleteText, 10, 0);
    
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    EXPECT_EQ(engine_->textStore_.getText(10), nullptr);
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
    const auto caretState = engine_->textStore_.getCaretState(1);
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
    const auto caretState = engine_->textStore_.getCaretState(5);
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
    std::string_view storedContent = engine_->textStore_.getContent(1);
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
    std::string_view storedContent = engine_->textStore_.getContent(1);
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
    EXPECT_NE(engine_->textStore_.getText(1), nullptr);
    EXPECT_NE(engine_->textStore_.getText(2), nullptr);
    EXPECT_NE(engine_->textStore_.getText(3), nullptr);
    EXPECT_EQ(engine_->textStore_.getTextCount(), 3u);
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
    auto it = engine_->entities.find(42);
    ASSERT_NE(it, engine_->entities.end());
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
    auto it = engine_->entities.find(42);
    EXPECT_EQ(it, engine_->entities.end());
}

// =============================================================================
// Generation/Dirty Tracking Tests
// =============================================================================

TEST_F(TextCommandsTest, UpsertTextIncrementsGeneration) {
    std::uint32_t genBefore = engine_->generation;
    
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
    EXPECT_GT(engine_->generation, genBefore);
}
