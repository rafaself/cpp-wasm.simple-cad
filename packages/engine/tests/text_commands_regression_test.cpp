#include "tests/text_commands_test_common.h"

TEST_F(TextCommandsTest, TextEntityInEntityMap) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    const auto& em = CadEngineTestAccessor::entityManager(*engine_);
    EXPECT_NE(em.entities.find(1), em.entities.end());
}

TEST_F(TextCommandsTest, DeleteTextRemovesFromEntityMap) {
    ASSERT_TRUE(upsertSimpleText(1, "Hello"));

    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::DeleteText, 1, sizeof(std::uint32_t));
    std::uint32_t id = 1;
    builder.pushBytes(&id, sizeof(id));

    EngineError err = applyCommands(builder);
    EXPECT_EQ(err, EngineError::Ok);

    const auto& emAfter = CadEngineTestAccessor::entityManager(*engine_);
    EXPECT_EQ(emAfter.entities.find(1), emAfter.entities.end());
}

TEST_F(TextCommandsTest, PR1_VerifyCaretStyling_WithInsertion) {
    ASSERT_TRUE(upsertSimpleText(200, "Hello"));

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 200;
    payload.rangeStartLogical = 2;
    payload.rangeEndLogical = 2;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;

    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);

    builder.clear();
    builder.writeHeader(1);
    TextInsertPayloadHeader insertHeader{};
    insertHeader.textId = 200;
    insertHeader.insertIndex = 2;
    insertHeader.byteLength = 1;
    builder.writeCommandHeader(CommandOp::InsertTextContent, 0, sizeof(insertHeader) + insertHeader.byteLength);
    builder.pushBytes(&insertHeader, sizeof(insertHeader));
    builder.pushBytes("X", insertHeader.byteLength);
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);

    const auto& runsBeforeInsert = CadEngineTestAccessor::textSystem(*engine_).store.getRuns(200);
    ASSERT_FALSE(runsBeforeInsert.empty());
    EXPECT_EQ(runsBeforeInsert[0].startIndex, 0u);
}

TEST_F(TextCommandsTest, Repro_VerticalDisplacement_FontSizeChange) {
    ASSERT_TRUE(upsertSimpleText(300, "Hello"));

    engine::text::ApplyTextStylePayload payload{};
    payload.textId = 300;
    payload.rangeStartLogical = 0;
    payload.rangeEndLogical = 5;
    payload.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.flagsValue = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload.mode = 0;
    payload.styleParamsVersion = 0;
    payload.styleParamsLen = 0;

    CommandBufferBuilder builder;
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload));
    builder.pushBytes(&payload, sizeof(payload));
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);

    CadEngineTestAccessor::textSystem(*engine_).layoutEngine.layoutText(300);
    const TextRec* text1 = CadEngineTestAccessor::textSystem(*engine_).store.getText(300);
    const engine::text::TextLayout* layout1 = CadEngineTestAccessor::textSystem(*engine_).layoutEngine.getLayout(300);
    ASSERT_NE(text1, nullptr);
    ASSERT_NE(layout1, nullptr);

    const float beforeY = text1->y;
    const float beforeHeight = layout1->totalHeight;

    engine::text::ApplyTextStylePayload payload2{};
    payload2.textId = 300;
    payload2.rangeStartLogical = 0;
    payload2.rangeEndLogical = 5;
    payload2.flagsMask = static_cast<std::uint8_t>(TextStyleFlags::Bold);
    payload2.flagsValue = 0;
    payload2.mode = 0;
    payload2.styleParamsVersion = 0;
    payload2.styleParamsLen = 0;

    builder.clear();
    builder.writeHeader(1);
    builder.writeCommandHeader(CommandOp::ApplyTextStyle, 0, sizeof(payload2));
    builder.pushBytes(&payload2, sizeof(payload2));
    EXPECT_EQ(applyCommands(builder), EngineError::Ok);

    CadEngineTestAccessor::textSystem(*engine_).layoutEngine.layoutText(300);
    const TextRec* text2 = CadEngineTestAccessor::textSystem(*engine_).store.getText(300);
    const engine::text::TextLayout* layout2 = CadEngineTestAccessor::textSystem(*engine_).layoutEngine.getLayout(300);
    ASSERT_NE(text2, nullptr);
    ASSERT_NE(layout2, nullptr);

    EXPECT_NEAR(text2->y, beforeY, 1e-3f);
    EXPECT_NEAR(layout2->totalHeight, beforeHeight, 1e-3f);
}
