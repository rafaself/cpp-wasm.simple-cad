#include <gtest/gtest.h>
#include "engine/engine.h"
#include "tests/test_accessors.h"
#include <chrono>
#include <iostream>

namespace {
void populateRects(CadEngine& engine, std::uint32_t count) {
    for (std::uint32_t i = 0; i < count; ++i) {
        const float x = static_cast<float>(i % 100) * 4.0f;
        const float y = static_cast<float>(i / 100) * 4.0f;
        CadEngineTestAccessor::upsertRect(engine, i + 1, x, y, 2.0f, 2.0f, 0.2f, 0.6f, 0.9f, 1.0f);
    }
}
} // namespace

TEST(PerfBaselineTest, RebuildBuffersBaseline) {
    CadEngine engine;
    engine.clear();
    CadEngineTestAccessor::setViewTransform(engine, 0.0f, 0.0f, 1.0f, 800.0f, 600.0f);

    constexpr std::uint32_t kRectCount = 2000;
    constexpr int kIterations = 20;
    populateRects(engine, kRectCount);

    engine.getPositionBufferMeta();

    const auto start = std::chrono::steady_clock::now();
    for (int i = 0; i < kIterations; ++i) {
        engine.rebuildRenderBuffers();
    }
    const auto end = std::chrono::steady_clock::now();

    const auto meta = engine.getPositionBufferMeta();
    EXPECT_GT(meta.vertexCount, 0u);

    const auto elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
    std::cout << "[PerfBaseline] rebuildRenderBuffers " << kIterations << "x: " << elapsedMs << " ms\n";
}

TEST(PerfBaselineTest, PickBaseline) {
    CadEngine engine;
    engine.clear();
    CadEngineTestAccessor::setViewTransform(engine, 0.0f, 0.0f, 1.0f, 800.0f, 600.0f);

    constexpr std::uint32_t kRectCount = 2000;
    constexpr int kPickIterations = 2000;
    populateRects(engine, kRectCount);
    engine.getPositionBufferMeta();

    const auto pickStart = std::chrono::steady_clock::now();
    std::uint32_t hits = 0;
    for (int i = 0; i < kPickIterations; ++i) {
        const float x = static_cast<float>(i % 100) * 4.0f + 1.0f;
        const float y = static_cast<float>(i / 100) * 4.0f + 1.0f;
        const std::uint32_t id = engine.pick(x, y, 0.5f);
        if (id != 0) ++hits;
    }
    const auto pickEnd = std::chrono::steady_clock::now();

    const auto pickMs = std::chrono::duration_cast<std::chrono::milliseconds>(pickEnd - pickStart).count();
    std::cout << "[PerfBaseline] pick " << kPickIterations << "x: " << pickMs << " ms\n";
    EXPECT_GT(hits, 0u);

    const auto queryStart = std::chrono::steady_clock::now();
    const auto ids = engine.queryArea(0.0f, 0.0f, 200.0f, 200.0f);
    const auto queryEnd = std::chrono::steady_clock::now();

    const auto queryMs = std::chrono::duration_cast<std::chrono::milliseconds>(queryEnd - queryStart).count();
    std::cout << "[PerfBaseline] queryArea: " << queryMs << " ms\n";
    EXPECT_FALSE(ids.empty());
}
