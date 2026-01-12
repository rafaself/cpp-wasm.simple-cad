#include <gtest/gtest.h>
#include "engine/engine.h"
#include "tests/test_accessors.h"
#include <cmath>

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
