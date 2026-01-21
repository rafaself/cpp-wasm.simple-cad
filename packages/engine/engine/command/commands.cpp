#include "engine/command/commands.h"
#include "engine/core/util.h"
#include "engine/core/types.h"

// No exceptions used here anymore.

namespace engine {

EngineError parseCommandBuffer(const std::uint8_t* src, std::uint32_t byteCount, CommandCallback cb, void* ctx) {
    if (!src || byteCount < commandHeaderBytes) {
        return EngineError::BufferTruncated;
    }

    const std::uint32_t magic = readU32(src, 0);
    if (magic != commandMagicEwdc) {
        return EngineError::InvalidMagic;
    }
    const std::uint32_t version = readU32(src, 4);
    if (version != 4) {
        return EngineError::UnsupportedVersion;
    }
    const std::uint32_t commandCount = readU32(src, 8);

    std::size_t o = commandHeaderBytes;
    for (std::uint32_t i = 0; i < commandCount; i++) {
        if (o > byteCount) {
            return EngineError::BufferTruncated;
        }
        if (perCommandHeaderBytes > (byteCount - o)) {
            return EngineError::BufferTruncated;
        }
        const std::uint32_t op = readU32(src, o); o += 4;
        const std::uint32_t id = readU32(src, o); o += 4;
        const std::uint32_t payloadByteCount = readU32(src, o); o += 4;
        o += 4; // reserved

        if (o > byteCount || payloadByteCount > (byteCount - o)) {
            return EngineError::BufferTruncated;
        }

        const std::uint8_t* payload = src + o;
        if (cb) {
            EngineError err = cb(ctx, op, id, payload, payloadByteCount);
            if (err != EngineError::Ok) {
                return err;
            }
        }

        o += payloadByteCount;
    }
    
    return EngineError::Ok;
}

} // namespace engine
