#pragma once

#include <cstdint>

constexpr std::uint32_t kEnginePluginAbiV1 = 1;

extern "C" {
struct EnginePluginApiV1 {
    std::uint32_t abi_version;
    std::uint32_t (*handle_command)(
        void* engine,
        std::uint32_t op,
        std::uint32_t id,
        const std::uint8_t* payload,
        std::uint32_t payloadByteCount);
};
}
