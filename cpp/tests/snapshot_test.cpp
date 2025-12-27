#include <gtest/gtest.h>
#include "engine/snapshot.h"
#include "engine/entity_manager.h"

using namespace engine;

TEST(SnapshotTest, RoundTrip) {
    SnapshotData data;
    LayerSnapshot layer{1, 0, static_cast<std::uint32_t>(LayerFlags::Visible), "Default"};
    data.layers.push_back(layer);

    RectSnapshot rect{};
    rect.rec = RectRec{1, 10.0f, 20.0f, 30.0f, 40.0f, 0.1f, 0.2f, 0.3f, 1.0f, 0.1f, 0.2f, 0.3f, 1.0f, 1.0f, 2.0f};
    rect.layerId = 1;
    rect.flags = static_cast<std::uint32_t>(EntityFlags::Visible);
    data.rects.push_back(rect);

    LineSnapshot line{};
    line.rec = LineRec{2, 0.0f, 0.0f, 5.0f, 5.0f, 1.0f, 0.5f, 0.25f, 1.0f, 1.0f, 1.5f};
    line.layerId = 1;
    line.flags = static_cast<std::uint32_t>(EntityFlags::Visible);
    data.lines.push_back(line);

    PolySnapshot poly{};
    poly.rec = PolyRec{3, 0, 2, 0.2f, 0.3f, 0.4f, 1.0f, 0.2f, 0.3f, 0.4f, 1.0f, 1.0f, 1.0f, 2.0f};
    poly.layerId = 1;
    poly.flags = static_cast<std::uint32_t>(EntityFlags::Visible);
    data.polylines.push_back(poly);

    data.points.push_back(Point2{1.0f, 1.0f});
    data.points.push_back(Point2{2.0f, 2.0f});

    data.drawOrder = {1, 2, 3};
    data.selection = {2};
    data.nextId = 4;

    TextSnapshot text{};
    text.id = 10;
    text.layerId = 1;
    text.flags = static_cast<std::uint32_t>(EntityFlags::Visible);
    text.header.x = 5.0f;
    text.header.y = 6.0f;
    text.header.rotation = 0.0f;
    text.header.boxMode = static_cast<std::uint8_t>(TextBoxMode::AutoWidth);
    text.header.align = static_cast<std::uint8_t>(TextAlign::Left);
    text.header.constraintWidth = 0.0f;
    text.layoutWidth = 50.0f;
    text.layoutHeight = 20.0f;
    text.minX = 5.0f;
    text.minY = 6.0f;
    text.maxX = 55.0f;
    text.maxY = 26.0f;
    text.content = "Hi";
    TextRunPayload run{};
    run.startIndex = 0;
    run.length = static_cast<std::uint32_t>(text.content.size());
    run.fontId = 4;
    run.fontSize = 16.0f;
    run.colorRGBA = 0xFFFFFFFFu;
    run.flags = static_cast<std::uint8_t>(TextStyleFlags::None);
    text.runs.push_back(run);
    data.texts.push_back(text);

    auto bytes = buildSnapshotBytes(data);
    ASSERT_GT(bytes.size(), 0u);

    SnapshotData parsed;
    EngineError err = parseSnapshot(bytes.data(), static_cast<uint32_t>(bytes.size()), parsed);
    EXPECT_EQ(err, EngineError::Ok);
    EXPECT_EQ(parsed.layers.size(), data.layers.size());
    EXPECT_EQ(parsed.rects.size(), data.rects.size());
    EXPECT_EQ(parsed.lines.size(), data.lines.size());
    EXPECT_EQ(parsed.polylines.size(), data.polylines.size());
    EXPECT_EQ(parsed.points.size(), data.points.size());
    EXPECT_EQ(parsed.drawOrder, data.drawOrder);
    EXPECT_EQ(parsed.selection, data.selection);
    EXPECT_EQ(parsed.nextId, data.nextId);
    EXPECT_EQ(parsed.texts.size(), data.texts.size());
}
