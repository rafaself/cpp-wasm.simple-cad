#include "engine/render.h"
#include "engine/util.h"

#include <cstddef>
#include <cmath>
#include <algorithm>
#include <unordered_set>

namespace engine {

static void pushVertexColored(float x, float y, float z, float r, float g, float b, float a, std::vector<float>& target) {
    target.push_back(x); target.push_back(y); target.push_back(z);
    target.push_back(r); target.push_back(g); target.push_back(b); target.push_back(a);
}

static float clamp01(float v) {
    if (!std::isfinite(v)) return 0.0f;
    if (v < 0.0f) return 0.0f;
    if (v > 1.0f) return 1.0f;
    return v;
}

static float clampMin(float v, float minV) {
    if (!std::isfinite(v)) return minV;
    return v < minV ? minV : v;
}

static void addSegmentQuad(
    float x0,
    float y0,
    float x1,
    float y1,
    float widthWorld,
    float r,
    float g,
    float b,
    float a,
    std::vector<float>& triangleVertices
) {
    const float w = clampMin(widthWorld, 0.0f);
    if (w <= 0.0f) return;
    const float dx = x1 - x0;
    const float dy = y1 - y0;
    const float len = std::sqrt(dx * dx + dy * dy);
    if (!(len > 1e-6f)) return;
    const float inv = 1.0f / len;
    const float ux = dx * inv;
    const float uy = dy * inv;
    const float px = -uy;
    const float py = ux;
    const float hw = w * 0.5f;

    const float ax0 = x0 + px * hw;
    const float ay0 = y0 + py * hw;
    const float bx0 = x0 - px * hw;
    const float by0 = y0 - py * hw;
    const float ax1 = x1 + px * hw;
    const float ay1 = y1 + py * hw;
    const float bx1 = x1 - px * hw;
    const float by1 = y1 - py * hw;

    constexpr float z = 0.0f;
    // (ax0,ay0) (bx0,by0) (ax1,ay1)
    pushVertexColored(ax0, ay0, z, r, g, b, a, triangleVertices);
    pushVertexColored(bx0, by0, z, r, g, b, a, triangleVertices);
    pushVertexColored(ax1, ay1, z, r, g, b, a, triangleVertices);
    // (bx0,by0) (bx1,by1) (ax1,ay1)
    pushVertexColored(bx0, by0, z, r, g, b, a, triangleVertices);
    pushVertexColored(bx1, by1, z, r, g, b, a, triangleVertices);
    pushVertexColored(ax1, ay1, z, r, g, b, a, triangleVertices);
}

static void addRectFill(const RectRec& r, std::vector<float>& triangleVertices) {
    if (!(r.a > 0.0f)) return;
    const float x0 = r.x;
    const float y0 = r.y;
    const float x1 = r.x + r.w;
    const float y1 = r.y + r.h;
    constexpr float z = 0.0f;

    pushVertexColored(x0, y0, z, r.r, r.g, r.b, r.a, triangleVertices);
    pushVertexColored(x1, y0, z, r.r, r.g, r.b, r.a, triangleVertices);
    pushVertexColored(x1, y1, z, r.r, r.g, r.b, r.a, triangleVertices);
    pushVertexColored(x0, y0, z, r.r, r.g, r.b, r.a, triangleVertices);
    pushVertexColored(x1, y1, z, r.r, r.g, r.b, r.a, triangleVertices);
    pushVertexColored(x0, y1, z, r.r, r.g, r.b, r.a, triangleVertices);
}

static void addRectStroke(const RectRec& r, float viewScale, std::vector<float>& triangleVertices) {
    if (!(r.strokeEnabled > 0.5f)) return;
    const float a = clamp01(r.sa);
    if (!(a > 0.0f)) return;
    const float w = (r.strokeWidthPx > 0.0f ? r.strokeWidthPx : 1.0f);
    const float widthWorld = w / clampMin(viewScale, 1e-6f);
    const float x0 = r.x;
    const float y0 = r.y;
    const float x1 = r.x + r.w;
    const float y1 = r.y + r.h;

    addSegmentQuad(x0, y0, x1, y0, widthWorld, r.sr, r.sg, r.sb, a, triangleVertices);
    addSegmentQuad(x1, y0, x1, y1, widthWorld, r.sr, r.sg, r.sb, a, triangleVertices);
    addSegmentQuad(x1, y1, x0, y1, widthWorld, r.sr, r.sg, r.sb, a, triangleVertices);
    addSegmentQuad(x0, y1, x0, y0, widthWorld, r.sr, r.sg, r.sb, a, triangleVertices);
}

static void addCircleFill(const CircleRec& c, std::vector<float>& triangleVertices) {
    if (!(c.a > 0.0f)) return;
    constexpr int segments = 72;
    constexpr float z = 0.0f;
    const float rot = c.rot;
    const float cosR = rot ? std::cos(rot) : 1.0f;
    const float sinR = rot ? std::sin(rot) : 0.0f;
    for (int i = 0; i < segments; i++) {
        const float t0 = (static_cast<float>(i) / segments) * 2.0f * static_cast<float>(M_PI);
        const float t1 = (static_cast<float>(i + 1) / segments) * 2.0f * static_cast<float>(M_PI);
        const float dx0 = std::cos(t0) * c.rx * c.sx;
        const float dy0 = std::sin(t0) * c.ry * c.sy;
        const float dx1 = std::cos(t1) * c.rx * c.sx;
        const float dy1 = std::sin(t1) * c.ry * c.sy;
        const float x0 = c.cx + dx0 * cosR - dy0 * sinR;
        const float y0 = c.cy + dx0 * sinR + dy0 * cosR;
        const float x1 = c.cx + dx1 * cosR - dy1 * sinR;
        const float y1 = c.cy + dx1 * sinR + dy1 * cosR;

        pushVertexColored(c.cx, c.cy, z, c.r, c.g, c.b, c.a, triangleVertices);
        pushVertexColored(x0, y0, z, c.r, c.g, c.b, c.a, triangleVertices);
        pushVertexColored(x1, y1, z, c.r, c.g, c.b, c.a, triangleVertices);
    }
}

static void addCircleStroke(const CircleRec& c, float viewScale, std::vector<float>& triangleVertices) {
    if (!(c.strokeEnabled > 0.5f)) return;
    const float a = clamp01(c.sa);
    if (!(a > 0.0f)) return;
    constexpr int segments = 72;
    const float w = (c.strokeWidthPx > 0.0f ? c.strokeWidthPx : 1.0f);
    const float hw = (w / clampMin(viewScale, 1e-6f)) * 0.5f;

    const float outerRx = c.rx + hw;
    const float outerRy = c.ry + hw;
    const float innerRx = std::max(0.0f, c.rx - hw);
    const float innerRy = std::max(0.0f, c.ry - hw);

    const float rot = c.rot;
    const float cosR = rot ? std::cos(rot) : 1.0f;
    const float sinR = rot ? std::sin(rot) : 0.0f;
    constexpr float z = 0.0f;

    for (int i = 0; i < segments; i++) {
        const float t0 = (static_cast<float>(i) / segments) * 2.0f * static_cast<float>(M_PI);
        const float t1 = (static_cast<float>(i + 1) / segments) * 2.0f * static_cast<float>(M_PI);

        const float ocx0 = std::cos(t0) * outerRx * c.sx;
        const float ocy0 = std::sin(t0) * outerRy * c.sy;
        const float ocx1 = std::cos(t1) * outerRx * c.sx;
        const float ocy1 = std::sin(t1) * outerRy * c.sy;

        const float icx0 = std::cos(t0) * innerRx * c.sx;
        const float icy0 = std::sin(t0) * innerRy * c.sy;
        const float icx1 = std::cos(t1) * innerRx * c.sx;
        const float icy1 = std::sin(t1) * innerRy * c.sy;

        const float ox0 = c.cx + ocx0 * cosR - ocy0 * sinR;
        const float oy0 = c.cy + ocx0 * sinR + ocy0 * cosR;
        const float ox1 = c.cx + ocx1 * cosR - ocy1 * sinR;
        const float oy1 = c.cy + ocx1 * sinR + ocy1 * cosR;

        const float ix0 = c.cx + icx0 * cosR - icy0 * sinR;
        const float iy0 = c.cy + icx0 * sinR + icy0 * cosR;
        const float ix1 = c.cx + icx1 * cosR - icy1 * sinR;
        const float iy1 = c.cy + icx1 * sinR + icy1 * cosR;

        // outer0, inner0, outer1
        pushVertexColored(ox0, oy0, z, c.sr, c.sg, c.sb, a, triangleVertices);
        pushVertexColored(ix0, iy0, z, c.sr, c.sg, c.sb, a, triangleVertices);
        pushVertexColored(ox1, oy1, z, c.sr, c.sg, c.sb, a, triangleVertices);
        // inner0, inner1, outer1
        pushVertexColored(ix0, iy0, z, c.sr, c.sg, c.sb, a, triangleVertices);
        pushVertexColored(ix1, iy1, z, c.sr, c.sg, c.sb, a, triangleVertices);
        pushVertexColored(ox1, oy1, z, c.sr, c.sg, c.sb, a, triangleVertices);
    }
}

static void polygonVertices(const PolygonRec& p, std::vector<Point2>& out) {
    out.clear();
    const std::uint32_t sides = std::max<std::uint32_t>(3u, p.sides);
    out.reserve(sides);
    const float rot = p.rot;
    const float cosR = rot ? std::cos(rot) : 1.0f;
    const float sinR = rot ? std::sin(rot) : 0.0f;
    for (std::uint32_t i = 0; i < sides; i++) {
        const float t = (static_cast<float>(i) / sides) * 2.0f * static_cast<float>(M_PI) - static_cast<float>(M_PI) / 2.0f;
        const float dx = std::cos(t) * p.rx * p.sx;
        const float dy = std::sin(t) * p.ry * p.sy;
        const float x = p.cx + dx * cosR - dy * sinR;
        const float y = p.cy + dx * sinR + dy * cosR;
        out.push_back(Point2{x, y});
    }
}

static void addPolygonFill(const PolygonRec& p, std::vector<Point2>& verts, std::vector<float>& triangleVertices) {
    if (!(p.a > 0.0f)) return;
    polygonVertices(p, verts);
    if (verts.size() < 3) return;
    constexpr float z = 0.0f;
    for (std::size_t i = 0; i < verts.size(); i++) {
        const Point2& a = verts[i];
        const Point2& b = verts[(i + 1) % verts.size()];
        pushVertexColored(p.cx, p.cy, z, p.r, p.g, p.b, p.a, triangleVertices);
        pushVertexColored(a.x, a.y, z, p.r, p.g, p.b, p.a, triangleVertices);
        pushVertexColored(b.x, b.y, z, p.r, p.g, p.b, p.a, triangleVertices);
    }
}

static void addPolygonStroke(const PolygonRec& p, float viewScale, std::vector<Point2>& verts, std::vector<float>& triangleVertices) {
    if (!(p.strokeEnabled > 0.5f)) return;
    const float a = clamp01(p.sa);
    if (!(a > 0.0f)) return;
    polygonVertices(p, verts);
    if (verts.size() < 3) return;
    const float w = (p.strokeWidthPx > 0.0f ? p.strokeWidthPx : 1.0f);
    const float widthWorld = w / clampMin(viewScale, 1e-6f);
    for (std::size_t i = 0; i < verts.size(); i++) {
        const Point2& a0 = verts[i];
        const Point2& b0 = verts[(i + 1) % verts.size()];
        addSegmentQuad(a0.x, a0.y, b0.x, b0.y, widthWorld, p.sr, p.sg, p.sb, a, triangleVertices);
    }
}

static void addArrow(const ArrowRec& ar, float viewScale, std::vector<float>& triangleVertices) {
    if (!(ar.strokeEnabled > 0.5f)) return;
    const float a = clamp01(ar.sa);
    if (!(a > 0.0f)) return;
    const float dx = ar.bx - ar.ax;
    const float dy = ar.by - ar.ay;
    const float len = std::sqrt(dx * dx + dy * dy);
    if (!(len > 1e-6f)) return;
    const float inv = 1.0f / len;
    const float dirX = dx * inv;
    const float dirY = dy * inv;
    const float headLen = std::min(ar.head, len * 0.45f);
    const float headW = headLen * 0.6f;
    const float baseX = ar.bx - dirX * headLen;
    const float baseY = ar.by - dirY * headLen;
    const float perpX = -dirY;
    const float perpY = dirX;

    const float wPx = (ar.strokeWidthPx > 0.0f ? ar.strokeWidthPx : 1.0f);
    const float widthWorld = wPx / clampMin(viewScale, 1e-6f);
    addSegmentQuad(ar.ax, ar.ay, baseX, baseY, widthWorld, ar.sr, ar.sg, ar.sb, a, triangleVertices);

    const float leftX = baseX + perpX * (headW / 2.0f);
    const float leftY = baseY + perpY * (headW / 2.0f);
    const float rightX = baseX - perpX * (headW / 2.0f);
    const float rightY = baseY - perpY * (headW / 2.0f);

    constexpr float z = 0.0f;
    pushVertexColored(ar.bx, ar.by, z, ar.sr, ar.sg, ar.sb, a, triangleVertices);
    pushVertexColored(leftX, leftY, z, ar.sr, ar.sg, ar.sb, a, triangleVertices);
    pushVertexColored(rightX, rightY, z, ar.sr, ar.sg, ar.sb, a, triangleVertices);
}

void rebuildRenderBuffers(
    const std::vector<RectRec>& rects,
    const std::vector<LineRec>& lines,
    const std::vector<PolyRec>& polylines,
    const std::vector<Point2>& points,
    const std::vector<ConduitRec>& conduits,
    const std::vector<CircleRec>& circles,
    const std::vector<PolygonRec>& polygons,
    const std::vector<ArrowRec>& arrows,
    const std::vector<SymbolRec>& /*symbols*/, // unused here
    const std::vector<NodeRec>& /*nodes*/,     // unused here
    const std::unordered_map<std::uint32_t, EntityRef>& entities,
    const std::vector<std::uint32_t>& drawOrderIds,
    float viewScale,
    std::vector<float>& triangleVertices,
    std::vector<float>& lineVertices,
    ResolveNodeCallback resolveCb,
    void* resolveCtx
) {
    triangleVertices.clear();
    lineVertices.clear();

    viewScale = clampMin(viewScale, 1e-6f);

    // Build a deterministic, complete draw order: requested order first, then remaining renderables sorted by id.
    std::vector<std::uint32_t> ordered;
    ordered.reserve(entities.size());
    std::unordered_set<std::uint32_t> seen;
    seen.reserve(entities.size());

    auto isRenderable = [](EntityKind k) {
        return k == EntityKind::Rect || k == EntityKind::Line || k == EntityKind::Polyline || k == EntityKind::Conduit || k == EntityKind::Circle || k == EntityKind::Polygon || k == EntityKind::Arrow;
    };

    for (const auto& id : drawOrderIds) {
        const auto it = entities.find(id);
        if (it == entities.end()) continue;
        if (!isRenderable(it->second.kind)) continue;
        if (seen.insert(id).second) ordered.push_back(id);
    }

    std::vector<std::uint32_t> missing;
    missing.reserve(entities.size());
    for (const auto& kv : entities) {
        const std::uint32_t id = kv.first;
        if (seen.find(id) != seen.end()) continue;
        if (!isRenderable(kv.second.kind)) continue;
        missing.push_back(id);
    }
    std::sort(missing.begin(), missing.end());
    ordered.insert(ordered.end(), missing.begin(), missing.end());

    // Budget reserves.
    constexpr std::size_t quadFloats = 6 * 7; // addSegmentQuad emits 6 vertices, each with 7 floats per vertex
    constexpr std::size_t triFloats = 3 * 7;  // 3 vertices * 7 floats per vertex
    constexpr std::size_t circleSegments = 72;

    std::size_t triangleBudget = 0;

    for (const auto& r : rects) {
        triangleBudget += rectTriangleFloats;
        if (r.strokeEnabled > 0.5f && clamp01(r.sa) > 0.0f) {
            triangleBudget += 4 * quadFloats; // four sides
        }
    }

    for (const auto& l : lines) {
        if (!(l.enabled > 0.5f) || !(clamp01(l.a) > 0.0f)) continue;
        triangleBudget += quadFloats;
    }

    for (const auto& pl : polylines) {
        if (!(pl.enabled > 0.5f) || !(clamp01(pl.a) > 0.0f) || pl.count < 2) continue;
        const std::uint32_t segments = (pl.count > 0 ? pl.count - 1 : 0);
        triangleBudget += static_cast<std::size_t>(segments) * quadFloats;
    }

    for (const auto& c : conduits) {
        if (!(c.enabled > 0.5f) || !(clamp01(c.a) > 0.0f)) continue;
        triangleBudget += quadFloats;
    }

    for (const auto& c : circles) {
        if (c.a > 0.0f) {
            triangleBudget += circleSegments * triFloats; // fill: center + two outer verts per segment
        }
        if (c.strokeEnabled > 0.5f && clamp01(c.sa) > 0.0f) {
            triangleBudget += circleSegments * quadFloats; // stroke ring
        }
    }

    for (const auto& p : polygons) {
        const std::uint32_t sides = std::max<std::uint32_t>(3u, p.sides);
        if (p.a > 0.0f) {
            triangleBudget += static_cast<std::size_t>(sides) * triFloats;
        }
        if (p.strokeEnabled > 0.5f && clamp01(p.sa) > 0.0f) {
            triangleBudget += static_cast<std::size_t>(sides) * quadFloats;
        }
    }

    for (const auto& a : arrows) {
        if (!(a.strokeEnabled > 0.5f) || !(clamp01(a.sa) > 0.0f)) continue;
        triangleBudget += quadFloats; // shaft quad
        triangleBudget += triFloats;  // head triangle
    }

    if (triangleBudget > 0) {
        triangleVertices.reserve(triangleBudget);
    }

    std::vector<Point2> tmpVerts;

    for (const auto& id : ordered) {
        const auto it = entities.find(id);
        if (it == entities.end()) continue;
        const EntityRef ref = it->second;

        if (ref.kind == EntityKind::Rect) {
            const RectRec& r = rects[ref.index];
            addRectFill(r, triangleVertices);
            addRectStroke(r, viewScale, triangleVertices);
            continue;
        }
        if (ref.kind == EntityKind::Line) {
            const LineRec& l = lines[ref.index];
            if (!(l.enabled > 0.5f)) continue;
            const float a = clamp01(l.a);
            if (!(a > 0.0f)) continue;
            const float widthWorld = (l.strokeWidthPx > 0.0f ? l.strokeWidthPx : 1.0f) / viewScale;
            addSegmentQuad(l.x0, l.y0, l.x1, l.y1, widthWorld, l.r, l.g, l.b, a, triangleVertices);
            continue;
        }
        if (ref.kind == EntityKind::Polyline) {
            const PolyRec& pl = polylines[ref.index];
            if (pl.count < 2) continue;
            if (!(pl.enabled > 0.5f)) continue;
            const float a = clamp01(pl.a);
            if (!(a > 0.0f)) continue;
            const std::uint32_t start = pl.offset;
            const std::uint32_t end = pl.offset + pl.count;
            if (end > points.size()) continue;
            const float widthWorld = (pl.strokeWidthPx > 0.0f ? pl.strokeWidthPx : 1.0f) / viewScale;
            for (std::uint32_t i = start; i + 1 < end; i++) {
                const auto& p0 = points[i];
                const auto& p1 = points[i + 1];
                addSegmentQuad(p0.x, p0.y, p1.x, p1.y, widthWorld, pl.r, pl.g, pl.b, a, triangleVertices);
            }
            continue;
        }
        if (ref.kind == EntityKind::Conduit) {
            const ConduitRec& c = conduits[ref.index];
            if (!(c.enabled > 0.5f)) continue;
            const float a = clamp01(c.a);
            if (!(a > 0.0f)) continue;
            Point2 a0;
            Point2 b0;
            bool okA = false;
            bool okB = false;
            if (resolveCb) okA = resolveCb(resolveCtx, c.fromNodeId, a0);
            if (resolveCb) okB = resolveCb(resolveCtx, c.toNodeId, b0);
            if (!okA || !okB) continue;
            const float widthWorld = (c.strokeWidthPx > 0.0f ? c.strokeWidthPx : 1.0f) / viewScale;
            addSegmentQuad(a0.x, a0.y, b0.x, b0.y, widthWorld, c.r, c.g, c.b, a, triangleVertices);
            continue;
        }
        if (ref.kind == EntityKind::Circle) {
            const CircleRec& c = circles[ref.index];
            addCircleFill(c, triangleVertices);
            addCircleStroke(c, viewScale, triangleVertices);
            continue;
        }
        if (ref.kind == EntityKind::Polygon) {
            const PolygonRec& p = polygons[ref.index];
            addPolygonFill(p, tmpVerts, triangleVertices);
            addPolygonStroke(p, viewScale, tmpVerts, triangleVertices);
            continue;
        }
        if (ref.kind == EntityKind::Arrow) {
            const ArrowRec& a = arrows[ref.index];
            addArrow(a, viewScale, triangleVertices);
            continue;
        }
    }
}

} // namespace engine
