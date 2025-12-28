#pragma once

#include <cstdint>

enum class TransformMode : std::uint8_t {
    Move = 0,
    VertexDrag = 1,
    EdgeDrag = 2,
    Resize = 3
};

enum class TransformOpCode : std::uint8_t {
    MOVE = 1,
    VERTEX_SET = 2,
    RESIZE = 3
};
