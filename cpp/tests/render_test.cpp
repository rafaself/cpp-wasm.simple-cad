#include <gtest/gtest.h>
#include "engine/render/render.h"
#include "engine/core/types.h"

TEST(RenderTest, SimpleBuffers) {
    using namespace engine;
    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
    std::vector<CircleRec> circles;
    std::vector<PolygonRec> polygons;
    std::vector<ArrowRec> arrows;
    std::unordered_map<std::uint32_t, EntityRef> entities;
    std::vector<std::uint32_t> drawOrderIds;

    rects.push_back(RectRec{1, 0, 0, 10, 10, 1, 0, 0, 1, 1, 1, 1, 1, 1, 2});
    entities.emplace(1, EntityRef{EntityKind::Rect, 0});
    drawOrderIds.push_back(1);

    std::vector<float> tri;
    std::vector<float> linev;

    engine::rebuildRenderBuffers(
        rects,
        lines,
        polylines,
        points,
        circles,
        polygons,
        arrows,
        entities,
        drawOrderIds,
        1.0f,
        tri,
        linev,
        nullptr,
        nullptr,
        nullptr
    );

    // One rect -> 2 fill triangles (6 vertices) + 4 stroke segments as quads (24 vertices) = 30 vertices
    EXPECT_EQ(tri.size(), static_cast<size_t>(30 * 7));
    // Strokes are triangulated, so there is no separate line buffer output.
    EXPECT_EQ(linev.size(), static_cast<size_t>(0));
}
