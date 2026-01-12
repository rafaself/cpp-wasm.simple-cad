#include "tests/text_commands_test_common.h"

TEST_F(TextCommandsTest, ApplyTextStyle_CaretOnly_MidRunInsertsZeroLengthRun) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextApplyStylePayload payload{};
    payload.textId = 1;
    payload.selectionStart = 2;
    payload.selectionEnd = 2;
    payload.styleMask = static_cast<std::uint32_t>(TextStyleFlags::Bold);
    payload.styleValue = static_cast<std::uint32_t>(TextStyleFlags::Bold);
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

    TextApplyStylePayload payload{};
    payload.textId = 1;
    payload.selectionStart = 5;
    payload.selectionEnd = 5;
    payload.styleMask = static_cast<std::uint32_t>(TextStyleFlags::Italic);
    payload.styleValue = static_cast<std::uint32_t>(TextStyleFlags::Italic);
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

    TextApplyStylePayload payload{};
    payload.textId = 1;
    payload.selectionStart = 5;
    payload.selectionEnd = 5;
    payload.styleMask = static_cast<std::uint32_t>(TextStyleFlags::Underline);
    payload.styleValue = static_cast<std::uint32_t>(TextStyleFlags::Underline);
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

    TextApplyStylePayload payload{};
    payload.textId = 1;
    payload.selectionStart = 0;
    payload.selectionEnd = 0;
    payload.styleMask = static_cast<std::uint32_t>(TextStyleFlags::Bold);
    payload.styleValue = static_cast<std::uint32_t>(TextStyleFlags::Bold);
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

    TextApplyStylePayload payload{};
    payload.textId = 1;
    payload.selectionStart = 0;
    payload.selectionEnd = 5;
    payload.styleMask = static_cast<std::uint32_t>(TextStyleFlags::Bold);
    payload.styleValue = static_cast<std::uint32_t>(TextStyleFlags::Bold);
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    auto events = engine_->pollEvents(32);
    bool found = false;
    for (std::uint32_t i = 0; i < events.count; ++i) {
        if (events.events[i].type == static_cast<std::uint16_t>(engine::protocol::EventType::EntityChanged)) {
            found = true;
            break;
        }
    }
    EXPECT_TRUE(found);
}

TEST_F(TextCommandsTest, ApplyTextStyle_MultipleTogglesAtCaret_SingleRun) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);

    TextApplyStylePayload payload{};
    payload.textId = 1;
    payload.selectionStart = 2;
    payload.selectionEnd = 2;
    payload.styleMask = static_cast<std::uint32_t>(TextStyleFlags::Bold)
        | static_cast<std::uint32_t>(TextStyleFlags::Italic);
    payload.styleValue = static_cast<std::uint32_t>(TextStyleFlags::Bold)
        | static_cast<std::uint32_t>(TextStyleFlags::Italic);
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& runs = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(1);
    ASSERT_EQ(runs.size(), 2u);
    EXPECT_EQ(runs[0].length, 2u);
    EXPECT_EQ(runs[1].length, 0u);
}
