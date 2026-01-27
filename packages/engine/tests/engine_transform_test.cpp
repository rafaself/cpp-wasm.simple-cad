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

TEST_F(CadEngineTest, SideResizeNorthResizesRectAsymmetric) {
    CadEngineTestAccessor::upsertRect(engine, 21, 40.0f, 40.0f, 20.0f, 10.0f, 1.0f, 1.0f, 1.0f, 1.0f);

    sideResizeByScreenWithView(
        engine,
        21,
        2, // North
        50.0f, -40.0f,
        50.0f, -35.0f,
        1.0f,
        0);

    const RectRec* rect = CadEngineTestAccessor::entityManager(engine).getRect(21);
    ASSERT_NE(rect, nullptr);
    EXPECT_NEAR(rect->x, 40.0f, 1e-3f);
    EXPECT_NEAR(rect->y, 35.0f, 1e-3f);
    EXPECT_NEAR(rect->w, 20.0f, 1e-3f);
    EXPECT_NEAR(rect->h, 15.0f, 1e-3f);
}

TEST_F(CadEngineTest, SideResizeNorthSymmetricKeepsCenter) {
    CadEngineTestAccessor::upsertRect(engine, 22, 40.0f, 40.0f, 20.0f, 10.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    const auto alt = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Alt);

    sideResizeByScreenWithView(
        engine,
        22,
        2, // North
        50.0f, -40.0f,
        50.0f, -35.0f,
        1.0f,
        alt);

    const RectRec* rect = CadEngineTestAccessor::entityManager(engine).getRect(22);
    ASSERT_NE(rect, nullptr);
    EXPECT_NEAR(rect->x, 40.0f, 1e-3f);
    EXPECT_NEAR(rect->y, 35.0f, 1e-3f);
    EXPECT_NEAR(rect->w, 20.0f, 1e-3f);
    EXPECT_NEAR(rect->h, 20.0f, 1e-3f);
}

TEST_F(CadEngineTest, SideResizeNorthCrossesAnchorStillValid) {
    CadEngineTestAccessor::upsertRect(engine, 23, 40.0f, 40.0f, 20.0f, 10.0f, 1.0f, 1.0f, 1.0f, 1.0f);

    sideResizeByScreenWithView(
        engine,
        23,
        2, // North
        50.0f, -40.0f,
        50.0f, -60.0f,
        1.0f,
        0);

    const RectRec* rect = CadEngineTestAccessor::entityManager(engine).getRect(23);
    ASSERT_NE(rect, nullptr);
    EXPECT_NEAR(rect->x, 40.0f, 1e-3f);
    EXPECT_NEAR(rect->y, 50.0f, 1e-3f);
    EXPECT_NEAR(rect->w, 20.0f, 1e-3f);
    EXPECT_NEAR(rect->h, 10.0f, 1e-3f);
}

TEST_F(CadEngineTest, MultiSelectionResizeScalesAllEntities) {
    CadEngineTestAccessor::upsertRect(engine, 100, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 200, 20.0f, 0.0f, 10.0f, 10.0f, 1.0f, 1.0f, 1.0f, 1.0f);

    std::uint32_t ids[] = { 100u, 200u };
    engine.setSelection(ids, 2, engine::protocol::SelectionMode::Replace);
    ASSERT_EQ(engine.getSelectionIds().size(), 2u);
    const auto aabbA = engine.getEntityAabb(100);
    const auto aabbB = engine.getEntityAabb(200);
    const auto selectionBounds = engine.getSelectionBounds();
    ASSERT_TRUE(aabbA.valid);
    ASSERT_TRUE(aabbB.valid);
    ASSERT_TRUE(selectionBounds.valid);
    EXPECT_NEAR(aabbA.minX, 0.0f, 1e-3f);
    EXPECT_NEAR(aabbA.maxX, 10.0f, 1e-3f);
    EXPECT_NEAR(aabbB.minX, 20.0f, 1e-3f);
    EXPECT_NEAR(aabbB.maxX, 30.0f, 1e-3f);
    EXPECT_NEAR(selectionBounds.minX, 0.0f, 1e-3f);
    EXPECT_NEAR(selectionBounds.maxX, 30.0f, 1e-3f);

    // Group bounds: min=(0,0) max=(30,10). Drag TR handle to (60,20) => scale 2x.
    engine.beginTransform(
        ids,
        2,
        CadEngine::TransformMode::Resize,
        100,
        2,
        30.0f,
        -10.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.updateTransform(60.0f, -20.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0);
    engine.commitTransform();

    const RectRec* rectA = CadEngineTestAccessor::entityManager(engine).getRect(100);
    const RectRec* rectB = CadEngineTestAccessor::entityManager(engine).getRect(200);
    ASSERT_NE(rectA, nullptr);
    ASSERT_NE(rectB, nullptr);

    EXPECT_NEAR(rectA->x, 0.0f, 1e-3f);
    EXPECT_NEAR(rectA->y, 0.0f, 1e-3f);
    EXPECT_NEAR(rectA->w, 20.0f, 1e-3f);
    EXPECT_NEAR(rectA->h, 20.0f, 1e-3f);

    EXPECT_NEAR(rectB->x, 40.0f, 1e-3f);
    EXPECT_NEAR(rectB->y, 0.0f, 1e-3f);
    EXPECT_NEAR(rectB->w, 20.0f, 1e-3f);
    EXPECT_NEAR(rectB->h, 20.0f, 1e-3f);
}
