#include <gtest/gtest.h>
#include "engine/engine.h"
#include "tests/test_accessors.h"

namespace {
const RectRec* findRect(const CadEngine& engine, std::uint32_t id) {
    return CadEngineTestAccessor::entityManager(engine).getRect(id);
}
} // namespace

TEST(HistoryTest, UndoRedoSequence) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.2f, 0.3f, 0.4f, 1.0f);
    const auto digestAfterCreate = engine.getDocumentDigest();

    std::uint32_t ids[] = {1};
    engine.beginTransform(ids, 1, CadEngine::TransformMode::Move, 0, -1, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0);
    engine.updateTransform(5.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0);
    engine.commitTransform();

    const RectRec* rect = findRect(engine, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 5.0f);

    CadEngineTestAccessor::deleteEntity(engine, 1);
    EXPECT_EQ(findRect(engine, 1), nullptr);

    engine.undo();
    rect = findRect(engine, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 5.0f);

    engine.undo();
    rect = findRect(engine, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 0.0f);

    const auto digestAfterUndo = engine.getDocumentDigest();
    EXPECT_EQ(digestAfterUndo.lo, digestAfterCreate.lo);
    EXPECT_EQ(digestAfterUndo.hi, digestAfterCreate.hi);

    engine.redo();
    rect = findRect(engine, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 5.0f);

    engine.redo();
    EXPECT_EQ(findRect(engine, 1), nullptr);
}

TEST(HistoryTest, SnapshotRoundTripUndoRedo) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.2f, 0.3f, 0.4f, 1.0f);

    std::uint32_t ids[] = {1};
    engine.beginTransform(ids, 1, CadEngine::TransformMode::Move, 0, -1, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0);
    engine.updateTransform(3.0f, 0.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0);
    engine.commitTransform();

    CadEngineTestAccessor::deleteEntity(engine, 1);

    const auto meta = engine.saveSnapshot();
    ASSERT_GT(meta.byteCount, 0u);

    CadEngine engine2;
    engine2.loadSnapshotFromPtr(meta.ptr, meta.byteCount);

    engine2.undo();
    const RectRec* rect = findRect(engine2, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 3.0f);

    engine2.undo();
    rect = findRect(engine2, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 0.0f);

    engine2.redo();
    rect = findRect(engine2, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 3.0f);

    engine2.redo();
    EXPECT_EQ(findRect(engine2, 1), nullptr);
}

TEST(HistoryTest, DragBelowThresholdDoesNotCreateHistory) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.2f, 0.3f, 0.4f, 1.0f);
    CadEngineTestAccessor::clearHistory(engine);

    std::uint32_t ids[] = {1};
    engine.beginTransform(ids, 1, CadEngine::TransformMode::Move, 0, -1,
        0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0);
    engine.updateTransform(1.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0);
    engine.commitTransform();

    const RectRec* rect = findRect(engine, 1);
    ASSERT_NE(rect, nullptr);
    EXPECT_FLOAT_EQ(rect->x, 0.0f);
    EXPECT_FALSE(engine.canUndo());
}
