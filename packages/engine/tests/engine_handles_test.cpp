#include "tests/engine_test_common.h"
#include <cmath>

using namespace engine_test;

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

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

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
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const float offset = 15.0f * 0.7071f; // ~10.6
    const float tolerance = 12.0f; // Rotation handle radius is 10px

    // Test rotation handle near BL corner
    {
        PickResult res = engine.pickEx(60.0f + offset, 30.0f - offset, tolerance, 0xFF);
        EXPECT_EQ(res.id, id) << "Rotation handle near BL should pick the ellipse";
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::RotateHandle)
            << "Should detect rotation handle";
    }
}

TEST_F(CadEngineTest, RotatedEllipseResizeContinuesFromCurrentState) {
    constexpr float kPiQuarter = 0.7853981633974483f; // π/4
    constexpr float kViewScale = 2.0f;
    const float cx = 50.0f;
    const float cy = 50.0f;
    const float rx = 20.0f;
    const float ry = 10.0f;

    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        cx, cy,
        rx, ry,
        kPiQuarter,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const float cosR = std::cos(kPiQuarter);
    const float sinR = std::sin(kPiQuarter);
    const float handleStartX = cx + rx * cosR - ry * sinR;
    const float handleStartY = cy + rx * sinR + ry * cosR;
    const float targetLocalX = rx + 10.0f;
    const float targetLocalY = ry + 5.0f;
    const float targetWorldX = cx + targetLocalX * cosR - targetLocalY * sinR;
    const float targetWorldY = cy + targetLocalX * sinR + targetLocalY * cosR;

    resizeByScreenWithView(
        engine,
        id,
        2,
        handleStartX * kViewScale,
        -handleStartY * kViewScale,
        targetWorldX * kViewScale,
        -targetWorldY * kViewScale,
        kViewScale,
        0);

    const CircleRec* circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
    ASSERT_NE(circle, nullptr);
    EXPECT_NEAR(circle->rx, 25.0f, 1e-3f);
    EXPECT_NEAR(circle->ry, 12.5f, 1e-3f);

    const float shift1x = 5.0f * cosR - 2.5f * sinR;
    const float shift1y = 5.0f * sinR + 2.5f * cosR;
    EXPECT_NEAR(circle->cx, cx + shift1x, 1e-3f);
    EXPECT_NEAR(circle->cy, cy + shift1y, 1e-3f);

    const float rx1 = circle->rx;
    const float ry1 = circle->ry;
    const float cx1 = circle->cx;
    const float cy1 = circle->cy;
    const float handleStartX2 = cx1 + rx1 * cosR - ry1 * sinR;
    const float handleStartY2 = cy1 + rx1 * sinR + ry1 * cosR;
    const float targetLocalX2 = rx1 + 5.0f;
    const float targetLocalY2 = ry1 + 5.0f;
    const float targetWorldX2 = cx1 + targetLocalX2 * cosR - targetLocalY2 * sinR;
    const float targetWorldY2 = cy1 + targetLocalX2 * sinR + targetLocalY2 * cosR;

    resizeByScreenWithView(
        engine,
        id,
        2,
        handleStartX2 * kViewScale,
        -handleStartY2 * kViewScale,
        targetWorldX2 * kViewScale,
        -targetWorldY2 * kViewScale,
        kViewScale,
        0);

    circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
    ASSERT_NE(circle, nullptr);
    EXPECT_NEAR(circle->rx, 27.5f, 1e-3f);
    EXPECT_NEAR(circle->ry, 15.0f, 1e-3f);
    EXPECT_GT(circle->rx, rx1);
    EXPECT_GT(circle->ry, ry1);

    const float shift2x = 2.5f * cosR - 2.5f * sinR;
    const float shift2y = 2.5f * sinR + 2.5f * cosR;
    EXPECT_NEAR(circle->cx, cx1 + shift2x, 1e-3f);
    EXPECT_NEAR(circle->cy, cy1 + shift2y, 1e-3f);
}

TEST_F(CadEngineTest, RotatedEllipseResizesFromAllCorners) {
    constexpr float kPiQuarter = 0.7853981633974483f;
    const float cx = 50.0f;
    const float cy = 50.0f;
    const float rx = 20.0f;
    const float ry = 10.0f;
    const float cosR = std::cos(kPiQuarter);
    const float sinR = std::sin(kPiQuarter);

    const float localCorners[4][2] = {
        {-rx, -ry}, // BL
        { rx, -ry}, // BR
        { rx,  ry}, // TR
        {-rx,  ry}  // TL
    };

    for (int handleIndex = 0; handleIndex < 4; ++handleIndex) {
        const std::uint32_t id = static_cast<std::uint32_t>(10 + handleIndex);
        CadEngineTestAccessor::upsertCircle(
            engine, id,
            cx, cy,
            rx, ry,
            kPiQuarter,
            1.0f, 1.0f,
            1.0f, 1.0f, 1.0f, 1.0f,
            0.0f, 0.0f, 0.0f, 1.0f,
            1.0f, 1.0f
        );
        engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

        const float localX = localCorners[handleIndex][0];
        const float localY = localCorners[handleIndex][1];
        const float worldX = cx + localX * cosR - localY * sinR;
        const float worldY = cy + localX * sinR + localY * cosR;

        const float step = 5.0f;
        const float targetLocalX = localX + (localX >= 0.0f ? step : -step);
        const float targetLocalY = localY + (localY >= 0.0f ? step : -step);
        const float targetWorldX = cx + targetLocalX * cosR - targetLocalY * sinR;
        const float targetWorldY = cy + targetLocalX * sinR + targetLocalY * cosR;

        resizeByScreenWithView(
            engine,
            id,
            handleIndex,
            worldX,
            worldY,
            targetWorldX,
            targetWorldY,
            1.0f,
            0);

        const CircleRec* circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
        ASSERT_NE(circle, nullptr);
        EXPECT_GT(circle->rx, rx);
        EXPECT_GT(circle->ry, ry);
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
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const float tolerance = 3.0f;

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
    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        50.0f, 50.0f,
        20.0f, 10.0f,
        0.0f,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const float tolerance = 3.0f;

    // For non-rotated ellipse: corners are at AABB positions
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

TEST_F(CadEngineTest, PickSideHandleDetectsEllipseEdges) {
    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        50.0f, 50.0f,
        20.0f, 10.0f,
        0.0f,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const float tolerance = 2.0f;

    {
        PickResult res = engine.pickSideHandle(50.0f, 40.0f, tolerance); // N
        EXPECT_EQ(res.id, id);
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
        EXPECT_EQ(res.subIndex, 4);
    }
    {
        PickResult res = engine.pickSideHandle(70.0f, 50.0f, tolerance); // E
        EXPECT_EQ(res.id, id);
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
        EXPECT_EQ(res.subIndex, 5);
    }
    {
        PickResult res = engine.pickSideHandle(50.0f, 60.0f, tolerance); // S
        EXPECT_EQ(res.id, id);
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
        EXPECT_EQ(res.subIndex, 6);
    }
    {
        PickResult res = engine.pickSideHandle(30.0f, 50.0f, tolerance); // W
        EXPECT_EQ(res.id, id);
        EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
        EXPECT_EQ(res.subIndex, 7);
    }
}

TEST_F(CadEngineTest, PickSideHandleRespectsRotation) {
    constexpr float kPiHalf = 1.5707963267948966f; // π/2
    const float cx = 50.0f;
    const float cy = 50.0f;
    const float rx = 20.0f;
    const float ry = 10.0f;

    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        cx, cy,
        rx, ry,
        kPiHalf,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    const std::uint32_t id = 1;
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    const float cosR = std::cos(kPiHalf);
    const float sinR = std::sin(kPiHalf);
    const float localX = 0.0f;
    const float localY = -ry; // N edge in local space
    const float worldX = cx + localX * cosR - localY * sinR;
    const float worldY = cy + localX * sinR + localY * cosR;

    PickResult res = engine.pickSideHandle(worldX, worldY, 2.0f);
    EXPECT_EQ(res.id, id);
    EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::ResizeHandle);
    EXPECT_EQ(res.subIndex, 4);
}

TEST_F(CadEngineTest, PickSideHandleRequiresSingleSelection) {
    CadEngineTestAccessor::upsertCircle(
        engine, 1,
        50.0f, 50.0f,
        20.0f, 10.0f,
        0.0f,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );
    CadEngineTestAccessor::upsertCircle(
        engine, 2,
        100.0f, 100.0f,
        10.0f, 5.0f,
        0.0f,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );

    std::uint32_t ids[] = { 1, 2 };
    engine.setSelection(ids, 2, engine::protocol::SelectionMode::Replace);

    PickResult res = engine.pickSideHandle(50.0f, 40.0f, 2.0f);
    EXPECT_EQ(res.id, 0u);
    EXPECT_EQ(static_cast<PickSubTarget>(res.subTarget), PickSubTarget::None);
}

TEST_F(CadEngineTest, CircleResizeRemainsUniformWithoutAlt) {
    constexpr std::uint32_t id = 300;
    constexpr float cx = 50.0f;
    constexpr float cy = 50.0f;
    constexpr float r = 10.0f;

    CadEngineTestAccessor::upsertCircle(
        engine, id,
        cx, cy,
        r, r,
        0.0f,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // TR handle at (cx + r, cy + r). Drag to a non-uniform target.
    resizeByScreenWithView(
        engine,
        id,
        2,
        cx + r,
        cy + r,
        cx + r + 10.0f,
        cy + r + 2.0f,
        1.0f,
        0);

    const CircleRec* circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
    ASSERT_NE(circle, nullptr);
    EXPECT_NEAR(circle->rx, circle->ry, 1e-3f);
}

TEST_F(CadEngineTest, CircleResizeAltUnlocksEllipse) {
    constexpr std::uint32_t id = 301;
    constexpr float cx = 50.0f;
    constexpr float cy = 50.0f;
    constexpr float r = 10.0f;
    const auto altMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Alt);

    CadEngineTestAccessor::upsertCircle(
        engine, id,
        cx, cy,
        r, r,
        0.0f,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    resizeByScreenWithView(
        engine,
        id,
        2,
        cx + r,
        cy + r,
        cx + r + 12.0f,
        cy + r + 1.0f,
        1.0f,
        altMask);

    const CircleRec* circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
    ASSERT_NE(circle, nullptr);
    EXPECT_GT(std::abs(circle->rx - circle->ry), 1e-2f);
}

TEST_F(CadEngineTest, CircleSideResizeRemainsUniformWithoutAlt) {
    constexpr std::uint32_t id = 302;
    constexpr float cx = 50.0f;
    constexpr float cy = 50.0f;
    constexpr float r = 10.0f;

    CadEngineTestAccessor::upsertCircle(
        engine, id,
        cx, cy,
        r, r,
        0.0f,
        1.0f, 1.0f,
        1.0f, 1.0f, 1.0f, 1.0f,
        0.0f, 0.0f, 0.0f, 1.0f,
        1.0f, 1.0f
    );
    engine.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // East side handle at (cx + r, cy). Drag outward.
    sideResizeByScreenWithView(
        engine,
        id,
        1,
        cx + r,
        cy,
        cx + r + 10.0f,
        cy,
        1.0f,
        0);

    const CircleRec* circle = CadEngineTestAccessor::entityManager(engine).getCircle(id);
    ASSERT_NE(circle, nullptr);
    EXPECT_NEAR(circle->rx, circle->ry, 1e-3f);
}
