#include <gtest/gtest.h>
#include "engine/engine.h"
#include "tests/test_accessors.h"

TEST(LayerFlagsTest, InvisibleLayerNotRendered) {
    CadEngine engine;
    engine.clear();
    CadEngineTestAccessor::upsertRect(engine, 1, 0, 0, 10, 10, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.setEntityLayer(1, 1);

    engine.setLayerProps(
        1,
        static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible),
        0u,
        std::string()
    );

    auto stats = engine.getStats();
    EXPECT_EQ(stats.triangleVertexCount, 0u);

    engine.setLayerProps(
        1,
        static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible),
        static_cast<std::uint32_t>(LayerFlags::Visible),
        std::string()
    );

    stats = engine.getStats();
    EXPECT_GT(stats.triangleVertexCount, 0u);
}

TEST(LayerFlagsTest, LayerVisibilityAndLockAffectPick) {
    CadEngine engine;
    engine.clear();
    CadEngineTestAccessor::upsertRect(engine, 1, 0, 0, 10, 10, 0.0f, 1.0f, 0.0f, 1.0f);
    engine.setEntityLayer(1, 1);

    EXPECT_EQ(engine.pick(5.0f, 5.0f, 0.5f), 1u);

    engine.setLayerProps(
        1,
        static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible),
        0u,
        std::string()
    );
    EXPECT_EQ(engine.pick(5.0f, 5.0f, 0.5f), 0u);

    engine.setLayerProps(
        1,
        static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible),
        static_cast<std::uint32_t>(LayerFlags::Visible),
        std::string()
    );

    engine.setLayerProps(
        1,
        static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Locked),
        static_cast<std::uint32_t>(LayerFlags::Locked),
        std::string()
    );
    EXPECT_EQ(engine.pick(5.0f, 5.0f, 0.5f), 0u);

    engine.setLayerProps(
        1,
        static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Locked),
        0u,
        std::string()
    );
    EXPECT_EQ(engine.pick(5.0f, 5.0f, 0.5f), 1u);
}
