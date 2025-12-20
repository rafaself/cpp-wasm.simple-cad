#include "engine/render.h"
#include "engine/util.h"

#include <cstddef>
#include <cmath>

namespace engine {

static void pushVertexColored(float x, float y, float z, float r, float g, float b, std::vector<float>& target) {
    target.push_back(x); target.push_back(y); target.push_back(z);
    target.push_back(r); target.push_back(g); target.push_back(b);
}

static void addRectToBuffers(const RectRec& r, std::vector<float>& triangleVertices, std::vector<float>& lineVertices) {
    const float x0 = r.x;
    const float y0 = r.y;
    const float x1 = r.x + r.w;
    const float y1 = r.y + r.h;
    constexpr float z = 0.0f;
    
    // Triangles - Only if alpha > 0 (visible fill)
    if (r.a > 0.0f) {
        pushVertexColored(x0, y0, z, r.r, r.g, r.b, triangleVertices);
        pushVertexColored(x1, y0, z, r.r, r.g, r.b, triangleVertices);
        pushVertexColored(x1, y1, z, r.r, r.g, r.b, triangleVertices);
        pushVertexColored(x0, y0, z, r.r, r.g, r.b, triangleVertices);
        pushVertexColored(x1, y1, z, r.r, r.g, r.b, triangleVertices);
        pushVertexColored(x0, y1, z, r.r, r.g, r.b, triangleVertices);
    }

    // Outline
    if (r.strokeEnabled > 0.5f) {
        pushVertexColored(x0, y0, z, r.sr, r.sg, r.sb, lineVertices);
        pushVertexColored(x1, y0, z, r.sr, r.sg, r.sb, lineVertices);
        pushVertexColored(x1, y0, z, r.sr, r.sg, r.sb, lineVertices);
        pushVertexColored(x1, y1, z, r.sr, r.sg, r.sb, lineVertices);
        pushVertexColored(x1, y1, z, r.sr, r.sg, r.sb, lineVertices);
        pushVertexColored(x0, y1, z, r.sr, r.sg, r.sb, lineVertices);
        pushVertexColored(x0, y1, z, r.sr, r.sg, r.sb, lineVertices);
        pushVertexColored(x0, y0, z, r.sr, r.sg, r.sb, lineVertices);
    }
}

static void addLineSegmentToBuffers(float x0, float y0, float x1, float y1, float r, float g, float b, bool enabled, std::vector<float>& lineVertices) {
    if (!enabled) return;
    constexpr float z = 0.0f;
    pushVertexColored(x0, y0, z, r, g, b, lineVertices);
    pushVertexColored(x1, y1, z, r, g, b, lineVertices);
}

void rebuildRenderBuffers(
    const std::vector<RectRec>& rects,
    const std::vector<LineRec>& lines,
    const std::vector<PolyRec>& polylines,
    const std::vector<Point2>& points,
    const std::vector<ConduitRec>& conduits,
    const std::vector<SymbolRec>& /*symbols*/, // unused here
    const std::vector<NodeRec>& /*nodes*/,     // unused here
    std::vector<float>& triangleVertices,
    std::vector<float>& lineVertices,
    ResolveNodeCallback resolveCb,
    void* resolveCtx
) {
    triangleVertices.clear();
    lineVertices.clear();

    // Reserve to avoid growth during rebuild.
    triangleVertices.reserve(rects.size() * rectTriangleFloats);

    std::size_t lineFloatBudget =
        rects.size() * rectOutlineFloats +
        lines.size() * lineSegmentFloats +
        conduits.size() * lineSegmentFloats;
    for (const auto& pl : polylines) {
        if (pl.count >= 2) lineFloatBudget += static_cast<std::size_t>(pl.count - 1) * lineSegmentFloats;
    }
    lineVertices.reserve(lineFloatBudget);

    for (const auto& r : rects) {
        addRectToBuffers(r, triangleVertices, lineVertices);
    }

    for (const auto& l : lines) {
        addLineSegmentToBuffers(l.x0, l.y0, l.x1, l.y1, l.r, l.g, l.b, l.enabled > 0.5f, lineVertices);
    }

    for (const auto& pl : polylines) {
        if (pl.count < 2) continue;
        if (!(pl.enabled > 0.5f)) continue;
        const std::uint32_t start = pl.offset;
        const std::uint32_t end = pl.offset + pl.count;
        if (end > points.size()) continue;
        for (std::uint32_t i = start; i + 1 < end; i++) {
            const auto& p0 = points[i];
            const auto& p1 = points[i + 1];
            addLineSegmentToBuffers(p0.x, p0.y, p1.x, p1.y, pl.r, pl.g, pl.b, true, lineVertices);
        }
    }

    for (const auto& c : conduits) {
        if (!(c.enabled > 0.5f)) continue;
        Point2 a;
        Point2 b;
        bool okA = false;
        bool okB = false;
        if (resolveCb) okA = resolveCb(resolveCtx, c.fromNodeId, a);
        if (resolveCb) okB = resolveCb(resolveCtx, c.toNodeId, b);
        if (!okA || !okB) continue;
        addLineSegmentToBuffers(a.x, a.y, b.x, b.y, c.r, c.g, c.b, true, lineVertices);
    }
}

} // namespace engine
