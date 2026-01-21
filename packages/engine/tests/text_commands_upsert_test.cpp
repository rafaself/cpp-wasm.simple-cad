#include "tests/text_commands_test_common.h"

TEST_F(TextCommandsTest, UpsertText_Simple) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);

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

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& em = CadEngineTestAccessor::entityManager(*engine_);
    const auto* text = em.getText(1);
    ASSERT_NE(text, nullptr);
    EXPECT_EQ(text->x, 0.0f);
}

TEST_F(TextCommandsTest, UpsertText_MultipleRuns) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextPayloadHeader header{};
    header.x = 10.0f;
    header.y = 20.0f;
    header.rotation = 0.0f;
    header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    header.align = static_cast<std::uint8_t>(TextAlign::Left);
    header.constraintWidth = 0.0f;
    header.runCount = 2;
    header.contentLength = 5;

    TextRunPayload runs[2]{};
    runs[0].startIndex = 0;
    runs[0].length = 2;
    runs[0].fontId = 0;
    runs[0].fontSize = 16.0f;
    runs[0].colorRGBA = 0xFFFFFFFFu;
    runs[0].flags = static_cast<std::uint8_t>(TextStyleFlags::Bold);

    runs[1].startIndex = 2;
    runs[1].length = 3;
    runs[1].fontId = 0;
    runs[1].fontSize = 16.0f;
    runs[1].colorRGBA = 0xFFFFFFFFu;
    runs[1].flags = static_cast<std::uint8_t>(TextStyleFlags::Italic);

    const std::uint32_t payloadBytes =
        static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(runs) + header.contentLength + sizeof(float));
    builder.writeCommandHeader(CommandOp::UpsertText, 2, payloadBytes);
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&runs, sizeof(runs));
    builder.pushBytes("Hello", header.contentLength);
    builder.pushFloat(0.0f);

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto* text = CadEngineTestAccessor::entityManager(*engine_).getText(2);
    ASSERT_NE(text, nullptr);
    EXPECT_EQ(text->x, 10.0f);
}

TEST_F(TextCommandsTest, UpsertText_InvalidPayloadSize) {
    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::UpsertText, 1, sizeof(TextPayloadHeader));
    TextPayloadHeader header{};
    builder.pushBytes(&header, sizeof(header));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::InvalidPayloadSize);
}

TEST_F(TextCommandsTest, UpsertTextIncrementsGeneration) {
    const std::uint32_t genBefore = CadEngineTestAccessor::generation(*engine_);

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextPayloadHeader header{};
    header.x = 0.0f;
    header.y = 0.0f;
    header.rotation = 0.0f;
    header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    header.align = static_cast<std::uint8_t>(TextAlign::Left);
    header.constraintWidth = 0.0f;
    header.runCount = 1;
    header.contentLength = 1;

    TextRunPayload run{};
    run.startIndex = 0;
    run.length = 1;
    run.fontId = 0;
    run.fontSize = 16.0f;
    run.colorRGBA = 0xFFFFFFFFu;
    run.flags = static_cast<std::uint8_t>(TextStyleFlags::None);

    const std::uint32_t payloadBytes =
        static_cast<std::uint32_t>(sizeof(TextPayloadHeader) + sizeof(TextRunPayload) + header.contentLength + sizeof(float));
    builder.writeCommandHeader(CommandOp::UpsertText, 1, payloadBytes);
    builder.pushBytes(&header, sizeof(header));
    builder.pushBytes(&run, sizeof(run));
    builder.pushBytes("A", header.contentLength);
    builder.pushFloat(0.0f);

    EXPECT_EQ(applyCommands(builder), EngineError::Ok);
    EXPECT_GT(CadEngineTestAccessor::generation(*engine_), genBefore);
}
