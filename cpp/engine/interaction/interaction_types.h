#pragma once

#include <cstdint>

enum class TransformMode : std::uint8_t {
    Move = 0,
    VertexDrag = 1,
    EdgeDrag = 2,
    Resize = 3,
    Rotate = 4,
    SideResize = 5  // Constrained resize (N/E/S/W handles)
};

enum class TransformOpCode : std::uint8_t {
    MOVE = 1,
    VERTEX_SET = 2,
    RESIZE = 3,
    ROTATE = 4,
    SIDE_RESIZE = 5
};

// Transform state for UI feedback (tooltips, etc.)
struct TransformState {
    bool active = false;
    std::uint8_t mode = 0;  // TransformMode as uint8
    float rotationDeltaDeg = 0.0f;  // For Rotate mode: accumulated rotation angle
    float pivotX = 0.0f;  // For Rotate mode: pivot point X
    float pivotY = 0.0f;  // For Rotate mode: pivot point Y
};
