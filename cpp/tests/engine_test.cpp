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
    appendU32(buffer, 2);
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
    pushU32(2);          // Version
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
