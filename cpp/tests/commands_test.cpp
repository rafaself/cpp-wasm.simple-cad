#include <gtest/gtest.h>
#include "engine/commands.h"

struct Ctx { int count = 0; };

static EngineError cb(void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount) {
    Ctx* c = reinterpret_cast<Ctx*>(ctx);
    (void)payload; (void)payloadByteCount; (void)id; (void)op;
    c->count++;
    return EngineError::Ok;
}

TEST(CommandsTest, ParseSingle) {
    // Build simple buffer with header + one empty ClearAll command
    std::vector<uint8_t> buf;
    auto pushU32 = [&](uint32_t v){ uint8_t b[4]; memcpy(b,&v,4); buf.insert(buf.end(), b, b+4); };

    pushU32(0x43445745); // magic
    pushU32(2); // version
    pushU32(1); // command count
    pushU32(0); // padding

    // Command header (op, id, payloadBytes, reserved)
    pushU32(1); // ClearAll
    pushU32(0);
    pushU32(0);
    pushU32(0);

    Ctx ctx;
    EngineError err = engine::parseCommandBuffer(buf.data(), static_cast<uint32_t>(buf.size()), &cb, &ctx);
    EXPECT_EQ(err, EngineError::Ok);
    EXPECT_EQ(ctx.count, 1);
}
