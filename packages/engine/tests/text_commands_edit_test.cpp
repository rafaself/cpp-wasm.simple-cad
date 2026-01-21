#include "tests/text_commands_test_common.h"

TEST_F(TextCommandsTest, DeleteText_Existing) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::DeleteText, 1, sizeof(std::uint32_t));
    std::uint32_t id = 1;
    builder.pushBytes(&id, sizeof(id));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& em = CadEngineTestAccessor::entityManager(*engine_);
    EXPECT_EQ(em.getText(1), nullptr);
}

TEST_F(TextCommandsTest, DeleteText_NonExisting) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::DeleteText, 123, sizeof(std::uint32_t));
    std::uint32_t id = 123;
    builder.pushBytes(&id, sizeof(id));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);
}

TEST_F(TextCommandsTest, SetTextCaret) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextCaretPayload payload{};
    payload.textId = 1;
    payload.caret = 2;
    builder.writeCommandHeader(CommandOp::SetTextCaret, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto caretState = CadEngineTestAccessor::textSystem(*engine_).store.getCaretState(1);
    EXPECT_EQ(caretState.caret, 2u);
}

TEST_F(TextCommandsTest, SetTextCaret_InvalidPayloadSize) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::SetTextCaret, 0, 1);
    std::uint8_t bad = 0;
    builder.pushBytes(&bad, sizeof(bad));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::InvalidPayloadSize);
}

TEST_F(TextCommandsTest, SetTextSelection) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextSelectionPayload payload{};
    payload.textId = 1;
    payload.selectionStart = 1;
    payload.selectionEnd = 4;
    builder.writeCommandHeader(CommandOp::SetTextSelection, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto caretState = CadEngineTestAccessor::textSystem(*engine_).store.getCaretState(1);
    EXPECT_EQ(caretState.selectionStart, 1u);
    EXPECT_EQ(caretState.selectionEnd, 4u);
}

TEST_F(TextCommandsTest, InsertTextContent) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    const char* insert = "XYZ";
    TextInsertPayloadHeader header{};
    header.textId = 1;
    header.insertIndex = 2;
    header.byteLength = 3;
    const std::uint32_t payloadBytes =
        static_cast<std::uint32_t>(sizeof(header) + header.byteLength);
    builder.writeCommandHeader(CommandOp::InsertTextContent, 0, payloadBytes);
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(insert, header.byteLength);

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    std::string_view content = CadEngineTestAccessor::textSystem(*engine_).store.getContent(1);
    EXPECT_EQ(content, "HeXYZllo");
}

TEST_F(TextCommandsTest, InsertTextContent_InvalidPayloadSize) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextInsertPayloadHeader header{};
    header.textId = 1;
    header.insertIndex = 0;
    header.byteLength = 3;
    builder.writeCommandHeader(CommandOp::InsertTextContent, 0, sizeof(header));
    builder.pushBytes(&header, sizeof(header));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::InvalidPayloadSize);
}

TEST_F(TextCommandsTest, DeleteTextContent) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextDeletePayload payload{};
    payload.textId = 1;
    payload.startIndex = 1;
    payload.endIndex = 4;
    builder.writeCommandHeader(CommandOp::DeleteTextContent, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    std::string_view content = CadEngineTestAccessor::textSystem(*engine_).store.getContent(1);
    EXPECT_EQ(content, "Ho");
}

TEST_F(TextCommandsTest, MultipleTextCommands) {
    CommandBufferBuilder builder;
    builder.writeHeader(2);

    TextPayloadHeader header{};
    header.x = 0.0f;
    header.y = 0.0f;
    header.rotation = 0.0f;
    header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    header.align = static_cast<std::uint8_t>(TextAlign::Left);
    header.constraintWidth = 0.0f;
    header.runCount = 1;
    header.contentLength = 5;

    TextRunPayload run{};
    run.startIndex = 0;
    run.length = 5;
    run.fontId = 0;
    run.fontSize = 16.0f;
    run.colorRGBA = 0xFFFFFFFFu;
    run.flags = static_cast<std::uint8_t>(TextStyleFlags::None);

    const std::uint32_t payloadBytes =
        static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + header.contentLength + sizeof(float));
    builder.writeCommandHeader(CommandOp::UpsertText, 1, payloadBytes);
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes("Hello", header.contentLength);
    builder.pushFloat(0.0f);

    TextCaretPayload caret{};
    caret.textId = 1;
    caret.caret = 3;
    builder.writeCommandHeader(CommandOp::SetTextCaret, 0, sizeof(caret));
    builder.pushBytes(&caret, sizeof(caret));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto caretState = CadEngineTestAccessor::textSystem(*engine_).store.getCaretState(1);
    EXPECT_EQ(caretState.caret, 3u);
}

TEST_F(TextCommandsTest, SetTextAlignMarksTextDirtyForRelayout) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextAlignmentPayload payload{};
    payload.textId = 1;
    payload.align = static_cast<std::uint32_t>(TextAlign::Center);
    builder.writeCommandHeader(CommandOp::SetTextAlign, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    auto& textSystem = CadEngineTestAccessor::textSystem(*engine_);
    EXPECT_TRUE(textSystem.store.isDirty(1));
}
