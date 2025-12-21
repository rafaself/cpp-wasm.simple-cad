#include <gtest/gtest.h>

#include "engine/vector_tessellation.h"

#include <cmath>
#include <cstddef>

namespace {

static bool hasNonFinite(const std::vector<float>& v) {
    for (float x : v) {
        if (!std::isfinite(x)) return true;
    }
    return false;
}

} // namespace

TEST(VectorTessellationTest, StrokeQuadraticFlattens) {
    using namespace engine::vector;

    DocumentV1 doc;
    Path p;
    p.id = 1;
    p.segments.push_back(Segment::moveTo(Point2{0.0f, 0.0f}));
    p.segments.push_back(Segment::quadTo(Point2{5.0f, 10.0f}, Point2{10.0f, 0.0f}));
    doc.paths.push_back(p);

    Draw d;
    d.id = 1;
    d.pathId = 1;
    d.style.strokeEnabled = true;
    d.style.stroke.widthPx = 2.0f;
    d.style.stroke.r = 1.0f;
    d.style.stroke.g = 0.0f;
    d.style.stroke.b = 0.0f;
    d.style.stroke.a = 1.0f;
    doc.draws.push_back(d);

    TessellateOptions opt;
    opt.viewScale = 1.0f;
    opt.tolerancePx = 0.1f; // force subdivision

    VectorTessellator tess;
    std::vector<float> out;
    tess.tessellateDocumentV1(doc, opt, out);

    // A straight segment yields 6 vertices (1 quad) => 42 floats.
    EXPECT_GT(out.size(), static_cast<std::size_t>(6 * 7));
    EXPECT_FALSE(hasNonFinite(out));
}

TEST(VectorTessellationTest, FillConcavePolygonEarclips) {
    using namespace engine::vector;

    DocumentV1 doc;
    Path p;
    p.id = 1;
    p.segments.push_back(Segment::moveTo(Point2{0.0f, 0.0f}));
    p.segments.push_back(Segment::lineTo(Point2{2.0f, 0.0f}));
    p.segments.push_back(Segment::lineTo(Point2{2.0f, 2.0f}));
    p.segments.push_back(Segment::lineTo(Point2{1.0f, 1.0f})); // concave dent
    p.segments.push_back(Segment::lineTo(Point2{0.0f, 2.0f}));
    p.segments.push_back(Segment::close());
    doc.paths.push_back(p);

    Draw d;
    d.id = 1;
    d.pathId = 1;
    d.style.fillEnabled = true;
    d.style.fill.r = 0.0f;
    d.style.fill.g = 1.0f;
    d.style.fill.b = 0.0f;
    d.style.fill.a = 1.0f;
    doc.draws.push_back(d);

    TessellateOptions opt;
    opt.viewScale = 1.0f;
    opt.tolerancePx = 1.0f;

    VectorTessellator tess;
    std::vector<float> out;
    tess.tessellateDocumentV1(doc, opt, out);

    // 5-vertex simple polygon => (n-2)=3 triangles => 9 vertices.
    EXPECT_EQ(out.size(), static_cast<std::size_t>(9 * 7));
    EXPECT_FALSE(hasNonFinite(out));
}

TEST(VectorTessellationTest, StrokeArcFlattens) {
    using namespace engine::vector;

    const Point2 center{0.0f, 0.0f};
    const Point2 radius{10.0f, 10.0f};
    const float rotation = 0.0f;
    const float startAngle = 0.0f;
    const float endAngle = static_cast<float>(M_PI) * 0.5f;

    // Move to arc start point so the path has a well-defined current point.
    const Point2 startPt{center.x + radius.x * std::cos(startAngle), center.y + radius.y * std::sin(startAngle)};

    DocumentV1 doc;
    Path p;
    p.id = 1;
    p.segments.push_back(Segment::moveTo(startPt));
    p.segments.push_back(Segment::arcTo(center, radius, rotation, startAngle, endAngle, true));
    doc.paths.push_back(p);

    Draw d;
    d.id = 1;
    d.pathId = 1;
    d.style.strokeEnabled = true;
    d.style.stroke.widthPx = 1.0f;
    d.style.stroke.join = StrokeJoin::Round;
    d.style.stroke.cap = StrokeCap::Round;
    d.style.stroke.a = 1.0f;
    doc.draws.push_back(d);

    TessellateOptions opt;
    opt.viewScale = 1.0f;
    opt.tolerancePx = 0.25f;

    VectorTessellator tess;
    std::vector<float> out;
    tess.tessellateDocumentV1(doc, opt, out);

    EXPECT_GT(out.size(), static_cast<std::size_t>(6 * 7));
    EXPECT_FALSE(hasNonFinite(out));
}
