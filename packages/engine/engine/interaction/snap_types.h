#pragma once

#include <cstdint>

enum class SnapTargetKind : std::uint16_t {
    None = 0,
    Endpoint = 1,
    Midpoint = 2,
    Center = 3,
};

struct SnapGuide {
    float x0;
    float y0;
    float x1;
    float y1;
};

struct SnapHit {
    SnapTargetKind kind{SnapTargetKind::None};
    float x{0.0f};
    float y{0.0f};
};
