#include <gtest/gtest.h>
#include "engine/render.h"
#include "engine/types.h"

TEST(RenderTest, SimpleBuffers) {
    using namespace engine;
    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
    std::vector<ConduitRec> conduits;
    std::vector<SymbolRec> symbols;
    std::vector<NodeRec> nodes;

    rects.push_back(RectRec{1, 0,0,10,10, 1,0,0, 1, 1,0,0, 1, 1});
    lines.push_back(LineRec{2, 0,0,5,5, 1,1,1, 1, 1});
    polylines.push_back(PolyRec{3, 0, 2, 1,1,1, 1, 1});
    points.push_back(Point2{0,0}); points.push_back(Point2{5,5});

    std::vector<float> tri;
    std::vector<float> linev;

    engine::rebuildRenderBuffers(rects, lines, polylines, points, conduits, symbols, nodes, tri, linev, nullptr, nullptr);

    // One rect -> 6 triangle vertices (each with 7 floats) => float count = 6*7
    EXPECT_EQ(tri.size(), static_cast<size_t>(6*7));
    // One rect outline (4 segments*2 vertices=8) + one line (2 vertices) + polyline (1 segment*2 vertices)
    EXPECT_EQ(linev.size(), static_cast<size_t>((8 + 2 + 2) * 7));
}
