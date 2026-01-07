#include <gtest/gtest.h>
#include <fstream>
#include <string>
#include <vector>

#include "engine/engine.h"
#include "engine/core/util.h"
#include "engine/protocol/protocol_types.h"
#include "tests/test_accessors.h"

namespace {
std::vector<std::uint8_t> loadFile(const std::string& path) {
    std::ifstream file(path, std::ios::binary | std::ios::ate);
    if (!file.is_open()) return {};
    std::streamsize size = file.tellg();
    file.seekg(0, std::ios::beg);
    std::vector<std::uint8_t> buffer(size);
    if (file.read(reinterpret_cast<char*>(buffer.data()), size)) return buffer;
    return {};
}

bool loadAnyFont(CadEngine& engine, std::uint32_t fontId) {
    const std::vector<std::string> fontPaths = {
        "../../frontend/public/fonts/Inter-Regular.ttf",
        "../../../frontend/public/fonts/Inter-Regular.ttf",
        "frontend/public/fonts/Inter-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    };

    for (const auto& path : fontPaths) {
        auto data = loadFile(path);
        if (!data.empty() &&
            engine.loadFont(fontId, reinterpret_cast<std::uintptr_t>(data.data()), data.size())) {
            return true;
        }
    }
    return false;
}

std::uint32_t pack(float r, float g, float b, float a) {
    return packColorRGBA(r, g, b, a);
}
} // namespace

TEST(StyleSystemTest, LayerStylePersistsAcrossSnapshots) {
    CadEngine engine;
    engine.clear();

    engine.setLayerStyle(1, CadEngine::StyleTarget::Stroke, pack(1.0f, 0.2f, 0.2f, 1.0f));
    engine.setLayerStyle(1, CadEngine::StyleTarget::Fill, pack(0.2f, 0.8f, 0.2f, 1.0f));
    engine.setLayerStyle(1, CadEngine::StyleTarget::TextColor, pack(0.1f, 0.1f, 0.9f, 1.0f));
    engine.setLayerStyle(1, CadEngine::StyleTarget::TextBackground, pack(0.0f, 0.0f, 0.0f, 0.6f));
    engine.setLayerStyleEnabled(1, CadEngine::StyleTarget::Fill, false);
    engine.setLayerStyleEnabled(1, CadEngine::StyleTarget::TextBackground, true);

    const auto snapshot = engine.saveSnapshot();
    ASSERT_GT(snapshot.byteCount, 0u);

    CadEngine engine2;
    engine2.loadSnapshotFromPtr(snapshot.ptr, snapshot.byteCount);
    const auto layerStyle = engine2.getLayerStyle(1);

    EXPECT_EQ(layerStyle.strokeRGBA, pack(1.0f, 0.2f, 0.2f, 1.0f));
    EXPECT_EQ(layerStyle.fillRGBA, pack(0.2f, 0.8f, 0.2f, 1.0f));
    EXPECT_EQ(layerStyle.textColorRGBA, pack(0.1f, 0.1f, 0.9f, 1.0f));
    EXPECT_EQ(layerStyle.textBackgroundRGBA, pack(0.0f, 0.0f, 0.0f, 0.6f));
    EXPECT_EQ(layerStyle.fillEnabled, 0u);
    EXPECT_EQ(layerStyle.textBackgroundEnabled, 1u);
}

TEST(StyleSystemTest, EntityOverridesPersistAcrossSnapshots) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.2f, 0.2f, 0.2f, 1.0f);
    const std::uint32_t ids[] = {1};
    engine.setEntityStyleOverride(ids, 1, CadEngine::StyleTarget::Stroke, pack(0.9f, 0.1f, 0.1f, 1.0f));

    const auto snapshot = engine.saveSnapshot();
    ASSERT_GT(snapshot.byteCount, 0u);

    CadEngine engine2;
    engine2.loadSnapshotFromPtr(snapshot.ptr, snapshot.byteCount);
    engine2.setSelection(ids, 1, CadEngine::SelectionMode::Replace);
    const auto summary = engine2.getSelectionStyleSummary();

    EXPECT_EQ(summary.stroke.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Override));
    EXPECT_EQ(summary.stroke.colorRGBA, pack(0.9f, 0.1f, 0.1f, 1.0f));
}

TEST(StyleSystemTest, SelectionSummaryStates) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.2f, 0.2f, 0.2f, 1.0f);
    CadEngineTestAccessor::upsertRect(engine, 2, 15.0f, 0.0f, 10.0f, 10.0f, 0.4f, 0.4f, 0.4f, 1.0f);
    CadEngineTestAccessor::upsertLine(engine, 3, 0.0f, 0.0f, 5.0f, 5.0f);

    const std::uint32_t id1[] = {1};
    const std::uint32_t id2[] = {2};

    engine.clearEntityStyleOverride(id1, 1, CadEngine::StyleTarget::Stroke);
    engine.clearEntityStyleOverride(id1, 1, CadEngine::StyleTarget::Fill);

    engine.setSelection(id1, 1, CadEngine::SelectionMode::Replace);
    auto summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.stroke.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Layer));

    engine.setSelection(id2, 1, CadEngine::SelectionMode::Replace);
    summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.stroke.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Override));

    const std::uint32_t both[] = {1, 2};
    engine.setSelection(both, 2, CadEngine::SelectionMode::Replace);
    summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.stroke.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Mixed));

    engine.setEntityStyleEnabled(id2, 1, CadEngine::StyleTarget::Fill, false);
    engine.setSelection(id2, 1, CadEngine::SelectionMode::Replace);
    summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.fill.state, static_cast<std::uint8_t>(engine::protocol::StyleState::None));

    const std::uint32_t lineIds[] = {3};
    engine.setSelection(lineIds, 1, CadEngine::SelectionMode::Replace);
    summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.fill.supportedState, static_cast<std::uint8_t>(engine::protocol::TriState::Off));
}

TEST(StyleSystemTest, UndoRedoStyleChanges) {
    CadEngine engine;
    engine.clear();

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 10.0f, 0.2f, 0.2f, 0.2f, 1.0f);
    const std::uint32_t ids[] = {1};
    engine.clearEntityStyleOverride(ids, 1, CadEngine::StyleTarget::Stroke);
    engine.setSelection(ids, 1, CadEngine::SelectionMode::Replace);

    engine.setEntityStyleOverride(ids, 1, CadEngine::StyleTarget::Stroke, pack(0.9f, 0.2f, 0.2f, 1.0f));
    auto summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.stroke.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Override));

    engine.undo();
    summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.stroke.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Layer));

    engine.redo();
    summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.stroke.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Override));
}

TEST(StyleSystemTest, TextStyleSummaryTargets) {
    CadEngine engine;
    engine.clear();
    engine.initializeTextSystem();

    const std::uint32_t fontId = 1;
    if (!loadAnyFont(engine, fontId)) {
        GTEST_SKIP() << "No font available for text style summary test";
    }

    TextPayloadHeader header{};
    header.x = 0.0f;
    header.y = 0.0f;
    header.rotation = 0.0f;
    header.boxMode = 0;
    header.align = 0;
    header.constraintWidth = 0.0f;
    header.runCount = 1;
    header.contentLength = 1;

    TextRunPayload run{};
    run.startIndex = 0;
    run.length = 1;
    run.fontId = fontId;
    run.fontSize = 16.0f;
    run.colorRGBA = pack(1.0f, 1.0f, 1.0f, 1.0f);
    run.flags = 0;

    ASSERT_TRUE(engine.upsertText(10, header, &run, 1, "A", 1));

    const std::uint32_t ids[] = {10};
    engine.setSelection(ids, 1, CadEngine::SelectionMode::Replace);
    engine.setEntityStyleOverride(ids, 1, CadEngine::StyleTarget::TextColor, pack(0.1f, 0.9f, 0.2f, 1.0f));
    engine.setEntityStyleEnabled(ids, 1, CadEngine::StyleTarget::TextBackground, false);

    const auto summary = engine.getSelectionStyleSummary();
    EXPECT_EQ(summary.textColor.state, static_cast<std::uint8_t>(engine::protocol::StyleState::Override));
    EXPECT_EQ(summary.textBackground.state, static_cast<std::uint8_t>(engine::protocol::StyleState::None));
}
