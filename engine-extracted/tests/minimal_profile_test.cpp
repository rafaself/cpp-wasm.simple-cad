#include <gtest/gtest.h>

#include "engine/command/commands.h"
#include "engine/core/types.h"
#include "engine/engine.h"
#include "tests/engine_test_common.h"
#include "tests/test_accessors.h"

#include <cstdint>
#include <cstring>
#include <vector>

namespace {

std::vector<std::uint8_t> buildSingleCommandBuffer(
    CommandOp op,
    std::uint32_t id,
    const void* payload,
    std::uint32_t payloadBytes) {
    std::vector<std::uint8_t> buf;
    buf.reserve(static_cast<std::size_t>(commandHeaderBytes + perCommandHeaderBytes + payloadBytes));
    auto pushU32 = [&](std::uint32_t v) {
        const auto* p = reinterpret_cast<const std::uint8_t*>(&v);
        buf.insert(buf.end(), p, p + sizeof(v));
    };
    pushU32(commandMagicEwdc);
    pushU32(4);
    pushU32(1);
    pushU32(0);
    pushU32(static_cast<std::uint32_t>(op));
    pushU32(id);
    pushU32(payloadBytes);
    pushU32(0);
    if (payloadBytes > 0 && payload != nullptr) {
        const auto* p = reinterpret_cast<const std::uint8_t*>(payload);
        buf.insert(buf.end(), p, p + payloadBytes);
    }
    return buf;
}

void applySingleCommand(CadEngine& engine, CommandOp op, std::uint32_t id, const void* payload, std::uint32_t payloadBytes) {
    std::vector<std::uint8_t> buf = buildSingleCommandBuffer(op, id, payload, payloadBytes);
    engine.applyCommandBuffer(reinterpret_cast<std::uintptr_t>(buf.data()), static_cast<std::uint32_t>(buf.size()));
}

} // namespace

using namespace engine_test;

TEST(MinimalProfileTest, UpsertEssentialEntities) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 20.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertLine(engine, 2, 0.0f, 0.0f, 10.0f, 5.0f);
    CadEngineTestAccessor::upsertArrow(engine, 3, 0.0f, 0.0f, 12.0f, 0.0f, 4.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f);

    TextPayloadHeader header{};
    header.x = 2.0f;
    header.y = 3.0f;
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
    run.fontSize = 14.0f;
    run.colorRGBA = 0xFFFFFFFFu;
    run.flags = static_cast<std::uint8_t>(TextStyleFlags::None);

    ASSERT_TRUE(engine.upsertText(4, header, &run, 1, "Hello", 5));

    EXPECT_EQ(engine.getEntityKind(1), static_cast<std::uint32_t>(EntityKind::Rect));
    EXPECT_EQ(engine.getEntityKind(2), static_cast<std::uint32_t>(EntityKind::Line));
    EXPECT_EQ(engine.getEntityKind(3), static_cast<std::uint32_t>(EntityKind::Arrow));
    EXPECT_EQ(engine.getEntityKind(4), static_cast<std::uint32_t>(EntityKind::Text));
}

TEST(MinimalProfileTest, PickHonorsElevationAndStableOrder) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 10, 0.0f, 0.0f, 20.0f, 20.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 11, 0.0f, 0.0f, 20.0f, 20.0f, 0.0f, 1.0f, 0.0f, 1.0f);

    ASSERT_TRUE(engine.setEntityGeomZ(10, 1.0f));
    ASSERT_TRUE(engine.setEntityGeomZ(11, 2.0f));
    EXPECT_EQ(engine.pick(5.0f, 5.0f, 1.0f), 11u);

    ASSERT_TRUE(engine.setEntityGeomZ(10, 2.0f));
    const std::uint32_t bringFront[] = {10u};
    engine.reorderEntities(bringFront, 1, engine::protocol::ReorderAction::BringToFront, 0);
    EXPECT_EQ(engine.pick(5.0f, 5.0f, 1.0f), 10u);
}

TEST(MinimalProfileTest, MoveResizeUndoRedoAndSnapshot) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 20, 0.0f, 0.0f, 10.0f, 10.0f, 0.8f, 0.8f, 0.8f, 1.0f);
    moveByScreen(engine, 20, 8.0f, 0.0f);

    const RectRec* moved = CadEngineTestAccessor::entityManager(engine).getRect(20);
    ASSERT_NE(moved, nullptr);
    EXPECT_NEAR(moved->x, 8.0f, 1e-3f);

    ASSERT_TRUE(engine.canUndo());
    engine.undo();
    const RectRec* undone = CadEngineTestAccessor::entityManager(engine).getRect(20);
    ASSERT_NE(undone, nullptr);
    EXPECT_NEAR(undone->x, 0.0f, 1e-3f);

    ASSERT_TRUE(engine.canRedo());
    engine.redo();
    const RectRec* redone = CadEngineTestAccessor::entityManager(engine).getRect(20);
    ASSERT_NE(redone, nullptr);
    EXPECT_NEAR(redone->x, 8.0f, 1e-3f);

    engine.setEntitySize(20, 15.0f, 12.0f);
    const RectRec* resized = CadEngineTestAccessor::entityManager(engine).getRect(20);
    ASSERT_NE(resized, nullptr);
    EXPECT_NEAR(resized->w, 15.0f, 1e-3f);
    EXPECT_NEAR(resized->h, 12.0f, 1e-3f);
    const float expectedX = resized->x;
    const float expectedW = resized->w;

    const auto snap = engine.saveSnapshot();
    ASSERT_GT(snap.byteCount, 0u);

    CadEngine engine2;
    engine2.loadSnapshotFromPtr(snap.ptr, snap.byteCount);
    const RectRec* restored = CadEngineTestAccessor::entityManager(engine2).getRect(20);
    ASSERT_NE(restored, nullptr);
    EXPECT_NEAR(restored->x, expectedX, 1e-3f);
    EXPECT_NEAR(restored->w, expectedW, 1e-3f);
}

TEST(MinimalProfileTest, UnsupportedOpsFailFast) {
    CadEngine engine;
    engine.clear();

    CirclePayload circle{};
    circle.cx = 0.0f;
    circle.cy = 0.0f;
    circle.rx = 5.0f;
    circle.ry = 5.0f;
    circle.rot = 0.0f;
    circle.sx = 1.0f;
    circle.sy = 1.0f;
    circle.fillA = 1.0f;
    circle.strokeA = 1.0f;
    circle.strokeEnabled = 1.0f;
    circle.strokeWidthPx = 1.0f;
    circle.elevationZ = 0.0f;
    applySingleCommand(engine, CommandOp::UpsertCircle, 100, &circle, sizeof(circle));
    EXPECT_EQ(CadEngineTestAccessor::lastError(engine), EngineError::InvalidOperation);

    BeginDraftPayload draft{};
    draft.kind = static_cast<std::uint32_t>(EntityKind::Rect);
    draft.x = 0.0f;
    draft.y = 0.0f;
    applySingleCommand(engine, CommandOp::BeginDraft, 0, &draft, sizeof(draft));
    EXPECT_EQ(CadEngineTestAccessor::lastError(engine), EngineError::InvalidOperation);

    TextCaretPayload caret{};
    caret.textId = 1;
    caret.caretIndex = 0;
    applySingleCommand(engine, CommandOp::SetTextCaret, 0, &caret, sizeof(caret));
    EXPECT_EQ(CadEngineTestAccessor::lastError(engine), EngineError::InvalidOperation);
}
