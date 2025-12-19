#ifndef ELETROCAD_ENGINE_COMMANDS_H
#define ELETROCAD_ENGINE_COMMANDS_H

#include <cstdint>
#include <cstddef>

namespace engine {

using CommandCallback = void(*)(void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount);

// Parse a command buffer and invoke the callback for each command.
// Throws std::runtime_error on invalid buffers.
void parseCommandBuffer(const std::uint8_t* src, std::uint32_t byteCount, CommandCallback cb, void* ctx);

}

#endif // ELETROCAD_ENGINE_COMMANDS_H
