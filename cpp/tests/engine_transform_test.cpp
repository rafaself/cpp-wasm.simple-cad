#include "tests/engine_test_common.h"
#include <vector>

using namespace engine_test;

TEST_F(CadEngineTest, MoveUpdatesPickIndexForRect) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    moveByScreen(engine, 1, kMoveScreenX, kMoveScreenY);
    expectPickMoved(engine, 1, 55.0f, 5.0f, 5.0f, 5.0f);
}

TEST_F(CadEngineTest, MoveUpdatesPickIndexForCircle) {
    CadEngineTestAccessor::upsertCircle(engine, 2, 0.0f, 0.0f, 5.0f, 5.0f, 0.0f, 1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    moveByScreen(engine, 2, kMoveScreenX, kMoveScreenY);
    expectPickMoved(engine, 2, 50.0f, 0.0f, 0.0f, 0.0f);
}

TEST_F(CadEngineTest, MoveUpdatesPickIndexForPolygon) {
    CadEngineTestAccessor::upsertPolygon(engine, 3, 0.0f, 0.0f, 5.0f, 5.0f, 0.0f, 1.0f, 1.0f, 5,
        1.0f, 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    moveByScreen(engine, 3, kMoveScreenX, kMoveScreenY);
    expectPickMoved(engine, 3, 50.0f, 0.0f, 0.0f, 0.0f);
}

TEST_F(CadEngineTest, MoveUpdatesPickIndexForLine) {
    CadEngineTestAccessor::upsertLine(engine, 4, 0.0f, 0.0f, 10.0f, 0.0f);
    moveByScreen(engine, 4, kMoveScreenX, kMoveScreenY);
    expectPickMoved(engine, 4, 55.0f, 0.0f, 5.0f, 0.0f);
}

TEST_F(CadEngineTest, EdgeDragMovesLine) {
    CadEngineTestAccessor::upsertLine(engine, 14, 0.0f, 0.0f, 10.0f, 0.0f);
    edgeDragByScreen(engine, 14, kMoveScreenX, kMoveScreenY);
    expectPickMoved(engine, 14, 55.0f, 0.0f, 5.0f, 0.0f);
}

TEST_F(CadEngineTest, VertexDragShiftSnapsLineTo45Degrees) {
    CadEngineTestAccessor::upsertLine(engine, 15, 0.0f, 0.0f, 10.0f, 0.0f);
    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    vertexDragByScreenWithModifiers(engine, 15, 1, 10.0f, -6.0f, shift);

    const LineRec* line = CadEngineTestAccessor::entityManager(engine).getLine(15);
    ASSERT_NE(line, nullptr);
    EXPECT_NEAR(line->x0, 0.0f, 1e-3f);
    EXPECT_NEAR(line->y0, 0.0f, 1e-3f);
    EXPECT_NEAR(line->x1, 8.246211f, 1e-3f);
    EXPECT_NEAR(line->y1, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, VertexDragShiftSnapsArrowEndpointTo45Degrees) {
    CadEngineTestAccessor::upsertArrow(engine, 18, 0.0f, 0.0f, 10.0f, 0.0f, 6.0f,
        1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    vertexDragByScreenWithModifiers(engine, 18, 1, 10.0f, -6.0f, shift);

    const ArrowRec* arrow = CadEngineTestAccessor::entityManager(engine).getArrow(18);
    ASSERT_NE(arrow, nullptr);
    EXPECT_NEAR(arrow->ax, 0.0f, 1e-3f);
    EXPECT_NEAR(arrow->ay, 0.0f, 1e-3f);
    EXPECT_NEAR(arrow->bx, 8.246211f, 1e-3f);
    EXPECT_NEAR(arrow->by, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, VertexDragShiftSnapsPolylineEndpointTo45Degrees) {
    std::vector<Point2> points = { {0.0f, 0.0f}, {10.0f, 0.0f} };
    const std::uint32_t id = 17;
    upsertPolyline(engine, id, points);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    vertexDragByScreenWithModifiers(engine, id, 1, 10.0f, -6.0f, shift);

    const EntityManager& em = CadEngineTestAccessor::entityManager(engine);
    const PolyRec* poly = em.getPolyline(id);
    ASSERT_NE(poly, nullptr);
    ASSERT_GE(poly->count, 2u);
    const std::vector<Point2>& updated = em.getPoints();
    const std::uint32_t idx = poly->offset + 1;
    ASSERT_LT(idx, updated.size());
    EXPECT_NEAR(updated[idx].x, 8.246211f, 1e-3f);
    EXPECT_NEAR(updated[idx].y, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, MoveUpdatesPickIndexForArrow) {
    CadEngineTestAccessor::upsertArrow(engine, 5, 0.0f, 0.0f, 10.0f, 0.0f, 6.0f,
        1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    moveByScreen(engine, 5, kMoveScreenX, kMoveScreenY);
    expectPickMoved(engine, 5, 55.0f, 0.0f, 5.0f, 0.0f);
}

TEST_F(CadEngineTest, MoveUpdatesPickIndexForPolyline) {
    std::vector<Point2> points = { {0.0f, 0.0f}, {10.0f, 0.0f}, {10.0f, 10.0f} };
    upsertPolyline(engine, 6, points);
    moveByScreen(engine, 6, kMoveScreenX, kMoveScreenY);
    expectPickMoved(engine, 6, 55.0f, 0.0f, 5.0f, 0.0f);
}
