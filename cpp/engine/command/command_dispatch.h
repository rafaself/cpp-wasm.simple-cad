#pragma once

#include "engine/core/types.h"
#include <cstdint>

class CadEngine;

namespace engine {

/**
 * CommandDispatcher handles the dispatch of individual commands to the engine.
 * This is a free function that acts as the callback for parseCommandBuffer.
 */
EngineError dispatchCommand(
    CadEngine* engine,
    std::uint32_t op,
    std::uint32_t id,
    const std::uint8_t* payload,
    std::uint32_t payloadByteCount
);

} // namespace engine
