#pragma once

#include <gtest/gtest.h>
#include "engine/engine.h"
#include "engine/command/commands.h"
#include "engine/command/command_dispatch.h"
#include "engine/core/types.h"
#include "tests/test_accessors.h"
#include "engine/text/text_style_contract.h"
#include <cstring>
#include <memory>
#include <string>
#include <vector>

class CommandBufferBuilder {
public:
    void pushU32(std::uint32_t v) {
        std::uint8_t b[4];
        std::memcpy(b, &v, 4);
        buffer_.insert(buffer_.end(), b, b + 4);
    }

    void pushFloat(float v) {
        std::uint8_t b[4];
        std::memcpy(b, &v, 4);
        buffer_.insert(buffer_.end(), b, b + 4);
    }

    void pushBytes(const void* data, std::size_t size) {
        const auto* bytes = reinterpret_cast<const std::uint8_t*>(data);
        buffer_.insert(buffer_.end(), bytes, bytes + size);
    }

    void writeHeader(std::uint32_t commandCount) {
        pushU32(0x43445745); // magic "EWDC"
        pushU32(4);          // version
        pushU32(commandCount);
        pushU32(0);          // padding
    }

    void writeCommandHeader(CommandOp op, std::uint32_t id, std::uint32_t payloadBytes) {
        pushU32(static_cast<std::uint32_t>(op));
        pushU32(id);
        pushU32(payloadBytes);
        pushU32(0); // reserved
    }

    const std::uint8_t* data() const { return buffer_.data(); }
    std::uint32_t size() const { return static_cast<std::uint32_t>(buffer_.size()); }

    void clear() { buffer_.clear(); }

private:
    std::vector<std::uint8_t> buffer_;
};

class TextCommandsTest : public ::testing::Test {
protected:
    void SetUp() override {
        engine_ = std::make_unique<CadEngine>();
    }

    void TearDown() override {
        engine_.reset();
    }

    EngineError applyCommands(const CommandBufferBuilder& builder) {
        auto commandCallback = [](void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount) -> EngineError {
            return engine::dispatchCommand(reinterpret_cast<CadEngine*>(ctx), op, id, payload, payloadByteCount);
        };
        return engine::parseCommandBuffer(
            builder.data(),
            builder.size(),
            commandCallback,
            engine_.get()
        );
    }

    bool upsertSimpleText(std::uint32_t id, const std::string& content, TextStyleFlags flags = TextStyleFlags::None) {
        TextPayloadHeader header{};
        header.x = 0.0f;
        header.y = 0.0f;
        header.rotation = 0.0f;
        header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
        header.align = static_cast<std::uint8_t>(TextAlign::Left);
        header.constraintWidth = 0.0f;
        header.runCount = 1;
        header.contentLength = static_cast<std::uint32_t>(content.size());

        TextRunPayload run{};
        run.startIndex = 0;
        run.length = header.contentLength;
        run.fontId = 0;
        run.fontSize = 16.0f;
        run.colorRGBA = 0xFFFFFFFFu;
        run.flags = static_cast<std::uint8_t>(flags);

        return engine_->upsertText(id, header, &run, 1, content.data(), header.contentLength);
    }

    std::unique_ptr<CadEngine> engine_;
};
