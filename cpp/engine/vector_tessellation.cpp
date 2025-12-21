#include "engine/vector_tessellation.h"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <limits>

namespace engine::vector {

namespace {

static constexpr float zPlane = 0.0f;
static constexpr float eps = 1e-6f;

struct Float4 {
    float r{0.0f};
    float g{0.0f};
    float b{0.0f};
    float a{1.0f};
};

inline float clamp01(float v) noexcept {
    if (!std::isfinite(v)) return 0.0f;
    return std::min(1.0f, std::max(0.0f, v));
}

inline void pushVertex(float x, float y, const Float4& c, std::vector<float>& out) {
    out.push_back(x);
    out.push_back(y);
    out.push_back(zPlane);
    out.push_back(c.r);
    out.push_back(c.g);
    out.push_back(c.b);
    out.push_back(c.a);
}

inline Point2 sub(const Point2& a, const Point2& b) noexcept { return Point2{a.x - b.x, a.y - b.y}; }
inline Point2 add(const Point2& a, const Point2& b) noexcept { return Point2{a.x + b.x, a.y + b.y}; }
inline Point2 mul(const Point2& a, float s) noexcept { return Point2{a.x * s, a.y * s}; }

inline float dot(const Point2& a, const Point2& b) noexcept { return a.x * b.x + a.y * b.y; }
inline float cross(const Point2& a, const Point2& b) noexcept { return a.x * b.y - a.y * b.x; }
inline float len2(const Point2& v) noexcept { return dot(v, v); }
inline float len(const Point2& v) noexcept { return std::sqrt(len2(v)); }

inline Point2 normalizeOrZero(const Point2& v) noexcept {
    const float l = len(v);
    if (!(l > eps)) return Point2{0.0f, 0.0f};
    const float inv = 1.0f / l;
    return Point2{v.x * inv, v.y * inv};
}

inline Point2 perp(const Point2& v) noexcept { return Point2{-v.y, v.x}; }

static void pushUniquePoint(const Point2& p, std::vector<Point2>& out, float minDist2) {
    if (out.empty()) {
        out.push_back(p);
        return;
    }
    const Point2 d = sub(p, out.back());
    if (len2(d) <= minDist2) return;
    out.push_back(p);
}

static float pointLineDistance(const Point2& p, const Point2& a, const Point2& b) noexcept {
    const Point2 ab = sub(b, a);
    const float abLen2 = len2(ab);
    if (!(abLen2 > eps)) return len(sub(p, a));
    const float t = dot(sub(p, a), ab) / abLen2;
    const float clamped = std::min(1.0f, std::max(0.0f, t));
    const Point2 proj = add(a, mul(ab, clamped));
    return len(sub(p, proj));
}

static void flattenQuadratic(
    const Point2& p0,
    const Point2& c,
    const Point2& p1,
    float tolWorld,
    std::vector<QuadWork>& stack,
    std::vector<Point2>& out
) {
    // Iterative subdivision (stack) to avoid recursion in hot path.
    stack.clear();
    stack.push_back(QuadWork{p0, c, p1});

    const float minDist2 = tolWorld * tolWorld * 0.25f;
    while (!stack.empty()) {
        const QuadWork w = stack.back();
        stack.pop_back();

        const float d = pointLineDistance(w.c, w.p0, w.p1);
        if (!(d > tolWorld)) {
            pushUniquePoint(w.p1, out, minDist2);
            continue;
        }

        // Subdivide at t=0.5
        const Point2 p0c = mul(add(w.p0, w.c), 0.5f);
        const Point2 cp1 = mul(add(w.c, w.p1), 0.5f);
        const Point2 mid = mul(add(p0c, cp1), 0.5f);
        // Push second half first so first half is processed first (LIFO).
        stack.push_back(QuadWork{mid, cp1, w.p1});
        stack.push_back(QuadWork{w.p0, p0c, mid});
    }
}

static void flattenCubic(
    const Point2& p0,
    const Point2& c1,
    const Point2& c2,
    const Point2& p1,
    float tolWorld,
    std::vector<CubicWork>& stack,
    std::vector<Point2>& out
) {
    stack.clear();
    stack.push_back(CubicWork{p0, c1, c2, p1});

    const float minDist2 = tolWorld * tolWorld * 0.25f;
    while (!stack.empty()) {
        const CubicWork w = stack.back();
        stack.pop_back();

        const float d1 = pointLineDistance(w.c1, w.p0, w.p1);
        const float d2 = pointLineDistance(w.c2, w.p0, w.p1);
        const float d = std::max(d1, d2);
        if (!(d > tolWorld)) {
            pushUniquePoint(w.p1, out, minDist2);
            continue;
        }

        // De Casteljau subdivision at t=0.5
        const Point2 p01 = mul(add(w.p0, w.c1), 0.5f);
        const Point2 p12 = mul(add(w.c1, w.c2), 0.5f);
        const Point2 p23 = mul(add(w.c2, w.p1), 0.5f);
        const Point2 p012 = mul(add(p01, p12), 0.5f);
        const Point2 p123 = mul(add(p12, p23), 0.5f);
        const Point2 mid = mul(add(p012, p123), 0.5f);

        stack.push_back(CubicWork{mid, p123, p23, w.p1});
        stack.push_back(CubicWork{w.p0, p01, p012, mid});
    }
}

static float normalizeAngle01(float a) noexcept {
    // Wrap to [-pi, pi] range for stable stepping.
    constexpr float twoPi = 2.0f * static_cast<float>(M_PI);
    float x = std::fmod(a, twoPi);
    if (x > static_cast<float>(M_PI)) x -= twoPi;
    if (x < -static_cast<float>(M_PI)) x += twoPi;
    return x;
}

static void flattenArc(
    const Point2& center,
    const Point2& radius,
    float rotation,
    float startAngle,
    float endAngle,
    bool ccw,
    float tolWorld,
    std::vector<Point2>& out
) {
    const float rx = std::max(0.0f, std::abs(radius.x));
    const float ry = std::max(0.0f, std::abs(radius.y));
    const float rMax = std::max(rx, ry);
    if (!(rMax > eps)) return;

    const float dTheta = normalizeAngle01(endAngle - startAngle);
    float sweep = dTheta;
    if (ccw) {
        if (sweep < 0.0f) sweep += 2.0f * static_cast<float>(M_PI);
    } else {
        if (sweep > 0.0f) sweep -= 2.0f * static_cast<float>(M_PI);
    }
    const float absSweep = std::abs(sweep);
    if (!(absSweep > eps)) return;

    // Angle step based on sagitta tolerance for the largest radius.
    float step = absSweep;
    if (tolWorld > 0.0f && rMax > tolWorld) {
        const float cosv = 1.0f - std::min(1.0f, tolWorld / rMax);
        const float acosv = std::acos(std::max(-1.0f, std::min(1.0f, cosv)));
        const float maxStep = std::max(1e-3f, 2.0f * acosv);
        step = std::min(step, maxStep);
    } else {
        step = std::min(step, 0.15f);
    }

    const int segments = std::max(1, static_cast<int>(std::ceil(absSweep / step)));
    const float cosR = rotation ? std::cos(rotation) : 1.0f;
    const float sinR = rotation ? std::sin(rotation) : 0.0f;

    const float minDist2 = tolWorld * tolWorld * 0.25f;
    for (int i = 1; i <= segments; i++) {
        const float t = static_cast<float>(i) / static_cast<float>(segments);
        const float a = startAngle + sweep * t;
        const float xLocal = std::cos(a) * rx;
        const float yLocal = std::sin(a) * ry;
        const float x = center.x + xLocal * cosR - yLocal * sinR;
        const float y = center.y + xLocal * sinR + yLocal * cosR;
        pushUniquePoint(Point2{x, y}, out, minDist2);
    }
}

static void flattenPathToContours(
    const Path& path,
    const Transform2D* transform,
    float tolWorld,
    std::vector<QuadWork>& quadStack,
    std::vector<CubicWork>& cubicStack,
    std::vector<Point2>& outPoints,
    std::vector<std::uint32_t>& outStarts,
    std::vector<std::uint8_t>& outClosedFlags
) {
    outPoints.clear();
    outStarts.clear();
    outClosedFlags.clear();

    Point2 curr{0.0f, 0.0f};
    Point2 start{0.0f, 0.0f};
    bool hasCurr = false;
    bool contourOpen = false;
    bool contourClosed = false;

    const auto xform = [&](const Point2& p) -> Point2 {
        return transform ? applyTransform(*transform, p) : p;
    };

    const float minDist2 = tolWorld * tolWorld * 0.25f;
    const auto startContour = [&](const Point2& p) {
        outStarts.push_back(static_cast<std::uint32_t>(outPoints.size()));
        outClosedFlags.push_back(0);
        contourOpen = true;
        contourClosed = false;
        pushUniquePoint(p, outPoints, minDist2);
    };
    const auto closeContour = [&]() {
        if (!contourOpen || !hasCurr) return;
        pushUniquePoint(start, outPoints, minDist2);
        contourClosed = true;
        outClosedFlags.back() = 1;
    };

    for (const Segment& seg : path.segments) {
        switch (seg.kind) {
            case SegmentKind::Move: {
                if (contourOpen && outPoints.size() - outStarts.back() >= 2) {
                    // Finalize previous contour; if it has only one point, keep it but it won't render.
                }
                curr = xform(seg.to);
                start = curr;
                hasCurr = true;
                startContour(curr);
                break;
            }
            case SegmentKind::Line: {
                if (!hasCurr || !contourOpen) {
                    curr = xform(seg.to);
                    start = curr;
                    hasCurr = true;
                    startContour(curr);
                    break;
                }
                curr = xform(seg.to);
                pushUniquePoint(curr, outPoints, minDist2);
                break;
            }
            case SegmentKind::Quad: {
                if (!hasCurr || !contourOpen) {
                    curr = xform(seg.to);
                    start = curr;
                    hasCurr = true;
                    startContour(curr);
                    break;
                }
                const Point2 c = xform(seg.c);
                const Point2 to = xform(seg.to);
                flattenQuadratic(curr, c, to, tolWorld, quadStack, outPoints);
                curr = to;
                break;
            }
            case SegmentKind::Cubic: {
                if (!hasCurr || !contourOpen) {
                    curr = xform(seg.to);
                    start = curr;
                    hasCurr = true;
                    startContour(curr);
                    break;
                }
                const Point2 c1 = xform(seg.c1);
                const Point2 c2 = xform(seg.c2);
                const Point2 to = xform(seg.to);
                flattenCubic(curr, c1, c2, to, tolWorld, cubicStack, outPoints);
                curr = to;
                break;
            }
            case SegmentKind::Arc: {
                // Arcs are absolute.
                const Point2 center = xform(seg.center);
                const Point2 radius = seg.radius;
                float rotation = seg.rotation;
                if (transform) {
                    // Basic handling: apply linear part to rotation only when transform is pure rotation+scale.
                    // General affine with shear isn't supported in PR4 core.
                    const float det = transform->a * transform->d - transform->b * transform->c;
                    if (std::abs(det) > eps) rotation += std::atan2(transform->b, transform->a);
                }
                if (!contourOpen) {
                    const float rx = std::max(0.0f, std::abs(radius.x));
                    const float ry = std::max(0.0f, std::abs(radius.y));
                    const float cosR = rotation ? std::cos(rotation) : 1.0f;
                    const float sinR = rotation ? std::sin(rotation) : 0.0f;
                    const float xLocal = std::cos(seg.startAngle) * rx;
                    const float yLocal = std::sin(seg.startAngle) * ry;
                    curr = Point2{center.x + xLocal * cosR - yLocal * sinR, center.y + xLocal * sinR + yLocal * cosR};
                    start = curr;
                    hasCurr = true;
                    startContour(curr);
                }
                flattenArc(center, radius, rotation, seg.startAngle, seg.endAngle, seg.ccw, tolWorld, outPoints);
                // Update current point to arc end.
                const float rx = std::max(0.0f, std::abs(radius.x));
                const float ry = std::max(0.0f, std::abs(radius.y));
                const float cosR = rotation ? std::cos(rotation) : 1.0f;
                const float sinR = rotation ? std::sin(rotation) : 0.0f;
                const float xLocal = std::cos(seg.endAngle) * rx;
                const float yLocal = std::sin(seg.endAngle) * ry;
                curr = Point2{center.x + xLocal * cosR - yLocal * sinR, center.y + xLocal * sinR + yLocal * cosR};
                hasCurr = true;
                break;
            }
            case SegmentKind::Close: {
                closeContour();
                break;
            }
        }
    }
    if (path.closed) {
        closeContour();
    }
}

static float signedArea(const std::vector<Point2>& poly) noexcept {
    if (poly.size() < 3) return 0.0f;
    double a = 0.0;
    for (std::size_t i = 0; i < poly.size(); i++) {
        const Point2& p = poly[i];
        const Point2& q = poly[(i + 1) % poly.size()];
        a += static_cast<double>(p.x) * static_cast<double>(q.y) - static_cast<double>(q.x) * static_cast<double>(p.y);
    }
    return static_cast<float>(0.5 * a);
}

static bool pointInTriangle(const Point2& p, const Point2& a, const Point2& b, const Point2& c) noexcept {
    // Barycentric via cross products, allowing points on edges.
    const Point2 ab = sub(b, a);
    const Point2 bc = sub(c, b);
    const Point2 ca = sub(a, c);
    const Point2 ap = sub(p, a);
    const Point2 bp = sub(p, b);
    const Point2 cp = sub(p, c);
    const float c1 = cross(ab, ap);
    const float c2 = cross(bc, bp);
    const float c3 = cross(ca, cp);
    const bool hasNeg = (c1 < -eps) || (c2 < -eps) || (c3 < -eps);
    const bool hasPos = (c1 > eps) || (c2 > eps) || (c3 > eps);
    return !(hasNeg && hasPos);
}

static void triangulateSimplePolygonEarClip(
    const std::vector<Point2>& poly,
    std::vector<std::uint32_t>& outIndices,
    std::vector<std::uint32_t>& work
) {
    outIndices.clear();
    const std::size_t n = poly.size();
    if (n < 3) return;

    work.clear();
    work.reserve(n);
    for (std::uint32_t i = 0; i < n; i++) work.push_back(i);

    const float area = signedArea(poly);
    const bool ccw = area > 0.0f;

    auto isConvex = [&](const Point2& prev, const Point2& curr, const Point2& next) -> bool {
        const float z = cross(sub(curr, prev), sub(next, curr));
        return ccw ? (z > eps) : (z < -eps);
    };

    // O(n^2) ear clip; intended for small-ish paths in PR4.
    std::size_t guard = 0;
    while (work.size() > 3 && guard++ < n * n) {
        bool earFound = false;
        for (std::size_t i = 0; i < work.size(); i++) {
            const std::size_t i0 = (i + work.size() - 1) % work.size();
            const std::size_t i1 = i;
            const std::size_t i2 = (i + 1) % work.size();
            const std::uint32_t ia = work[i0];
            const std::uint32_t ib = work[i1];
            const std::uint32_t ic = work[i2];
            const Point2& a = poly[ia];
            const Point2& b = poly[ib];
            const Point2& c = poly[ic];

            if (!isConvex(a, b, c)) continue;

            bool contains = false;
            for (std::size_t j = 0; j < work.size(); j++) {
                if (j == i0 || j == i1 || j == i2) continue;
                const Point2& p = poly[work[j]];
                if (pointInTriangle(p, a, b, c)) {
                    contains = true;
                    break;
                }
            }
            if (contains) continue;

            if (ccw) {
                outIndices.push_back(ia);
                outIndices.push_back(ib);
                outIndices.push_back(ic);
            } else {
                outIndices.push_back(ia);
                outIndices.push_back(ic);
                outIndices.push_back(ib);
            }
            work.erase(work.begin() + static_cast<std::ptrdiff_t>(i1));
            earFound = true;
            break;
        }
        if (!earFound) break;
    }
    if (work.size() == 3) {
        if (ccw) {
            outIndices.push_back(work[0]);
            outIndices.push_back(work[1]);
            outIndices.push_back(work[2]);
        } else {
            outIndices.push_back(work[0]);
            outIndices.push_back(work[2]);
            outIndices.push_back(work[1]);
        }
    }
}

static bool applyDash(
    const std::vector<Point2>& in,
    const std::vector<float>& dashPx,
    float dashOffsetPx,
    float viewScale,
    std::vector<Point2>& out
) {
    out.clear();
    if (in.size() < 2) return false;
    if (dashPx.empty()) {
        out.assign(in.begin(), in.end());
        return true;
    }
    float total = 0.0f;
    for (float d : dashPx) total += std::max(0.0f, d);
    if (!(total > eps)) {
        out.assign(in.begin(), in.end());
        return true;
    }
    const float worldPerPx = 1.0f / std::max(viewScale, eps);

    // Normalize offset into [0,total)
    float offset = std::fmod(dashOffsetPx, total);
    if (offset < 0.0f) offset += total;

    std::size_t dashIndex = 0;
    float dashRemainingPx = dashPx[0] - offset;
    while (dashRemainingPx <= 0.0f && dashIndex + 1 < dashPx.size()) {
        dashIndex++;
        dashRemainingPx += dashPx[dashIndex];
    }
    bool on = (dashIndex % 2) == 0;

    Point2 curr = in[0];
    if (on) out.push_back(curr);
    for (std::size_t i = 0; i + 1 < in.size(); i++) {
        Point2 a = in[i];
        Point2 b = in[i + 1];
        Point2 d = sub(b, a);
        float segLenWorld = len(d);
        if (!(segLenWorld > eps)) continue;
        Point2 dir = mul(d, 1.0f / segLenWorld);

        float remainingWorld = segLenWorld;
        Point2 p = a;
        while (remainingWorld > eps) {
            const float stepWorld = std::min(remainingWorld, dashRemainingPx * worldPerPx);
            const Point2 q = add(p, mul(dir, stepWorld));
            remainingWorld -= stepWorld;
            dashRemainingPx -= stepWorld / worldPerPx;

            if (on) {
                if (out.empty()) out.push_back(p);
                out.push_back(q);
            } else {
                // gap: ensure new "on" segment starts clean
            }

            p = q;
            if (dashRemainingPx <= eps) {
                dashIndex = (dashIndex + 1) % dashPx.size();
                dashRemainingPx = dashPx[dashIndex];
                on = (dashIndex % 2) == 0;
                if (on) {
                    out.push_back(p);
                }
            }
        }
        curr = b;
    }
    return out.size() >= 2;
}

static void tessellateStrokePolyline(
    const std::vector<Point2>& polyline,
    bool closed,
    const StrokeStyle& stroke,
    float opacity,
    const TessellateOptions& opt,
    std::vector<Point2>& scratchPts,
    std::vector<Point2>& scratchLeft,
    std::vector<Point2>& scratchRight,
    std::vector<float>& outTriangles
) {
    if (polyline.size() < 2) return;
    if (!(stroke.widthPx > 0.0f)) return;

    const float viewScale = std::max(opt.viewScale, eps);
    const float halfWidthWorld = (stroke.widthPx / viewScale) * 0.5f;
    if (!(halfWidthWorld > 0.0f)) return;

    scratchPts.assign(polyline.begin(), polyline.end());

    if (closed && scratchPts.size() >= 2) {
        const Point2 d = sub(scratchPts.front(), scratchPts.back());
        if (len2(d) <= eps * eps) scratchPts.pop_back();
    }
    if (closed) {
        if (scratchPts.size() < 3) return;
    } else {
        if (scratchPts.size() < 2) return;
    }

    const Point2 d0 = normalizeOrZero(sub(scratchPts[1], scratchPts[0]));
    const Point2 dn = normalizeOrZero(sub(scratchPts[scratchPts.size() - 1], scratchPts[scratchPts.size() - 2]));
    const float capExt = (stroke.cap == StrokeCap::Square) ? halfWidthWorld : 0.0f;
    if (!closed && capExt > 0.0f) {
        scratchPts[0] = sub(scratchPts[0], mul(d0, capExt));
        scratchPts[scratchPts.size() - 1] = add(scratchPts[scratchPts.size() - 1], mul(dn, capExt));
    }

    scratchLeft.resize(scratchPts.size());
    scratchRight.resize(scratchPts.size());

    const auto computeJoinPoint = [&](const Point2& p, const Point2& dir0, const Point2& n0, const Point2& dir1, const Point2& n1, bool leftSide) -> Point2 {
        // Intersect offset lines (p + offset + t*dir).
        const float s = leftSide ? 1.0f : -1.0f;
        const Point2 p0 = add(p, mul(n0, s * halfWidthWorld));
        const Point2 p1 = add(p, mul(n1, s * halfWidthWorld));
        const float denom = cross(dir0, dir1);
        Point2 join = p1;
        if (std::abs(denom) > eps) {
            const float t = cross(sub(p1, p0), dir1) / denom;
            join = add(p0, mul(dir0, t));
        }
        const float miterLimit = (stroke.join == StrokeJoin::Bevel) ? 1.0f : std::max(1.0f, stroke.miterLimit);
        const float maxMiter = miterLimit * halfWidthWorld;
        const Point2 v = sub(join, p);
        const float l = len(v);
        if (l > maxMiter) {
            const float inv = maxMiter / std::max(l, eps);
            join = add(p, mul(v, inv));
        }
        return join;
    };

    if (closed) {
        const std::size_t n = scratchPts.size();
        for (std::size_t i = 0; i < n; i++) {
            const Point2 p = scratchPts[i];
            const Point2 prev = scratchPts[(i + n - 1) % n];
            const Point2 next = scratchPts[(i + 1) % n];
            const Point2 dPrev = normalizeOrZero(sub(p, prev));
            const Point2 dNext = normalizeOrZero(sub(next, p));
            const Point2 nPrev = perp(dPrev);
            const Point2 nNext = perp(dNext);
            scratchLeft[i] = computeJoinPoint(p, dPrev, nPrev, dNext, nNext, true);
            scratchRight[i] = computeJoinPoint(p, dPrev, nPrev, dNext, nNext, false);
        }
    } else {
        // Endpoints
        {
            const Point2 d = normalizeOrZero(sub(scratchPts[1], scratchPts[0]));
            const Point2 n = perp(d);
            scratchLeft[0] = add(scratchPts[0], mul(n, halfWidthWorld));
            scratchRight[0] = add(scratchPts[0], mul(n, -halfWidthWorld));
        }
        for (std::size_t i = 1; i + 1 < scratchPts.size(); i++) {
            const Point2 p = scratchPts[i];
            const Point2 dPrev = normalizeOrZero(sub(p, scratchPts[i - 1]));
            const Point2 dNext = normalizeOrZero(sub(scratchPts[i + 1], p));
            const Point2 nPrev = perp(dPrev);
            const Point2 nNext = perp(dNext);

            scratchLeft[i] = computeJoinPoint(p, dPrev, nPrev, dNext, nNext, true);
            scratchRight[i] = computeJoinPoint(p, dPrev, nPrev, dNext, nNext, false);
        }
        {
            const std::size_t last = scratchPts.size() - 1;
            const Point2 d = normalizeOrZero(sub(scratchPts[last], scratchPts[last - 1]));
            const Point2 n = perp(d);
            scratchLeft[last] = add(scratchPts[last], mul(n, halfWidthWorld));
            scratchRight[last] = add(scratchPts[last], mul(n, -halfWidthWorld));
        }
    }

    const Float4 c{
        stroke.r,
        stroke.g,
        stroke.b,
        clamp01(stroke.a * opacity),
    };
    if (!(c.a > 0.0f)) return;

    // Body strip
    const std::size_t segCount = closed ? scratchPts.size() : (scratchPts.size() - 1);
    outTriangles.reserve(outTriangles.size() + segCount * 6 * 7);
    for (std::size_t i = 0; i < segCount; i++) {
        const std::size_t j = closed ? ((i + 1) % scratchPts.size()) : (i + 1);
        const Point2& l0 = scratchLeft[i];
        const Point2& r0 = scratchRight[i];
        const Point2& l1 = scratchLeft[j];
        const Point2& r1 = scratchRight[j];
        pushVertex(l0.x, l0.y, c, outTriangles);
        pushVertex(r0.x, r0.y, c, outTriangles);
        pushVertex(l1.x, l1.y, c, outTriangles);
        pushVertex(r0.x, r0.y, c, outTriangles);
        pushVertex(r1.x, r1.y, c, outTriangles);
        pushVertex(l1.x, l1.y, c, outTriangles);
    }

    const auto emitRoundCap = [&](const Point2& center, const Point2& dir, bool start) {
        const Point2 n = perp(dir);
        const Point2 leftPt = add(center, mul(n, halfWidthWorld));
        const Point2 rightPt = add(center, mul(n, -halfWidthWorld));
        const float aRight = std::atan2(rightPt.y - center.y, rightPt.x - center.x);
        const float aLeft = std::atan2(leftPt.y - center.y, leftPt.x - center.x);
        const int segments = std::max(8, static_cast<int>(std::ceil(static_cast<float>(M_PI) / 0.25f)));
        const float a0 = start ? aRight : aLeft;
        float sweep = start ? (aLeft - aRight) : (aRight - aLeft);
        if (sweep < 0.0f) sweep += 2.0f * static_cast<float>(M_PI);
        if (sweep > static_cast<float>(M_PI) + 1e-3f) sweep = 2.0f * static_cast<float>(M_PI) - sweep;
        Point2 prev = start ? rightPt : leftPt;
        for (int i = 1; i <= segments; i++) {
            const float t = static_cast<float>(i) / static_cast<float>(segments);
            const float a = a0 + (start ? 1.0f : -1.0f) * sweep * t;
            const Point2 p = add(center, Point2{std::cos(a) * halfWidthWorld, std::sin(a) * halfWidthWorld});
            pushVertex(center.x, center.y, c, outTriangles);
            pushVertex(prev.x, prev.y, c, outTriangles);
            pushVertex(p.x, p.y, c, outTriangles);
            prev = p;
        }
    };

    if (!closed && stroke.cap == StrokeCap::Round) {
        emitRoundCap(scratchPts[0], d0, true);
        emitRoundCap(scratchPts[scratchPts.size() - 1], dn, false);
    }

    if (stroke.join == StrokeJoin::Round && scratchPts.size() >= 3) {
        // Emit outer-corner round joins (overlay).
        const int segments = std::max(6, static_cast<int>(std::ceil(static_cast<float>(M_PI) / 0.25f)));
        const std::size_t n = scratchPts.size();
        const std::size_t start = closed ? 0 : 1;
        const std::size_t end = closed ? n : (n - 1);
        for (std::size_t i = start; i < end; i++) {
            const std::size_t iPrev = (i + n - 1) % n;
            const std::size_t iNext = (i + 1) % n;
            if (!closed && (i == 0 || i + 1 >= n)) continue;
            const Point2 p = scratchPts[i];
            const Point2 dPrev = normalizeOrZero(sub(p, scratchPts[iPrev]));
            const Point2 dNext = normalizeOrZero(sub(scratchPts[iNext], p));
            if (!(len2(dPrev) > eps) || !(len2(dNext) > eps)) continue;
            const float turn = cross(dPrev, dNext);
            if (std::abs(turn) <= eps) continue;

            const bool leftTurn = turn > 0.0f;
            const Point2 nPrev = perp(dPrev);
            const Point2 nNext = perp(dNext);
            const float s = leftTurn ? 1.0f : -1.0f;
            const Point2 aPt = add(p, mul(nPrev, s * halfWidthWorld));
            const Point2 bPt = add(p, mul(nNext, s * halfWidthWorld));

            const float a0 = std::atan2(aPt.y - p.y, aPt.x - p.x);
            const float a1 = std::atan2(bPt.y - p.y, bPt.x - p.x);
            float sweep = a1 - a0;
            if (leftTurn) {
                if (sweep < 0.0f) sweep += 2.0f * static_cast<float>(M_PI);
            } else {
                if (sweep > 0.0f) sweep -= 2.0f * static_cast<float>(M_PI);
            }
            const int segs = std::max(2, static_cast<int>(std::ceil(std::abs(sweep) / (static_cast<float>(M_PI) / segments))));
            Point2 prev = aPt;
            for (int k = 1; k <= segs; k++) {
                const float t = static_cast<float>(k) / static_cast<float>(segs);
                const float a = a0 + sweep * t;
                const Point2 q = add(p, Point2{std::cos(a) * halfWidthWorld, std::sin(a) * halfWidthWorld});
                pushVertex(p.x, p.y, c, outTriangles);
                pushVertex(prev.x, prev.y, c, outTriangles);
                pushVertex(q.x, q.y, c, outTriangles);
                prev = q;
            }
        }
    }
}

static void tessellateFillPolygon(
    const std::vector<Point2>& polygon,
    const FillStyle& fill,
    float opacity,
    std::vector<std::uint32_t>& triIndices,
    std::vector<std::uint32_t>& earWork,
    std::vector<float>& outTriangles
) {
    if (polygon.size() < 3) return;
    const Float4 c{fill.r, fill.g, fill.b, clamp01(fill.a * opacity)};
    if (!(c.a > 0.0f)) return;

    triangulateSimplePolygonEarClip(polygon, triIndices, earWork);
    outTriangles.reserve(outTriangles.size() + triIndices.size() * 7);
    for (std::size_t i = 0; i + 2 < triIndices.size(); i += 3) {
        const Point2& a = polygon[triIndices[i]];
        const Point2& b = polygon[triIndices[i + 1]];
        const Point2& cpt = polygon[triIndices[i + 2]];
        pushVertex(a.x, a.y, c, outTriangles);
        pushVertex(b.x, b.y, c, outTriangles);
        pushVertex(cpt.x, cpt.y, c, outTriangles);
    }
}

} // namespace

void VectorTessellator::ensureScratchCapacity(std::size_t approxSegments) {
    const std::size_t cap = std::max<std::size_t>(approxSegments * 8, 64);
    pathPoints_.reserve(cap);
    contourStarts_.reserve(std::max<std::size_t>(4, approxSegments / 4));
    contourClosed_.reserve(contourStarts_.capacity());
    contour_.reserve(cap);
    dashPolyline_.reserve(cap);
    strokePts_.reserve(cap);
    strokeLeft_.reserve(cap);
    strokeRight_.reserve(cap);

    quadStack_.reserve(std::max<std::size_t>(16, approxSegments));
    cubicStack_.reserve(std::max<std::size_t>(16, approxSegments));

    triIndices_.reserve(cap * 3);
    earWork_.reserve(cap);
}

void VectorTessellator::tessellateDocumentV1(const DocumentV1& doc, const TessellateOptions& opt, std::vector<float>& outTriangles) {
    // Index paths for O(1) draw lookup (reused map to avoid per-call allocations).
    pathById_.clear();
    pathById_.reserve(doc.paths.size());
    for (const auto& p : doc.paths) pathById_[p.id] = &p;

    for (const auto& draw : doc.draws) {
        const auto it = pathById_.find(draw.pathId);
        if (it == pathById_.end()) continue;
        const Path& path = *it->second;

        ensureScratchCapacity(path.segments.size());

        const Transform2D* t = draw.hasTransform ? &draw.transform : nullptr;
        const float tolWorld = opt.tolerancePx / std::max(opt.viewScale, eps);
        flattenPathToContours(path, t, tolWorld, quadStack_, cubicStack_, pathPoints_, contourStarts_, contourClosed_);
        if (contourStarts_.empty()) continue;

        const float opacity = clamp01(draw.style.opacity);

        for (std::size_t ci = 0; ci < contourStarts_.size(); ci++) {
            const std::size_t start = contourStarts_[ci];
            const std::size_t end = (ci + 1 < contourStarts_.size()) ? contourStarts_[ci + 1] : pathPoints_.size();
            if (end <= start) continue;

            contour_.assign(pathPoints_.begin() + static_cast<std::ptrdiff_t>(start), pathPoints_.begin() + static_cast<std::ptrdiff_t>(end));
            if (contour_.size() < 2) continue;

            const bool closed = contourClosed_[ci] != 0;

            if (draw.style.fillEnabled && closed) {
                // Drop duplicated closing point for polygon indexing.
                if (contour_.size() >= 2) {
                    const Point2 d = sub(contour_.front(), contour_.back());
                    if (len2(d) <= tolWorld * tolWorld * 0.25f) contour_.pop_back();
                }
                tessellateFillPolygon(contour_, draw.style.fill, opacity, triIndices_, earWork_, outTriangles);
            }

            if (draw.style.strokeEnabled) {
                const bool hasDash = !draw.style.stroke.dash.empty();
                const std::vector<Point2>& strokeSource = contour_;
                const std::vector<Point2>& dashed = (!closed && hasDash)
                    ? (applyDash(strokeSource, draw.style.stroke.dash, draw.style.stroke.dashOffset, opt.viewScale, dashPolyline_) ? dashPolyline_ : strokeSource)
                    : strokeSource;
                tessellateStrokePolyline(dashed, closed, draw.style.stroke, opacity, opt, strokePts_, strokeLeft_, strokeRight_, outTriangles);
            }
        }
    }
}

} // namespace engine::vector
