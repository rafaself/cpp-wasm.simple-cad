#include <gtest/gtest.h>
#include "engine/engine.h"
#include "engine/entity/entity_manager.h"
#include "tests/test_accessors.h"
#include <vector>
#include <fstream>
#include <string>

namespace {
constexpr float kMoveScreenX = 50.0f;
constexpr float kMoveScreenY = 0.0f;
constexpr float kPickTolerance = 2.0f;
constexpr std::uint32_t kPickMask = 0xFF;

void moveByScreen(CadEngine& engine, std::uint32_t id, float screenX, float screenY) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::Move,
        0,
        -1,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.commitTransform();
}

void edgeDragByScreen(CadEngine& engine, std::uint32_t id, float screenX, float screenY) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::EdgeDrag,
        id,
        -1,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.commitTransform();
}

void moveByScreenWithModifiers(
    CadEngine& engine,
    std::uint32_t id,
    float screenX,
    float screenY,
    std::uint32_t modifiers) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::Move,
        0,
        -1,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.commitTransform();
}

void resizeByScreenWithModifiers(
    CadEngine& engine,
    std::uint32_t id,
    std::int32_t handleIndex,
    float screenX,
    float screenY,
    std::uint32_t modifiers) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::Resize,
        id,
        handleIndex,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.commitTransform();
}

void vertexDragByScreenWithModifiers(
    CadEngine& engine,
    std::uint32_t id,
    std::int32_t vertexIndex,
    float screenX,
    float screenY,
    std::uint32_t modifiers) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::VertexDrag,
        id,
        vertexIndex,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.commitTransform();
}

PickResult pickAt(const CadEngine& engine, float x, float y) {
    return engine.pickEx(x, y, kPickTolerance, kPickMask);
}

void expectPickMoved(CadEngine& engine, std::uint32_t id, float hitX, float hitY, float missX, float missY) {
    const PickResult hit = pickAt(engine, hitX, hitY);
    EXPECT_EQ(hit.id, id);
    const PickResult miss = pickAt(engine, missX, missY);
    EXPECT_NE(miss.id, id);
}

void appendU32(std::vector<std::uint8_t>& buffer, std::uint32_t v) {
    const std::uint8_t* bytes = reinterpret_cast<const std::uint8_t*>(&v);
    buffer.insert(buffer.end(), bytes, bytes + sizeof(v));
}

void appendBytes(std::vector<std::uint8_t>& buffer, const void* data, std::size_t size) {
    const std::uint8_t* bytes = reinterpret_cast<const std::uint8_t*>(data);
    buffer.insert(buffer.end(), bytes, bytes + size);
}

void upsertPolyline(CadEngine& engine, std::uint32_t id, const std::vector<Point2>& points) {
    std::vector<std::uint8_t> buffer;
    const std::uint32_t count = static_cast<std::uint32_t>(points.size());
    const std::uint32_t payloadBytes = static_cast<std::uint32_t>(
        sizeof(PolylinePayloadHeader) + points.size() * sizeof(Point2));

    appendU32(buffer, 0x43445745);
    appendU32(buffer, 3);
    appendU32(buffer, 1);
    appendU32(buffer, 0);
    appendU32(buffer, static_cast<std::uint32_t>(CadEngine::CommandOp::UpsertPolyline));
    appendU32(buffer, id);
    appendU32(buffer, payloadBytes);
    appendU32(buffer, 0);

    PolylinePayloadHeader header{};
    header.r = 1.0f;
    header.g = 1.0f;
    header.b = 1.0f;
    header.a = 1.0f;
    header.enabled = 1.0f;
    header.strokeWidthPx = 1.0f;
    header.count = count;
    appendBytes(buffer, &header, sizeof(header));
    for (const auto& pt : points) {
        appendBytes(buffer, &pt, sizeof(pt));
    }

    engine.applyCommandBuffer(reinterpret_cast<uintptr_t>(buffer.data()), static_cast<std::uint32_t>(buffer.size()));
}
} // namespace

class CadEngineTest : public ::testing::Test {
protected:
    CadEngine engine;

    void SetUp() override {
        engine.clear();
    }
};

TEST_F(CadEngineTest, InitialState) {
    auto stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 0);
    EXPECT_EQ(stats.generation, 1);
}

TEST_F(CadEngineTest, EntityManagement) {
    // Direct API usage updates the logical state, but not the render buffers
    CadEngineTestAccessor::upsertRect(engine, 100, 10, 20, 30, 40, 1.0f, 0.0f, 0.0f, 1.0f); // Add color
    auto stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1);
    
    // Update
    CadEngineTestAccessor::upsertRect(engine, 100, 15, 25, 35, 45, 0.0f, 1.0f, 0.0f, 1.0f); // Add color
    stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1); // ID mismatch would create new, same ID updates
    
    // Delete
    CadEngineTestAccessor::deleteEntity(engine, 100);
    stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 0);
}

TEST_F(CadEngineTest, CommandBufferCycle) {
    // Construct a command buffer to test full cycle including render generation
    std::vector<uint8_t> buffer;
    auto pushU32 = [&](uint32_t v) {
        uint8_t b[4]; memcpy(b, &v, 4);
        buffer.insert(buffer.end(), b, b+4);
    };
    auto pushF32 = [&](float v) {
        uint8_t b[4]; memcpy(b, &v, 4);
        buffer.insert(buffer.end(), b, b+4);
    };

    pushU32(0x43445745); // Magic EWDC
    pushU32(3);          // Version
    pushU32(1);          // Command Count
    pushU32(0);          // Padding

    // Command 1: UpsertRect
    pushU32(static_cast<std::uint32_t>(CadEngine::CommandOp::UpsertRect)); // Op
    pushU32(10);         // ID
    pushU32(56);         // Payload Bytes (14 floats * 4 bytes/float)
    pushU32(0);          // Reserved

    pushF32(10.0f); // x
    pushF32(20.0f); // y
    pushF32(50.0f); // w
    pushF32(60.0f); // h
    // Fill RGBA
    pushF32(1.0f);  // fillR
    pushF32(0.5f);  // fillG
    pushF32(0.0f);  // fillB
    pushF32(1.0f);  // fillA
    // Stroke RGB + enabled
    pushF32(0.0f);  // strokeR
    pushF32(1.0f);  // strokeG
    pushF32(0.0f);  // strokeB
    pushF32(1.0f);  // strokeA
    pushF32(1.0f);  // strokeEnabled
    pushF32(2.0f);  // strokeWidthPx

    // Pass to engine
    uintptr_t ptr = reinterpret_cast<uintptr_t>(buffer.data());
    engine.applyCommandBuffer(ptr, buffer.size());

    auto stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1);
    
    // Verify render buffers were rebuilt
    // 2 fill triangles (6 vertices) + 4 stroke segments as quads (24 vertices) = 30 vertices total.
    EXPECT_EQ(stats.triangleVertexCount, 30);
    // Strokes are triangulated, so there is no separate line buffer output.
    EXPECT_EQ(stats.lineVertexCount, 0);

    // Also check color property
    const auto& em = CadEngineTestAccessor::entityManager(engine);
    ASSERT_FALSE(em.rects.empty());
    EXPECT_EQ(em.rects[0].r, 1.0f);
    EXPECT_EQ(em.rects[0].g, 0.5f);
    EXPECT_EQ(em.rects[0].b, 0.0f);
    EXPECT_EQ(em.rects[0].sr, 0.0f);
    EXPECT_EQ(em.rects[0].sg, 1.0f);
    EXPECT_EQ(em.rects[0].sb, 0.0f);
    EXPECT_EQ(em.rects[0].strokeWidthPx, 2.0f);
}

TEST_F(CadEngineTest, SnapshotRoundTrip) {
    // 1. Populate initial state
    CadEngineTestAccessor::upsertRect(engine, 1, 10, 10, 100, 100, 0.0f, 0.0f, 1.0f, 1.0f); // Add color
    CadEngineTestAccessor::upsertLine(engine, 2, 0, 0, 50, 50);
    const std::uint32_t selectId = 1;
    engine.setSelection(&selectId, 1, CadEngine::SelectionMode::Replace);

    // 2. Get snapshot data
    auto meta = engine.saveSnapshot();
    ASSERT_GT(meta.byteCount, 0);
    ASSERT_NE(meta.ptr, 0);

    // 3. Create a fresh engine and load the snapshot
    CadEngine engine2;
    engine2.loadSnapshotFromPtr(meta.ptr, meta.byteCount);

    // 4. Verify state matches
    auto stats1 = engine.getStats();
    auto stats2 = engine2.getStats();

    EXPECT_EQ(stats2.rectCount, 1);
    EXPECT_EQ(stats2.lineCount, 1);
    EXPECT_EQ(stats2.rectCount, stats1.rectCount);
    EXPECT_EQ(stats2.lineCount, stats1.lineCount);
    
    // Verify geometry is rebuilt too
    EXPECT_EQ(stats2.triangleVertexCount, stats1.triangleVertexCount);
    EXPECT_EQ(stats2.lineVertexCount, stats1.lineVertexCount);

    // Verify color
    const auto& em2 = CadEngineTestAccessor::entityManager(engine2);
    ASSERT_FALSE(em2.rects.empty());
    EXPECT_EQ(em2.rects[0].r, 0.0f);
    EXPECT_EQ(em2.rects[0].g, 0.0f);
    EXPECT_EQ(em2.rects[0].b, 1.0f);
}

TEST_F(CadEngineTest, DocumentDigestDeterministicSaveLoad) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0, 0, 10, 10, 0.2f, 0.3f, 0.4f, 1.0f);
    CadEngineTestAccessor::upsertLine(engine, 2, 5, 5, 15, 15);

    const std::uint32_t layer2 = 2;
    const std::uint32_t props =
        static_cast<std::uint32_t>(CadEngine::LayerPropMask::Name)
        | static_cast<std::uint32_t>(CadEngine::LayerPropMask::Visible);
    engine.setLayerProps(layer2, props, static_cast<std::uint32_t>(LayerFlags::Visible), "Layer 2");
    engine.setEntityLayer(2, layer2);

    const std::uint32_t flagsMask =
        static_cast<std::uint32_t>(EntityFlags::Visible)
        | static_cast<std::uint32_t>(EntityFlags::Locked);
    engine.setEntityFlags(2, flagsMask, static_cast<std::uint32_t>(EntityFlags::Visible));

    const std::uint32_t ids[] = {1, 2};
    engine.setSelection(ids, 2, CadEngine::SelectionMode::Replace);
    engine.reorderEntities(ids, 2, CadEngine::ReorderAction::BringToFront, 0);

    const auto digest1 = engine.getDocumentDigest();
    const auto meta = engine.saveSnapshot();

    CadEngine engine2;
    engine2.loadSnapshotFromPtr(meta.ptr, meta.byteCount);
    const auto digest2 = engine2.getDocumentDigest();

    EXPECT_EQ(digest1.lo, digest2.lo);
    EXPECT_EQ(digest1.hi, digest2.hi);
}

TEST_F(CadEngineTest, CommandBufferError) {
    auto initialStats = engine.getStats();
    
    // Construct an invalid command buffer (bad magic)
    std::vector<uint8_t> buffer;
    auto pushU32 = [&](uint32_t v) {
        uint8_t b[4]; memcpy(b, &v, 4);
        buffer.insert(buffer.end(), b, b+4);
    };
    
    pushU32(0xDEADBEEF); // Bad Magic
    
    // Pass to engine
    uintptr_t ptr = reinterpret_cast<uintptr_t>(buffer.data());
    engine.applyCommandBuffer(ptr, buffer.size());

    // Verify error is set
    EXPECT_NE(CadEngineTestAccessor::lastError(engine), EngineError::Ok);
    
    // Verify state did not change
    auto finalStats = engine.getStats();
    EXPECT_EQ(finalStats.generation, initialStats.generation);
    EXPECT_EQ(finalStats.lastApplyMs, 0.0f); // Should not have updated timing
}

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
    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
    vertexDragByScreenWithModifiers(engine, 15, 1, 10.0f, -6.0f, shift);

    const LineRec* line = CadEngineTestAccessor::entityManager(engine).getLine(15);
    ASSERT_NE(line, nullptr);
    EXPECT_NEAR(line->x0, 0.0f, 1e-3f);
    EXPECT_NEAR(line->y0, 0.0f, 1e-3f);
    EXPECT_NEAR(line->x1, 8.246211f, 1e-3f);
    EXPECT_NEAR(line->y1, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, DraftLineShiftSnapsTo45Degrees) {
    BeginDraftPayload payload{};
    payload.kind = static_cast<std::uint32_t>(EntityKind::Line);
    payload.x = 0.0f;
    payload.y = 0.0f;
    payload.strokeEnabled = 1.0f;
    payload.strokeWidthPx = 1.0f;
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
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
    payload.head = 6.0f; // Arrow head size
    engine.beginDraft(payload);

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
    engine.updateDraft(10.0f, 6.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const ArrowRec* arrow = CadEngineTestAccessor::entityManager(engine).getArrow(id);
    ASSERT_NE(arrow, nullptr);
    // Origin at (0,0), target at 10,6 with shift should snap to 45 degrees
    // Same as line: should be approximately (8.246, 8.246)
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

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
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

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
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

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
    engine.updateDraft(80.0f, 50.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const CircleRec* circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
    ASSERT_NE(circle, nullptr);
    // With shift, max(80, 50) = 80, so bbox is 80x80, circle is centered
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

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
    engine.updateDraft(70.0f, 100.0f, shift);
    const std::uint32_t id = engine.commitDraft();

    const PolygonRec* polygon = CadEngineTestAccessor::entityManager(engine).getPolygon(id);
    ASSERT_NE(polygon, nullptr);
    // With shift, max(70, 100) = 100, so bbox is 100x100
    EXPECT_NEAR(polygon->cx, 50.0f, 1e-3f);
    EXPECT_NEAR(polygon->cy, 50.0f, 1e-3f);
    EXPECT_NEAR(polygon->rx, 50.0f, 1e-3f);
    EXPECT_NEAR(polygon->ry, 50.0f, 1e-3f);
}

TEST_F(CadEngineTest, VertexDragShiftSnapsArrowEndpointTo45Degrees) {
    // Create an arrow from (0,0) to (10,0)
    CadEngineTestAccessor::upsertArrow(engine, 18, 0.0f, 0.0f, 10.0f, 0.0f, 6.0f,
        1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f);

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
    // Drag endpoint (vertex 1) to (10, -6) with shift should snap to 45 degrees
    vertexDragByScreenWithModifiers(engine, 18, 1, 10.0f, -6.0f, shift);

    const ArrowRec* arrow = CadEngineTestAccessor::entityManager(engine).getArrow(18);
    ASSERT_NE(arrow, nullptr);
    // Anchor is (0, 0), dragged point snaps to 45 degree angle
    EXPECT_NEAR(arrow->ax, 0.0f, 1e-3f);
    EXPECT_NEAR(arrow->ay, 0.0f, 1e-3f);
    EXPECT_NEAR(arrow->bx, 8.246211f, 1e-3f);
    EXPECT_NEAR(arrow->by, 8.246211f, 1e-3f);
}

TEST_F(CadEngineTest, VertexDragShiftSnapsPolylineEndpointTo45Degrees) {
    std::vector<Point2> points = { {0.0f, 0.0f}, {10.0f, 0.0f} };
    const std::uint32_t id = 17;
    upsertPolyline(engine, id, points);

    const auto shift = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
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
    engine.setSelection(ids, 2, CadEngine::SelectionMode::Replace);

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
    engine.setSelection(ids, 2, CadEngine::SelectionMode::Replace);

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

    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);

    const PickResult res = engine.pickEx(0.0f, 0.0f, kPickTolerance, kPickMask);
    EXPECT_EQ(res.id, id);
    EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::Vertex);
    EXPECT_EQ(res.subIndex, 0);
}

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
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
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
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
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
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
    const std::uint32_t ctrlMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Ctrl);
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
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
    const std::uint32_t shiftMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
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
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
    const std::uint32_t shiftMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
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
    const std::uint32_t shiftMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
    resizeByScreenWithModifiers(engine, id, 2, 40.0f, -10.0f, shiftMask);

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
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
    const std::uint32_t altMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Alt);
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
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);
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

TEST_F(CadEngineTest, GetEntityKindReturnsCorrectType) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertLine(engine, 2, 0.0f, 0.0f, 10.0f, 10.0f);
    std::vector<Point2> points = { {0.0f, 0.0f}, {10.0f, 0.0f}, {10.0f, 10.0f} };
    upsertPolyline(engine, 3, points);
    CadEngineTestAccessor::upsertCircle(engine, 4, 0.0f, 0.0f, 5.0f, 5.0f, 0.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertPolygon(engine, 5, 0.0f, 0.0f, 5.0f, 5.0f, 0.0f, 1.0f, 1.0f, 5, 1.0f, 1.0f, 1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertArrow(engine, 6, 0.0f, 0.0f, 10.0f, 0.0f, 6.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f);

    EXPECT_EQ(engine.getEntityKind(1), static_cast<std::uint32_t>(PickEntityKind::Rect));
    EXPECT_EQ(engine.getEntityKind(2), static_cast<std::uint32_t>(PickEntityKind::Line));
    EXPECT_EQ(engine.getEntityKind(3), static_cast<std::uint32_t>(PickEntityKind::Polyline));
    EXPECT_EQ(engine.getEntityKind(4), static_cast<std::uint32_t>(PickEntityKind::Circle));
    EXPECT_EQ(engine.getEntityKind(5), static_cast<std::uint32_t>(PickEntityKind::Polygon));
    EXPECT_EQ(engine.getEntityKind(6), static_cast<std::uint32_t>(PickEntityKind::Arrow));

    // Non-existent entity
    EXPECT_EQ(engine.getEntityKind(999), 0);
}

// Regression tests for rotated ellipse handle picking
// These tests verify that handles are correctly pickable after rotation

TEST_F(CadEngineTest, RotatedEllipseResizeHandlesAllPickable) {
    // Create a rotated ellipse: center (50,50), rx=20, ry=10, rotation=π/2 (90°)
    // After 90° rotation, the corners in world coords are:
    //   BL (index 0): (60, 30)
    //   BR (index 1): (60, 70)
    //   TR (index 2): (40, 70)
    //   TL (index 3): (40, 30)
    constexpr float kPiHalf = 1.5707963267948966f; // π/2
    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        50.0f, 50.0f,  // center
        20.0f, 10.0f,  // radii
        kPiHalf,       // rotation in radians
        1.0f, 1.0f,    // scale
        1.0f, 1.0f, 1.0f, 1.0f,  // fill color
        0.0f, 0.0f, 0.0f, 1.0f,  // stroke color
        1.0f, 1.0f               // stroke enabled, width
    );

    // Select the ellipse to enable handle picking
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);

    const float tolerance = 3.0f;

    // Test BL corner (index 0) at (60, 30)
    {
        PickResult res = engine.pickEx(60.0f, 30.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "BL handle should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "BL should be a resize handle";
        EXPECT_EQ(res.subIndex, 0) << "BL should be handle index 0";
    }

    // Test BR corner (index 1) at (60, 70)
    {
        PickResult res = engine.pickEx(60.0f, 70.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "BR handle should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "BR should be a resize handle";
        EXPECT_EQ(res.subIndex, 1) << "BR should be handle index 1";
    }

    // Test TR corner (index 2) at (40, 70)
    {
        PickResult res = engine.pickEx(40.0f, 70.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "TR handle should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "TR should be a resize handle";
        EXPECT_EQ(res.subIndex, 2) << "TR should be handle index 2";
    }

    // Test TL corner (index 3) at (40, 30)
    {
        PickResult res = engine.pickEx(40.0f, 30.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "TL handle should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "TL should be a resize handle";
        EXPECT_EQ(res.subIndex, 3) << "TL should be handle index 3";
    }
}

TEST_F(CadEngineTest, RotatedEllipseRotationHandlesPickable) {
    // Create a rotated ellipse: center (50,50), rx=20, ry=10, rotation=π/2 (90°)
    // Rotation handles are positioned diagonally outside each corner
    constexpr float kPiHalf = 1.5707963267948966f;
    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        50.0f, 50.0f,
        20.0f, 10.0f,
        kPiHalf,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);

    // Rotation handle offset is 15px in screen space
    // At viewScale=1, this is 15 world units diagonally from each corner
    // Direction for BL (index 0) is rotated (-0.707, -0.707) by 90°
    // Rotated direction: (0.707, -0.707) (down-right becomes right-down after 90° CCW)
    // Actually with 90° rotation:
    //   base dir (-0.707, -0.707) rotated 90°:
    //   dx' = -0.707*0 - (-0.707)*1 = 0.707
    //   dy' = -0.707*1 + (-0.707)*0 = -0.707
    // So the rotation handle for BL at (60,30) is at (60 + 0.707*15, 30 - 0.707*15)
    //   = (60 + 10.6, 30 - 10.6) ≈ (70.6, 19.4)

    const float offset = 15.0f * 0.7071f; // ~10.6
    const float tolerance = 12.0f; // Rotation handle radius is 10px

    // Test rotation handle near BL corner
    // BL corner is at (60, 30), rotation handle is diagonally outward
    {
        PickResult res = engine.pickEx(60.0f + offset, 30.0f - offset, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "Rotation handle near BL should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::RotateHandle)
            << "Should detect rotation handle";
    }
}

TEST_F(CadEngineTest, RotatedPolygonResizeHandlesAllPickable) {
    // Create a rotated hexagon: center (50,50), rx=20, ry=10, rotation=π/2, 6 sides
    constexpr float kPiHalf = 1.5707963267948966f;
    CadEngineTestAccessor::upsertPolygon(
        engine, 1,
        50.0f, 50.0f,
        20.0f, 10.0f,
        kPiHalf,
        1.0f, 1.0f,
        6,  // hexagon
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);

    const float tolerance = 3.0f;

    // After 90° rotation, the corner handles are at rotated positions
    // The key test is that ALL 4 handles are pickable at their rotated positions
    // Corner positions after rotation: (60,30), (60,70), (40,70), (40,30)

    // Test that handles at all 4 rotated corners are pickable
    {
        PickResult res = engine.pickEx(60.0f, 30.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "Handle at (60,30) should pick the polygon";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "Should be a resize handle";
    }
    {
        PickResult res = engine.pickEx(60.0f, 70.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "Handle at (60,70) should pick the polygon";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "Should be a resize handle";
    }
    {
        PickResult res = engine.pickEx(40.0f, 70.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "Handle at (40,70) should pick the polygon";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "Should be a resize handle";
    }
    {
        PickResult res = engine.pickEx(40.0f, 30.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "Handle at (40,30) should pick the polygon";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle)
            << "Should be a resize handle";
    }
}

TEST_F(CadEngineTest, NonRotatedEllipseHandlesStillWork) {
    // Verify non-rotated ellipses still work correctly
    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        50.0f, 50.0f,
        20.0f, 10.0f,
        0.0f,          // no rotation
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);

    const float tolerance = 3.0f;

    // For non-rotated ellipse: corners are at AABB positions
    // BL: (30, 40), BR: (70, 40), TR: (70, 60), TL: (30, 60)
    {
        PickResult res = engine.pickEx(30.0f, 40.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "BL handle should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
        EXPECT_EQ(res.subIndex, 0);
    }
    {
        PickResult res = engine.pickEx(70.0f, 60.0f, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "TR handle should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
        EXPECT_EQ(res.subIndex, 2);
    }
}
