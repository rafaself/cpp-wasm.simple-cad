#include "tests/engine_test_common.h"

using namespace engine_test;

TEST_F(CadEngineTest, SnapToGridUsesSnapOptions) {
    engine.setSnapOptions(true, true, 10.0f, 5.0f, false, false, false, false);
    const auto snapped = engine.getSnappedPoint(12.4f, 18.9f);
    EXPECT_FLOAT_EQ(snapped.first, 10.0f);
    EXPECT_FLOAT_EQ(snapped.second, 20.0f);
}

TEST_F(CadEngineTest, SnapToGridDisabledReturnsInput) {
    engine.setSnapOptions(false, true, 10.0f, 5.0f, false, false, false, false);
    const auto snapped = engine.getSnappedPoint(12.4f, 18.9f);
    EXPECT_FLOAT_EQ(snapped.first, 12.4f);
    EXPECT_FLOAT_EQ(snapped.second, 18.9f);
}

TEST_F(CadEngineTest, ObjectSnapAlignsEdges) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 2, 30.0f, 0.0f, 10.0f, 10.0f, 0.0f, 1.0f, 0.0f, 1.0f);

    engine.setSnapOptions(true, false, 10.0f, 5.0f, false, false, true, false);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    engine.beginTransform(&id, 1, CadEngine::TransformMode::Move, 0, -1,
        0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 100.0f, 100.0f, 0);
    engine.updateTransform(19.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 100.0f, 100.0f, 0);
    engine.commitTransform();

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* rect = em.getRect(id);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 20.0f);
}

TEST_F(CadEngineTest, GridSnapAppliedDuringMove) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setSnapOptions(true, true, 10.0f, 5.0f, false, false, false, false);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    moveByScreenWithModifiers(engine, id, 9.5f, 0.0f, 0);

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* rect = em.getRect(id);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 10.0f);
}

TEST_F(CadEngineTest, SnapSuppressedByCtrlDuringMove) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setSnapOptions(true, true, 10.0f, 5.0f, false, false, false, false);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    const std::uint32_t ctrlMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Ctrl);
    moveByScreenWithModifiers(engine, id, 9.5f, 0.0f, ctrlMask);

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* rect = em.getRect(id);
    ASSERT_NE(rect, nullptr);
    EXPECT_NEAR(rect->x, 9.5f, 1e-4f);
}

TEST_F(CadEngineTest, AxisLockWithShiftUsesScreenDelta) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setSnapOptions(false, false, 10.0f, 5.0f, false, false, false, false);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    const std::uint32_t shiftMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    moveByScreenWithModifiers(engine, id, 10.0f, 2.0f, shiftMask);

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* rect = em.getRect(id);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 10.0f);
    EXPECT_FLOAT_EQ(rect->y, 0.0f);
}

TEST_F(CadEngineTest, AxisLockWithShiftAllowsSwitch) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setSnapOptions(false, false, 10.0f, 5.0f, false, false, false, false);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    const std::uint32_t shiftMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    engine.beginTransform(&id, 1, CadEngine::TransformMode::Move, 0, -1,
        0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 0.0f, 0.0f, shiftMask);
    engine.updateTransform(10.0f, 2.0f,
        0.0f, 0.0f, 1.0f, 0.0f, 0.0f, shiftMask);
    engine.updateTransform(10.0f, -30.0f,
        0.0f, 0.0f, 1.0f, 0.0f, 0.0f, shiftMask);
    engine.commitTransform();

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* rect = em.getRect(id);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 0.0f);
    EXPECT_FLOAT_EQ(rect->y, 30.0f);
}

TEST_F(CadEngineTest, ResizeWithShiftPreservesAspectRatio) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 20.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setSnapOptions(false, false, 10.0f, 5.0f, false, false, false, false);

    const std::uint32_t id = 1;
    const std::uint32_t shiftMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    resizeByScreenWithView(engine, id, 2, 20.0f, -10.0f, 40.0f, -20.0f, 1.0f, shiftMask);

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* rect = em.getRect(id);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 0.0f);
    EXPECT_FLOAT_EQ(rect->y, 0.0f);
    EXPECT_FLOAT_EQ(rect->w, 40.0f);
    EXPECT_FLOAT_EQ(rect->h, 20.0f);
}

TEST_F(CadEngineTest, AltDragDuplicatesSelection) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setSnapOptions(false, false, 10.0f, 5.0f, false, false, false, false);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    const std::uint32_t altMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Alt);
    moveByScreenWithModifiers(engine, id, 10.0f, 0.0f, altMask);

    const auto selection = engine.getSelectionIds();
    ASSERT_EQ(selection.size(), 1u);
    const std::uint32_t dupId = selection[0];
    EXPECT_NE(dupId, id);

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* original = em.getRect(id);
    const RectRec* duplicate = em.getRect(dupId);
    ASSERT_NE(original, nullptr);
    ASSERT_NE(duplicate, nullptr);
    EXPECT_FLOAT_EQ(original->x, 0.0f);
    EXPECT_FLOAT_EQ(duplicate->x, 10.0f);

    engine.undo();
    const auto& emAfter = CadEngineTestAccessor::entityManager(engine);
    EXPECT_NE(emAfter.getRect(id), nullptr);
    EXPECT_EQ(emAfter.getRect(dupId), nullptr);
}

TEST_F(CadEngineTest, TransformReplayOverridesViewAndSnapContext) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setSnapOptions(true, true, 10.0f, 5.0f, false, false, false, false);
    engine.setTransformLogEnabled(true, 32, 32);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    engine.beginTransform(&id, 1, CadEngine::TransformMode::Move, 0, -1,
        0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 100.0f, 100.0f, 0);
    engine.updateTransform(9.5f, 0.0f,
        0.0f, 0.0f, 1.0f, 100.0f, 100.0f, 0);
    engine.commitTransform();

    const auto& em = CadEngineTestAccessor::entityManager(engine);
    const RectRec* moved = em.getRect(id);
    ASSERT_NE(moved, nullptr);
    EXPECT_FLOAT_EQ(moved->x, 10.0f);

    engine.undo();
    const RectRec* reset = em.getRect(id);
    ASSERT_NE(reset, nullptr);
    EXPECT_FLOAT_EQ(reset->x, 0.0f);

    engine.setSnapOptions(false, false, 10.0f, 5.0f, false, false, false, false);
    CadEngineTestAccessor::setViewTransform(engine, 10.0f, -5.0f, 2.0f, 800.0f, 600.0f);

    EXPECT_TRUE(engine.replayTransformLog());

    const RectRec* replayed = em.getRect(id);
    ASSERT_NE(replayed, nullptr);
    EXPECT_FLOAT_EQ(replayed->x, 10.0f);
    EXPECT_FLOAT_EQ(CadEngineTestAccessor::viewScale(engine), 2.0f);

    const auto snapped = engine.getSnappedPoint(9.5f, 0.0f);
    EXPECT_FLOAT_EQ(snapped.first, 9.5f);
    EXPECT_FLOAT_EQ(snapped.second, 0.0f);
}
