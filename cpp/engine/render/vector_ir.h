#ifndef ELETROCAD_ENGINE_VECTOR_IR_H
#define ELETROCAD_ENGINE_VECTOR_IR_H

#include "engine/core/types.h"

#include <cstdint>
#include <vector>

namespace engine::vector {

// Mirrors frontend/types VectorDocumentV1 semantics, but uses an internal, native-friendly representation.

enum class FillRule : std::uint8_t { NonZero = 0, EvenOdd = 1 };

struct Transform2D {
    // SVG/canvas-style affine matrix:
    // [ a c e ]
    // [ b d f ]
    // [ 0 0 1 ]
    float a{1.0f};
    float b{0.0f};
    float c{0.0f};
    float d{1.0f};
    float e{0.0f};
    float f{0.0f};
};

inline Point2 applyTransform(const Transform2D& t, const Point2& p) noexcept {
    return Point2{
        t.a * p.x + t.c * p.y + t.e,
        t.b * p.x + t.d * p.y + t.f,
    };
}

enum class SegmentKind : std::uint8_t { Move = 0, Line = 1, Quad = 2, Cubic = 3, Arc = 4, Close = 5 };

struct Segment {
    SegmentKind kind{SegmentKind::Move};
    // For Move/Line: to
    // For Quad: c, to
    // For Cubic: c1, c2, to
    // For Arc: center, radius (rx,ry), rotation, startAngle, endAngle, ccw
    Point2 to{};
    Point2 c{};
    Point2 c1{};
    Point2 c2{};
    Point2 center{};
    Point2 radius{};
    float rotation{0.0f};
    float startAngle{0.0f};
    float endAngle{0.0f};
    bool ccw{false};

    static Segment moveTo(Point2 p) noexcept {
        Segment s;
        s.kind = SegmentKind::Move;
        s.to = p;
        return s;
    }
    static Segment lineTo(Point2 p) noexcept {
        Segment s;
        s.kind = SegmentKind::Line;
        s.to = p;
        return s;
    }
    static Segment quadTo(Point2 control, Point2 p) noexcept {
        Segment s;
        s.kind = SegmentKind::Quad;
        s.c = control;
        s.to = p;
        return s;
    }
    static Segment cubicTo(Point2 control1, Point2 control2, Point2 p) noexcept {
        Segment s;
        s.kind = SegmentKind::Cubic;
        s.c1 = control1;
        s.c2 = control2;
        s.to = p;
        return s;
    }
    static Segment arcTo(Point2 arcCenter, Point2 arcRadius, float arcRotation, float arcStartAngle, float arcEndAngle, bool arcCcw) noexcept {
        Segment s;
        s.kind = SegmentKind::Arc;
        s.center = arcCenter;
        s.radius = arcRadius;
        s.rotation = arcRotation;
        s.startAngle = arcStartAngle;
        s.endAngle = arcEndAngle;
        s.ccw = arcCcw;
        return s;
    }
    static Segment close() noexcept {
        Segment s;
        s.kind = SegmentKind::Close;
        return s;
    }
};

struct Path {
    std::uint32_t id{0};
    std::vector<Segment> segments;
    bool closed{false};
};

enum class StrokeJoin : std::uint8_t { Miter = 0, Round = 1, Bevel = 2 };
enum class StrokeCap : std::uint8_t { Butt = 0, Round = 1, Square = 2 };

struct StrokeStyle {
    float r{0.0f};
    float g{0.0f};
    float b{0.0f};
    float a{1.0f};
    float widthPx{1.0f};
    StrokeJoin join{StrokeJoin::Miter};
    StrokeCap cap{StrokeCap::Butt};
    float miterLimit{4.0f};
    std::vector<float> dash; // alternating on/off lengths in px
    float dashOffset{0.0f};
};

struct FillStyle {
    float r{0.0f};
    float g{0.0f};
    float b{0.0f};
    float a{1.0f};
};

struct Style {
    bool fillEnabled{false};
    FillStyle fill{};
    bool strokeEnabled{false};
    StrokeStyle stroke{};
    FillRule fillRule{FillRule::NonZero};
    float opacity{1.0f};
};

struct Draw {
    std::uint32_t id{0};
    std::uint32_t pathId{0};
    Style style{};
    Transform2D transform{};
    bool hasTransform{false};
    // clipStack omitted for PR4 core tessellation (handled in later PRs).
};

struct DocumentV1 {
    std::vector<Path> paths;
    std::vector<Draw> draws;
};

} // namespace engine::vector

#endif // ELETROCAD_ENGINE_VECTOR_IR_H

