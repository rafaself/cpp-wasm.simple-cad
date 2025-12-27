#include <gtest/gtest.h>
#include "../engine/engine.h"

TEST(SelectionStateTest, FiltersLockedAndInvisible) {
    CadEngine engine;
    engine.clear();
    engine.upsertRect(1, 0, 0, 10, 10, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.upsertRect(2, 0, 0, 10, 10, 0.0f, 1.0f, 0.0f, 1.0f);

    engine.setEntityFlags(
        2,
        static_cast<std::uint32_t>(EntityFlags::Locked),
        static_cast<std::uint32_t>(EntityFlags::Locked)
    );

    const std::uint32_t ids[] = {1, 2};
    engine.setSelection(ids, 2, CadEngine::SelectionMode::Replace);

    const auto selected = engine.getSelectionIds();
    ASSERT_EQ(selected.size(), 1u);
    EXPECT_EQ(selected[0], 1u);

    engine.setLayerProps(
        1,
        static_cast<std::uint32_t>(CadEngine::LayerPropMask::Visible),
        0u,
        std::string()
    );
    EXPECT_TRUE(engine.getSelectionIds().empty());
}

TEST(SelectionStateTest, SelectionOrderFollowsDrawOrder) {
    CadEngine engine;
    engine.clear();
    engine.upsertRect(1, 0, 0, 10, 10, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.upsertRect(2, 0, 0, 10, 10, 0.0f, 1.0f, 0.0f, 1.0f);
    engine.upsertRect(3, 0, 0, 10, 10, 0.0f, 0.0f, 1.0f, 1.0f);

    const std::uint32_t ids[] = {1, 3};
    engine.setSelection(ids, 2, CadEngine::SelectionMode::Replace);

    auto selected = engine.getSelectionIds();
    ASSERT_EQ(selected.size(), 2u);
    EXPECT_EQ(selected[0], 1u);
    EXPECT_EQ(selected[1], 3u);

    const std::uint32_t moveId = 1;
    engine.reorderEntities(&moveId, 1, CadEngine::ReorderAction::BringToFront, 0);

    const auto order = engine.getDrawOrderSnapshot();
    ASSERT_EQ(order.size(), 3u);
    EXPECT_EQ(order[0], 2u);
    EXPECT_EQ(order[1], 3u);
    EXPECT_EQ(order[2], 1u);

    selected = engine.getSelectionIds();
    ASSERT_EQ(selected.size(), 2u);
    EXPECT_EQ(selected[0], 3u);
    EXPECT_EQ(selected[1], 1u);
}

TEST(SelectionStateTest, PickRespectsDrawOrder) {
    CadEngine engine;
    engine.clear();
    engine.upsertRect(1, 0, 0, 10, 10, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.upsertRect(2, 0, 0, 10, 10, 0.0f, 1.0f, 0.0f, 1.0f);

    EXPECT_EQ(engine.pick(5.0f, 5.0f, 0.5f), 2u);

    const std::uint32_t moveId = 1;
    engine.reorderEntities(&moveId, 1, CadEngine::ReorderAction::BringToFront, 0);
    EXPECT_EQ(engine.pick(5.0f, 5.0f, 0.5f), 1u);
}
