#include "engine/render/render.h"
#include "engine/core/util.h"

#include <cstddef>
#include <cmath>
#include <algorithm>
#include <unordered_set>
#include <unordered_map>

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

static float normalizeViewScale(float viewScale) {
    return (viewScale > 1e-6f && std::isfinite(viewScale)) ? viewScale : 1.0f;
}

static float strokeWidthWorld(float strokeWidthPx, float viewScale) {
    const float scale = normalizeViewScale(viewScale);
    const float px = (strokeWidthPx > 0.0f ? strokeWidthPx : 1.0f);
    return px / scale;
}

static void applyRectStyle(RectRec& r, const ResolvedShapeStyle& style) {
    r.r = style.fillR;
    r.g = style.fillG;
    r.b = style.fillB;
    r.a = style.fillEnabled > 0.5f ? style.fillA : 0.0f;
    r.sr = style.strokeR;
    r.sg = style.strokeG;
    r.sb = style.strokeB;
    r.sa = style.strokeA;
    r.strokeEnabled = style.strokeEnabled;
}

static void applyCircleStyle(CircleRec& c, const ResolvedShapeStyle& style) {
    c.r = style.fillR;
    c.g = style.fillG;
    c.b = style.fillB;
    c.a = style.fillEnabled > 0.5f ? style.fillA : 0.0f;
    c.sr = style.strokeR;
    c.sg = style.strokeG;
    c.sb = style.strokeB;
    c.sa = style.strokeA;
    c.strokeEnabled = style.strokeEnabled;
}

static void applyPolygonStyle(PolygonRec& p, const ResolvedShapeStyle& style) {
    p.r = style.fillR;
    p.g = style.fillG;
    p.b = style.fillB;
    p.a = style.fillEnabled > 0.5f ? style.fillA : 0.0f;
    p.sr = style.strokeR;
    p.sg = style.strokeG;
    p.sb = style.strokeB;
    p.sa = style.strokeA;
    p.strokeEnabled = style.strokeEnabled;
}

static void applyLineStyle(LineRec& l, const ResolvedShapeStyle& style) {
    l.r = style.strokeR;
    l.g = style.strokeG;
    l.b = style.strokeB;
    l.a = style.strokeA;
    l.enabled = style.strokeEnabled;
}

static void applyPolylineStyle(PolyRec& p, const ResolvedShapeStyle& style) {
    p.sr = style.strokeR;
    p.sg = style.strokeG;
    p.sb = style.strokeB;
    p.sa = style.strokeA;
    p.strokeEnabled = style.strokeEnabled;
    p.enabled = style.strokeEnabled;
}

static void applyArrowStyle(ArrowRec& a, const ResolvedShapeStyle& style) {
    a.sr = style.strokeR;
    a.sg = style.strokeG;
    a.sb = style.strokeB;
    a.sa = style.strokeA;
    a.strokeEnabled = style.strokeEnabled;
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
    const float strokeWorld = strokeWidthWorld(r.strokeWidthPx, viewScale);

    const float ox0 = r.x;
    const float oy0 = r.y;
    const float ox1 = r.x + r.w;
    const float oy1 = r.y + r.h;
    const float ix0 = ox0 + strokeWorld;
    const float iy0 = oy0 + strokeWorld;
    const float ix1 = ox1 - strokeWorld;
    const float iy1 = oy1 - strokeWorld;

    const float cix0 = std::min(ix0, (ox0 + ox1) * 0.5f);
    const float ciy0 = std::min(iy0, (oy0 + oy1) * 0.5f);
    const float cix1 = std::max(ix1, (ox0 + ox1) * 0.5f);
    const float ciy1 = std::max(iy1, (oy0 + oy1) * 0.5f);

    constexpr float z = 0.0f;

    auto pushEdge = [&](float oxA, float oyA, float ixA, float iyA, float oxB, float oyB, float ixB, float iyB) {
        // Triangle 1: outer A, inner A, outer B
        pushVertexColored(oxA, oyA, z, r.sr, r.sg, r.sb, a, triangleVertices);
        pushVertexColored(ixA, iyA, z, r.sr, r.sg, r.sb, a, triangleVertices);
        pushVertexColored(oxB, oyB, z, r.sr, r.sg, r.sb, a, triangleVertices);
        // Triangle 2: inner A, inner B, outer B
        pushVertexColored(ixA, iyA, z, r.sr, r.sg, r.sb, a, triangleVertices);
        pushVertexColored(ixB, iyB, z, r.sr, r.sg, r.sb, a, triangleVertices);
        pushVertexColored(oxB, oyB, z, r.sr, r.sg, r.sb, a, triangleVertices);
    };

    // Top edge
    pushEdge(ox0, oy0, cix0, ciy0, ox1, oy0, cix1, ciy0);
    // Right edge
    pushEdge(ox1, oy0, cix1, ciy0, ox1, oy1, cix1, ciy1);
    // Bottom edge
    pushEdge(ox1, oy1, cix1, ciy1, ox0, oy1, cix0, ciy1);
    // Left edge
    pushEdge(ox0, oy1, cix0, ciy1, ox0, oy0, cix0, ciy0);
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
    const float w = strokeWidthWorld(c.strokeWidthPx, viewScale);
    const float outerRx = c.rx;
    const float outerRy = c.ry;
    const float innerRx = std::max(0.0f, c.rx - w);
    const float innerRy = std::max(0.0f, c.ry - w);

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
    const std::size_t n = verts.size();
    if (n < 3) return;
    const float strokeWorld = strokeWidthWorld(p.strokeWidthPx, viewScale);

    std::vector<Point2> innerVerts;
    innerVerts.reserve(n);

    for (std::size_t i = 0; i < n; i++) {
        const Point2& prev = verts[(i + n - 1) % n];
        const Point2& curr = verts[i];
        const Point2& next = verts[(i + 1) % n];

        float d1x = curr.x - prev.x;
        float d1y = curr.y - prev.y;
        float d2x = next.x - curr.x;
        float d2y = next.y - curr.y;

        const float len1 = std::sqrt(d1x * d1x + d1y * d1y);
        const float len2 = std::sqrt(d2x * d2x + d2y * d2y);
        if (len1 > 1e-6f) { d1x /= len1; d1y /= len1; }
        if (len2 > 1e-6f) { d2x /= len2; d2y /= len2; }

        const float n1x = -d1y;
        const float n1y = d1x;
        const float n2x = -d2y;
        const float n2y = d2x;

        float mx = n1x + n2x;
        float my = n1y + n2y;
        const float mlen = std::sqrt(mx * mx + my * my);
        if (mlen > 1e-6f) {
            mx /= mlen;
            my /= mlen;
        } else {
            mx = n1x;
            my = n1y;
        }

        float cosHalf = mx * n1x + my * n1y;
        if (cosHalf < 0.2f) cosHalf = 0.2f;
        const float miterLen = strokeWorld / cosHalf;

        const float maxMiter = strokeWorld * 4.0f;
        const float clampedMiter = std::min(miterLen, maxMiter);

        innerVerts.push_back(Point2{curr.x + mx * clampedMiter, curr.y + my * clampedMiter});
    }

    constexpr float z = 0.0f;
    for (std::size_t i = 0; i < n; i++) {
        const std::size_t j = (i + 1) % n;
        const Point2& outer0 = verts[i];
        const Point2& outer1 = verts[j];
        const Point2& inner0 = innerVerts[i];
        const Point2& inner1 = innerVerts[j];

        pushVertexColored(outer0.x, outer0.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(inner0.x, inner0.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(outer1.x, outer1.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(inner0.x, inner0.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(inner1.x, inner1.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(outer1.x, outer1.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
    }
}

static void addPolylineStroke(
    const PolyRec& p,
    float viewScale,
    const std::vector<Point2>& points,
    std::vector<Point2>& verts,
    std::vector<float>& triangleVertices
) {
    if (!(p.strokeEnabled > 0.5f)) return;
    const float a = clamp01(p.sa);
    if (!(a > 0.0f)) return;
    if (p.count < 2) return;

    const std::uint32_t start = p.offset;
    const std::uint32_t end = p.offset + p.count;
    if (end > points.size()) return;

    verts.clear();
    verts.reserve(p.count);
    for (std::uint32_t i = start; i < end; i++) {
        verts.push_back(points[i]);
    }

    const std::size_t n = verts.size();
    if (n < 2) return;

    const float widthWorld = strokeWidthWorld(p.strokeWidthPx, viewScale);
    const float halfWidth = widthWorld * 0.5f;

    struct SegmentInfo {
        Point2 normal;
        bool valid;
    };

    std::vector<SegmentInfo> segments;
    segments.reserve(n - 1);
    for (std::size_t i = 0; i + 1 < n; i++) {
        const Point2& curr = verts[i];
        const Point2& next = verts[i + 1];
        float dx = next.x - curr.x;
        float dy = next.y - curr.y;
        const float len = std::sqrt(dx * dx + dy * dy);
        if (len <= 1e-6f) {
            segments.push_back(SegmentInfo{{0.0f, 0.0f}, false});
            continue;
        }
        dx /= len;
        dy /= len;
        segments.push_back(SegmentInfo{{-dy, dx}, true});
    }

    std::vector<int> prevValid(n, -1);
    int lastValid = -1;
    for (std::size_t i = 0; i < n; i++) {
        if (i > 0 && segments[i - 1].valid) {
            lastValid = static_cast<int>(i - 1);
        }
        prevValid[i] = lastValid;
    }

    std::vector<int> nextValid(n, -1);
    int nextIdx = -1;
    for (int i = static_cast<int>(n) - 1; i >= 0; i--) {
        if (i < static_cast<int>(n) - 1 && segments[i].valid) {
            nextIdx = i;
        }
        nextValid[i] = nextIdx;
    }

    auto buildMiter = [&](const Point2& n1, const Point2& n2) {
        Point2 sum{n1.x + n2.x, n1.y + n2.y};
        const float slen = std::sqrt(sum.x * sum.x + sum.y * sum.y);
        Point2 dir = (slen > 1e-6f) ? Point2{sum.x / slen, sum.y / slen} : n1;
        float cosHalf = dir.x * n1.x + dir.y * n1.y;
        if (cosHalf < 0.2f) cosHalf = 0.2f;
        const float miterLen = halfWidth / cosHalf;
        return Point2{dir.x * miterLen, dir.y * miterLen};
    };

    struct Offset {
        Point2 left;
        Point2 right;
        bool valid;
    };

    std::vector<Offset> offsets(n);
    for (std::size_t i = 0; i < n; i++) {
        const Point2& center = verts[i];
        const int prevIdx = prevValid[i];
        const int nextIdxItem = nextValid[i];
        Point2 left{};
        Point2 right{};
        bool valid = false;

        if (prevIdx >= 0 && nextIdxItem >= 0) {
            const Point2& nPrev = segments[prevIdx].normal;
            const Point2& nNext = segments[nextIdxItem].normal;
            const Point2 miterLeft = buildMiter(nPrev, nNext);
            const Point2 miterRight = buildMiter(Point2{-nPrev.x, -nPrev.y}, Point2{-nNext.x, -nNext.y});
            left = Point2{center.x + miterLeft.x, center.y + miterLeft.y};
            right = Point2{center.x + miterRight.x, center.y + miterRight.y};
            valid = true;
        } else if (nextIdxItem >= 0) {
            const Point2& nNext = segments[nextIdxItem].normal;
            left = Point2{center.x + nNext.x * halfWidth, center.y + nNext.y * halfWidth};
            right = Point2{center.x - nNext.x * halfWidth, center.y - nNext.y * halfWidth};
            valid = true;
        } else if (prevIdx >= 0) {
            const Point2& nPrev = segments[prevIdx].normal;
            left = Point2{center.x + nPrev.x * halfWidth, center.y + nPrev.y * halfWidth};
            right = Point2{center.x - nPrev.x * halfWidth, center.y - nPrev.y * halfWidth};
            valid = true;
        }

        offsets[i] = Offset{left, right, valid};
    }

    constexpr float z = 0.0f;
    for (std::size_t i = 0; i + 1 < n; i++) {
        if (!segments[i].valid) continue;
        const Offset& o0 = offsets[i];
        const Offset& o1 = offsets[i + 1];
        if (!o0.valid || !o1.valid) continue;
        pushVertexColored(o0.left.x, o0.left.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(o1.left.x, o1.left.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(o0.right.x, o0.right.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(o1.left.x, o1.left.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(o1.right.x, o1.right.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
        pushVertexColored(o0.right.x, o0.right.y, z, p.sr, p.sg, p.sb, a, triangleVertices);
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

    const float widthWorld = strokeWidthWorld(ar.strokeWidthPx, viewScale);
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

bool buildEntityRenderData(
    std::uint32_t entityId,
    const EntityRef& ref,
    const std::vector<RectRec>& rects,
    const std::vector<LineRec>& lines,
    const std::vector<PolyRec>& polylines,
    const std::vector<Point2>& points,
    const std::vector<CircleRec>& circles,
    const std::vector<PolygonRec>& polygons,
    const std::vector<ArrowRec>& arrows,
    float viewScale,
    std::vector<float>& triangleVertices,
    void* resolveCtx,
    EntityVisibilityFn isVisible,
    ResolveStyleFn resolveStyle
) {
    if (isVisible && !isVisible(resolveCtx, entityId)) return false;

    const std::size_t start = triangleVertices.size();
    std::vector<Point2> tmpVerts;
    ResolvedShapeStyle resolved{};
    const bool hasResolved = resolveStyle && resolveStyle(resolveCtx, entityId, ref.kind, resolved);

    if (ref.kind == EntityKind::Rect) {
        RectRec r = rects[ref.index];
        if (hasResolved) applyRectStyle(r, resolved);
        addRectFill(r, triangleVertices);
        addRectStroke(r, viewScale, triangleVertices);
    } else if (ref.kind == EntityKind::Line) {
        LineRec l = lines[ref.index];
        if (hasResolved) applyLineStyle(l, resolved);
        if (l.enabled > 0.5f) {
            const float a = clamp01(l.a);
            if (a > 0.0f) {
                const float widthWorld = strokeWidthWorld(l.strokeWidthPx, viewScale);
                addSegmentQuad(l.x0, l.y0, l.x1, l.y1, widthWorld, l.r, l.g, l.b, a, triangleVertices);
            }
        }
    } else if (ref.kind == EntityKind::Polyline) {
        PolyRec pl = polylines[ref.index];
        if (hasResolved) applyPolylineStyle(pl, resolved);
        if (pl.count >= 2 && pl.enabled > 0.5f) {
            addPolylineStroke(pl, viewScale, points, tmpVerts, triangleVertices);
        }
    } else if (ref.kind == EntityKind::Circle) {
        CircleRec c = circles[ref.index];
        if (hasResolved) applyCircleStyle(c, resolved);
        addCircleFill(c, triangleVertices);
        addCircleStroke(c, viewScale, triangleVertices);
    } else if (ref.kind == EntityKind::Polygon) {
        PolygonRec p = polygons[ref.index];
        if (hasResolved) applyPolygonStyle(p, resolved);
        addPolygonFill(p, tmpVerts, triangleVertices);
        addPolygonStroke(p, viewScale, tmpVerts, triangleVertices);
    } else if (ref.kind == EntityKind::Arrow) {
        ArrowRec a = arrows[ref.index];
        if (hasResolved) applyArrowStyle(a, resolved);
        addArrow(a, viewScale, triangleVertices);
    }

    return triangleVertices.size() > start;
}

void rebuildRenderBuffers(
    const std::vector<RectRec>& rects,
    const std::vector<LineRec>& lines,
    const std::vector<PolyRec>& polylines,
    const std::vector<Point2>& points,
    const std::vector<CircleRec>& circles,
    const std::vector<PolygonRec>& polygons,
    const std::vector<ArrowRec>& arrows,
    const std::unordered_map<std::uint32_t, EntityRef>& entities,
    const std::vector<std::uint32_t>& drawOrderIds,
    float viewScale,
    std::vector<float>& triangleVertices,
    std::vector<float>& lineVertices,
    void* resolveCtx,
    EntityVisibilityFn isVisible,
    ResolveStyleFn resolveStyle,
    std::unordered_map<std::uint32_t, RenderRange>* outRanges
) {
    triangleVertices.clear();
    lineVertices.clear();
    if (outRanges) outRanges->clear();

    (void)viewScale; // Stroke widths now live in world space, so view scale is unused.

    // Build a deterministic, complete draw order: requested order first, then remaining renderables sorted by id.
    std::vector<std::uint32_t> ordered;
    ordered.reserve(entities.size());
    std::unordered_set<std::uint32_t> seen;
    seen.reserve(entities.size());

    auto isRenderable = [](EntityKind k) {
        return k == EntityKind::Rect || k == EntityKind::Line || k == EntityKind::Polyline || k == EntityKind::Circle || k == EntityKind::Polygon || k == EntityKind::Arrow;
    };
    auto isEntityVisible = [&](std::uint32_t id) {
        return isVisible == nullptr || isVisible(resolveCtx, id);
    };

    for (const auto& id : drawOrderIds) {
        const auto it = entities.find(id);
        if (it == entities.end()) continue;
        if (!isRenderable(it->second.kind)) continue;
        if (!isEntityVisible(id)) continue;
        if (seen.insert(id).second) ordered.push_back(id);
    }

    std::vector<std::uint32_t> missing;
    missing.reserve(entities.size());
    for (const auto& kv : entities) {
        const std::uint32_t id = kv.first;
        if (seen.find(id) != seen.end()) continue;
        if (!isRenderable(kv.second.kind)) continue;
        if (!isEntityVisible(id)) continue;
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
        if (!isEntityVisible(r.id)) continue;
        triangleBudget += rectTriangleFloats;
        if (r.strokeEnabled > 0.5f && clamp01(r.sa) > 0.0f) {
            triangleBudget += 4 * quadFloats; // four sides
        }
    }

    for (const auto& l : lines) {
        if (!isEntityVisible(l.id)) continue;
        if (!(l.enabled > 0.5f) || !(clamp01(l.a) > 0.0f)) continue;
        triangleBudget += quadFloats;
    }

    for (const auto& pl : polylines) {
        if (!isEntityVisible(pl.id)) continue;
        if (!(pl.enabled > 0.5f) || !(clamp01(pl.a) > 0.0f) || pl.count < 2) continue;
        const std::uint32_t segments = (pl.count > 0 ? pl.count - 1 : 0);
        triangleBudget += static_cast<std::size_t>(segments) * quadFloats;
    }

    for (const auto& c : circles) {
        if (!isEntityVisible(c.id)) continue;
        if (c.a > 0.0f) {
            triangleBudget += circleSegments * triFloats; // fill: center + two outer verts per segment
        }
        if (c.strokeEnabled > 0.5f && clamp01(c.sa) > 0.0f) {
            triangleBudget += circleSegments * quadFloats; // stroke ring
        }
    }

    for (const auto& p : polygons) {
        if (!isEntityVisible(p.id)) continue;
        const std::uint32_t sides = std::max<std::uint32_t>(3u, p.sides);
        if (p.a > 0.0f) {
            triangleBudget += static_cast<std::size_t>(sides) * triFloats;
        }
        if (p.strokeEnabled > 0.5f && clamp01(p.sa) > 0.0f) {
            triangleBudget += static_cast<std::size_t>(sides) * quadFloats;
        }
    }

    for (const auto& a : arrows) {
        if (!isEntityVisible(a.id)) continue;
        if (!(a.strokeEnabled > 0.5f) || !(clamp01(a.sa) > 0.0f)) continue;
        triangleBudget += quadFloats; // shaft quad
        triangleBudget += triFloats;  // head triangle
    }

    if (triangleBudget > 0) {
        triangleVertices.reserve(triangleBudget);
    }

    for (const auto& id : ordered) {
        if (!isEntityVisible(id)) continue;
        const auto it = entities.find(id);
        if (it == entities.end()) continue;
        const EntityRef ref = it->second;
        const std::size_t start = triangleVertices.size();
        const bool appended = buildEntityRenderData(
            id,
            ref,
            rects,
            lines,
            polylines,
            points,
            circles,
            polygons,
            arrows,
            viewScale,
            triangleVertices,
            resolveCtx,
            isVisible,
            resolveStyle
        );
        if (outRanges && appended) {
            const std::size_t end = triangleVertices.size();
            outRanges->emplace(id, RenderRange{
                static_cast<std::uint32_t>(start),
                static_cast<std::uint32_t>(end - start),
            });
        }
    }
}

} // namespace engine
