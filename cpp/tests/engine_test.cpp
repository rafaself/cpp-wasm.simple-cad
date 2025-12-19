#include <gtest/gtest.h>
#include "../engine/engine.h"
#include <vector>

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
    engine.upsertRect(100, 10, 20, 30, 40, 1.0f, 0.0f, 0.0f); // Add color
    auto stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1);
    
    // Update
    engine.upsertRect(100, 15, 25, 35, 45, 0.0f, 1.0f, 0.0f); // Add color
    stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1); // ID mismatch would create new, same ID updates
    
    // Delete
    engine.deleteEntity(100);
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
    pushU32(1);          // Version
    pushU32(1);          // Command Count
    pushU32(0);          // Padding

    // Command 1: UpsertRect
    pushU32(static_cast<std::uint32_t>(CadEngine::CommandOp::UpsertRect)); // Op
    pushU32(10);         // ID
    pushU32(28);         // Payload Bytes (7 floats * 4 bytes/float) - UPDATED
    pushU32(0);          // Reserved

    pushF32(10.0f); // x
    pushF32(20.0f); // y
    pushF32(50.0f); // w
    pushF32(60.0f); // h
    pushF32(1.0f);  // r - NEW
    pushF32(0.5f);  // g - NEW
    pushF32(0.0f);  // b - NEW

    // Pass to engine
    uintptr_t ptr = reinterpret_cast<uintptr_t>(buffer.data());
    engine.applyCommandBuffer(ptr, buffer.size());

    auto stats = engine.getStats();
    EXPECT_EQ(stats.rectCount, 1);
    
    // Verify render buffers were rebuilt
    // 2 triangles = 6 vertices, each with 6 floats (pos+color)
    EXPECT_EQ(stats.triangleVertexCount, 6);
    // 4 lines = 8 vertices
    EXPECT_EQ(stats.lineVertexCount, 8); // This is for outline, still 3 floats per vertex.

    // Also check color property
    EXPECT_EQ(engine.rects[0].r, 1.0f);
    EXPECT_EQ(engine.rects[0].g, 0.5f);
    EXPECT_EQ(engine.rects[0].b, 0.0f);
}

TEST_F(CadEngineTest, SnappingElectrical) {
    // Setup: 1 Symbol and 1 Node
    // Symbol at (100, 100), 20x20. Center (110, 110).
    // Node at (200, 200).
    
    engine.upsertSymbol(1, 99, 100, 100, 20, 20, 0, 1, 1, 0.5, 0.5);
    engine.upsertNode(2, CadEngine::NodeKind::Free, 0, 200, 200);

    // Snap near Node (200, 200)
    auto res = engine.snapElectrical(201, 201, 5.0f);
    EXPECT_EQ(res.kind, 1); // 1 = Node
    EXPECT_EQ(res.id, 2);
    
    // Snap near Symbol center (110, 110)
    res = engine.snapElectrical(111, 111, 5.0f);
    EXPECT_EQ(res.kind, 2); // 2 = Symbol
    EXPECT_EQ(res.id, 1);
    
    // Snap far away
    res = engine.snapElectrical(0, 0, 5.0f);
    EXPECT_EQ(res.kind, 0); // None
}

TEST_F(CadEngineTest, SnapshotRoundTrip) {
    // 1. Populate initial state
    engine.upsertRect(1, 10, 10, 100, 100, 0.0f, 0.0f, 1.0f); // Add color
    engine.upsertLine(2, 0, 0, 50, 50);
    // Trigger rebuilds
    engine.rebuildRenderBuffers();
    engine.rebuildSnapshotBytes();

    // 2. Get snapshot data
    auto meta = engine.getSnapshotBufferMeta();
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
    EXPECT_EQ(engine2.rects[0].r, 0.0f);
    EXPECT_EQ(engine2.rects[0].g, 0.0f);
    EXPECT_EQ(engine2.rects[0].b, 1.0f);
}
