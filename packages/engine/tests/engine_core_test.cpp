#include "tests/engine_test_common.h"
#include <cstring>
#include <vector>

using namespace engine_test;

TEST_F(CadEngineTest, InitialState) {
    auto stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 0);
    EXPECT_EQ(stats.generation, 1);
}

TEST_F(CadEngineTest, EntityManagement) {
    // Direct API usage updates the logical state, but not the render buffers
    CadEngineTestAccessor::upsertRect(engine, 100, 10, 20, 30, 40, 1.0f, 0.0f, 0.0f, 1.0f);
    auto stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1);

    // Update
    CadEngineTestAccessor::upsertRect(engine, 100, 15, 25, 35, 45, 0.0f, 1.0f, 0.0f, 1.0f);
    stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1);

    // Delete
    CadEngineTestAccessor::deleteEntity(engine, 100);
    stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 0);
}

TEST_F(CadEngineTest, CommandBufferCycle) {
    // Construct a command buffer to test full cycle including render generation
    std::vector<uint8_t> buffer;
    auto pushU32 = [&](uint32_t v) {
        uint8_t b[4]; std::memcpy(b, &v, 4);
        buffer.insert(buffer.end(), b, b + 4);
    };
    auto pushF32 = [&](float v) {
        uint8_t b[4]; std::memcpy(b, &v, 4);
        buffer.insert(buffer.end(), b, b + 4);
    };

    pushU32(0x43445745); // Magic EWDC
    pushU32(4);          // Version
    pushU32(1);          // Command Count
    pushU32(0);          // Padding

    // Command 1: UpsertRect
    pushU32(static_cast<std::uint32_t>(CommandOp::UpsertRect)); // Op
    pushU32(10);         // ID
    pushU32(60);         // Payload Bytes (15 floats * 4 bytes/float)
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
    pushF32(0.0f);  // elevationZ

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
    CadEngineTestAccessor::upsertRect(engine, 1, 10, 10, 100, 100, 0.0f, 0.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertLine(engine, 2, 0, 0, 50, 50);
    const std::uint32_t selectId = 1;
    engine.setSelection(&selectId, 1, engine::protocol::SelectionMode::Replace);

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
        static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Name)
        | static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible);
    engine.setLayerProps(layer2, props, static_cast<std::uint32_t>(LayerFlags::Visible), "Layer 2");
    engine.setEntityLayer(2, layer2);

    const std::uint32_t flagsMask =
        static_cast<std::uint32_t>(EntityFlags::Visible)
        | static_cast<std::uint32_t>(EntityFlags::Locked);
    engine.setEntityFlags(2, flagsMask, static_cast<std::uint32_t>(EntityFlags::Visible));

    const std::uint32_t ids[] = {1, 2};
    engine.setSelection(ids, 2, engine::protocol::SelectionMode::Replace);
    engine.reorderEntities(ids, 2, engine::protocol::ReorderAction::BringToFront, 0);

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
        uint8_t b[4]; std::memcpy(b, &v, 4);
        buffer.insert(buffer.end(), b, b + 4);
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
    EXPECT_EQ(finalStats.lastApplyMs, 0.0f);
}

TEST_F(CadEngineTest, GetEntityKindReturnsCorrectType) {
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    CadEngineTestAccessor::upsertLine(engine, 2, 0.0f, 0.0f, 10.0f, 10.0f);
    CadEngineTestAccessor::upsertCircle(engine, 3, 0.0f, 0.0f, 5.0f, 5.0f, 0.0f, 1.0f, 1.0f,
        0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertPolygon(engine, 4, 0.0f, 0.0f, 5.0f, 5.0f, 0.0f, 1.0f, 1.0f, 5,
        0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertArrow(engine, 5, 0.0f, 0.0f, 10.0f, 10.0f, 2.0f, 0.0f, 1.0f, 0.0f, 1.0f, 1.0f, 1.0f);

    EXPECT_EQ(engine.getEntityKind(1), EntityKind::Rect);
    EXPECT_EQ(engine.getEntityKind(2), EntityKind::Line);
    EXPECT_EQ(engine.getEntityKind(3), EntityKind::Circle);
    EXPECT_EQ(engine.getEntityKind(4), EntityKind::Polygon);
    EXPECT_EQ(engine.getEntityKind(5), EntityKind::Arrow);
}
