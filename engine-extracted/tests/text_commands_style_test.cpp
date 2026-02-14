#include "tests/text_commands_test_common.h"

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_MidRunInsertsZeroLengthRun) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 1;
    payload.rangeStartLogical = 2;
    payload.rangeEndLogical = 2;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 0; // set
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(1);
    ASSERT_EQ(runs.size(), 2u);
    EXPECT_EQ(runs[0].length, 2u);
    EXPECT_EQ(runs[1].length, 0u);
}

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_AtRunBoundaryBetweenRuns) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 1;
    payload.rangeStartLogical = 5;
    payload.rangeEndLogical = 5;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Italic);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Italic);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(1);
    ASSERT_EQ(runs.size(), 2u);
    EXPECT_EQ(runs[0].length, 5u);
    EXPECT_EQ(runs[1].length, 0u);
}

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_AtContentEnd) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 1;
    payload.rangeStartLogical = 5;
    payload.rangeEndLogical = 5;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Underline);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Underline);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(1);
    ASSERT_EQ(runs.size(), 2u);
    EXPECT_EQ(runs[1].length, 0u);
}

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_OnEmptyContent) {
    ASSERT_TRUE(upsertSimpleText(1, ""));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 1;
    payload.rangeStartLogical = 0;
    payload.rangeEndLogical = 0;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(1);
    ASSERT_EQ(runs.size(), 1u);
    EXPECT_EQ(runs[0].length, 0u);
}

TEST_F(TextCommandsTest, ApplyTextStyleEmitsEntityChangedWithBounds) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 1;
    payload.rangeStartLogical = 0;
    payload.rangeEndLogical = 5;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    auto eventsMeta = engine_->pollEvents(32);
    bool found = false;
    if (eventsMeta.ptr && eventsMeta.count > 0) {
        const auto* events = reinterpret_cast<const engine::protocol::EngineEvent*>(eventsMeta.ptr);
        for (std::uint32_t i = 0; i < eventsMeta.count; ++i) {
            if (events[i].type == static_cast<std::uint16_t>(engine::protocol::EventType::EntityChanged)) {
                found = true;
                break;
            }
        }
    }
    EXPECT_TRUE(found);
}

TEST_F(TextCommandsTest, ApplyTextStyle_MultipleTogglesAtCaret_SingleRun) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 1;
    payload.rangeStartLogical = 2;
    payload.rangeEndLogical = 2;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold)
        | static_cast<std::uint8_t>(TextStyleFlags::Italic);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold)
        | static_cast<std::uint8_t>(TextStyleFlags::Italic);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(1);
    ASSERT_EQ(runs.size(), 2u);
    EXPECT_EQ(runs[0].length, 2u);
    EXPECT_EQ(runs[1].length, 0u);
}
