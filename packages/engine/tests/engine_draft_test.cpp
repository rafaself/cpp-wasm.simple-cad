#include "tests/engine_test_common.h"
#include <vector>

using namespace engine_test;

TEST_F(CadEngineTest, DraftLineShiftSnapsTo45Degrees) {
    BeginDraftPayload payload{};
    payload.kind = static_cast<std::uint32_t>(EntityKind::Line);
    payload.x = 0.0f;
    payload.y = 0.0f;
    payload.strokeEnabled = 1.0f;
    payload.strokeWidthPx = 1.0f;
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    engine.updateDraft(10.0f, 6.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const LineRec* line = CadEngineTestAccessor::entityManager(engine).getLine(id);
    ASSERT_NE(line, nullptr);
    EXPECT_NEAR(line->x0, 0.0f, 1e-3f);
    EXPECT_NEAR(line->y0, 0.0f, 1e-3f);
    EXPECT_NEAR(line->x1, 8.246211f, 1e-3f);
    EXPECT_NEAR(line->y1, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, DraftArrowShiftSnapsTo45Degrees) {
    BeginDraftPayload payload{};
    payload.kind = static_cast<std::uint32_t>(EntityKind::Arrow);
    payload.x = 0.0f;
    payload.y = 0.0f;
    payload.strokeEnabled = 1.0f;
    payload.strokeWidthPx = 1.0f;
    payload.head = 6.0f;
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    engine.updateDraft(10.0f, 6.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const ArrowRec* arrow = CadEngineTestAccessor::entityManager(engine).getArrow(id);
    ASSERT_NE(arrow, nullptr);
    EXPECT_NEAR(arrow->ax, 0.0f, 1e-3f);
    EXPECT_NEAR(arrow->ay, 0.0f, 1e-3f);
    EXPECT_NEAR(arrow->bx, 8.246211f, 1e-3f);
    EXPECT_NEAR(arrow->by, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, DraftPolylineShiftSnapsAppendPointTo45Degrees) {
    BeginDraftPayload payload{};
    payload.kind = static_cast<std::uint32_t>(EntityKind::Polyline);
    payload.x = 0.0f;
    payload.y = 0.0f;
    payload.strokeEnabled = 1.0f;
    payload.strokeWidthPx = 1.0f;
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    engine.appendDraftPoint(10.0f, 6.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const EntityManager& em = CadEngineTestAccessor::entityManager(engine);
    const PolyRec* poly = em.getPolyline(id);
    ASSERT_NE(poly, nullptr);
    ASSERT_GE(poly->count, 2u);
    const std::vector<Point2>& points = em.getPoints();
    const std::uint32_t idx = poly->offset + 1;
    ASSERT_LT(idx, points.size());
    EXPECT_NEAR(points[idx].x, 8.246211f, 1e-3f);
    EXPECT_NEAR(points[idx].y, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, DraftRectShiftCreatesSquare) {
    BeginDraftPayload payload{};
    payload.kind = static_cast<std::uint32_t>(EntityKind::Rect);
    payload.x = 0.0f;
    payload.y = 0.0f;
    payload.fillA = 1.0f;
    payload.strokeEnabled = 1.0f;
    payload.strokeWidthPx = 1.0f;
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    engine.updateDraft(100.0f, 60.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const RectRec* rect = CadEngineTestAccessor::entityManager(engine).getRect(id);
    ASSERT_NE(rect, nullptr);
    EXPECT_NEAR(rect->x, 0.0f, 1e-3f);
    EXPECT_NEAR(rect->y, 0.0f, 1e-3f);
    EXPECT_NEAR(rect->w, 100.0f, 1e-3f);
    EXPECT_NEAR(rect->h, 100.0f, 1e-3f);
}

TEST_F(CadEngineTest, DraftCircleShiftCreatesCircle) {
    BeginDraftPayload payload{};
    payload.kind = static_cast<std::uint32_t>(EntityKind::Circle);
    payload.x = 0.0f;
    payload.y = 0.0f;
    payload.fillA = 1.0f;
    payload.strokeEnabled = 1.0f;
    payload.strokeWidthPx = 1.0f;
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    engine.updateDraft(80.0f, 50.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const CircleRec* circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
    ASSERT_NE(circle, nullptr);
    EXPECT_NEAR(circle->cx, 40.0f, 1e-3f);
    EXPECT_NEAR(circle->cy, 40.0f, 1e-3f);
    EXPECT_NEAR(circle->rx, 40.0f, 1e-3f);
    EXPECT_NEAR(circle->ry, 40.0f, 1e-3f);
}

TEST_F(CadEngineTest, DraftPolygonShiftCreatesProportional) {
    BeginDraftPayload payload{};
    payload.kind = static_cast<std::uint32_t>(EntityKind::Polygon);
    payload.x = 0.0f;
    payload.y = 0.0f;
    payload.fillA = 1.0f;
    payload.strokeEnabled = 1.0f;
    payload.strokeWidthPx = 1.0f;
    payload.sides = 3.0f;
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
    engine.updateDraft(70.0f, 100.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const PolygonRec* polygon = CadEngineTestAccessor::entityManager(engine).getPolygon(id);
    ASSERT_NE(polygon, nullptr);
    EXPECT_NEAR(polygon->cx, 50.0f, 1e-3f);
    EXPECT_NEAR(polygon->cy, 50.0f, 1e-3f);
    EXPECT_NEAR(polygon->rx, 50.0f, 1e-3f);
    EXPECT_NEAR(polygon->ry, 50.0f, 1e-3f);
}
