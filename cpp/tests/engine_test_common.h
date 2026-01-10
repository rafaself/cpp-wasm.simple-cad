#pragma once

#include <gtest/gtest.h>
#include "engine/engine.h"
#include "engine/entity/entity_manager.h"
#include "tests/test_accessors.h"
#include <cmath>
#include <vector>

namespace engine_test {
inline constexpr float kMoveScreenX = 50.0f;
inline constexpr float kMoveScreenY = 0.0f;
inline constexpr float kPickTolerance = 2.0f;
inline constexpr std::uint32_t kPickMask = 0xFF;

inline void moveByScreen(CadEngine& engine, std::uint32_t id, float screenX, float screenY) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::Move,
        0,
        -1,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.commitTransform();
}

inline void edgeDragByScreen(CadEngine& engine, std::uint32_t id, float screenX, float screenY) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::EdgeDrag,
        id,
        -1,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        0);
    engine.commitTransform();
}

inline void moveByScreenWithModifiers(
    CadEngine& engine,
    std::uint32_t id,
    float screenX,
    float screenY,
    std::uint32_t modifiers) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::Move,
        0,
        -1,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.commitTransform();
}

inline void resizeByScreenWithModifiers(
    CadEngine& engine,
    std::uint32_t id,
    std::int32_t handleIndex,
    float screenX,
    float screenY,
    std::uint32_t modifiers) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::Resize,
        id,
        handleIndex,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.commitTransform();
}

inline void resizeByScreenWithView(
    CadEngine& engine,
    std::uint32_t id,
    std::int32_t handleIndex,
    float startScreenX,
    float startScreenY,
    float endScreenX,
    float endScreenY,
    float viewScale,
    std::uint32_t modifiers) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::Resize,
        id,
        handleIndex,
        startScreenX,
        startScreenY,
        0.0f,
        0.0f,
        viewScale,
        0.0f,
        0.0f,
        modifiers);
    engine.updateTransform(
        endScreenX,
        endScreenY,
        0.0f,
        0.0f,
        viewScale,
        0.0f,
        0.0f,
        modifiers);
    engine.commitTransform();
}

inline void vertexDragByScreenWithModifiers(
    CadEngine& engine,
    std::uint32_t id,
    std::int32_t vertexIndex,
    float screenX,
    float screenY,
    std::uint32_t modifiers) {
    std::uint32_t ids[] = { id };
    engine.beginTransform(
        ids,
        1,
        CadEngine::TransformMode::VertexDrag,
        id,
        vertexIndex,
        0.0f,
        0.0f,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.updateTransform(
        screenX,
        screenY,
        0.0f,
        0.0f,
        1.0f,
        0.0f,
        0.0f,
        modifiers);
    engine.commitTransform();
}

inline PickResult pickAt(const CadEngine& engine, float x, float y) {
    return engine.pickEx(x, y, kPickTolerance, kPickMask);
}

inline void expectPickMoved(CadEngine& engine, std::uint32_t id, float hitX, float hitY, float missX, float missY) {
    const PickResult hit = pickAt(engine, hitX, hitY);
    EXPECT_EQ(hit.id, id);
    const PickResult miss = pickAt(engine, missX, missY);
    EXPECT_NE(miss.id, id);
}

inline void appendU32(std::vector<std::uint8_t>& buffer, std::uint32_t v) {
    const std::uint8_t* bytes = reinterpret_cast<const std::uint8_t*>(&v);
    buffer.insert(buffer.end(), bytes, bytes + sizeof(v));
}

inline void appendBytes(std::vector<std::uint8_t>& buffer, const void* data, std::size_t size) {
    const std::uint8_t* bytes = reinterpret_cast<const std::uint8_t*>(data);
    buffer.insert(buffer.end(), bytes, bytes + size);
}

inline void upsertPolyline(CadEngine& engine, std::uint32_t id, const std::vector<Point2>& points) {
    std::vector<std::uint8_t> buffer;
    const std::uint32_t count = static_cast<std::uint32_t>(points.size());
    const std::uint32_t payloadBytes = static_cast<std::uint32_t>(
        sizeof(PolylinePayloadHeader) + points.size() * sizeof(Point2));

    appendU32(buffer, 0x43445745);
    appendU32(buffer, 3);
    appendU32(buffer, 1);
    appendU32(buffer, 0);
    appendU32(buffer, static_cast<std::uint32_t>(CommandOp::UpsertPolyline));
    appendU32(buffer, id);
    appendU32(buffer, payloadBytes);
    appendU32(buffer, 0);

    PolylinePayloadHeader header{};
    header.r = 1.0f;
    header.g = 1.0f;
    header.b = 1.0f;
    header.a = 1.0f;
    header.enabled = 1.0f;
    header.strokeWidthPx = 1.0f;
    header.count = count;
    appendBytes(buffer, &header, sizeof(header));
    for (const auto& pt : points) {
        appendBytes(buffer, &pt, sizeof(pt));
    }

    engine.applyCommandBuffer(reinterpret_cast<uintptr_t>(buffer.data()), static_cast<std::uint32_t>(buffer.size()));
}
} // namespace engine_test

class CadEngineTest : public ::testing::Test {
protected:
    CadEngine engine;

    void SetUp() override {
        engine.clear();
    }
};
