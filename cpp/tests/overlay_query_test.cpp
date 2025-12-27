#include <gtest/gtest.h>
#include "../engine/engine.h"

TEST(OverlayQueryTest, SelectionOutlineAndHandles) {
    CadEngine engine;
    engine.clear();

    // Create a simple rect and select it.
    engine.upsertRect(1, 0.0f, 0.0f, 10.0f, 5.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, CadEngine::SelectionMode::Replace);

    const auto outline = engine.getSelectionOutlineMeta();
    EXPECT_EQ(outline.primitiveCount, 1u);
    EXPECT_EQ(outline.floatCount, 8u); // 4 points * 2 floats

    const auto* outlinePrim = reinterpret_cast<const CadEngine::OverlayPrimitive*>(outline.primitivesPtr);
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

    const auto* handlePrim = reinterpret_cast<const CadEngine::OverlayPrimitive*>(handles.primitivesPtr);
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
