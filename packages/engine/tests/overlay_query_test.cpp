#include <gtest/gtest.h>
#include "engine/engine.h"
#include "tests/test_accessors.h"
#include <cmath>

// =============================================================================
// Phase 3: Polygon Contour Selection Tests
// Validates CAD-like polygon selection with true N-vertex contours
// =============================================================================

TEST(OverlayQueryTest, PolygonContourSelection_TriangleHas3Vertices) {
    CadEngine engine;
    engine.clear();

    // Create a triangle (3 sides) at origin with radius 10
    CadEngineTestAccessor::upsertPolygon(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.0f, 1.0f, 1.0f, 3,
        1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // Verify outline has 3 vertices
    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.primitiveCount, 1u);
    EXPECT_EQ(outline.floatCount, 6u); // 3 vertices * 2 floats

    const auto* outlinePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(outline.primitivesPtr);
    ASSERT_NE(outlinePrim, nullptr);
    EXPECT_EQ(outlinePrim[0].count, 3u); // Triangle = 3 vertices

    // Verify handles have 3 grips
    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.primitiveCount, 1u);
    EXPECT_EQ(handles.floatCount, 6u); // 3 grips * 2 floats

    const auto* handlePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(handles.primitivesPtr);
    ASSERT_NE(handlePrim, nullptr);
    EXPECT_EQ(handlePrim[0].count, 3u); // 3 vertex grips
}

TEST(OverlayQueryTest, PolygonContourSelection_HexagonHas6Vertices) {
    CadEngine engine;
    engine.clear();

    // Create a hexagon (6 sides)
    CadEngineTestAccessor::upsertPolygon(engine, 1, 50.0f, 50.0f, 20.0f, 20.0f, 0.0f, 1.0f, 1.0f, 6,
        0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // Verify outline has 6 vertices
    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.primitiveCount, 1u);
    EXPECT_EQ(outline.floatCount, 12u); // 6 vertices * 2 floats

    const auto* outlinePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(outline.primitivesPtr);
    ASSERT_NE(outlinePrim, nullptr);
    EXPECT_EQ(outlinePrim[0].count, 6u); // Hexagon = 6 vertices

    // Verify handles have 6 grips
    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.floatCount, 12u); // 6 grips * 2 floats

    const auto* handlePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(handles.primitivesPtr);
    ASSERT_NE(handlePrim, nullptr);
    EXPECT_EQ(handlePrim[0].count, 6u); // 6 vertex grips
}

TEST(OverlayQueryTest, PolygonContourSelection_OctagonHas8Vertices) {
    CadEngine engine;
    engine.clear();

    // Create an octagon (8 sides)
    CadEngineTestAccessor::upsertPolygon(engine, 1, 0.0f, 0.0f, 15.0f, 15.0f, 0.0f, 1.0f, 1.0f, 8,
        0.0f, 0.0f, 1.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // Verify outline has 8 vertices
    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.floatCount, 16u); // 8 vertices * 2 floats

    const auto* outlinePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(outline.primitivesPtr);
    ASSERT_NE(outlinePrim, nullptr);
    EXPECT_EQ(outlinePrim[0].count, 8u); // Octagon = 8 vertices

    // Verify handles have 8 grips
    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.floatCount, 16u); // 8 grips * 2 floats
}

TEST(OverlayQueryTest, PolygonContourSelection_12SidedPolygon) {
    CadEngine engine;
    engine.clear();

    // Create a dodecagon (12 sides)
    CadEngineTestAccessor::upsertPolygon(engine, 1, 100.0f, 100.0f, 30.0f, 30.0f, 0.0f, 1.0f, 1.0f, 12,
        1.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // Verify outline has 12 vertices
    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.floatCount, 24u); // 12 vertices * 2 floats

    const auto* outlinePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(outline.primitivesPtr);
    ASSERT_NE(outlinePrim, nullptr);
    EXPECT_EQ(outlinePrim[0].count, 12u); // 12 vertices

    // Verify handles have 12 grips
    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.floatCount, 24u); // 12 grips * 2 floats
}

TEST(OverlayQueryTest, PolygonOrientedHandleMeta_ReturnsInvalid) {
    CadEngine engine;
    engine.clear();

    // Create a pentagon (5 sides)
    CadEngineTestAccessor::upsertPolygon(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.0f, 1.0f, 1.0f, 5,
        1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // getOrientedHandleMeta should return invalid for polygons
    // (signals frontend to use vertex-based selection, not OBB)
    const auto orientedMeta = engine.getOrientedHandleMeta();
    EXPECT_EQ(orientedMeta.valid, 0u); // Must be invalid for polygons
}

TEST(OverlayQueryTest, PolygonContourSelection_RotatedPolygonVerticesCorrect) {
    CadEngine engine;
    engine.clear();

    // Create a square-like polygon (4 sides) rotated 45 degrees
    const std::uint32_t id = 1;
    CadEngineTestAccessor::upsertPolygon(engine, id, 0.0f, 0.0f, 10.0f, 10.0f, 0.0f, 1.0f, 1.0f, 4,
        1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);

    constexpr float kRotationDeg = 45.0f;
    engine.setEntityRotation(id, kRotationDeg);
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // Verify outline still has 4 vertices after rotation
    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.floatCount, 8u); // 4 vertices * 2 floats

    // Verify handles still have 4 grips after rotation
    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.floatCount, 8u); // 4 grips * 2 floats

    // Verify the vertices are rotated correctly
    const auto* handleData = reinterpret_cast<const float*>(handles.dataPtr);
    ASSERT_NE(handleData, nullptr);

    // For a rotated regular polygon, all vertices should be at distance rx from center
    constexpr float expectedRadius = 10.0f;
    for (int i = 0; i < 4; ++i) {
        const float vx = handleData[i * 2];
        const float vy = handleData[i * 2 + 1];
        const float dist = std::sqrt(vx * vx + vy * vy);
        EXPECT_NEAR(dist, expectedRadius, 0.01f);
    }
}

TEST(OverlayQueryTest, PolygonContourSelection_MultiplePolygonsMultiSelect) {
    CadEngine engine;
    engine.clear();

    // Create two polygons with different vertex counts
    CadEngineTestAccessor::upsertPolygon(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.0f, 1.0f, 1.0f, 3,
        1.0f, 0.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertPolygon(engine, 2, 50.0f, 0.0f, 10.0f, 10.0f, 0.0f, 1.0f, 1.0f, 5,
        0.0f, 1.0f, 0.0f, 1.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);

    const std::uint32_t ids[] = {1, 2};
    engine.setSelection(ids, 2, engine::protocol::SelectionMode::Replace);

    // With multi-selection, getSelectionOutlineMeta returns both polygons
    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.primitiveCount, 2u); // 2 polygons
    EXPECT_EQ(outline.floatCount, 16u); // (3 + 5) vertices * 2 floats

    // Verify handles for both polygons
    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.primitiveCount, 2u); // 2 primitives
    EXPECT_EQ(handles.floatCount, 16u); // (3 + 5) grips * 2 floats
}

TEST(OverlayQueryTest, SelectionOutlineAndHandles) {
    CadEngine engine;
    engine.clear();

    // Create a simple rect and select it.
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 5.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.primitiveCount, 1u);
    EXPECT_EQ(outline.floatCount, 8u); // 4 points * 2 floats

    const auto* outlinePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(outline.primitivesPtr);
    ASSERT_NE(outlinePrim, nullptr);
    EXPECT_EQ(outlinePrim[0].count, 4u);

    const auto* outlineData = reinterpret_cast<const float*>(outline.dataPtr);
    ASSERT_NE(outlineData, nullptr);
    EXPECT_FLOAT_EQ(outlineData[0], 0.0f);
    EXPECT_FLOAT_EQ(outlineData[1], 0.0f);
    EXPECT_FLOAT_EQ(outlineData[2], 10.0f);
    EXPECT_FLOAT_EQ(outlineData[3], 0.0f);
    EXPECT_FLOAT_EQ(outlineData[4], 10.0f);
    EXPECT_FLOAT_EQ(outlineData[5], 5.0f);
    EXPECT_FLOAT_EQ(outlineData[6], 0.0f);
    EXPECT_FLOAT_EQ(outlineData[7], 5.0f);

    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.primitiveCount, 1u);
    EXPECT_EQ(handles.floatCount, 8u); // 4 handles * 2 floats

    const auto* handlePrim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(handles.primitivesPtr);
    ASSERT_NE(handlePrim, nullptr);
    EXPECT_EQ(handlePrim[0].count, 4u);

    const auto* handleData = reinterpret_cast<const float*>(handles.dataPtr);
    ASSERT_NE(handleData, nullptr);
    EXPECT_FLOAT_EQ(handleData[0], 0.0f);
    EXPECT_FLOAT_EQ(handleData[1], 0.0f);
    EXPECT_FLOAT_EQ(handleData[2], 10.0f);
    EXPECT_FLOAT_EQ(handleData[3], 0.0f);
    EXPECT_FLOAT_EQ(handleData[4], 10.0f);
    EXPECT_FLOAT_EQ(handleData[5], 5.0f);
    EXPECT_FLOAT_EQ(handleData[6], 0.0f);
    EXPECT_FLOAT_EQ(handleData[7], 5.0f);
}

TEST(OverlayQueryTest, RotatedSelectionHandlesMatchObb) {
    CadEngine engine;
    engine.clear();

    const std::uint32_t id = 42;
    CadEngineTestAccessor::upsertRect(engine, id, 0.0f, 0.0f, 10.0f, 5.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    constexpr float kRotationDeg = 67.03f;
    engine.setEntityRotation(id, kRotationDeg);
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const auto handles = engine.getSelectionHandleMeta();
    EXPECT_EQ(handles.floatCount, 8u);

    const auto* handleData = reinterpret_cast<const float*>(handles.dataPtr);
    ASSERT_NE(handleData, nullptr);

    constexpr float kDegToRad = 0.017453292519943295f;
    const float rotRad = kRotationDeg * kDegToRad;
    const float cosR = std::cos(rotRad);
    const float sinR = std::sin(rotRad);
    const float cx = 0.0f + 10.0f * 0.5f;
    const float cy = 0.0f + 5.0f * 0.5f;
    const float hw = 10.0f * 0.5f;
    const float hh = 5.0f * 0.5f;

    const float localCorners[4][2] = {
        {-hw, -hh}, // BL
        {+hw, -hh}, // BR
        {+hw, +hh}, // TR
        {-hw, +hh}, // TL
    };

    for (int i = 0; i < 4; ++i) {
        const float expectedX = cx + localCorners[i][0] * cosR - localCorners[i][1] * sinR;
        const float expectedY = cy + localCorners[i][0] * sinR + localCorners[i][1] * cosR;
        const float actualX = handleData[i * 2 + 0];
        const float actualY = handleData[i * 2 + 1];
        EXPECT_NEAR(actualX, expectedX, 1e-3f);
        EXPECT_NEAR(actualY, expectedY, 1e-3f);
    }
}

TEST(OverlayQueryTest, SnapOverlayForObjectSnap) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 2, 30.0f, 0.0f, 10.0f, 10.0f, 0.2f, 0.6f, 0.9f, 1.0f);
    engine.setSnapOptions(true, false, 10.0f, 5.0f, false, false, true, false);

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);
    engine.beginTransform(&id, 1, CadEngine::TransformMode::Move, 0, -1,
        0.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 100.0f, 100.0f, 0);
    engine.updateTransform(19.0f, 0.0f,
        0.0f, 0.0f, 1.0f, 100.0f, 100.0f, 0);

    const auto snap = engine.getSnapOverlayMeta();
    EXPECT_GT(snap.primitiveCount, 0u);

    const auto* prim = reinterpret_cast<const engine::protocol::OverlayPrimitive*>(snap.primitivesPtr);
    const auto* data = reinterpret_cast<const float*>(snap.dataPtr);
    ASSERT_NE(prim, nullptr);
    ASSERT_NE(data, nullptr);

    bool foundVertical = false;
    for (std::uint32_t i = 0; i < snap.primitiveCount; ++i) {
        if (prim[i].kind != static_cast<std::uint16_t>(engine::protocol::OverlayKind::Segment)) continue;
        const std::uint32_t offset = prim[i].offset;
        if (offset + 3 >= snap.floatCount) continue;
        const float x0 = data[offset];
        const float x1 = data[offset + 2];
        if (std::fabs(x0 - 30.0f) < 1e-4f && std::fabs(x1 - 30.0f) < 1e-4f) {
            foundVertical = true;
            break;
        }
    }
    EXPECT_TRUE(foundVertical);
}
