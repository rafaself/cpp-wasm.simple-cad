#include <gtest/gtest.h>
#include "engine/engine.h"

TEST(InteractiveTransformPerfTest, UpdateTransformDoesNotRebuildAll) {
    CadEngine engine;
    engine.clear();

    engine.upsertRect(1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.getPositionBufferMeta(); // Ensure buffers are built.

    const auto before = engine.getStats().rebuildAllGeometryCount;

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
    engine.beginTransform(&id, 1, CadEngine::TransformMode::Move, 0, -1, 0.0f, 0.0f);

    engine.updateTransform(5.0f, 5.0f);
    engine.updateTransform(10.0f, 10.0f);

    const auto after = engine.getStats().rebuildAllGeometryCount;
    EXPECT_EQ(after, before);

    engine.commitTransform();
}
