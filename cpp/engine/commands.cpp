#include "engine/commands.h"
#include "engine/util.h"
#include "engine/types.h"

#include <stdexcept>

namespace engine {

void parseCommandBuffer(const std::uint8_t* src, std::uint32_t byteCount, CommandCallback cb, void* ctx) {
    if (!src || byteCount < commandHeaderBytes) {
        throw std::runtime_error("Invalid command buffer payload");
    }

    const std::uint32_t magic = readU32(src, 0);
    if (magic != commandMagicEwdc) {
        throw std::runtime_error("Command buffer magic mismatch");
    }
    const std::uint32_t version = readU32(src, 4);
    if (version != 1) {
        throw std::runtime_error("Unsupported command buffer version");
    }
    const std::uint32_t commandCount = readU32(src, 8);

    std::size_t o = commandHeaderBytes;
    for (std::uint32_t i = 0; i < commandCount; i++) {
        if (o + perCommandHeaderBytes > byteCount) {
            throw std::runtime_error("Command buffer truncated (header)");
        }
        const std::uint32_t op = readU32(src, o); o += 4;
        const std::uint32_t id = readU32(src, o); o += 4;
        const std::uint32_t payloadByteCount = readU32(src, o); o += 4;
        o += 4; // reserved

        if (o + payloadByteCount > byteCount) {
            throw std::runtime_error("Command buffer truncated (payload)");
        }

        const std::uint8_t* payload = src + o;
        if (cb) cb(ctx, op, id, payload, payloadByteCount);

        o += payloadByteCount;
    }
}

} // namespace engine
