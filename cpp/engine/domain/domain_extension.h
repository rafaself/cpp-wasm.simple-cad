#pragma once

#include "engine/core/types.h"
#include <cstdint>

class CadEngine;

namespace engine::domain {
class DomainExtension {
public:
    virtual ~DomainExtension() = default;
    virtual EngineError handleCommand(
        CadEngine& engine,
        std::uint32_t op,
        std::uint32_t id,
        const std::uint8_t* payload,
        std::uint32_t payloadByteCount) = 0;
};
} // namespace engine::domain
