#include "tests/engine_test_common.h"
#include <fstream>
#include <string>
#include <vector>

using namespace engine_test;

TEST_F(CadEngineTest, PickPolylinePrefersVertexWithinTolerance) {
    std::vector<Point2> points = { {0.0f, 0.0f}, {10.0f, 0.0f} };
    const std::uint32_t id = 16;
    upsertPolyline(engine, id, points);
    PickResult res = pickAt(engine, 1.0f, 0.0f);
    EXPECT_EQ(res.id, id);
    EXPECT_EQ(res.subTarget, static_cast<std::uint8_t>(PickSubTarget::Vertex));
    EXPECT_EQ(res.subIndex, 0);
}

#if ENGINE_TEXT_ENABLED
TEST_F(CadEngineTest, MoveUpdatesPickIndexForText) {
    engine.initializeTextSystem();

    std::vector<std::string> fontPaths = {
        "../../frontend/public/fonts/DejaVuSans.ttf",
        "../../../frontend/public/fonts/DejaVuSans.ttf",
        "frontend/public/fonts/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    };
    std::vector<std::uint8_t> fontData;
    bool fontLoaded = false;
    for (const auto& path : fontPaths) {
        std::ifstream file(path, std::ios::binary | std::ios::ate);
        if (!file.is_open()) continue;
        std::streamsize size = file.tellg();
        file.seekg(0, std::ios::beg);
        if (size <= 0) continue;
        fontData.resize(static_cast<std::size_t>(size));
        if (!file.read(reinterpret_cast<char*>(fontData.data()), size)) continue;
        if (engine.loadFont(1, reinterpret_cast<uintptr_t>(fontData.data()), fontData.size())) {
            fontLoaded = true;
            break;
        }
    }
    if (!fontLoaded) {
        GTEST_SKIP() << "No font available for text pick test";
    }

    TextPayloadHeader header{};
    header.x = 0.0f;
    header.y = 0.0f;
    header.rotation = 0.0f;
    header.boxMode = 0;
    header.align = 0;
    header.constraintWidth = 0.0f;
    header.runCount = 1;
    header.contentLength = 1;

    TextRunPayload run{};
    run.startIndex = 0;
    run.length = 1;
    run.fontId = 1;
    run.fontSize = 16.0f;
    run.colorRGBA = 0xFFFFFFFF;
    run.flags = 0;

    ASSERT_TRUE(engine.upsertText(7, header, &run, 1, "A", 1));

    const auto before = engine.getEntityAabb(7);
    ASSERT_TRUE(before.valid);

    moveByScreen(engine, 7, kMoveScreenX, kMoveScreenY);

    const auto after = engine.getEntityAabb(7);
    ASSERT_TRUE(after.valid);

    const float beforeX = (before.minX + before.maxX) * 0.5f;
    const float beforeY = (before.minY + before.maxY) * 0.5f;
    const float afterX = (after.minX + after.maxX) * 0.5f;
    const float afterY = (after.minY + after.maxY) * 0.5f;

    expectPickMoved(engine, 7, afterX, afterY, beforeX, beforeY);
}
#endif

TEST_F(CadEngineTest, SelectionBoundsUnion) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 2, 20.0f, -5.0f, 5.0f, 15.0f, 0.0f, 1.0f, 0.0f, 1.0f);

    const std::uint32_t ids[] = {1, 2};
    engine.setSelection(ids, 2, engine::protocol::SelectionMode::Replace);

    const auto bounds = engine.getSelectionBounds();
    ASSERT_TRUE(bounds.valid);
    EXPECT_FLOAT_EQ(bounds.minX, 0.0f);
    EXPECT_FLOAT_EQ(bounds.minY, -5.0f);
    EXPECT_FLOAT_EQ(bounds.maxX, 25.0f);
    EXPECT_FLOAT_EQ(bounds.maxY, 10.0f);
}

TEST_F(CadEngineTest, PickExUsesSelectionBoundsHandles) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 2, 30.0f, 0.0f, 10.0f, 10.0f, 0.0f, 1.0f, 0.0f, 1.0f);

    const std::uint32_t ids[] = {1, 2};
    engine.setSelection(ids, 2, engine::protocol::SelectionMode::Replace);

    const float x = 40.0f;
    const float y = 10.0f;
    const float tolerance = 2.0f;

    const PickResult res = engine.pickEx(x, y, tolerance, 0xFF);
    EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
    EXPECT_EQ(res.subIndex, 2);
    EXPECT_EQ(res.id, 1u);
}

TEST_F(CadEngineTest, PickLineEndpointPrefersVertexOverSelectionHandles) {
    const std::uint32_t id = 20;
    CadEngineTestAccessor::upsertLine(engine, id, 0.0f, 0.0f, 10.0f, 10.0f);

    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const PickResult res = engine.pickEx(0.0f, 0.0f, kPickTolerance, kPickMask);
    EXPECT_EQ(res.id, id);
    EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::Vertex);
    EXPECT_EQ(res.subIndex, 0);
}

TEST_F(CadEngineTest, PickCandidatesReturnsOverlapsSortedByZIndex) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 20.0f, 20.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 2, 5.0f, 5.0f, 20.0f, 20.0f, 0.0f, 1.0f, 0.0f, 1.0f);

    const std::uint32_t bringFront[] = {2};
    engine.reorderEntities(bringFront, 1, engine::protocol::ReorderAction::BringToFront, 0);

    const std::vector<PickResult> candidates = engine.pickCandidates(10.0f, 10.0f, 5.0f, 0xFF);
    ASSERT_GE(candidates.size(), 2u);
    EXPECT_EQ(candidates[0].id, 2u);
    EXPECT_EQ(candidates[1].id, 1u);
}
